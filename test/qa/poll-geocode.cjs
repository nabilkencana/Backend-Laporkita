/**
 * QA Fase 6 — 6.1 timing throttle: polling DB utk job 6E yg tertinggal.
 * Worker baru memproses 3 job berurutan dgn limiter 1/1000ms.
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const codes = ['#LP-2026-6E00001', '#LP-2026-6E00002', '#LP-2026-6E00003'];
  const start = Date.now();
  const done = new Map();
  console.log(`mulai polling t=${start}`);
  while (done.size < 3 && Date.now() - start < 30000) {
    const rows = await prisma.report.findMany({
      where: { report_code: { in: codes }, address_text: { not: null } },
      select: { report_code: true },
    });
    for (const r of rows) {
      if (!done.has(r.report_code)) {
        done.set(r.report_code, ((Date.now() - start) / 1000).toFixed(2));
        console.log(`${r.report_code}: address terisi t+${done.get(r.report_code)}s`);
      }
    }
    await sleep(250);
  }
  const times = [...done.values()].map(Number).sort((a, b) => a - b);
  const intervals = [];
  for (let i = 1; i < times.length; i++) intervals.push((times[i] - times[i - 1]).toFixed(2));
  console.log(`interval antar selesai (s): ${intervals.join(', ')}`);
  const throttled = intervals.length > 0 && intervals.every((iv) => parseFloat(iv) >= 0.7);
  console.log(`6.1: ${throttled ? 'PASS (interval >= ~1s → throttle 1/detik aktif)' : 'FAIL (interval < 1s → burst/paralel)'}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
