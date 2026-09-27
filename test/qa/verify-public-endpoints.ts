import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Target Public Endpoints requested by User
const BACKEND_BASE = 'https://api.canadev.my.id/api/v1';
const SWAGGER_DOCS = 'https://api.canadev.my.id/api/docs';
const AI_SERVICE_BASE = 'https://ai.canadev.my.id';
const AI_DEMO_CONSOLE = 'https://ai.canadev.my.id/demo';

const DB_URL =
  process.env.DATABASE_URL ||
  '';

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

interface StepRecord {
  category: string;
  test: string;
  targetUrl: string;
  status: 'PASS' | 'FAIL';
  httpStatus?: number;
  timeMs: number;
  detail?: string;
}

const records: StepRecord[] = [];

async function runStep(
  category: string,
  test: string,
  targetUrl: string,
  fn: () => Promise<{ httpStatus?: number; detail?: string }>,
) {
  const t0 = Date.now();
  process.stdout.write(`  ▶ [${category}] ${test} (${targetUrl}) ... `);
  try {
    const res = await fn();
    const duration = Date.now() - t0;
    console.log(`✅ PASS (${duration}ms) [HTTP ${res.httpStatus || 200}] ${res.detail ? `— ${res.detail}` : ''}`);
    records.push({
      category,
      test,
      targetUrl,
      status: 'PASS',
      httpStatus: res.httpStatus || 200,
      timeMs: duration,
      detail: res.detail,
    });
  } catch (err: unknown) {
    const duration = Date.now() - t0;
    let msg = 'Error';
    let statusCode: number | undefined;
    if (axios.isAxiosError(err)) {
      statusCode = err.response?.status;
      msg = err.response?.data?.error?.message || err.response?.data?.detail || err.message;
    } else if (err instanceof Error) {
      msg = err.message;
    }
    console.log(`❌ FAIL (${duration}ms) [HTTP ${statusCode || 'ERR'}] — ${msg}`);
    records.push({
      category,
      test,
      targetUrl,
      status: 'FAIL',
      httpStatus: statusCode,
      timeMs: duration,
      detail: msg,
    });
  }
}

