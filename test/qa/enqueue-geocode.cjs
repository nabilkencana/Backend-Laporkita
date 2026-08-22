/**
 * QA Fase 5 — 6.1: enqueue 5 job reverse-geocode koordinat UNIK via BullMQ.
 * Worker server dev (satu-satunya worker) yang consume dengan limiter 1/1000ms.
 * Interval antar request diukur dari log server ("Memanggil OpenStreetMap...").
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

// 5 koordinat UNIK (belum pernah di-geocode) — base di sekitar -7.98, 112.63
const COORDS = [
  [-7.9711, 112.6311],
  [-7.9722, 112.6322],
  [-7.9733, 112.6333],
  [-7.9744, 112.6344],
  [-7.9755, 112.6355],
];

async function main() {
  const queue = new Queue('reverse-geocode', {
    connection: { host: 'localhost', port: 6379 },
  });

  for (let i = 0; i < COORDS.length; i++) {
    const [lat, lng] = COORDS[i];
    const report = await prisma.report.create({
      data: {
        report_code: `#LP-2026-6D${String(i + 1).padStart(5, '0')}`,
        reporter_id: REPORTER,
        category_id: CATEGORY_ID,
        assigned_agency_id: AGENCY_ID,
        description: `F6.1 throttle coord ${i + 1}`,
        latitude: lat,
        longitude: lng,
        status: 'verified',
        address_text: null,
      },
    });
    await prisma.reportStatusHistory.create({
      data: { report_id: report.id, status: 'verified', changed_by: REPORTER, note: 'seed F6.1' },
    });
    await queue.add('reverse-geocode-job', {
      reportId: report.id,
      latitude: lat,
      longitude: lng,
    });
    console.log(`enqueue job ${i + 1}: report ${report.id} @ (${lat}, ${lng})`);
  }

  await queue.close();
  await prisma.$disconnect();
  console.log('Selesai enqueue 5 job — ukur interval di log server.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
