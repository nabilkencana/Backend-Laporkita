/**
 * QA Fase 4 — State Machine Matrix 8x8 (service-layer, deterministik)
 * Boot AppModule asli (Nest application context) → Prisma asli → ReportsService asli.
 * Report dibuat langsung via Prisma (seed state, TANPA enqueue AI worker)
 * sehingga status awal presisi. Memanggil transitionReportStatus sungguhan.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.js';
import { ReportsService } from '../../src/modules/reports/reports.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { ReportStatus, MediaType } from '@prisma/client';

const REPORTER_ID = '0d83a338-d595-45d2-b452-f3af74a4864c'; // citizen A (qa.alpha)
const ACTOR_ID = 'abdfebf6-249e-46ae-904c-407dc3cfcba2'; // operator (qa.ops)
const CATEGORY_ID = 'c1000000-0000-4000-8000-000000000001';
const AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';

// Status awal yang membutuhkan completion_photo agar transisi legal in_progress->completed
// bisa diuji (4.5/4.6) — kita beri media pada laporan "completed-ready".
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);

  const statuses = Object.values(ReportStatus);
  console.log('Status enum order:', statuses.join(', '));

  // ── Buat 8 laporan, satu per status awal (seed state, tanpa enqueue) ──
  const reports: Record<string, string> = {};
  let seq = 0;
  for (const st of statuses) {
    seq += 1;
    const report = await prisma.report.create({
      data: {
        report_code: `#LP-2026-9${String(seq).padStart(6, '0')}`,
        reporter_id: REPORTER_ID,
        category_id: CATEGORY_ID,
        assigned_agency_id: AGENCY_ID,
        description: `state machine matrix from=${st}`,
        latitude: -7.982,
        longitude: 112.63,
        status: st,
      },
    });
    // history awal agar konsisten dgn alur nyata
    await prisma.reportStatusHistory.create({
      data: { report_id: report.id, status: st, changed_by: REPORTER_ID, note: 'seed matrix' },
    });
    reports[st] = report.id;
    console.log(`  seed from=${st} -> ${report.id}`);
  }
  // Untuk laporan from=in_progress: beri completion_photo (agar 4.5/4.6 bisa diuji)
  const inProgId = reports[ReportStatus.in_progress];
  await prisma.reportMedia.create({
    data: {
      report_id: inProgId,
      type: MediaType.completion_photo,
      url: 'https://storage.example.com/qa/matrix_completion.jpg',
      uploaded_by: ACTOR_ID,
    },
  });
  console.log('  completion_photo ditambahkan ke laporan from=in_progress');

  // ── Jalankan matrix 8x8 ──
  console.log('\nFROM->TO          RESULT');
  const results: Record<string, string> = {};
  for (const from of statuses) {
    for (const to of statuses) {
      const rid = reports[from];
      try {
        await reportsService.transitionReportStatus(rid, to, ACTOR_ID, `matrix ${from}->${to}`);
        results[`${from}|${to}`] = 'OK';
      } catch (e: unknown) {
        const err = e as { response?: { statusCode?: number }; message?: string };
        const code = err.response?.statusCode ?? 'ERR';
        const msg = (err.message ?? '').slice(0, 60);
        results[`${from}|${to}`] = `${code}:${msg}`;
      }
    }
  }

  // ── Cetak matrix ──
  console.log('\n=== MATRIX 8x8 (status code dari setiap transisi) ===');
  const header = 'FROM\\TO            ' + statuses.map((s) => s.padEnd(20)).join('');
  console.log(header);
  for (const from of statuses) {
    let row = from.padEnd(20);
    for (const to of statuses) {
      const r = results[`${from}|${to}`] ?? '?';
      const code = r.split(':')[0];
      row += code.padEnd(20);
    }
    console.log(row);
  }

  // ── Ringkas legal vs ilegal ──
  console.log('\n=== VERIFIKASI LEGAL TRANSITIONS (Rules.md §1.1) ===');
  const legal: Array<[ReportStatus, ReportStatus]> = [
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
    const ok = r.startsWith('OK');
    console.log(`  ${from} -> ${to}: ${ok ? 'LEGAL OK' : 'GAGAL: ' + r}`);
    if (ok) legalOk++;
  }
  console.log(`Legal transitions sukses: ${legalOk}/${legal.length}`);

  // ── Hitung ilegal yang harus 409 INVALID_STATUS_TRANSITION ──
  let illegal409 = 0;
  let illegalTotal = 0;
  for (const from of statuses) {
    for (const to of statuses) {
      if (legal.some(([f, t]) => f === from && t === to)) continue;
      illegalTotal++;
      const r = results[`${from}|${to}`] ?? '?';
      if (r.startsWith('409')) illegal409++;
      else console.log(`  ILEGAL LOLOS?: ${from} -> ${to} => ${r}`);
    }
  }
  console.log(`Transisi ilegal ditolak 409: ${illegal409}/${illegalTotal}`);

  await app.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
