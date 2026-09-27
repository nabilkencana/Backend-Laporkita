import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Test Configuration
const BASE_URL = process.env.API_BASE_URL || 'https://api.canadev.my.id/api/v1';
const AI_URL = process.env.AI_BASE_URL || 'https://ai.canadev.my.id';
const DB_URL =
  process.env.DATABASE_URL ||
  '';

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: TestResult[] = [];

async function step(suite: string, name: string, fn: () => Promise<string | void>) {
  const start = Date.now();
  process.stdout.write(`  [TEST] ${name} ... `);
  try {
    const detail = await fn();
    const durationMs = Date.now() - start;
    console.log(`✅ PASS (${durationMs}ms)${detail ? ` - ${detail}` : ''}`);
    results.push({ suite, name, passed: true, durationMs, details: detail || undefined });
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    let msg = 'Unknown error';
    if (axios.isAxiosError(err)) {
      msg = err.response?.data?.error?.message || err.response?.data?.detail || err.message;
      if (err.response?.data) {
        console.log('    Response body:', JSON.stringify(err.response.data));
      }
    } else if (err instanceof Error) {
      msg = err.message;
    }
    console.log(`❌ FAIL (${durationMs}ms) -> ${msg}`);
    results.push({ suite, name, passed: false, durationMs, details: msg });
  }
}

