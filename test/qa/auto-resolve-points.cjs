/**
 * QA Fase 4 — 4.27 auto-resolve 7 hari + 4.31/4.32 poin reject berulang
 * Service-layer (AppModule asli, Prisma asli, ReportsService asli).
 * Time-travel & seed state langsung — diizinkan test case 4.27/4.32.
 */
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module.js');
const { ReportsService } = require('../../dist/modules/reports/reports.service.js');
const { PrismaService } = require('../../dist/prisma/prisma.service.js');
const { ReportStatus, ContributionReason } = require('@prisma/client');

const REPORTER_A = '0d83a338-d595-45d2-b452-f3af74a4864c'; // citizen A
const REPORTER_B = '3a341ec8-6cb1-4cb6-8388-8b6e06885ffe'; // citizen B (bravo)
const OPERATOR = 'abdfebf6-249e-46ae-904c-407dc3cfcba2';
const CATEGORY_ID = 'c1000000-0000-4000-8000-000000000001';
const AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);

  // ── 4.27: AUTO-RESOLVE 7 HARI ──
  console.log('=== 4.27: AUTO-RESOLVE (completed > 7 hari tanpa validasi) ===');
  const stale = await prisma.report.create({
    data: {
      report_code: '#LP-2026-7STALE1',
      reporter_id: REPORTER_A,
      category_id: CATEGORY_ID,
      assigned_agency_id: AGENCY_ID,
      description: 'stale completed utk auto-resolve',
      latitude: -7.982,
      longitude: 112.63,
      status: ReportStatus.completed,
    },
  });
  await prisma.reportStatusHistory.create({
    data: { report_id: stale.id, status: ReportStatus.completed, changed_by: OPERATOR, note: 'completed 8 hari lalu' },
  });
  // time-travel: created_at 8 hari lalu
  await prisma.$executeRaw`UPDATE reports SET created_at = now() - interval '8 days', updated_at = now() - interval '8 days' WHERE id = ${stale.id}`;
  console.log(`  laporan stale: ${stale.id} (status completed, created 8 hari lalu)`);

  // cek laporan fresh (baru completed, < 7 hari) TIDAK boleh ter-resolve
  const fresh = await prisma.report.create({
    data: {
      report_code: '#LP-2026-7FRESH1',
      reporter_id: REPORTER_A,
      category_id: CATEGORY_ID,
      assigned_agency_id: AGENCY_ID,
      description: 'fresh completed',
      latitude: -7.982,
      longitude: 112.63,
      status: ReportStatus.completed,
    },
  });
  await prisma.reportStatusHistory.create({
    data: { report_id: fresh.id, status: ReportStatus.completed, changed_by: OPERATOR, note: 'completed baru' },
  });
  console.log(`  laporan fresh: ${fresh.id} (status completed, baru)`);

  const resolvedCount = await reportsService.handleAutoResolveJob();
  console.log(`  auto-resolve job selesai: ${resolvedCount} laporan di-resolve`);

  const staleNow = await prisma.report.findUnique({ where: { id: stale.id } });
  const freshNow = await prisma.report.findUnique({ where: { id: fresh.id } });
  console.log(`  status stale (8 hari): ${staleNow.status} (HARUS resolved)`);
  console.log(`  status fresh (baru): ${freshNow.status} (HARUS completed)`);
  const staleHistory = await prisma.reportStatusHistory.findMany({
    where: { report_id: stale.id },
    orderBy: { created_at: 'desc' },
    take: 2,
  });
  console.log(`  history stale terakhir: ${staleHistory.map((h) => h.status + (h.note ? ' (' + h.note.slice(0, 40) + ')' : '')).join(' -> ')}`);

  // ── 4.31/4.32: POIN REJECT BERULANG (user B) ──
  console.log('\n=== 4.31/4.32: REJECT BERULANG (user B, 4x dalam 30 hari) ===');
  const before = await prisma.user.findUnique({ where: { id: REPORTER_B } });
  console.log(`  user B sebelum: contribution_points=${before.contribution_points}, flagged=${before.is_flagged_for_review}`);

  const rejectedIds = [];
  for (let i = 1; i <= 4; i++) {
    const r = await prisma.report.create({
      data: {
        report_code: `#LP-2026-7REJ${i}`,
        reporter_id: REPORTER_B,
        category_id: CATEGORY_ID,
        assigned_agency_id: AGENCY_ID,
        description: `reject ${i}`,
        latitude: -7.982,
        longitude: 112.63,
        status: ReportStatus.pending_verification,
      },
    });
    await prisma.reportStatusHistory.create({
      data: { report_id: r.id, status: ReportStatus.pending_verification, changed_by: REPORTER_B, note: 'submit' },
    });
    try {
      await reportsService.transitionReportStatus(r.id, ReportStatus.rejected, OPERATOR, `penolakan ke-${i} (QA)`);
      console.log(`  reject #${i}: OK`);
    } catch (e) {
      console.log(`  reject #${i}: GAGAL ${e.message}`);
    }
    rejectedIds.push(r.id);
  }

  const after = await prisma.user.findUnique({ where: { id: REPORTER_B } });
  console.log(`  user B sesudah: contribution_points=${after.contribution_points}, flagged=${after.is_flagged_for_review}`);

  const logs = await prisma.contributionPointsLog.findMany({
    where: { user_id: REPORTER_B, reason: ContributionReason.report_submitted, points: { lt: 0 } },
  });
  console.log(`  log penalti (-20): ${logs.length} entry, total ${logs.reduce((s, l) => s + l.points, 0)} poin`);
  console.log(`  flagged utk review: ${after.is_flagged_for_review} (HARUS true setelah reject ke-4)`);

  // ── 4.33: TOTAL = SUM LOG (user B) ──
  console.log('\n=== 4.33: TOTAL users.contribution_points vs SUM log ===');
  const sumB = await prisma.contributionPointsLog.aggregate({ where: { user_id: REPORTER_B }, _sum: { points: true } });
  console.log(`  user B: users.contribution_points=${after.contribution_points}, SUM(log)=${sumB._sum.points} (match: ${after.contribution_points === sumB._sum.points})`);

  await app.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
