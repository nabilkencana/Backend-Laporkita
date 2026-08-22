/**
 * QA Fase 5 — 5.8..5.11 Smart Priority (Rules.md §1.3)
 * 5.8: formula presisi (computeScore vs hitung manual)
 * 5.9: ubah bobot via system_configs (DB, bukan kode) → recalculate
 * 5.10/5.11: recalculateNearbyReports radius 200m (dalam/ luar radius)
 */
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module.js');
const { SmartPriorityService } = require('../../dist/modules/smart-priority/smart-priority.service.js');
const { PrismaService } = require('../../dist/prisma/prisma.service.js');
const { ReportStatus } = require('@prisma/client');

const REPORTER = '0d83a338-d595-45d2-b452-f3af74a4864c';
const CATEGORY_ID = 'c1000000-0000-4000-8000-000000000001';
const AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sp = app.get(SmartPriorityService);
  const prisma = app.get(PrismaService);

  // ── 5.8: FORMULA PRESISI ──
  console.log('=== 5.8: FORMULA PRESISI (computeScore vs hitung manual) ===');
  const weights = await sp.getWeights();
  console.log('bobot dari config DB:', JSON.stringify(weights));

  // Rumus dari source (smart-priority.service.ts:57-100):
  // damage = clamp(damage,0,1); support = clamp(support/100,0,1); density = clamp(density/10,0,1); cat = clamp(cat/2,0,1)
  // score = (w1*damage + w2*support + w3*density + w4*cat) * 5, dibulatkan 2 desimal
  const manual = (damage, support, density, cat, w) => {
    const d = Math.max(0, Math.min(1, damage));
    const s = Math.max(0, Math.min(1, support / w.support_cap));
    const den = Math.max(0, Math.min(1, density / 10));
    const c = Math.max(0, Math.min(1, cat / 2));
    return Number(((w.w1_damage_severity * d + w.w2_support * s + w.w3_density * den + w.w4_category * c) * 5).toFixed(2));
  };

  const sets = [
    { damage: 0.8, support: 50, density: 3, cat: 1.5 },
    { damage: 0.3, support: 200, density: 12, cat: 0.8 },
    { damage: 1.0, support: 0, density: 0, cat: 2.0 },
  ];
  let allOk = true;
  for (const [i, s] of sets.entries()) {
    const expected = manual(s.damage, s.support, s.density, s.cat, weights);
    const actual = sp.computeScore(s.damage, s.support, s.density, s.cat, weights).urgency_score;
    const ok = Math.abs(actual - expected) < 0.011;
    if (!ok) allOk = false;
    console.log(`  set${i + 1} (d=${s.damage},sup=${s.support},den=${s.density},cat=${s.cat}): expected=${expected} actual=${actual} => ${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(`5.8: ${allOk ? 'PASS (3/3)' : 'FAIL'}`);

  // ── 5.9: UBAH BOBOT VIA CONFIG (DB, bukan kode) ──
  console.log('\n=== 5.9: BOBOT DARI CONFIG (ubah system_configs, recalculate) ===');
  const r9 = await prisma.report.create({
    data: {
      report_code: '#LP-2026-6B90001',
      reporter_id: REPORTER,
      category_id: CATEGORY_ID,
      assigned_agency_id: AGENCY_ID,
      description: 'F5.9 bobot config',
      latitude: -7.99,
      longitude: 112.65,
      status: ReportStatus.verified,
      damage_severity: 0.8,
      support_count: 10,
    },
  });
  await prisma.reportStatusHistory.create({
    data: { report_id: r9.id, status: ReportStatus.verified, changed_by: REPORTER, note: 'seed F5.9' },
  });
  const before = await sp.recalculateUrgencyScore(r9.id);
  console.log(`  urgency dgn bobot lama (w1=0.35): ${before}`);

  // Ubah w1_damage_severity 0.35 → 0.9 via DB (BUKAN redeploy)
  const orig = await prisma.systemConfig.findUnique({ where: { key: 'smart_priority_weights' } });
  await prisma.systemConfig.update({
    where: { key: 'smart_priority_weights' },
    data: { value: { ...orig.value, w1_damage_severity: 0.9 } },
  });
  const after = await sp.recalculateUrgencyScore(r9.id);
  console.log(`  urgency dgn bobot baru (w1=0.9): ${after}`);
  console.log(`  5.9: ${after > before ? 'PASS (naik sesuai bobot baru)' : 'FAIL (tidak berubah/naik)'}`);

  // Kembalikan bobot asli (jangan tinggalkan state berubah)
  await prisma.systemConfig.update({
    where: { key: 'smart_priority_weights' },
    data: { value: orig.value },
  });
  const restored = await sp.recalculateUrgencyScore(r9.id);
  console.log(`  bobot dikembalikan → urgency: ${restored} (harus kembali ~${before})`);

  // ── 5.10/5.11: RADIUS 200m ──
  console.log('\n=== 5.10/5.11: RECALCULATE RADIUS 200m ===');
  // Laporan anchor di (-7.9950, 112.6500)
  const anchor = await prisma.report.create({
    data: {
      report_code: '#LP-2026-6C00001',
      reporter_id: REPORTER,
      category_id: CATEGORY_ID,
      assigned_agency_id: AGENCY_ID,
      description: 'anchor F5.10',
      latitude: -7.995,
      longitude: 112.65,
      status: ReportStatus.verified,
      damage_severity: 0.5,
    },
  });
  await prisma.reportStatusHistory.create({
    data: { report_id: anchor.id, status: ReportStatus.verified, changed_by: REPORTER, note: 'seed F5.10' },
  });
  const anchorScoreBefore = await sp.recalculateUrgencyScore(anchor.id);
  console.log(`  anchor urgency sebelum: ${anchorScoreBefore}`);

  // Laporan dalam radius (~100m) — lat +0.0009 ≈ 100m
  const near = await prisma.report.create({
    data: {
      report_code: '#LP-2026-6C00002',
      reporter_id: REPORTER,
      category_id: CATEGORY_ID,
      assigned_agency_id: AGENCY_ID,
      description: 'near F5.10 (100m)',
      latitude: -7.9941,
      longitude: 112.65,
      status: ReportStatus.pending_verification,
      damage_severity: 0.5,
    },
  });
  await prisma.reportStatusHistory.create({
    data: { report_id: near.id, status: ReportStatus.pending_verification, changed_by: REPORTER, note: 'seed F5.10' },
  });
  const updatedCount = await sp.recalculateNearbyReports(-7.9941, 112.65);
  const anchorScoreAfter = await sp.recalculateUrgencyScore(anchor.id);
  console.log(`  recalculateNearbyReports dari (near) → updated ${updatedCount} laporan`);
  console.log(`  anchor urgency sesudah: ${anchorScoreAfter} (harus naik: ${anchorScoreAfter > anchorScoreBefore ? 'PASS 5.10' : 'FAIL'})`);

  // Laporan di luar radius (~1.1km) — lat +0.01 ≈ 1110m
  const far = await prisma.report.create({
    data: {
      report_code: '#LP-2026-6C00003',
      reporter_id: REPORTER,
      category_id: CATEGORY_ID,
      assigned_agency_id: AGENCY_ID,
      description: 'far F5.11 (~1.1km)',
      latitude: -7.985,
      longitude: 112.65,
      status: ReportStatus.pending_verification,
      damage_severity: 0.9,
    },
  });
  await prisma.reportStatusHistory.create({
    data: { report_id: far.id, status: ReportStatus.pending_verification, changed_by: REPORTER, note: 'seed F5.11' },
  });
  const anchorBeforeFar = await sp.recalculateUrgencyScore(anchor.id);
  const updatedFar = await sp.recalculateNearbyReports(-7.985, 112.65);
  const anchorAfterFar = await sp.recalculateUrgencyScore(anchor.id);
  console.log(`  recalculateNearbyReports dari (far) → updated ${updatedFar} laporan`);
  console.log(`  anchor urgency: ${anchorBeforeFar} → ${anchorAfterFar} (harus TIDAK berubah: ${anchorAfterFar === anchorBeforeFar ? 'PASS 5.11' : 'FAIL'})`);

  await app.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
