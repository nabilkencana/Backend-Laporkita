/**
 * QA Fase 5 — 5.1..5.5 AI Verification thresholds (Rules.md §1.2)
 * Boot AppModule ASLI (Prisma & ReportsService & processor asli) tapi
 * AIVerificationService di-STUB di layer test (bukan ubah source).
 * Laporan dibuat langsung via Prisma (tanpa enqueue) lalu processor.process()
 * dipanggil manual → verifikasi efek aktual di DB.
 */
const { Test } = require('@nestjs/testing');
const { AppModule } = require('../../dist/app.module.js');
const { AIVerificationService } = require('../../dist/modules/ai-verification/ai-verification.service.js');
const { ReportVerificationProcessor } = require('../../dist/modules/ai-verification/report-verification.processor.js');
const { PrismaService } = require('../../dist/prisma/prisma.service.js');
const { ReportStatus } = require('@prisma/client');

const REPORTER = '0d83a338-d595-45d2-b452-f3af74a4864c';
const CATEGORY_ID = 'c1000000-0000-4000-8000-000000000001';
const AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';

async function main() {
  // Stub AIVerificationService — di-set per kasus
  const stub = { verifyReport: async () => { throw new Error('stub not configured'); } };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AIVerificationService)
    .useValue(stub)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const processor = app.get(ReportVerificationProcessor);
  const prisma = app.get(PrismaService);

  const cases = [
    { name: '5.1 conf=0.59', confidence: 0.59, gps: true, ts: true, expect: 'MANUAL_REVIEW' },
    { name: '5.2 conf=0.60 exact', confidence: 0.6, gps: true, ts: true, expect: 'VERIFIED' },
    { name: '5.3 conf=0.61', confidence: 0.61, gps: true, ts: true, expect: 'VERIFIED' },
    { name: '5.4 conf=0.88 gps=FALSE', confidence: 0.88, gps: false, ts: true, expect: 'MANUAL_REVIEW' },
    { name: '5.5 conf=0.88 ts=FALSE', confidence: 0.88, gps: true, ts: false, expect: 'MANUAL_REVIEW' },
  ];

  const createdIds = [];
  for (const c of cases) {
    const report = await prisma.report.create({
      data: {
        report_code: `#LP-2026-6A${String(cases.indexOf(c) + 1).padStart(5, '0')}`,
        reporter_id: REPORTER,
        category_id: CATEGORY_ID,
        assigned_agency_id: AGENCY_ID,
        description: `QA F5 ${c.name}`,
        latitude: -7.982,
        longitude: 112.63,
        status: ReportStatus.pending_verification,
      },
    });
    await prisma.reportStatusHistory.create({
      data: { report_id: report.id, status: ReportStatus.pending_verification, changed_by: REPORTER, note: 'seed F5' },
    });
    createdIds.push(report.id);

    stub.verifyReport = async () => ({
      confidence: c.confidence,
      category: 'Jalan Berlubang',
      isValidGps: c.gps,
      isValidTimestamp: c.ts,
      damageSeverity: 0.75,
      reason: 'stub QA',
      isMock: true,
    });

    const job = { data: { reportId: report.id } };
    let result;
    try {
      result = await processor.process(job);
    } catch (e) {
      result = { status: 'THREW: ' + (e.message || e) };
    }

    const after = await prisma.report.findUnique({ where: { id: report.id } });
    const ok = (c.expect === 'VERIFIED' && after.status === ReportStatus.verified) ||
               (c.expect === 'MANUAL_REVIEW' && after.status === ReportStatus.pending_verification);
    console.log(`${c.name}: processor=${result.status} | status DB=${after.status} | confidence DB=${after.ai_confidence_score} => ${ok ? 'PASS' : 'FAIL (expect ' + c.expect + ')'}`);
  }

  // Simpan ID untuk test 5.6
  const fs = require('fs');
  fs.writeFileSync('/tmp/f5_report_ids.json', JSON.stringify(createdIds));
  console.log('\nreport IDs tersimpan utk 5.6:');
  createdIds.forEach((id, i) => console.log(`  ${cases[i].name}: ${id}`));

  await app.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
