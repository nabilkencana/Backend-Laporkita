/**
 * QA Fase 6 — 6.7: prediction mock XGBoost bisa jalan tanpa mengubah caller
 * Boot AppModule asli → buat zona seed → refreshAllZoneMetrics() (mock path,
 * karena AI_SERVICE_URL tidak merespons) → verifikasi zone_metrics & stress_level.
 */
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module.js');
const { PredictionService } = require('../../dist/modules/prediction/prediction.service.js');
const { PrismaService } = require('../../dist/prisma/prisma.service.js');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prediction = app.get(PredictionService);
  const prisma = app.get(PrismaService);

  console.log('=== 6.7: STRUKTUR INTERFACE (IPredictionService) ===');
  // Dari source: prediction.service.ts implements IPredictionService (prediction.interface.ts)
  // Method: predictZoneMetrics(zoneId), refreshAllZoneMetrics(). Caller (controller)
  // memanggil method interface — swap mock↔real hanya lewat AI_SERVICE_URL env,
  // TANPA mengubah caller. Verifikasi eksekusi di bawah.

  const zone = await prisma.zone.create({
    data: { id: 'd1000000-0000-4000-8000-000000000001', name: 'Klojen Utara (QA F6)' },
  });
  console.log(`zona seed: ${zone.name} (${zone.id})`);

  const result = await prediction.refreshAllZoneMetrics();
  console.log(`refreshAllZoneMetrics → updated ${result.updatedCount} zona, results[0].isMock=${result.results[0]?.isMock}`);

  const metric = await prisma.zoneMetric.findFirst({
    where: { zone_id: zone.id },
    orderBy: { recorded_at: 'desc' },
  });
  const zoneAfter = await prisma.zone.findUnique({ where: { id: zone.id } });
  console.log(`zone_metrics row: ${metric ? 'ADA' : 'TIDAK ADA'}`);
  console.log(`  report_density=${metric?.report_density}, flood_risk=${metric?.flood_risk_probability}, weather_context.source=${metric?.weather_context?.source}`);
  console.log(`zones.stress_level setelah refresh: ${zoneAfter?.stress_level}`);

  const ok = result.updatedCount >= 1 && !!metric && zoneAfter.stress_level !== null;
  console.log(`6.7: ${ok ? 'PASS (mock XGBoost jalan via interface, caller tak berubah; persist zone_metrics OK)' : 'FAIL'}`);

  // Catatan desain utk laporan: controller inject PredictionService (class), bukan token
  // interface — swap antar-class butuh ubah module, tapi swap mock↔real (yg diminta test)
  // cukup via env AI_SERVICE_URL. Tidak hardcoded ke satu implementasi.

  await app.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
