/**
 * QA Fase 6 — 6.1 timing throttle (ukur interval via polling DB)
 * Enqueue 3 job koordinat unik → poll DB tiap 200ms → timeline selesai.
 * Limiter 1 job/1000ms → 3 job minimal ~2s (interval 1s antar selesai).
 * Kalau paralel/burst → selesai bersamaan (< 1s).
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Queue } = require('bullmq');

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const REPORTER = '0d83a338-d595-45d2-b452-f3af74a4864c';
const CATEGORY_ID = 'c1000000-0000-4000-8000-000000000001';
const AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';
const COORDS = [
  [-7.9811, 112.6411],
  [-7.9812, 112.6412],
  [-7.9813, 112.6413],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const queue = new Queue('reverse-geocode', { connection: { host: 'localhost', port: 6379 } });
  const codes = [];

  for (let i = 0; i < COORDS.length; i++) {
    const [lat, lng] = COORDS[i];
    const report = await prisma.report.create({
      data: {
        report_code: `#LP-2026-6E${String(i + 1).padStart(5, '0')}`,
        reporter_id: REPORTER,
        category_id: CATEGORY_ID,
        assigned_agency_id: AGENCY_ID,
        description: `F6.1 timing ${i + 1}`,
        latitude: lat,
        longitude: lng,
        status: 'verified',
        address_text: null,
      },
    });
    await prisma.reportStatusHistory.create({
      data: { report_id: report.id, status: 'verified', changed_by: REPORTER, note: 'seed F6.1 timing' },
    });
    await queue.add('reverse-geocode-job', { reportId: report.id, latitude: lat, longitude: lng });
    codes.push(report.report_code);
  }
  await queue.close();

  console.log(`enqueue 3 job pada t=${Date.now()} — mulai polling...`);
  const timeline = [];
  const start = Date.now();
  const done = new Set();
  while (done.size < 3 && Date.now() - start < 20000) {
    const rows = await prisma.report.findMany({
      where: { report_code: { in: codes }, address_text: { not: null } },
      select: { report_code: true },
    });
    for (const r of rows) {
      if (!done.has(r.report_code)) {
        done.add(r.report_code);
        timeline.push(`${r.report_code}: selesai t+${((Date.now() - start) / 1000).toFixed(2)}s`);
      }
    }
    await sleep(200);
  }
  console.log(timeline.join('\n'));
  const totalSec = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`total durasi 3 job: ${totalSec}s`);
  const intervals = [];
  const times = timeline.map((l) => parseFloat(l.match(/t\+([\d.]+)s/)[1]));
  for (let i = 1; i < times.length; i++) intervals.push((times[i] - times[i - 1]).toFixed(2));
  console.log(`interval antar selesai: ${intervals.join('s, ')}s`);
  const throttled = intervals.every((iv) => parseFloat(iv) >= 0.8);
  console.log(`6.1: ${throttled ? 'PASS (interval >= ~1s → throttle aktif)' : 'FAIL (interval < 1s → burst/paralel)'}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
