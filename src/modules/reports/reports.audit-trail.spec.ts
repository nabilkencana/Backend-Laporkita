import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service.js';
import { ReportsRepository } from './reports.repository.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SmartPriorityService } from '../smart-priority/smart-priority.service.js';
import { ConfigService } from '@nestjs/config';
import { ReportStatus } from '@prisma/client';

describe('Audit Trail Verification (report_status_history for ALL status transitions)', () => {
  let service: ReportsService;
  let repository: ReportsRepository;

  const reporterId = '11111111-1111-4000-8000-000000000001';
  const operatorId = '22222222-2222-4000-8000-000000000002';
  const aiActorId = '00000000-0000-4000-8000-000000000001';
  const reportId = 'report-audit-trail-uuid';

  const historyEntries: {
    report_id: string;
    status: ReportStatus;
    changed_by: string | null;
    note: string | null;
  }[] = [];

  let currentReportState: {
    id: string;
    report_code: string;
    reporter_id: string;
    status: ReportStatus;
    urgency_score: number;
    needs_manual_review: boolean;
    created_at: Date;
  } = {
    id: reportId,
    report_code: '#LP-2026-000001',
    reporter_id: reporterId,
    status: ReportStatus.pending_verification,
    urgency_score: 1.0,
    needs_manual_review: false,
    created_at: new Date(),
  };

  beforeEach(async () => {
    historyEntries.length = 0;
    currentReportState = {
      id: reportId,
      report_code: '#LP-2026-000001',
      reporter_id: reporterId,
      status: ReportStatus.pending_verification,
      urgency_score: 1.0,
      needs_manual_review: false,
      created_at: new Date(),
    };

    const mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb: unknown) => {
        if (typeof cb === 'function') {
          return (cb as (tx: unknown) => unknown)(mockPrisma);
        }
        if (Array.isArray(cb)) {
          return Promise.all(cb);
        }
        return cb;
      }),
      report: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(currentReportState)),
        create: jest.fn().mockImplementation(({ data }: { data: { status: ReportStatus } }) => {
          currentReportState.status = data.status;
          return Promise.resolve(currentReportState);
        }),
        update: jest.fn().mockImplementation(({ data }: { data: { status: ReportStatus } }) => {
          currentReportState.status = data.status;
          return Promise.resolve(currentReportState);
        }),
      },
      reportMedia: {
        create: jest.fn().mockResolvedValue({ id: 'media-1' }),
        count: jest.fn().mockResolvedValue(1), // Mock completion photo exists
      },
      reportStatusHistory: {
        create: jest.fn().mockImplementation(
          ({
            data,
          }: {
            data: {
              report_id: string;
              status: ReportStatus;
              changed_by: string | null;
              note: string | null;
            };
          }) => {
            historyEntries.push(data);
            return Promise.resolve({ id: `history-${historyEntries.length}`, ...data });
          },
        ),
        findMany: jest.fn().mockImplementation(() => Promise.resolve(historyEntries)),
      },
      citizenValidation: {
        create: jest.fn().mockResolvedValue({ id: 'val-1' }),
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      },
      contributionPointsLog: {
        create: jest.fn().mockResolvedValue({ id: 'cp-1' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: reporterId, current_points: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cat-1',
          name: 'Jalan Rusak',
          default_agency_id: 'agency-1',
        }),
      },
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'CITIZEN_VALIDATION_AUTO_RESOLVE_DAYS') return 7;
        return null;
      }),
    };

    const mockSmartPriority = {
      recalculateUrgencyScore: jest.fn().mockResolvedValue(1.5),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        ReportsRepository,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: SmartPriorityService, useValue: mockSmartPriority },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    repository = module.get<ReportsRepository>(ReportsRepository);
  });

  it('Path 1: Submit report records initial history as pending_verification', async () => {
    await repository.createReportInTransaction({
      report_code: '#LP-2026-000001',
      reporter_id: reporterId,
      category_id: 'cat-1',
      latitude: -7.983908,
      longitude: 112.621391,
      photo_url: 'https://storage.laporkita.id/reports/initial.jpg',
    });

    expect(historyEntries.length).toBe(1);
    expect(historyEntries[0].status).toBe(ReportStatus.pending_verification);
    expect(historyEntries[0].changed_by).toBe(reporterId);
  });

  it('Path 2: AI automatic verification records history as verified with AI actor ID', async () => {
    currentReportState.status = ReportStatus.pending_verification;

    await service.transitionReportStatus(
      reportId,
      ReportStatus.verified,
      aiActorId,
      'Lolos verifikasi AI otomatis (Confidence: 92%)',
    );

    expect(historyEntries.length).toBe(1);
    expect(historyEntries[0].status).toBe(ReportStatus.verified);
    expect(historyEntries[0].changed_by).toBe(aiActorId);
    expect(historyEntries[0].note).toContain('Lolos verifikasi AI');
  });

  it('Path 3: Manual operator flow (verified -> assigned -> in_progress -> completed)', async () => {
    currentReportState.status = ReportStatus.verified;

    // 1. Assign to agency
    await service.transitionReportStatus(
      reportId,
      ReportStatus.assigned,
      operatorId,
      'Ditugaskan ke DPUPR Malang',
    );

    // 2. Start progress
    await service.transitionReportStatus(
      reportId,
      ReportStatus.in_progress,
      operatorId,
      'Pengerjaan perbaikan dimulai',
    );

    // 3. Mark completed (completion photo mocked)
    await service.transitionReportStatus(
      reportId,
      ReportStatus.completed,
      operatorId,
      'Perbaikan telah selesai 100%',
    );

    expect(historyEntries.length).toBe(3);
    expect(historyEntries[0].status).toBe(ReportStatus.assigned);
    expect(historyEntries[1].status).toBe(ReportStatus.in_progress);
    expect(historyEntries[2].status).toBe(ReportStatus.completed);
    expect(historyEntries[2].changed_by).toBe(operatorId);
  });

  it('Path 4: Citizen validation Dispute returns to in_progress with dispute note in history', async () => {
    currentReportState.status = ReportStatus.completed;

    const result = await service.validateReport(
      reportId,
      {
        id: reporterId,
        full_name: 'Warga Pelapor',
        email: 'citizen@test.com',
        phone_number: null,
        role: ReportStatus.pending_verification as any,
        agency_id: null,
      },
      { is_valid: false, note: 'Aspal masih bergelombang dan belum rata' },
    );

    expect(result.new_status).toBe(ReportStatus.in_progress);
    expect(historyEntries.length).toBe(1);
    expect(historyEntries[0].status).toBe(ReportStatus.in_progress);
    expect(historyEntries[0].changed_by).toBe(reporterId);
    expect(historyEntries[0].note).toBe('Aspal masih bergelombang dan belum rata');
  });

  it('Path 5: Citizen validation Confirmed records resolved in history', async () => {
    currentReportState.status = ReportStatus.completed;

    const result = await service.validateReport(
      reportId,
      {
        id: reporterId,
        full_name: 'Warga Pelapor',
        email: 'citizen@test.com',
        phone_number: null,
        role: ReportStatus.pending_verification as any,
        agency_id: null,
      },
      { is_valid: true, note: 'Jalan sudah halus dan rapi, terima kasih!' },
    );

    expect(result.new_status).toBe(ReportStatus.resolved);
    expect(historyEntries.length).toBe(1);
    expect(historyEntries[0].status).toBe(ReportStatus.resolved);
    expect(historyEntries[0].changed_by).toBe(reporterId);
  });

  it('Path 6: Daily Auto-resolve Cron job records resolved with system note', async () => {
    currentReportState.status = ReportStatus.completed;
    jest
      .spyOn(repository, 'findCompletedReportsOlderThan')
      .mockResolvedValue([currentReportState as never]);

    const count = await service.handleAutoResolveJob();

    expect(count).toBe(1);
    expect(historyEntries.length).toBe(1);
    expect(historyEntries[0].status).toBe(ReportStatus.resolved);
    expect(historyEntries[0].changed_by).toBeNull();
    expect(historyEntries[0].note).toContain('Otomatis diselesaikan oleh sistem');
  });
});