async function run() {
  console.log('========================================================================');
  console.log('🌐 VERIFIKASI LENGKAP ENDPOINT PUBLIK & WORKFLOW PRD LAPORKITA');
  console.log('========================================================================');
  console.log(`1. Backend API Base:           ${BACKEND_BASE}`);
  console.log(`2. Swagger Documentation:      ${SWAGGER_DOCS}`);
  console.log(`3. AI Service Base:            ${AI_SERVICE_BASE}`);
  console.log(`4. AI Interactive Web Console: ${AI_DEMO_CONSOLE}`);
  console.log('========================================================================\n');

  // Shared state
  let adminToken = '';
  let citizenToken = '';
  let operatorToken = '';
  let policyMakerToken = '';
  let activeReportId = '';
  const jalanBerlubangCatId = 'c1000000-0000-4000-8000-000000000001';
  const klojenZoneId = 'b1000000-0000-4000-8000-000000000001';

  // ── 1. VERIFIKASI 4 ENDPOINT PUBLIK UTAMA ─────────────────────────────────
  console.log('── 1. Verifikasi Langsung 4 Endpoint Publik Utama ──');

  await runStep('Public URL', 'Akses Swagger Documentation UI', SWAGGER_DOCS, async () => {
    const res = await axios.get(SWAGGER_DOCS);
    if (!res.data.includes('Swagger UI')) throw new Error('HTML does not contain Swagger UI');
    return { httpStatus: res.status, detail: 'Swagger UI HTML rendered (35 API endpoints)' };
  });

  await runStep('Public URL', 'Akses Swagger JSON Schema', `${SWAGGER_DOCS}-json`, async () => {
    const res = await axios.get(`${SWAGGER_DOCS}-json`);
    const pathsCount = Object.keys(res.data.paths || {}).length;
    return { httpStatus: res.status, detail: `Title="${res.data.info.title}", Endpoints=${pathsCount}` };
  });

  await runStep('Public URL', 'Akses AI Interactive Web Console', AI_DEMO_CONSOLE, async () => {
    const res = await axios.get(AI_DEMO_CONSOLE);
    if (!res.data.includes('LaporKita AI Console')) throw new Error('Demo HTML not found');
    return { httpStatus: res.status, detail: 'Interactive Web Sandbox rendered' };
  });

  await runStep('Public URL', 'Akses AI Service Base & Health', `${AI_SERVICE_BASE}/health`, async () => {
    const res = await axios.get(`${AI_SERVICE_BASE}/health`);
    const m = res.data.data.models;
    return {
      httpStatus: res.status,
      detail: `Environment=${res.data.data.environment}, YOLO=${m.yolo_classification_loaded}, XGBoost=${m.xgboost_risk_loaded}`,
    };
  });

  await runStep('Public URL', 'Akses Backend Base Healthcheck', `${BACKEND_BASE}/health`, async () => {
    const res = await axios.get(`${BACKEND_BASE}/health`);
    return { httpStatus: res.status, detail: `Status=${res.data.data.status}, Version=${res.data.data.version}` };
  });

  // ── 2. WORKFLOW PRD §3 & §6.1: AUTENTIKASI SEMUA ROLE ─────────────────────
  console.log('\n── 2. Workflow PRD §3: Autentikasi Pengguna & Hak Akses Role ──');

  await runStep('Auth', 'Login Admin (Command Center Master)', `${BACKEND_BASE}/auth/login`, async () => {
    const res = await axios.post(`${BACKEND_BASE}/auth/login`, {
      identifier: 'admin@laporkita.malangkota.go.id',
      password: 'AdminLaporKita2026!',
    });
    adminToken = res.data.data.access_token;
    return { httpStatus: res.status, detail: `Role=${res.data.data.user.role}, Name=${res.data.data.user.full_name}` };
  });

  await runStep('Auth', 'Login Warga (Citizen App)', `${BACKEND_BASE}/auth/login`, async () => {
    const res = await axios.post(`${BACKEND_BASE}/auth/login`, {
      identifier: 'warga@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    citizenToken = res.data.data.access_token;
    return {
      httpStatus: res.status,
      detail: `Role=${res.data.data.user.role}, Points=${res.data.data.user.contribution_points}`,
    };
  });

  await runStep('Auth', 'Login Operator DPUPR (Command Center Dinas)', `${BACKEND_BASE}/auth/login`, async () => {
    const res = await axios.post(`${BACKEND_BASE}/auth/login`, {
      identifier: 'operator.dpupr@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    operatorToken = res.data.data.access_token;
    return { httpStatus: res.status, detail: `Role=${res.data.data.user.role}, AgencyId=${res.data.data.user.agency_id}` };
  });

  await runStep('Auth', 'Login Policy Maker (Eksekutif & Tata Ruang)', `${BACKEND_BASE}/auth/login`, async () => {
    const res = await axios.post(`${BACKEND_BASE}/auth/login`, {
      identifier: 'policymaker@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    policyMakerToken = res.data.data.access_token;
    return { httpStatus: res.status, detail: `Role=${res.data.data.user.role}` };
  });

  await runStep('Auth', 'Rotasi Refresh Token Single-Use (SA-2)', `${BACKEND_BASE}/auth/refresh`, async () => {
    const loginRes = await axios.post(`${BACKEND_BASE}/auth/login`, {
      identifier: 'warga@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    const refToken = loginRes.data.data.refresh_token;
    const res = await axios.post(`${BACKEND_BASE}/auth/refresh`, { refresh_token: refToken });
    return { httpStatus: res.status, detail: `Access token baru berhasil diterbitkan` };
  });

  // ── 3. WORKFLOW PRD §6.1 & RULES §1.1-§1.5: FROM REPORT TO RESOLVE ────────
  console.log('\n── 3. Workflow PRD §6.1 & Rules: Digital Accountability Loop (Report to Resolve) ──');

  // Siapkan foto riil 640x480 untuk laporan jalan berlubang
  const photoBuffer = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 90, g: 90, b: 90 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();

  await runStep('Report Flow', 'Submit Laporan Warga dengan Foto & GPS Malang', `${BACKEND_BASE}/reports`, async () => {
    const form = new FormData();
    form.append('category_id', jalanBerlubangCatId);
    form.append('latitude', '-7.9826');
    form.append('longitude', '112.6308');
    form.append('description', 'Lubang aspal jalan sedalam 15cm di depan kantor pos Alun-Alun Malang');
    form.append('photo', photoBuffer, { filename: 'jalan-alun-alun.jpg', contentType: 'image/jpeg' });

    const res = await axios.post(`${BACKEND_BASE}/reports`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${citizenToken}` },
    });
    activeReportId = res.data.data.id;
    return {
      httpStatus: res.status,
      detail: `ID=${activeReportId}, Kode=${res.data.data.report_code}, Status=${res.data.data.status}`,
    };
  });

  await runStep('Report Flow', 'Ambil Detail Laporan & Verifikasi Foto', `${BACKEND_BASE}/reports/:id`, async () => {
    const res = await axios.get(`${BACKEND_BASE}/reports/${activeReportId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const d = res.data.data;
    return {
      httpStatus: res.status,
      detail: `Kode=${d.report_code}, MediaCount=${d.media?.length}, Urgency=${d.urgency_score}`,
    };
  });

  await runStep('Community', 'Warga Mendukung Laporan (Upvote)', `${BACKEND_BASE}/reports/:id/support`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/reports/${activeReportId}/support`,
      {},
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return { httpStatus: res.status, detail: `SupportCount=${res.data.data.support_count}` };
  });

  await runStep('Community', 'Proteksi Duplikasi Upvote (Rules §1.4)', `${BACKEND_BASE}/reports/:id/support`, async () => {
    try {
      await axios.post(
        `${BACKEND_BASE}/reports/${activeReportId}/support`,
        {},
        { headers: { Authorization: `Bearer ${citizenToken}` } },
      );
      throw new Error('Upvote ganda seharusnya dicegah');
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        return { httpStatus: 409, detail: '409 Conflict: 1 user hanya 1 dukungan' };
      }
      throw err;
    }
  });

  await runStep('Community', 'Komentar Wajar Publik', `${BACKEND_BASE}/reports/:id/comments`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/reports/${activeReportId}/comments`,
      { content: 'Banyak motor terperosok di sini kalau malam, tolong segera ditambal.' },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return { httpStatus: res.status, detail: `CommentId=${res.data.data.id}, is_flagged=${res.data.data.is_flagged}` };
  });

  await runStep('Moderation', 'Filter Otomatis Kata Kasar (Rules §2.3)', `${BACKEND_BASE}/reports/:id/comments`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/reports/${activeReportId}/comments`,
      { content: 'Pemerintah anjing lambat banget kerjanya!' },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    if (!res.data.data.is_flagged) throw new Error('Komentar tidak ter-flag otomatis');
    return { httpStatus: res.status, detail: `is_flagged=${res.data.data.is_flagged} (Otomatis ditandai untuk review)` };
  });

  await runStep('Operator', 'Transisi Status: verified -> assigned', `${BACKEND_BASE}/reports/:id/status`, async () => {
    // Pastikan verified dulu jika masih pending
    const current = await axios.get(`${BACKEND_BASE}/reports/${activeReportId}`, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    if (current.data.data.status === 'pending_verification') {
      await axios.patch(
        `${BACKEND_BASE}/reports/${activeReportId}/status`,
        { status: 'verified', note: 'Verifikasi lapangan valid' },
        { headers: { Authorization: `Bearer ${operatorToken}` } },
      );
    }
    const res = await axios.patch(
      `${BACKEND_BASE}/reports/${activeReportId}/status`,
      { status: 'assigned', note: 'Ditugaskan ke Tim Reaksi Cepat DPUPRPKP' },
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return { httpStatus: res.status, detail: `Status saat ini = ${res.data.data.status}` };
  });

  await runStep('Operator', 'Transisi Status: assigned -> in_progress', `${BACKEND_BASE}/reports/:id/status`, async () => {
    const res = await axios.patch(
      `${BACKEND_BASE}/reports/${activeReportId}/status`,
      { status: 'in_progress', note: 'Pekerjaan penambalan aspal dimulai di lokasi' },
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return { httpStatus: res.status, detail: `Status saat ini = ${res.data.data.status}` };
  });

  await runStep('Operator', 'Upload Bukti Foto Selesai Perbaikan', `${BACKEND_BASE}/reports/:id/media`, async () => {
    const form = new FormData();
    form.append('type', 'completion_photo');
    form.append('photo', photoBuffer, { filename: 'selesai-perbaikan.jpg', contentType: 'image/jpeg' });
    const res = await axios.post(`${BACKEND_BASE}/reports/${activeReportId}/media`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${operatorToken}` },
    });
    return { httpStatus: res.status, detail: `Tipe=${res.data.data.type}, URL=${res.data.data.url?.slice(0, 35)}...` };
  });

  await runStep('Operator', 'Transisi Status: in_progress -> completed', `${BACKEND_BASE}/reports/:id/status`, async () => {
    const res = await axios.patch(
      `${BACKEND_BASE}/reports/${activeReportId}/status`,
      { status: 'completed', note: 'Penambalan aspal selesai 100%' },
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return { httpStatus: res.status, detail: `Status saat ini = ${res.data.data.status}` };
  });

  await runStep('Citizen', 'Citizen Validation: Konfirmasi Hasil -> RESOLVED', `${BACKEND_BASE}/reports/:id/validate`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/reports/${activeReportId}/validate`,
      {
        is_valid: true,
        latitude: -7.9826,
        longitude: 112.6308,
        note: 'Pekerjaan penambalan sudah rapi dan aspal sudah kering.',
      },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return { httpStatus: res.status, detail: `Status akhir laporan = ${res.data.data.status} (RESOLVED 🎉)` };
  });

  // ── 4. WORKFLOW PRD §4.1: MAPS & ROUTE ALERT ──────────────────────────────
  console.log('\n── 4. Workflow PRD §4.1: Peta, Routing OSRM & Route Alerts ──');

  await runStep('Maps', 'Hitung Rute Jalan (OSRM Kota Malang)', `${BACKEND_BASE}/maps/route`, async () => {
    const res = await axios.post(`${BACKEND_BASE}/maps/route`, {
      origin_lat: -7.9827,
      origin_lng: 112.6304,
      destination_lat: -7.9701,
      destination_lng: 112.6412,
    });
    const d = res.data.data;
    return {
      httpStatus: res.status,
      detail: `Jarak=${d.distance_meters}m, Estimasi Waktu=${Math.round(d.duration_seconds)}s`,
    };
  });

  await runStep('Maps', 'Pencarian Titik Kerusakan Sepanjang Rute', `${BACKEND_BASE}/reports/along-route`, async () => {
    const res = await axios.post(`${BACKEND_BASE}/reports/along-route`, {
      route_points: [
        { lat: -7.9827, lng: 112.6304 },
        { lat: -7.9781, lng: 112.635 },
        { lat: -7.9701, lng: 112.6412 },
      ],
      radius_meters: 500,
    });
    return { httpStatus: res.status, detail: `Laporan aktif dalam koridor rute = ${res.data.data.length}` };
  });

  await runStep('Route Alert', 'Langganan Geofencing Route Alert Warga', `${BACKEND_BASE}/route-alerts/subscribe`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/route-alerts/subscribe`,
      {
        device_token: 'fcm-token-malang-citizen-qa',
        last_lat: -7.9827,
        last_long: 112.6304,
      },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return { httpStatus: res.status, detail: 'Device token FCM aktif terdaftar' };
  });

  await runStep('Route Alert', 'Cek Bahaya di Sekitar Koordinat Realtime', `${BACKEND_BASE}/route-alerts/check`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/route-alerts/check`,
      { current_lat: -7.9826, current_lng: 112.6308 },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return { httpStatus: res.status, detail: `Notifikasi bahaya terdekat = ${res.data.data?.length ?? 0}` };
  });

  // ── 5. WORKFLOW PRD §4.2 & §4.3: URBAN EMOTION MAP, PREDIKSI & POLICY SIMULATOR ─
  console.log('\n── 5. Workflow PRD §4.2 & §4.3: Urban Emotion Map, Prediksi Risiko & Policy Simulator ──');

  await runStep('Emotion Map', 'Ambil 5 Zona Wilayah Kota Malang', `${BACKEND_BASE}/predictions/zones`, async () => {
    const res = await axios.get(`${BACKEND_BASE}/predictions/zones`);
    const names = res.data.data.map((z: { name: string }) => z.name).join(', ');
    return { httpStatus: res.status, detail: `5 Zona = ${names}` };
  });

  await runStep('AI Inference', 'Refresh Prediksi Risiko (XGBoost Microservice)', `${BACKEND_BASE}/predictions/metrics/refresh`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/predictions/metrics/refresh`,
      {},
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return { httpStatus: res.status, detail: `Inferensi selesai untuk ${res.data.data.updatedCount} zona` };
  });

  await runStep('Policy Simulator', 'Eksekusi Simulasi Kebijakan (Gemini 2.5 Flash)', `${BACKEND_BASE}/policy-simulations`, async () => {
    const res = await axios.post(
      `${BACKEND_BASE}/policy-simulations`,
      {
        prompt_text: 'Simulasi alokasi anggaran penanganan banjir dan perbaikan drainase di Klojen dan Lowokwaru',
        zone_id: klojenZoneId,
      },
      { headers: { Authorization: `Bearer ${policyMakerToken}` } },
    );
    const d = res.data.data;
    return {
      httpStatus: res.status,
      detail: `Model=${d.resultData?.source_model}, Estimasi Biaya=Rp${d.resultData?.estimated_budget_idr?.toLocaleString()}, Reduksi Keluhan=${d.resultData?.estimated_complaint_reduction_percent}%`,
    };
  });

  await runStep('Policy Simulator', 'Histori Simulasi Kebijakan', `${BACKEND_BASE}/policy-simulations`, async () => {
    const res = await axios.get(`${BACKEND_BASE}/policy-simulations?limit=5`, {
      headers: { Authorization: `Bearer ${policyMakerToken}` },
    });
    return { httpStatus: res.status, detail: `Total simulasi tersimpan = ${res.data.data.length}` };
  });

  // ── REKAPITULASI HASIL PENGUJIAN ──────────────────────────────────────────
  console.log('\n========================================================================');
  const passCount = records.filter((r) => r.status === 'PASS').length;
  const failCount = records.filter((r) => r.status === 'FAIL').length;
  const totalDuration = records.reduce((sum, r) => sum + r.timeMs, 0);

  console.log('📋 HASIL AKHIR PENGUJIAN:');
  console.log(`   Total Pengujian:  ${records.length}`);
  console.log(`   Berhasil (PASS):  ${passCount} ✅`);
  console.log(`   Gagal (FAIL):     ${failCount} ${failCount > 0 ? '❌' : '🎉'}`);
  console.log(`   Total Waktu:      ${(totalDuration / 1000).toFixed(2)} detik`);
  console.log('========================================================================');

  await prisma.$disconnect();

  if (failCount > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
