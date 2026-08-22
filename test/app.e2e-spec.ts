import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole, ReportStatus, MediaType } from '@prisma/client';

describe('LaporKita Digital Accountability Loop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let citizenToken: string;
  let operatorToken: string;
  let categoryId: string;
  let reportId: string;

  const timestamp = Date.now();
  const citizenEmail = `citizen_${timestamp}@test.com`;
  const operatorEmail = `operator_${timestamp}@test.com`;
  const password = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Dapatkan kategori fasilitas untuk pengujian laporan
    const category = await prisma.category.findFirst();

    if (category) {
      categoryId = category.id;
    } else {
      const createdCategory = await prisma.category.create({
        data: {
          name: `Jalan Rusak ${timestamp}`,
          icon_url: 'https://cdn.laporkita.id/icons/road.svg',
          urgency_weight: 1.2,
        },
      });
      categoryId = createdCategory.id;
    }
  });

  afterAll(async () => {
    // Cleanup generated e2e test users and reports
    try {
      if (reportId) {
        await prisma.reportStatusHistory.deleteMany({ where: { report_id: reportId } });
        await prisma.reportMedia.deleteMany({ where: { report_id: reportId } });
        await prisma.reportSupport.deleteMany({ where: { report_id: reportId } });
        await prisma.reportComment.deleteMany({ where: { report_id: reportId } });
        await prisma.citizenValidation.deleteMany({ where: { report_id: reportId } });
        await prisma.notification.deleteMany({ where: { reference_report_id: reportId } });
        await prisma.contributionPointsLog.deleteMany({ where: { reference_report_id: reportId } });
        await prisma.report.delete({ where: { id: reportId } });
      }
      const testUsers = await prisma.user.findMany({
        where: { email: { in: [citizenEmail, operatorEmail] } },
      });
      for (const u of testUsers) {
        await prisma.otpVerification.deleteMany({ where: { user_id: u.id } });
        await prisma.contributionPointsLog.deleteMany({ where: { user_id: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    } catch {
      // Ignore cleanup error
    }

    await app.close();
  });

  // ── Step 0: Health Check ───────────────────────────────────────────────────
  it('0. Health Check — GET /api/v1/health', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.version).toBeDefined();
  });

  // ── Step 1: Register Citizen & Operator ────────────────────────────────────
  it('1. Register Citizen & Operator — POST /api/v1/auth/register', async () => {
    // 1. Register Citizen (Returns 202 Accepted with OTP sent)
    const citizenRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: citizenEmail,
        password: password,
        full_name: 'Warga Kota Malang',
        phone_number: '+6281234567890',
      })
      .expect(202);

    expect(citizenRes.body.success).toBe(true);
    expect(citizenRes.body.data.user_id).toBeDefined();

    // Verifikasi aktivasi user via database & login citizen
    await prisma.user.update({
      where: { email: citizenEmail },
      data: { is_active: true, phone_verified_at: new Date() },
    });

    const citizenLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: citizenEmail,
        password: password,
      })
      .expect(200);

    expect(citizenLoginRes.body.data.access_token).toBeDefined();
    expect(citizenLoginRes.body.data.user.role).toBe(UserRole.citizen);
    citizenToken = citizenLoginRes.body.data.access_token;

    // 2. Register Operator
    const operatorRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: operatorEmail,
        password: password,
        full_name: 'Petugas DPUPR',
        phone_number: '+6281234567899',
      })
      .expect(202);

    expect(operatorRes.body.success).toBe(true);
    expect(operatorRes.body.data.user_id).toBeDefined();

    // Set role operator di database, aktivasi akun, & login operator
    const categoryRecord = await prisma.category.findUnique({ where: { id: categoryId } });
    await prisma.user.update({
      where: { email: operatorEmail },
      data: {
        role: UserRole.operator,
        is_active: true,
        phone_verified_at: new Date(),
        agency_id: categoryRecord?.default_agency_id ?? null,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: operatorEmail,
        password: password,
      })
      .expect(200);

    expect(loginRes.body.data.user.role).toBe(UserRole.operator);
    operatorToken = loginRes.body.data.access_token;
  });

  // ── Step 2: Submit Laporan (Citizen) ───────────────────────────────────────
  it('2. Submit Laporan — POST /api/v1/reports', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        category_id: categoryId,
        description: 'Lubang jalan cukup dalam di sekitar Jl. Ijen',
        latitude: -7.983908,
        longitude: 112.621391,
        address_text: 'Jl. Ijen No. 1, Kota Malang',
        photo_url: 'https://storage.laporkita.id/reports/e2e-initial.jpg',
      })
      .expect(202);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe(ReportStatus.pending_verification);
    expect(res.body.data.report_code).toMatch(/^#LP-\d{4}-\d{6}$/);

    reportId = res.body.data.id;
  });

  // ── Step 3: Verifikasi Laporan ─────────────────────────────────────────────
  it('3. Operator Verifikasi Laporan — PATCH /api/v1/reports/:id/status', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: ReportStatus.verified,
        note: 'Laporan diverifikasi valid oleh operator',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(ReportStatus.verified);
  });

  // ── Step 4: Beri Dukungan & Komentar (Citizen) ─────────────────────────────
  it('4. Beri Dukungan & Komentar — POST /api/v1/reports/:id/support & comments', async () => {
    // Beri Dukungan
    const supportRes = await request(app.getHttpServer())
      .post(`/api/v1/reports/${reportId}/support`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .expect(201);

    expect(supportRes.body.success).toBe(true);
    expect(supportRes.body.data.support_count).toBe(1);

    // Kirim Komentar
    const commentRes = await request(app.getHttpServer())
      .post(`/api/v1/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        content: 'Semoga segera diperbaiki sebelum musim hujan deras.',
      })
      .expect(201);

    expect(commentRes.body.success).toBe(true);
    expect(commentRes.body.data.content).toContain('Semoga segera diperbaiki');
  });

  // ── Step 5: Operator Penugasan & Pengerjaan ─────────────────────────────────
  it('5. Operator Alur Kerja: assigned -> in_progress -> upload media -> completed', async () => {
    // 1. Assign
    await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: ReportStatus.assigned,
        note: 'Ditugaskan ke Tim Reaksi Cepat DPUPR',
      })
      .expect(200);

    // 2. In Progress
    await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: ReportStatus.in_progress,
        note: 'Pengerjaan overlay aspal sedang berlangsung',
      })
      .expect(200);

    // 3. Upload Completion Photo
    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/reports/${reportId}/media`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        type: MediaType.completion_photo,
        url: 'https://storage.laporkita.id/reports/e2e-completion.jpg',
      })
      .expect(201);

    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.data.type).toBe(MediaType.completion_photo);

    // 4. Mark Completed
    const completeRes = await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        status: ReportStatus.completed,
        note: 'Pekerjaan perbaikan selesai 100%',
      })
      .expect(200);

    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.data.status).toBe(ReportStatus.completed);
  });

  // ── Step 6: Citizen Validation (Resolved) ──────────────────────────────────
  it('6. Citizen Validation — POST /api/v1/reports/:id/validate (Resolved)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/reports/${reportId}/validate`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        is_valid: true,
        note: 'Konfirmasi: Aspal jalan sudah mulus dan rapi.',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.new_status).toBe(ReportStatus.resolved);
  });

  // ── Step 7: Get Detail Laporan Terakhir ────────────────────────────────────
  it('7. Detail Laporan Final — GET /api/v1/reports/:id', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/reports/${reportId}`).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(reportId);
    expect(res.body.data.status).toBe(ReportStatus.resolved);
    expect(res.body.data.support_count).toBe(1);
    expect(res.body.data.status_history.length).toBeGreaterThanOrEqual(5);
  });
});
