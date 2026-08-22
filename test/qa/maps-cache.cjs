/**
 * QA Fase 6 — 6.2 User-Agent, 6.3 cache, 6.4 cache miss
 * TestingModule kecil: MapsService ASLI + HttpService SPY (mencatat header & hit).
 * Tidak ada request eksternal nyata (spy) — deterministik.
 */
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { HttpService } = require('@nestjs/axios');
const { MapsService } = require('../../dist/modules/maps/maps.service.js');
const { of } = require('rxjs');

async function main() {
  const calls = [];
  const spyHttp = {
    get: (url, config) => {
      calls.push({ url, config });
      return of({
        data: {
          display_name: 'Jalan Test, Kota Malang',
          address: { road: 'Jalan Test', city: 'Kota Malang' },
        },
      });
    },
  };

  // env: NOMINATIM_USER_AGENT TIDAK diset di .env (temuan 1.6) → fallback dipakai
  const configService = new ConfigService({
    NOMINATIM_BASE_URL: 'https://nominatim.openstreetmap.org',
  });

  const moduleRef = await Test.createTestingModule({
    providers: [
      MapsService,
      { provide: ConfigService, useValue: configService },
      { provide: HttpService, useValue: spyHttp },
    ],
  }).compile();

  const maps = moduleRef.get(MapsService);

  // ── 6.2: User-Agent ──
  await maps.reverseGeocode(-7.982, 112.63);
  const ua = calls[0].config.headers['User-Agent'];
  console.log('=== 6.2: User-Agent ===');
  console.log(`  User-Agent terkirim: "${ua}"`);
  const uaOk = typeof ua === 'string' && ua.length > 5 && /LaporKita/i.test(ua);
  console.log(`  6.2: ${uaOk ? 'PASS (berisi identitas aplikasi LaporKita)' : 'FAIL (default/kosong)'}`);

  // ── 6.3: cache koordinat SAMA 2x → 1 hit eksternal ──
  console.log('\n=== 6.3: cache koordinat sama 2x ===');
  const c1 = await maps.reverseGeocode(-7.982, 112.63);
  const c2 = await maps.reverseGeocode(-7.982, 112.63);
  console.log(`  calls eksternal: ${calls.length} (harus 1 — kedua memakai cache)`);
  console.log(`  c1.cached=${c1.cached}, c2.cached=${c2.cached}`);
  const cacheOk = calls.length === 1 && c2.cached === true;
  console.log(`  6.3: ${cacheOk ? 'PASS (1 hit eksternal, kedua dari cache)' : 'FAIL'}`);

  // ── 6.4: koordinat BEDA → hit eksternal bertambah ──
  console.log('\n=== 6.4: koordinat berbeda ===');
  await maps.reverseGeocode(-7.983, 112.631);
  console.log(`  calls eksternal setelah koordinat baru: ${calls.length} (harus 2)`);
  const diffOk = calls.length === 2;
  console.log(`  6.4: ${diffOk ? 'PASS (cache tidak overzealous, lokasi beda → call)' : 'FAIL'}`);

  await moduleRef.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
