/**
 * QA FIX-3 — F5-1: laporan isValidGps=false + confidence TINGGI
 * → needs_manual_review=true (flag eksplisit) + muncul di endpoint operator.
 * AppModule asli + stub AIVerificationService (layer test).
 */
const { Test } = require('@nestjs/testing');
const { AppModule } = require('../../dist/app.module.js');
const { AIVerificationService } = require('../../dist/modules/ai-verification/ai-verification.service.js');
const { ReportVerificationProcessor } = require('../../dist/modules/ai-verification/report-verification.processor.js');
const { PrismaService } = require('../../dist/prisma/prisma.service.js');
const { ReportStatus } = require('@prisma/client');

const REPORTER = '652ccfc5-2526-4de0-a40d-75bae9f6370f'; // citizen A fix3
const CATEGORY_ID = 'c1000000-0000-4000-8000-000000000001';
const AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';

async function main() {
  const stub = { verifyReport: async () => { throw new Error('not configured'); } };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AIVerificationService)
    .useValue(stub)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  const processor = app.get(ReportVerificationProcessor);
  const prisma = app.get(PrismaService);

  // Kasus: confidence 0.88 (TINGGI) tapi GPS INVALID
  const report = await prisma.report.create({
    data: {
      report_code: '#LP-2026-9F51001',
      reporter_id: REPORTER,
      category_id: CATEGORY_ID,
      assigned_agency_id: AGENCY_ID,
      description: 'F5-1 gps=false conf tinggi',
      latitude: -7.982,
      longitude: 112.63,
      status: ReportStatus.pending_verification,
      needs_manual_review: false,
    },
  });
  await prisma.reportStatusHistory.create({
    data: { report_id: report.id, status: ReportStatus.pending_verification, changed_by: REPORTER, note: 'seed F5-1' },
  });

  stub.verifyReport = async () => ({
    confidence: 0.88,        // TINGGI — lolos threshold
    category: 'Jalan Berlubang',
    isValidGps: false,       // TAPI GPS invalid → harus manual review
    isValidTimestamp: true,
    damageSeverity: 0.75,
    reason: 'stub F5-1 fix',
    isMock: true,
  });

  const result = await processor.process({ data: { reportId: report.id } });
  const after = await prisma.report.findUnique({ where: { id: report.id } });
  console.log(`processor result: ${result.status}`);
  console.log(`status DB: ${after.status} | confidence DB: ${after.ai_confidence_score}`);
  console.log(`needs_manual_review flag: ${after.needs_manual_review}`);
  const ok = after.status === ReportStatus.pending_verification && after.needs_manual_review === true;
  console.log(`F5-1 (flag di-set): ${ok ? 'PASS' : 'FAIL'}`);
  console.log(`reportId: ${report.id}`);

  await app.close();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