async function main() {
  console.log('========================================================================');
  console.log('🧪 LAPORKITA END-TO-END VALIDATION SUITE');
  console.log(`📍 Backend API URL: ${BASE_URL}`);
  console.log(`🤖 AI Service URL:  ${AI_URL}`);
  console.log('========================================================================\n');

  // Tokens cache
  let adminToken = '';
  let citizenToken = '';
  let operatorToken = '';
  let policyMakerToken = '';
  let testReportId = '';
  const jalanBerlubangCategoryId = 'c1000000-0000-4000-8000-000000000001';
  const klojenZoneId = 'b1000000-0000-4000-8000-000000000001';

  // ── SUITE 1: AI Service Standalone Endpoints ───────────────────────────────
  console.log('── SUITE 1: AI Service Standalone Endpoints ──');

  await step('AI Service', 'GET /health', async () => {
    const res = await axios.get(`${AI_URL}/health`);
    if (!res.data.success || res.data.data.status !== 'ok') throw new Error('Status not ok');
    const m = res.data.data.models;
    return `YOLO=${m.yolo_classification_loaded}, XGBoost=${m.xgboost_risk_loaded}, LLM=${m.llm_connected}`;
  });

  await step('AI Service', 'POST /api/v1/predict-risk (XGBoost Flood Risk)', async () => {
    const res = await axios.post(
      `${AI_URL}/api/v1/predict-risk`,
      {
        rainfall_mm: 45.0,
        drainage_condition_score: 3.5,
        elevation_meters: 440.0,
        slope_percentage: 2.1,
        historic_flood_events: 2,
        zone_density_reports: 12,
      },
      {
        headers: {
          'X-API-Key': process.env.INTERNAL_API_KEY || '',
        },
      },
    );
    if (!res.data.success && res.data.flood_risk_probability === undefined) {
      throw new Error('Predict failed');
    }
    const prob = res.data.data?.flood_risk_probability ?? res.data.flood_risk_probability;
    return `Probability=${prob}, RiskLevel=${res.data.data?.risk_level ?? res.data.risk_level}`;
  });

  await step('AI Service', 'POST /api/v1/predict/zone-metrics (Zone Batch Prediction)', async () => {
    const res = await axios.post(
      `${AI_URL}/api/v1/predict/zone-metrics`,
      {
        zone_id: klojenZoneId,
        zone_name: 'Klojen (Pusat Kota)',
        active_reports: 5,
      },
      {
        headers: {
          'X-API-Key': process.env.INTERNAL_API_KEY || '',
        },
      },
    );
    const data = res.data.data || res.data;
    return `Zone=${data.zone_name}, Density=${data.report_density}, Risk=${data.flood_risk_probability}`;
  });

  // ── SUITE 2: Backend Master Data & Health ──────────────────────────────────
  console.log('\n── SUITE 2: Backend Master Data & Health ──');

  await step('Backend Base', 'GET /health', async () => {
    const res = await axios.get(`${BASE_URL}/health`);
    if (!res.data.success || res.data.data.status !== 'ok') throw new Error('Health check failed');
    return `version=${res.data.data.version}, status=${res.data.data.status}`;
  });

  await step('Master Data', 'GET /categories (Active 5 Categories)', async () => {
    const res = await axios.get(`${BASE_URL}/categories`);
    const cats = res.data.data;
    if (!Array.isArray(cats) || cats.length < 5) throw new Error('Categories count < 5');
    const names = cats.map((c: { name: string }) => c.name).join(', ');
    return `count=${cats.length} (${names})`;
  });

  await step('Master Data', 'GET /categories/:id', async () => {
    const res = await axios.get(`${BASE_URL}/categories/${jalanBerlubangCategoryId}`);
    return `Name=${res.data.data.name}, DefaultAgency=${res.data.data.default_agency?.name}`;
  });

  await step('Master Data', 'GET /agencies (Government Agencies)', async () => {
    const res = await axios.get(`${BASE_URL}/agencies`);
    const agencies = res.data.data;
    if (!Array.isArray(agencies) || agencies.length < 3) throw new Error('Agencies count < 3');
    const types = agencies.map((a: { type: string }) => `${a.type.toUpperCase()}`).join(', ');
    return `count=${agencies.length} (${types})`;
  });

  // ── SUITE 3: Auth & Identity Lifecycle ────────────────────────────────────
  console.log('\n── SUITE 3: Auth & Identity Lifecycle ──');

  await step('Auth', 'POST /auth/login (Admin Role)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: 'admin@laporkita.malangkota.go.id',
      password: 'AdminLaporKita2026!',
    });
    adminToken = res.data.data.access_token;
    if (!adminToken) throw new Error('No access token returned');
    return `Role=${res.data.data.user.role}, Name=${res.data.data.user.full_name}`;
  });

  await step('Auth', 'POST /auth/login (Citizen Role)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: 'warga@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    citizenToken = res.data.data.access_token;
    if (!citizenToken) throw new Error('No access token returned');
    return `Role=${res.data.data.user.role}, Points=${res.data.data.user.contribution_points}`;
  });

  await step('Auth', 'POST /auth/login (Operator Role)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: 'operator.dpupr@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    operatorToken = res.data.data.access_token;
    return `Role=${res.data.data.user.role}, AgencyId=${res.data.data.user.agency_id}`;
  });

  await step('Auth', 'POST /auth/login (Policy Maker Role)', async () => {
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: 'policymaker@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    policyMakerToken = res.data.data.access_token;
    return `Role=${res.data.data.user.role}`;
  });

  await step('Auth', 'POST /auth/refresh (Refresh Token Rotation)', async () => {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: 'warga@laporkita.malangkota.go.id',
      password: 'Password123!',
    });
    const refreshToken = loginRes.data.data.refresh_token;
    const refreshRes = await axios.post(`${BASE_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    if (!refreshRes.data.data.access_token) throw new Error('Failed to refresh token');
    return `New Token Issued`;
  });

  // Test full Citizen Registration with Phone verification
  const uniqueNum = Math.floor(100000 + Math.random() * 900000);
  const newEmail = `citizen.test.${uniqueNum}@laporkita.id`;
  const newPhone = `+62812${uniqueNum}99`;

  await step('Auth', 'POST /auth/register & Verification Lifecycle', async () => {
    const regRes = await axios.post(`${BASE_URL}/auth/register`, {
      full_name: `Warga Test ${uniqueNum}`,
      email: newEmail,
      phone_number: newPhone,
      password: 'Password123!',
    });
    if (regRes.status !== 202 && !regRes.data.success) throw new Error('Registration not accepted');

    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    const user = await prisma.user.findUnique({ where: { email: newEmail } });
    if (!user) throw new Error('User not saved in DB');

    await prisma.user.update({
      where: { id: user.id },
      data: { is_active: true, phone_verified_at: new Date() },
    });

    const loginNew = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: newEmail,
      password: 'Password123!',
    });
    return `User created=${newEmail}, is_active=${loginNew.data.data.user.is_active}`;
  });

  // ── SUITE 4: User Profile Management ───────────────────────────────────────
  console.log('\n── SUITE 4: User Profile Management ──');

  await step('Users', 'GET /users/me (Authenticated Profile)', async () => {
    const res = await axios.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    return `Name=${res.data.data.full_name}, Email=${res.data.data.email}`;
  });

  await step('Users', 'PATCH /users/me (Update Full Name)', async () => {
    const res = await axios.patch(
      `${BASE_URL}/users/me`,
      { full_name: 'Warga Peduli Malang Kota' },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return `Updated Name=${res.data.data.full_name}`;
  });

  await step('Users', 'GET /users (Admin Only User Listing)', async () => {
    const res = await axios.get(`${BASE_URL}/users?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    return `Total=${res.data.meta?.total_items ?? res.data.data?.length}`;
  });

  // ── SUITE 5: Core Reporting Flow (PRD §6.1, Rules §1.1-§1.5) ──────────────
  console.log('\n── SUITE 5: Core Reporting Flow (From Report to Resolve) ──');

  // Generate valid test JPEG image (640x480) with sharp
  const testImageBuffer = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  })
    .jpeg()
    .toBuffer();

  await step('Reports', 'POST /reports (Submit Report with Photo & Malang GPS)', async () => {
    const form = new FormData();
    form.append('category_id', jalanBerlubangCategoryId);
    form.append('latitude', '-7.9826');
    form.append('longitude', '112.6308');
    form.append('description', 'Jalan berlubang cukup dalam di dekat Alun-Alun Merdeka Malang');
    form.append('photo', testImageBuffer, { filename: 'jalan-rusak.jpg', contentType: 'image/jpeg' });

    const res = await axios.post(`${BASE_URL}/reports`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${citizenToken}`,
      },
    });

    if (!res.data.success && res.status !== 202) throw new Error('Report submit rejected');
    testReportId = res.data.data.id;
    return `ID=${testReportId}, Code=${res.data.data.report_code}, Status=${res.data.data.status}`;
  });

  await step('Reports', 'GET /reports/:id (Report Details)', async () => {
    const res = await axios.get(`${BASE_URL}/reports/${testReportId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const r = res.data.data;
    return `Code=${r.report_code}, Status=${r.status}, Urgency=${r.urgency_score}`;
  });

  await step('Reports', 'GET /reports (List with Filtering)', async () => {
    const res = await axios.get(`${BASE_URL}/reports?limit=5`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    return `Count=${res.data.data.length}`;
  });

  // Community Support (Upvote) & Grace Period (Rules §1.4)
  await step('Community Support', 'POST /reports/:id/support (Upvote Report)', async () => {
    const res = await axios.post(
      `${BASE_URL}/reports/${testReportId}/support`,
      {},
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return `SupportCount=${res.data.data.support_count}, UrgencyScore=${res.data.data.urgency_score}`;
  });

  await step('Community Support', 'POST duplicate support rejected with 409', async () => {
    try {
      await axios.post(
        `${BASE_URL}/reports/${testReportId}/support`,
        {},
        { headers: { Authorization: `Bearer ${citizenToken}` } },
      );
      throw new Error('Should have failed with 409');
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 409) return '409 Conflict as expected';
      throw err;
    }
  });

  await step('Community Support', 'DELETE /reports/:id/support (Grace Period Cancel)', async () => {
    const res = await axios.delete(`${BASE_URL}/reports/${testReportId}/support`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    return `Cancelled, SupportCount=${res.data.data.support_count}`;
  });

  await step('Community Support', 'Re-add Support', async () => {
    const res = await axios.post(
      `${BASE_URL}/reports/${testReportId}/support`,
      {},
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return `SupportCount=${res.data.data.support_count}`;
  });

  // Comments & Profanity Filter (Rules §2.3)
  await step('Comments', 'POST /reports/:id/comments (Normal Comment)', async () => {
    const res = await axios.post(
      `${BASE_URL}/reports/${testReportId}/comments`,
      { content: 'Sangat membahayakan pengendara motor di malam hari.' },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return `CommentId=${res.data.data.id}, is_flagged=${res.data.data.is_flagged}`;
  });

  await step('Comments', 'POST /reports/:id/comments (Profanity Auto-Flag)', async () => {
    const res = await axios.post(
      `${BASE_URL}/reports/${testReportId}/comments`,
      { content: 'Jalan anjing rusak parah bikin celaka!' },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    if (!res.data.data.is_flagged) throw new Error('Expected comment to be flagged');
    return `Comment flagged=${res.data.data.is_flagged}`;
  });

  await step('Comments', 'GET /reports/:id/comments', async () => {
    const res = await axios.get(`${BASE_URL}/reports/${testReportId}/comments`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    return `Comments count=${res.data.data.length}`;
  });

  // Operator State Machine Transitions (Rules §1.1)
  await step('State Machine', 'Operator transition -> verified', async () => {
    const current = await axios.get(`${BASE_URL}/reports/${testReportId}`, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    if (current.data.data.status === 'pending_verification') {
      const res = await axios.patch(
        `${BASE_URL}/reports/${testReportId}/status`,
        { status: 'verified', note: 'Laporan diverifikasi oleh operator lapangan DPUPR' },
        { headers: { Authorization: `Bearer ${operatorToken}` } },
      );
      return `Status=${res.data.data.status}`;
    }
    return `Current status already=${current.data.data.status}`;
  });

  await step('State Machine', 'Operator transition -> assigned', async () => {
    const res = await axios.patch(
      `${BASE_URL}/reports/${testReportId}/status`,
      { status: 'assigned', note: 'Ditugaskan ke Tim Reaksi Cepat DPUPR' },
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return `Status=${res.data.data.status}`;
  });

  await step('State Machine', 'Operator transition -> in_progress', async () => {
    const res = await axios.patch(
      `${BASE_URL}/reports/${testReportId}/status`,
      { status: 'in_progress', note: 'Alat berat dan aspal tiba di lokasi' },
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return `Status=${res.data.data.status}`;
  });

  await step('State Machine', 'Upload completion photo media', async () => {
    const form = new FormData();
    form.append('type', 'completion_photo');
    form.append('photo', testImageBuffer, {
      filename: 'perbaikan-selesai.jpg',
      contentType: 'image/jpeg',
    });
    const res = await axios.post(`${BASE_URL}/reports/${testReportId}/media`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${operatorToken}`,
      },
    });
    return `Media uploaded, url=${res.data.data.url?.slice(0, 40)}...`;
  });

  await step('State Machine', 'Operator transition -> completed', async () => {
    const res = await axios.patch(
      `${BASE_URL}/reports/${testReportId}/status`,
      { status: 'completed', note: 'Pengaspalan selesai 100%' },
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return `Status=${res.data.data.status}`;
  });

  await step('Citizen Validation', 'POST /reports/:id/validate (Resolve Report)', async () => {
    const res = await axios.post(
      `${BASE_URL}/reports/${testReportId}/validate`,
      {
        is_valid: true,
        latitude: -7.9826,
        longitude: 112.6308,
        note: 'Sudah saya cek langsung, jalanan sudah mulus dan aman.',
      },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return `Status=${res.data.data.status} (RESOLVED!)`;
  });

  // ── SUITE 6: Maps, Routing & Route Alerts ──────────────────────────────────
  console.log('\n── SUITE 6: Maps, Routing & Route Alerts ──');

  await step('Maps', 'POST /maps/route (OSRM Routing Malang)', async () => {
    const res = await axios.post(`${BASE_URL}/maps/route`, {
      origin_lat: -7.9827,
      origin_lng: 112.6304,
      destination_lat: -7.9701,
      destination_lng: 112.6412,
    });
    const d = res.data.data;
    return `Distance=${d.distance_meters}m, Duration=${Math.round(d.duration_seconds)}s, Points=${d.geometry?.coordinates?.length}`;
  });

  await step('Reports Along Route', 'POST /reports/along-route', async () => {
    const res = await axios.post(`${BASE_URL}/reports/along-route`, {
      route_points: [
        { lat: -7.9827, lng: 112.6304 },
        { lat: -7.9781, lng: 112.635 },
        { lat: -7.9701, lng: 112.6412 },
      ],
      radius_meters: 500,
    });
    return `Hazards found count=${res.data.data.length}`;
  });

  await step('Route Alerts', 'POST /route-alerts/subscribe', async () => {
    const res = await axios.post(
      `${BASE_URL}/route-alerts/subscribe`,
      {
        device_token: 'fcm-device-token-qa-test-12345',
        last_lat: -7.9827,
        last_long: 112.6304,
      },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return `Alert subscription active`;
  });

  await step('Route Alerts', 'POST /route-alerts/check', async () => {
    const res = await axios.post(
      `${BASE_URL}/route-alerts/check`,
      {
        current_lat: -7.9826,
        current_lng: 112.6308,
      },
      { headers: { Authorization: `Bearer ${citizenToken}` } },
    );
    return `Alerts checked, count=${res.data.data?.length ?? 0}`;
  });

  // ── SUITE 7: Urban Emotion Map, Predictions & Policy Simulator ────────────
  console.log('\n── SUITE 7: Urban Emotion Map, Predictions & Policy Simulator ──');

  await step('Predictions', 'GET /predictions/zones (Urban Emotion Map)', async () => {
    const res = await axios.get(`${BASE_URL}/predictions/zones`);
    const zones = res.data.data;
    if (!Array.isArray(zones) || zones.length !== 5) throw new Error('Expected 5 zones');
    const names = zones.map((z: { name: string }) => z.name).join(', ');
    return `5 Zones=${names}`;
  });

  await step('Predictions', 'POST /predictions/metrics/refresh (AI Service XGBoost)', async () => {
    const res = await axios.post(
      `${BASE_URL}/predictions/metrics/refresh`,
      {},
      { headers: { Authorization: `Bearer ${operatorToken}` } },
    );
    return `Updated zones=${res.data.data.updatedCount}`;
  });

  await step('Predictions', 'GET /predictions/zones/:zoneId/metrics', async () => {
    const res = await axios.get(`${BASE_URL}/predictions/zones/${klojenZoneId}/metrics`);
    return `Zone=${res.data.data.zone.name}, History entries=${res.data.data.metrics.length}`;
  });

  await step('Policy Simulator', 'POST /policy-simulations (Google Gemini 2.5 Flash)', async () => {
    const res = await axios.post(
      `${BASE_URL}/policy-simulations`,
      {
        prompt_text: 'Simulasi alokasi perbaikan gorong-gorong dan drainase di kawasan Sukun dan Klojen',
        zone_id: klojenZoneId,
      },
      { headers: { Authorization: `Bearer ${policyMakerToken}` } },
    );
    const d = res.data.data;
    return `Model=${d.resultData?.source_model}, Budget=Rp${d.resultData?.estimated_budget_idr?.toLocaleString()}, Narrative=${d.resultNarrative?.slice(0, 50)}...`;
  });

  await step('Policy Simulator', 'GET /policy-simulations', async () => {
    const res = await axios.get(`${BASE_URL}/policy-simulations?limit=5`, {
      headers: { Authorization: `Bearer ${policyMakerToken}` },
    });
    return `Simulations count=${res.data.data.length}`;
  });

  // ── FINAL SUMMARY ──────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);

  console.log('📊 TEST EXECUTION SUMMARY:');
  console.log(`   Total Tests:  ${total}`);
  console.log(`   Passed:       ${passedCount} ✅`);
  console.log(`   Failed:       ${failedCount} ${failedCount > 0 ? '❌' : '🎉'}`);
  console.log(`   Total Time:   ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('========================================================================');

  await prisma.$disconnect();

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
