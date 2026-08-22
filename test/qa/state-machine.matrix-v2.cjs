/**
 * QA Fase 4 — State Machine Matrix 8x8 v2 (service-layer, DETERMINISTIK)
 * SATU laporan per kombinasi (64 laporan) → status awal selalu presisi,
 * tidak ada state mutation antar target.
 */
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module.js');
const { ReportsService } = require('../../dist/modules/reports/reports.service.js');
const { PrismaService } = require('../../dist/prisma/prisma.service.js');
const { ReportStatus, MediaType } = require('@prisma/client');

const REPORTER_ID = '0d83a338-d595-45d2-b452-f3af74a4864c';
const ACTOR_ID = 'abdfebf6-249e-46ae-904c-407dc3cfcba2';
const CATEGORY_ID = 'c1000000-0000-4000-8000-000000000001';
const AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);

  const statuses = Object.values(ReportStatus);
  const results = {};
  let seq = 0;

  console.log('Membuat 64 laporan (1 per kombinasi from->to)...');
  for (const from of statuses) {
    for (const to of statuses) {
      seq += 1;
      const report = await prisma.report.create({
        data: {
          report_code: `#LP-2026-8${String(seq).padStart(6, '0')}`,
          reporter_id: REPORTER_ID,
          category_id: CATEGORY_ID,
          assigned_agency_id: AGENCY_ID,
          description: `matrix ${from}->${to}`,
          latitude: -7.982,
          longitude: 112.63,
          status: from,
        },
      });
      await prisma.reportStatusHistory.create({
        data: { report_id: report.id, status: from, changed_by: REPORTER_ID, note: 'seed matrix v2' },
      });
      // Supaya transisi in_progress->completed (legal, 4.5/4.6) bisa diuji,
      // beri completion_photo pada SEMUA laporan from=in_progress DAN
      // from=pending_verification (karena pending->in_progress->completed juga tidak legal,
      // photo tidak relevan di sana — hanya in_progress yang butuh).
      if (from === ReportStatus.in_progress) {
        await prisma.reportMedia.create({
          data: {
            report_id: report.id,
            type: MediaType.completion_photo,
            url: 'https://storage.example.com/qa/matrix_completion.jpg',
            uploaded_by: ACTOR_ID,
          },
        });
      }
      try {
        await reportsService.transitionReportStatus(report.id, to, ACTOR_ID, `matrix ${from}->${to}`);
        results[`${from}|${to}`] = 'OK';
      } catch (e) {
        const code = e.response?.statusCode ?? 'ERR';
        results[`${from}|${to}`] = `${code}`;
      }
    }
  }

  console.log('\n=== MATRIX 8x8 (status code per transisi, 1 laporan per kombinasi) ===');
  let header = 'FROM\\TO'.padEnd(22);
  for (const s of statuses) header += s.padEnd(20);
  console.log(header);
  for (const from of statuses) {
    let row = from.padEnd(22);
    for (const to of statuses) {
      const r = results[`${from}|${to}`] ?? '?';
      row += r.padEnd(20);
    }
    console.log(row);
  }

  console.log('\n=== VERIFIKASI LEGAL (Rules.md §1.1 — 8 transisi) ===');
  const legal = [
    [ReportStatus.pending_verification, ReportStatus.verified],
    [ReportStatus.pending_verification, ReportStatus.rejected],
    [ReportStatus.verified, ReportStatus.assigned],
    [ReportStatus.assigned, ReportStatus.in_progress],
    [ReportStatus.in_progress, ReportStatus.completed],
    [ReportStatus.completed, ReportStatus.resolved],
    [ReportStatus.completed, ReportStatus.disputed],
    [ReportStatus.disputed, ReportStatus.in_progress],
  ];
  let legalOk = 0;
  for (const [from, to] of legal) {
    const r = results[`${from}|${to}`] ?? '?';
    const ok = r === 'OK';
    console.log(`  ${from} -> ${to}: ${ok ? 'LEGAL OK' : 'GAGAL: HTTP ' + r}`);
    if (ok) legalOk++;
  }
  console.log(`Legal transitions sukses: ${legalOk}/${legal.length}`);

  console.log('\n=== VERIFIKASI ILEGAL (56 kombinasi, harus 409) ===');
  let illegal409 = 0;
  let illegalTotal = 0;
  for (const from of statuses) {
    for (const to of statuses) {
      if (legal.some(([f, t]) => f === from && t === to)) continue;
      illegalTotal++;
      const r = results[`${from}|${to}`] ?? '?';
      if (r === '409') illegal409++;
      else console.log(`  ⚠️ ILEGAL TIDAK 409: ${from} -> ${to} => HTTP ${r}`);
    }
  }
  console.log(`Transisi ilegal ditolak 409: ${illegal409}/${illegalTotal}`);

  await app.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
