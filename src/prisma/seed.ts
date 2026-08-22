import 'dotenv/config';
import { PrismaClient, AgencyType, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required for seeding.');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log('🌱 Memulai seeding database LaporKita...');

  // ── 1. Seed Instansi Pemerintah (Agencies) ────────────────────────────────
  // Sesuai PRD.md §3, Rules.md §1.7, dan ERD.md §2.2
  console.log('🏢 Seeding agencies (DPUPR, Dishub, Diskominfo)...');

  const agencyDpupr = await prisma.agency.upsert({
    where: { id: 'a1000000-0000-4000-8000-000000000001' },
    update: {
      name: 'Dinas Pekerjaan Umum, Penataan Ruang, Perumahan dan Kawasan Permukiman (DPUPRPKP) Kota Malang',
      type: AgencyType.dpupr,
      contact_email: 'dpupr@malangkota.go.id',
    },
    create: {
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'Dinas Pekerjaan Umum, Penataan Ruang, Perumahan dan Kawasan Permukiman (DPUPRPKP) Kota Malang',
      type: AgencyType.dpupr,
      contact_email: 'dpupr@malangkota.go.id',
    },
  });

  const agencyDishub = await prisma.agency.upsert({
    where: { id: 'a2000000-0000-4000-8000-000000000002' },
    update: {
      name: 'Dinas Perhubungan (Dishub) Kota Malang',
      type: AgencyType.dishub,
      contact_email: 'dishub@malangkota.go.id',
    },
    create: {
      id: 'a2000000-0000-4000-8000-000000000002',
      name: 'Dinas Perhubungan (Dishub) Kota Malang',
      type: AgencyType.dishub,
      contact_email: 'dishub@malangkota.go.id',
    },
  });

  const agencyDiskominfo = await prisma.agency.upsert({
    where: { id: 'a3000000-0000-4000-8000-000000000003' },
    update: {
      name: 'Dinas Komunikasi dan Informatika (Diskominfo) Kota Malang',
      type: AgencyType.diskominfo,
      contact_email: 'diskominfo@malangkota.go.id',
    },
    create: {
      id: 'a3000000-0000-4000-8000-000000000003',
      name: 'Dinas Komunikasi dan Informatika (Diskominfo) Kota Malang',
      type: AgencyType.diskominfo,
      contact_email: 'diskominfo@malangkota.go.id',
    },
  });

  console.log(`✅ 3 Instansi berhasil di-seed:`);
  console.log(`   - ${agencyDpupr.name} (DPUPR)`);
  console.log(`   - ${agencyDishub.name} (Dishub)`);
  console.log(`   - ${agencyDiskominfo.name} (Diskominfo)`);

  // ── 2. Seed 5 Kategori Aktif Fasilitas Umum ──────────────────────────────
  // Sesuai Rules.md §2.1 & §1.7 (routing otomatis default_agency_id)
  console.log('📂 Seeding 5 active categories...');

  const categoriesData = [
    {
      id: 'c1000000-0000-4000-8000-000000000001',
      name: 'Jalan Berlubang',
      icon_url: 'https://assets.laporkita.malangkota.go.id/icons/pothole.svg',
      default_agency_id: agencyDpupr.id,
      urgency_weight: 1.5,
    },
    {
      id: 'c2000000-0000-4000-8000-000000000002',
      name: 'Lampu Jalan',
      icon_url: 'https://assets.laporkita.malangkota.go.id/icons/street_light.svg',
      default_agency_id: agencyDishub.id,
      urgency_weight: 1.2,
    },
    {
      id: 'c3000000-0000-4000-8000-000000000003',
      name: 'Rambu Lalu Lintas',
      icon_url: 'https://assets.laporkita.malangkota.go.id/icons/traffic_sign.svg',
      default_agency_id: agencyDishub.id,
      urgency_weight: 1.3,
    },
    {
      id: 'c4000000-0000-4000-8000-000000000004',
      name: 'Trotoar',
      icon_url: 'https://assets.laporkita.malangkota.go.id/icons/sidewalk.svg',
      default_agency_id: agencyDpupr.id,
      urgency_weight: 1.0,
    },
    {
      id: 'c5000000-0000-4000-8000-000000000005',
      name: 'Drainase',
      icon_url: 'https://assets.laporkita.malangkota.go.id/icons/drainage.svg',
      default_agency_id: agencyDpupr.id,
      urgency_weight: 1.4,
    },
  ];

  for (const cat of categoriesData) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {
        name: cat.name,
        icon_url: cat.icon_url,
        default_agency_id: cat.default_agency_id,
        urgency_weight: cat.urgency_weight,
      },
      create: cat,
    });
  }

  console.log(
    '✅ 5 Kategori aktif berhasil di-seed (Jalan Berlubang, Lampu Jalan, Rambu Lalu Lintas, Trotoar, Drainase)',
  );

  // ── 3. Seed Default Admin User ───────────────────────────────────────────
  // Password dan email dibaca dari env vars, di-hash dengan bcrypt (Rules.md §4.1)
  console.log('👤 Seeding default admin user...');

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@laporkita.malangkota.go.id';
  const adminRawPassword = process.env.ADMIN_PASSWORD ?? 'AdminLaporKita2026!';
  const adminName = process.env.ADMIN_NAME ?? 'Admin LaporKita Kota Malang';
  const passwordHash = await bcrypt.hash(adminRawPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      full_name: adminName,
      password_hash: passwordHash,
      role: UserRole.admin,
      is_active: true,
      phone_verified_at: new Date(),
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      full_name: adminName,
      email: adminEmail,
      phone_number: '+6281133344455',
      password_hash: passwordHash,
      role: UserRole.admin,
      contribution_points: 0,
      is_active: true,
      phone_verified_at: new Date(),
    },
  });

  console.log(`✅ Default Admin user berhasil di-seed:`);
  console.log(`   - ID: ${adminUser.id}`);
  console.log(`   - Email: ${adminUser.email}`);
  console.log(`   - Role: ${adminUser.role}`);

  // ── 4. Seed Dynamic System Configs (Smart Priority Weights & AI Thresholds) ─
  // Sesuai Rules.md §1.3 (bobot disimpan di DB bukan hardcode)
  console.log('⚙️ Seeding dynamic system configs...');

  await prisma.systemConfig.upsert({
    where: { key: 'smart_priority_weights' },
    update: {
      value: {
        w1_damage_severity: 0.35,
        w2_support: 0.2,
        w3_density: 0.25,
        w4_category: 0.2,
        density_radius_meters: 200,
        support_cap: 100,
      },
      description: 'Bobot scoring Smart Priority Engine (Rules.md §1.3)',
    },
    create: {
      key: 'smart_priority_weights',
      value: {
        w1_damage_severity: 0.35,
        w2_support: 0.2,
        w3_density: 0.25,
        w4_category: 0.2,
        density_radius_meters: 200,
        support_cap: 100,
      },
      description: 'Bobot scoring Smart Priority Engine (Rules.md §1.3)',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'ai_verification_thresholds' },
    update: {
      value: {
        min_confidence: 0.6,
        require_valid_gps: true,
        require_valid_timestamp: true,
      },
      description: 'Threshold verifikasi AI otomatis (Rules.md §1.2)',
    },
    create: {
      key: 'ai_verification_thresholds',
      value: {
        min_confidence: 0.6,
        require_valid_gps: true,
        require_valid_timestamp: true,
      },
      description: 'Threshold verifikasi AI otomatis (Rules.md §1.2)',
    },
  });

  console.log(
    '✅ Dynamic System Configs (Smart Priority Weights & AI Thresholds) berhasil di-seed!',
  );

  console.log('🎉 Seeding database selesai dengan sukses!');
}

main()
  .catch((e: unknown) => {
    console.error('❌ Error saat seeding database:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
