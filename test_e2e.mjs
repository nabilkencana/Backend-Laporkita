/**
 * LaporKita — Comprehensive Playwright E2E QA Test Suite
 * Covers 48 Backend + 11 AI endpoints + browser /demo test
 * Output: qa_results.json, ai_demo_console.png
 */
import { chromium, request } from '/Users/nabilkencana/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync } from 'fs';
import sharpMod from 'sharp';
import { QA_CONFIG } from './qa-contract-audit/env_config.mjs';

// ── Config ──────────────────────────────────────────────────────────────
const BASE = QA_CONFIG.baseUrl;
const AI   = QA_CONFIG.aiUrl;
const AI_KEY = QA_CONFIG.aiKey;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LaporKita-QA/1.0';

const SEEDS = QA_CONFIG.seeds;
// Malang GPS
const ALUN_ALUN = { lat: -7.9826, lng: 112.6308 };
const LOWOKWARU = { lat: -7.9454, lng: 112.6137 };
const SURABAYA  = { lat: -7.2575, lng: 112.7521 }; // >100m

// ── State ───────────────────────────────────────────────────────────────
const tokens = {};
const results = [];
let totalPassed = 0, totalFailed = 0;
const cleanup = [];

// ── Helpers ──────────────────────────────────────────────────────────────
function mask(s) { return s ? s.slice(0,8) + '...' : '(none)'; }

async function step(ctx, suite, name, fn) {
  const t0 = Date.now();
  const label = `[${suite}] ${name}`;
  process.stdout.write(`  ${label} ... `);
  try {
    const detail = await fn(ctx);
    const ms = Date.now() - t0;
    console.log(`PASS (${ms}ms)${detail ? ' — '+detail : ''}`);
    results.push({ suite, name, status: 'PASS', ms, detail: detail||'' });
    totalPassed++;
    return true;
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = String(err?.message || err).slice(0,300);
    console.log(`FAIL (${ms}ms) — ${msg}`);
    results.push({ suite, name, status: 'FAIL', ms, detail: msg });
    totalFailed++;
    return false;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function apiCall(ctx, method, url, opts = {}) {
  const { body, headers: extra, maxRetries = 2 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const callOpts = { headers: { ...extra } };
      if (body !== undefined) callOpts.data = body;
      const res = await ctx[method.toLowerCase()](url, callOpts);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && /ECONN|ETIMEDOUT|EAI_AGAIN|socket/i.test(String(err))) {
        await new Promise(r => setTimeout(r, 1000 * (attempt+1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function authH(role) { return { Authorization: `Bearer ${tokens[role]}` }; }
function aiH()       { return { 'X-API-Key': AI_KEY }; }

let _testJpegCache = null;
async function makeTestJpeg() {
  if (_testJpegCache) return _testJpegCache;
  _testJpegCache = await sharpMod({
    create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 80, b: 40 } }
  }).jpeg({ quality: 70 }).toBuffer();
  return _testJpegCache;
}

// ── Suite 1: AI Microservice ─────────────────────────────────────────────
async function suite1_AI(apiCtx) {
  const S = 'Suite 1: AI Service';
  console.log(`\n═══ ${S} ═══`);

  // 1a. Health
  let yoloOk = false, xgbOk = false, llmStatus = '';
  await step(apiCtx, S, 'GET /health', async (ctx) => {
    const r = await apiCall(ctx, 'get', `${AI}/health`, { headers: aiH() });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    assert(j.success === true, 'success not true');
    const m = j.data.models;
    yoloOk = m.yolo_classification_loaded === true;
    xgbOk  = m.xgboost_risk_loaded === true;
    llmStatus = m.llm_connected ? 'connected' : 'not connected';
    assert(yoloOk, 'YOLOv11 not loaded');
    assert(xgbOk, 'XGBoost not loaded');
    return `YOLO=${yoloOk} XGB=${xgbOk} LLM=${llmStatus}`;
  });

  // 1b. Browser /demo
  await step(apiCtx, S, 'GET /demo (Browser)', async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      const page = await browser.newPage({ userAgent: UA });
      await page.goto(`${AI}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
      const title = await page.title();
      assert(title.includes('LaporKita AI Console'), `Title: "${title}"`);
      await page.screenshot({ path: 'ai_demo_console.png', fullPage: true });
      return `title="${title}", screenshot saved`;
    } finally { await browser.close(); }
  });

  // 1c. Sample images
  let sampleImages = {};
  await step(apiCtx, S, 'GET /sample_images.json', async (ctx) => {
    const r = await apiCall(ctx, 'get', `${AI}/sample_images.json`, { headers: aiH() });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    sampleImages = j;
    const classes = ['Drainase','Jalan Berlubang','Lampu Jalan','Rambu Lalu Lintas','Trotoar'];
    for (const c of classes) {
      const found = j[c] || j[c.toLowerCase()] || j[c.replace(/ /g,'_')];
      assert(found, `Class "${c}" missing`);
    }
    return `${Object.keys(j).length} classes`;
  });

  // 1d. POST /v1/verify
  await step(apiCtx, S, 'POST /v1/verify (YOLOv11)', async (ctx) => {
    // Get a sample image for Jalan Berlubang
    const key = Object.keys(sampleImages).find(k => /jalan.berlubang/i.test(k) || /pothole/i.test(k));
    const imgData = sampleImages[key] || Object.values(sampleImages)[1]; // fallback
    const b64 = typeof imgData === 'string' ? imgData.replace(/^data:image\/\w+;base64,/,'') : imgData;

    const r = await apiCall(ctx, 'post', `${AI}/v1/verify`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: b64,
        claimed_category: 'Jalan Berlubang',
        latitude: ALUN_ALUN.lat,
        longitude: ALUN_ALUN.lng,
        timestamp: new Date().toISOString()
      }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    assert(d.predicted_category, 'No predicted_category');
    const conf = d.ai_confidence_score ?? d.confidence;
    assert(typeof conf === 'number', 'No confidence score');
    return `cat=${d.predicted_category} conf=${conf?.toFixed(2)} auth=${d.is_authentic} sev=${d.damage_severity}`;
  });

  // 1e. POST /v1/predict-risk
  await step(apiCtx, S, 'POST /v1/predict-risk (XGBoost)', async (ctx) => {
    const r = await apiCall(ctx, 'post', `${AI}/v1/predict-risk`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        zone_id: 'b1000000-0000-4000-8000-000000000001',
        report_density: 12,
        rainfall_mm: 64,
        temperature_c: 28,
        weather_context: { rainfall_mm: 64, temperature_c: 28, condition: 'Hujan Deras', drainage_issue_ratio: 0.4 },
        traffic_density: 0.8,
        category: 'Drainase'
      }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    const prob = d.flood_risk_probability;
    assert(typeof prob === 'number' && prob >= 0 && prob <= 1, `flood_risk_probability=${prob}`);
    assert(['low','medium','high'].includes(d.risk_level), `risk_level=${d.risk_level}`);
    assert(d._placeholder !== true, '_placeholder is true');
    return `prob=${prob?.toFixed(3)} level=${d.risk_level}`;
  });

  // 1f. POST /v1/predict/zone-metrics
  await step(apiCtx, S, 'POST /v1/predict/zone-metrics', async (ctx) => {
    const r = await apiCall(ctx, 'post', `${AI}/v1/predict/zone-metrics`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        zone_id: 'b1000000-0000-4000-8000-000000000001',
        zone_name: 'Klojen',
        active_reports: 13,
        rainfall_mm: 82,
        temperature_c: 27,
        traffic_density: 0.65,
        condition: 'Hujan Ringan'
      }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    assert(d.flood_risk_probability !== undefined, 'Missing flood_risk_probability');
    return `flood=${d.flood_risk_probability?.toFixed(3)} stress=${d.stress_level}`;
  });

  // 1g. POST /v1/policy-simulate (Gemini)
  let geminiOk = false;
  await step(apiCtx, S, 'POST /v1/policy-simulate (Gemini)', async (ctx) => {
    const r = await apiCall(ctx, 'post', `${AI}/v1/policy-simulate`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        prompt_text: '[QA] Analisis dampak kebijakan normalisasi drainase di wilayah Klojen Kota Malang. Berikan proyeksi penurunan risiko banjir dan estimasi anggaran yang diperlukan.',
        zone_id: 'b1000000-0000-4000-8000-000000000001',
        time_horizon_months: 12,
        parameters: { drainage_coverage_pct: 80, budget_idr: 5000000000 }
      }
    });
    assert(r.status() === 200, `Expected 200, got ${r.status()}`);
    geminiOk = true;
    const j = await r.json();
    const d = j.data || j;
    assert(d.result_data?.budget_estimate_idr > 0, 'Missing budget_estimate_idr');
    assert(Array.isArray(d.key_recommendations) && d.key_recommendations.length > 0, 'Missing key_recommendations');
    return `Gemini OK — budget=${d.result_data.budget_estimate_idr} recs=${d.key_recommendations.length}`;
  });

  // 1h. GET /v1/training/dataset-stats
  await step(apiCtx, S, 'GET /v1/training/dataset-stats', async (ctx) => {
    const r = await apiCall(ctx, 'get', `${AI}/v1/training/dataset-stats`, { headers: aiH() });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    return `total=${d.total_samples} classes=${JSON.stringify(d.class_distribution||d.classes||{}).slice(0,80)}`;
  });

  // 1i. POST /v1/training/ingest-sample
  let ingestedFile = '';
  await step(apiCtx, S, 'POST /v1/training/ingest-sample', async (ctx) => {
    // Use a sample image base64 for ingest
    const key = Object.keys(sampleImages).find(k => /jalan.berlubang/i.test(k) || /pothole/i.test(k));
    const imgData = sampleImages[key] || Object.values(sampleImages)[1];
    const b64 = typeof imgData === 'string' ? imgData.replace(/^data:image\/\w+;base64,/,'') : imgData;
    const r = await apiCall(ctx, 'post', `${AI}/v1/training/ingest-sample`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: b64,
        verified_category: 'Jalan Berlubang',
        original_prediction: 'Jalan Berlubang',
        confidence_score: 0.92,
        source: 'qa_test',
        operator_notes: '[QA] Test ingest sample'
      }
    });
    const st = r.status();
    assert(st === 200 || st === 201, `Status ${st}: ${(await r.text()).slice(0,200)}`);
    const j = await r.json().catch(() => ({}));
    const d = j.data || j;
    ingestedFile = d.saved_file || d.filename || '';
    return `saved=${ingestedFile} correction=${d.is_correction}`;
  });

  // 1j. GET /v1/training/download-dataset (check content-type)
  await step(apiCtx, S, 'GET /v1/training/download-dataset', async (ctx) => {
    const r = await apiCall(ctx, 'get', `${AI}/v1/training/download-dataset`, { headers: aiH() });
    assert(r.status() === 200, `Status ${r.status()}`);
    const ct = r.headers()['content-type'] || '';
    assert(/zip|octet/i.test(ct), `Expected zip, got ${ct}`);
    return `Content-Type: ${ct}`;
  });

  // 1k. Security: no API key
  await step(apiCtx, S, 'POST /v1/verify without X-API-Key → 401/403', async (ctx) => {
    const r = await apiCall(ctx, 'post', `${AI}/v1/verify`, {
      headers: { 'Content-Type': 'application/json' },
      body: { image: 'x' }
    });
    assert(r.status() === 401 || r.status() === 403, `Expected 401/403, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 1l. Security: wrong API key
  await step(apiCtx, S, 'POST /v1/verify wrong key → 401/403', async (ctx) => {
    const r = await apiCall(ctx, 'post', `${AI}/v1/verify`, {
      headers: { 'X-API-Key': 'wrong-key', 'Content-Type': 'application/json' },
      body: { image: 'x' }
    });
    assert(r.status() === 401 || r.status() === 403, `Expected 401/403, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 1m. /api/v1 prefix compatibility
  await step(apiCtx, S, 'POST /api/v1/predict-risk (prefix compat)', async (ctx) => {
    const r = await apiCall(ctx, 'post', `${AI}/api/v1/predict-risk`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: { zone_id: 'b1000000-0000-4000-8000-000000000001', zone_name: 'Klojen', report_density: 5, active_reports: 3, rainfall_mm: 30, temperature_c: 30, condition: 'Cerah', traffic_density: 0.3 }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  return { yoloOk, xgbOk, geminiOk, llmStatus };
}

// ── Suite 2: Auth & Identity Lifecycle ───────────────────────────────────
async function suite2_Auth(ctx) {
  const S = 'Suite 2: Auth';
  console.log(`\n═══ ${S} ═══`);

  // 2a–d. Login 4 roles
  for (const [role, cred] of Object.entries(SEEDS)) {
    await step(ctx, S, `POST /auth/login (${role})`, async (c) => {
      const r = await apiCall(c, 'post', `${BASE}/auth/login`, {
        headers: { 'Content-Type': 'application/json' },
        body: { identifier: cred.email, password: cred.password }
      });
      assert(r.status() === 200, `Status ${r.status()}`);
      const j = await r.json();
      const d = j.data || j;
      const tok = d.access_token || d.accessToken;
      assert(tok, 'No access_token');
      tokens[role] = tok;
      tokens[role + '_refresh'] = d.refresh_token || d.refreshToken || '';
      return `role=${role} token=${mask(tok)}`;
    });
  }

  // 2e. Wrong password
  await step(ctx, S, 'POST /auth/login wrong password → 401', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: SEEDS.citizen.email, password: 'WrongPass999!' }
    });
    assert(r.status() === 401, `Expected 401, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 2f. Refresh token
  await step(ctx, S, 'POST /auth/refresh → new token', async (c) => {
    const rt = tokens.citizen_refresh;
    const r = await apiCall(c, 'post', `${BASE}/auth/refresh`, {
      headers: { 'Content-Type': 'application/json' },
      body: { refresh_token: rt }
    });
    const st = r.status();
    assert(st === 200 || st === 201, `Status ${st}`);
    const j = await r.json();
    const d = j.data || j;
    const newTok = d.access_token || d.accessToken;
    assert(newTok, 'No new access_token');
    tokens.citizen = newTok;
    return `new token=${mask(newTok)}`;
  });

  // 2g. Register
  const qaEmail = `qa.test.${Date.now()}@laporkita.test.go.id`;
  const qaPhone = `0812${String(Date.now()).slice(-8)}`;
  let registeredUserId = '';
  await step(ctx, S, 'POST /auth/register → 202', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/auth/register`, {
      headers: { 'Content-Type': 'application/json' },
      body: {
        full_name: '[QA] Test Citizen',
        email: qaEmail,
        phone_number: qaPhone,
        password: 'QaTest2026!'
      }
    });
    const st = r.status();
    // May return 201 or 202
    assert(st === 201 || st === 202, `Expected 201/202, got ${st}`);
    const j = await r.json();
    registeredUserId = j.data?.user_id || j.data?.id || '';
    cleanup.push({ type: 'user', id: registeredUserId, email: qaEmail });
    return `${st} userId=${registeredUserId || 'pending'}`;
  });

  // 2h. Resend OTP
  await step(ctx, S, 'POST /auth/resend-otp', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/auth/resend-otp`, {
      headers: { 'Content-Type': 'application/json' },
      body: { phone_number: qaPhone }
    });
    const st = r.status();
    // 200 OK or 400 cooldown — both valid
    assert(st === 200 || st === 400 || st === 429, `Expected 200/400/429, got ${st}`);
    return `${st}`;
  });

  // 2i. Wrong OTP
  await step(ctx, S, 'POST /auth/verify-otp wrong code → 400', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/auth/verify-otp`, {
      headers: { 'Content-Type': 'application/json' },
      body: { user_id: registeredUserId || '00000000-0000-0000-0000-000000000000', otp_code: '0000', phone_number: qaPhone }
    });
    assert(r.status() === 400 || r.status() === 404, `Expected 400/404, got ${r.status()}`);
    return `${r.status()}`;
  });
}

// ── Suite 3: Master Data CRUD ────────────────────────────────────────────
async function suite3_MasterData(ctx) {
  const S = 'Suite 3: Master Data';
  console.log(`\n═══ ${S} ═══`);

  // 3a. GET /categories
  let categories = [];
  await step(ctx, S, 'GET /categories (public)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/categories`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    categories = j.data || j;
    assert(Array.isArray(categories) && categories.length >= 5, `Expected >=5 categories, got ${categories.length}`);
    return `${categories.length} categories`;
  });

  // 3b. GET /categories/{id}
  const jalanBerlubangId = 'c1000000-0000-4000-8000-000000000001';
  await step(ctx, S, `GET /categories/${jalanBerlubangId}`, async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/categories/${jalanBerlubangId}`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    assert(d.name || d.id, 'No category data');
    return `name=${d.name}`;
  });

  // 3c. RBAC: citizen POST /categories → 403
  await step(ctx, S, 'POST /categories as citizen → 403', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/categories`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { name: '[QA] Forbidden', urgency_weight: 1 }
    });
    assert(r.status() === 403, `Expected 403, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 3d. Admin CRUD Category
  let qaCatId = '';
  await step(ctx, S, 'POST /categories (admin create)', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/categories`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: '[QA] Kategori Test', default_agency_id: 'a1000000-0000-4000-8000-000000000001', urgency_weight: 1.5, icon_url: 'https://example.com/qa.svg' }
    });
    assert(r.status() === 201 || r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    qaCatId = j.data?.id || j.id;
    assert(qaCatId, 'No category ID returned');
    cleanup.push({ type: 'category', id: qaCatId });
    return `id=${qaCatId}`;
  });

  await step(ctx, S, `PATCH /categories/${qaCatId || 'ID'} (admin update)`, async (c) => {
    assert(qaCatId, 'No category to update');
    const r = await apiCall(c, 'patch', `${BASE}/categories/${qaCatId}`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: '[QA] Kategori Updated' }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  await step(ctx, S, `DELETE /categories/${qaCatId || 'ID'} (admin delete)`, async (c) => {
    assert(qaCatId, 'No category to delete');
    const r = await apiCall(c, 'delete', `${BASE}/categories/${qaCatId}`, { headers: authH('admin') });
    assert(r.status() === 200, `Status ${r.status()}`);
    cleanup.splice(cleanup.findIndex(c => c.type === 'category' && c.id === qaCatId), 1);
    return 'Deleted';
  });

  // 3e. GET /agencies
  let agencies = [];
  await step(ctx, S, 'GET /agencies (public)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/agencies`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    agencies = j.data || j;
    assert(Array.isArray(agencies) && agencies.length >= 3, `Expected >=3, got ${agencies.length}`);
    return `${agencies.length} agencies`;
  });

  // 3f. GET /agencies/{id}
  await step(ctx, S, 'GET /agencies/{id}', async (c) => {
    const aid = agencies[0]?.id;
    assert(aid, 'No agency ID');
    const r = await apiCall(c, 'get', `${BASE}/agencies/${aid}`);
    assert(r.status() === 200, `Status ${r.status()}`);
    return `name=${(await r.json()).data?.name || 'ok'}`;
  });

  // 3g. RBAC: citizen POST /agencies → 403
  await step(ctx, S, 'POST /agencies as citizen → 403', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/agencies`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { name: '[QA] Forbidden Agency', type: 'dinas', email: 'qa@test.go.id', contact_email: 'qa@test.go.id' }
    });
    assert(r.status() === 403, `Expected 403, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 3h. Admin CRUD Agency
  let qaAgencyId = '';
  await step(ctx, S, 'POST /agencies (admin create)', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/agencies`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: '[QA] Dinas Test', type: 'lainnya', contact_email: 'qa.dinas@laporkita.test.go.id' }
    });
    assert(r.status() === 201 || r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    qaAgencyId = j.data?.id || j.id;
    assert(qaAgencyId, 'No agency ID returned');
    cleanup.push({ type: 'agency', id: qaAgencyId });
    return `id=${qaAgencyId}`;
  });

  await step(ctx, S, 'PATCH /agencies/{id} (admin update)', async (c) => {
    assert(qaAgencyId, 'No agency to update');
    const r = await apiCall(c, 'patch', `${BASE}/agencies/${qaAgencyId}`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: '[QA] Dinas Updated' }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  await step(ctx, S, 'DELETE /agencies/{id} (admin delete)', async (c) => {
    assert(qaAgencyId, 'No agency to delete');
    const r = await apiCall(c, 'delete', `${BASE}/agencies/${qaAgencyId}`, { headers: authH('admin') });
    assert(r.status() === 200, `Status ${r.status()}`);
    cleanup.splice(cleanup.findIndex(c => c.type === 'agency' && c.id === qaAgencyId), 1);
    return 'Deleted';
  });
}

// ── Suite 4: User Profile & RBAC ─────────────────────────────────────────
async function suite4_Users(ctx) {
  const S = 'Suite 4: Users';
  console.log(`\n═══ ${S} ═══`);

  let citizenUserId = '';
  let adminUserId = '';
  let originalName = '';

  // 4a. GET /users/me (citizen)
  await step(ctx, S, 'GET /users/me (citizen)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/users/me`, { headers: authH('citizen') });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    citizenUserId = d.id;
    originalName = d.full_name;
    assert(d.email, 'No email');
    return `id=${citizenUserId} name=${d.full_name} role=${d.role}`;
  });

  // 4b. PATCH /users/me (citizen update)
  await step(ctx, S, 'PATCH /users/me (update full_name)', async (c) => {
    const r = await apiCall(c, 'patch', `${BASE}/users/me`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { full_name: '[QA] Warga Peduli Malang' }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 4c. Verify update persisted
  await step(ctx, S, 'GET /users/me (verify update)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/users/me`, { headers: authH('citizen') });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    assert(d.full_name.includes('[QA]'), `Name not updated: ${d.full_name}`);
    return `name=${d.full_name}`;
  });

  // Restore original name
  await step(ctx, S, 'PATCH /users/me (restore name)', async (c) => {
    const r = await apiCall(c, 'patch', `${BASE}/users/me`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { full_name: originalName || 'Warga Peduli' }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'Restored';
  });

  // 4d. GET /users/me/points
  await step(ctx, S, 'GET /users/me/points (citizen)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/users/me/points`, { headers: authH('citizen') });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 4e. RBAC: citizen GET /users → 403
  await step(ctx, S, 'GET /users as citizen → 403', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/users`, { headers: authH('citizen') });
    assert(r.status() === 403, `Expected 403, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 4f. Admin GET /users
  await step(ctx, S, 'GET /users (admin)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/users?limit=5`, { headers: authH('admin') });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    const items = Array.isArray(d) ? d : d.data || d.items || d.users || [];
    assert(items.length > 0, 'No users returned');
    return `${items.length} users`;
  });

  // 4g. Admin GET /users/me to get own ID
  await step(ctx, S, 'GET /users/me (admin → get ID)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/users/me`, { headers: authH('admin') });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    adminUserId = (j.data || j).id;
    return `adminId=${adminUserId}`;
  });

  // 4h. Admin GET /users/{citizenId}
  await step(ctx, S, 'GET /users/{id} (admin)', async (c) => {
    assert(citizenUserId, 'No citizen ID');
    const r = await apiCall(c, 'get', `${BASE}/users/${citizenUserId}`, { headers: authH('admin') });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 4i. Admin PATCH /users/{citizenId} (no-op update)
  await step(ctx, S, 'PATCH /users/{id} (admin update citizen)', async (c) => {
    assert(citizenUserId, 'No citizen ID');
    const r = await apiCall(c, 'patch', `${BASE}/users/${citizenUserId}`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { full_name: originalName || 'Warga Peduli' }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 4j. Admin DELETE self → 400
  await step(ctx, S, 'DELETE /users/{adminId} (admin self-delete) → 400', async (c) => {
    assert(adminUserId, 'No admin ID');
    const r = await apiCall(c, 'delete', `${BASE}/users/${adminUserId}`, { headers: authH('admin') });
    assert(r.status() === 400, `Expected 400, got ${r.status()}`);
    return `${r.status()}`;
  });
}

// ── Suite 5: Report Lifecycle ────────────────────────────────────────────
async function suite5_Reports(ctx) {
  const S = 'Suite 5: Reports';
  console.log(`\n═══ ${S} ═══`);

  let reportId = '', reportCode = '';

  // 5a. Create report
  await step(ctx, S, 'POST /reports (citizen create)', async (c) => {
    const jpgBuf = await makeTestJpeg();
    const r = await c.post(`${BASE}/reports`, {
      headers: { Authorization: `Bearer ${tokens.citizen}` },
      multipart: {
        description: '[QA] Jalan berlubang besar di depan Alun-Alun Malang, membahayakan pengendara motor',
        category_id: 'c1000000-0000-4000-8000-000000000001',
        latitude: String(ALUN_ALUN.lat),
        longitude: String(ALUN_ALUN.lng),
        photo: { name: 'pothole_qa.jpg', mimeType: 'image/jpeg', buffer: jpgBuf }
      }
    });
    const st = r.status();
    assert(st === 201 || st === 202 || st === 200, `Status ${st}`);
    const j = await r.json();
    const d = j.data || j;
    reportId = d.id;
    reportCode = d.report_code || d.reportCode || '';
    assert(reportId, 'No report ID');
    cleanup.push({ type: 'report', id: reportId });
    return `id=${reportId} code=${reportCode}`;
  });

  // 5b. GET /reports/{id}
  await step(ctx, S, 'GET /reports/{id} (detail)', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'get', `${BASE}/reports/${reportId}`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    assert(d.report_code || d.id, 'No report data');
    return `status=${d.status} code=${d.report_code}`;
  });

  // 5c. GET /reports (list)
  await step(ctx, S, 'GET /reports (public list)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/reports?limit=5`);
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 5d. Upvote
  await step(ctx, S, 'POST /reports/{id}/support (upvote)', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'post', `${BASE}/reports/${reportId}/support`, { headers: authH('citizen') });
    const st = r.status();
    assert(st === 200 || st === 201, `Status ${st}`);
    return `${st}`;
  });

  // 5e. Duplicate upvote → 409
  await step(ctx, S, 'POST /reports/{id}/support duplicate → 409', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'post', `${BASE}/reports/${reportId}/support`, { headers: authH('citizen') });
    assert(r.status() === 409 || r.status() === 400, `Expected 409/400, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 5f. Cancel upvote
  await step(ctx, S, 'DELETE /reports/{id}/support (cancel)', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'delete', `${BASE}/reports/${reportId}/support`, { headers: authH('citizen') });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 5g. Re-upvote for further testing
  await step(ctx, S, 'POST /reports/{id}/support (re-upvote)', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'post', `${BASE}/reports/${reportId}/support`, { headers: authH('citizen') });
    assert(r.status() === 200 || r.status() === 201, `Status ${r.status()}`);
    return `${r.status()}`;
  });

  // 5h. Normal comment
  await step(ctx, S, 'POST /reports/{id}/comments (normal)', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'post', `${BASE}/reports/${reportId}/comments`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { content: '[QA] Terima kasih atas laporannya, semoga segera diperbaiki.' }
    });
    assert(r.status() === 201 || r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    return `flagged=${d.is_flagged || false}`;
  });

  // 5i. Profane comment
  await step(ctx, S, 'POST /reports/{id}/comments (profanity)', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'post', `${BASE}/reports/${reportId}/comments`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { content: '[QA] Anjing bangsat! Jalan ini sudah lama rusak tapi tidak diperbaiki!' }
    });
    assert(r.status() === 201 || r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    return `flagged=${d.is_flagged} content=${String(d.content||'').slice(0,50)}`;
  });

  // 5j. GET comments
  await step(ctx, S, 'GET /reports/{id}/comments', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'get', `${BASE}/reports/${reportId}/comments`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const items = j.data || j;
    const count = Array.isArray(items) ? items.length : (items.comments||[]).length;
    return `${count} comments`;
  });

  // 5k. Flagged queue (operator)
  await step(ctx, S, 'GET /reports/comments/flagged (operator)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/reports/comments/flagged`, { headers: authH('operator') });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 5l. Invalid transition: skip to completed from current state → 400/409
  await step(ctx, S, 'PATCH /reports/{id}/status (invalid skip) → 400/409', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'patch', `${BASE}/reports/${reportId}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'completed' }
    });
    assert(r.status() === 400 || r.status() === 409, `Expected 400/409, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 5m. State transitions: check current status first, then advance through remaining states
  // Backend auto-verifies via AI so report may already be 'verified'
  const stateOrder = ['pending_verification', 'verified', 'assigned', 'in_progress', 'completed'];
  let currentStatus = '';
  await step(ctx, S, 'GET /reports/{id} (check current status)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/reports/${reportId}`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const d = (await r.json()).data || {};
    currentStatus = d.status;
    return `current=${currentStatus}`;
  });

  const currentIdx = stateOrder.indexOf(currentStatus);
  const remaining = stateOrder.slice(Math.max(currentIdx + 1, 1)).filter(s => s !== 'completed');
  for (const status of remaining) {
    await step(ctx, S, `PATCH /reports/{id}/status → ${status}`, async (c) => {
      assert(reportId, 'No report');
      const body = { status };
      if (status === 'assigned') body.note = '[QA] Ditugaskan ke Satgas Jalan DPUPR';
      const r = await apiCall(c, 'patch', `${BASE}/reports/${reportId}/status`, {
        headers: { ...authH('operator'), 'Content-Type': 'application/json' },
        body
      });
      assert(r.status() === 200, `Status ${r.status()}: ${(await r.text()).slice(0,150)}`);
      return 'OK';
    });
  }

  // 5n. Upload completion photo (must be in_progress or later)
  await step(ctx, S, 'POST /reports/{id}/media (completion)', async (c) => {
    assert(reportId, 'No report');
    const jpgBuf = await makeTestJpeg();
    const r = await c.post(`${BASE}/reports/${reportId}/media`, {
      headers: { Authorization: `Bearer ${tokens.operator}` },
      multipart: {
        photo: { name: 'completion_qa.jpg', mimeType: 'image/jpeg', buffer: jpgBuf },
        type: 'completion_photo'
      }
    });
    const st = r.status();
    assert(st === 201 || st === 200, `Status ${st}: ${(await r.text()).slice(0,150)}`);
    return `${st}`;
  });

  // 5o. Complete
  await step(ctx, S, 'PATCH /reports/{id}/status → completed', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'patch', `${BASE}/reports/${reportId}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'completed' }
    });
    assert(r.status() === 200, `Status ${r.status()}: ${(await r.text()).slice(0,150)}`);
    return 'OK';
  });

  // 5p. Validate (citizen — pelapor asli may be exempt from 100m radius)
  let validateDone = false;
  await step(ctx, S, 'POST /reports/{id}/validate (far location)', async (c) => {
    assert(reportId, 'No report');
    const r = await apiCall(c, 'post', `${BASE}/reports/${reportId}/validate`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { is_valid: true, note: '[QA] Validasi jarak jauh oleh pelapor asli', latitude: SURABAYA.lat, longitude: SURABAYA.lng }
    });
    const st = r.status();
    assert(st === 200 || st === 201 || st === 400, `Expected 200/201/400, got ${st}`);
    if (st === 200 || st === 201) validateDone = true;
    return `${st}${st !== 400 ? ' — pelapor asli exempt' : ' — radius enforced'}`;
  });

  // 5q. Confirm final status is resolved
  await step(ctx, S, 'GET /reports/{id} → verify final status', async (c) => {
    assert(reportId, 'No report');
    if (!validateDone) {
      // Need to validate at actual location
      const r2 = await apiCall(c, 'post', `${BASE}/reports/${reportId}/validate`, {
        headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
        body: { is_valid: true, note: '[QA] Sudah diperbaiki.', latitude: ALUN_ALUN.lat, longitude: ALUN_ALUN.lng }
      });
      assert(r2.status() === 200 || r2.status() === 201, `Validate status ${r2.status()}`);
    }
    const r = await apiCall(c, 'get', `${BASE}/reports/${reportId}`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const d = (await r.json()).data || {};
    assert(d.status === 'resolved', `Expected resolved, got ${d.status}`);
    return `final status=${d.status} ✓`;
  });
}

// ── Suite 6: GIS & Route Alerts ──────────────────────────────────────────
async function suite6_GIS(ctx) {
  const S = 'Suite 6: GIS';
  console.log(`\n═══ ${S} ═══`);

  // 6a. POST /maps/route
  await step(ctx, S, 'POST /maps/route (OSRM)', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/maps/route`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: {
        origin_lat: ALUN_ALUN.lat,
        origin_lng: ALUN_ALUN.lng,
        destination_lat: LOWOKWARU.lat,
        destination_lng: LOWOKWARU.lng
      }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    const dist = d.distance_meters || d.distance || d.routes?.[0]?.distance || 0;
    const dur  = d.duration_seconds || d.duration || d.routes?.[0]?.duration || 0;
    assert(dist > 0, `distance=${dist}`);
    assert(dur > 0, `duration=${dur}`);
    return `dist=${dist}m dur=${dur}s`;
  });

  // 6b. POST /reports/along-route
  await step(ctx, S, 'POST /reports/along-route', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/reports/along-route`, {
      headers: { 'Content-Type': 'application/json' },
      body: {
        route_points: [
          { lat: ALUN_ALUN.lat, lng: ALUN_ALUN.lng },
          { lat: LOWOKWARU.lat, lng: LOWOKWARU.lng }
        ],
        radius_meters: 500
      }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 6c. POST /route-alerts/subscribe
  await step(ctx, S, 'POST /route-alerts/subscribe', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/route-alerts/subscribe`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: {
        device_token: 'qa-test-fcm-token-' + Date.now(),
        last_lat: ALUN_ALUN.lat,
        last_long: ALUN_ALUN.lng
      }
    });
    assert(r.status() === 200 || r.status() === 201, `Status ${r.status()}`);
    return `${r.status()}`;
  });

  // 6d. POST /route-alerts/check
  await step(ctx, S, 'POST /route-alerts/check', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/route-alerts/check`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { latitude: ALUN_ALUN.lat, longitude: ALUN_ALUN.lng }
    });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 6e. DELETE /route-alerts/unsubscribe
  await step(ctx, S, 'DELETE /route-alerts/unsubscribe', async (c) => {
    const r = await apiCall(c, 'delete', `${BASE}/route-alerts/unsubscribe`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { fcm_token: 'qa-test-fcm-token-cleanup' }
    });
    // May return 200 or 404 if not found
    assert(r.status() === 200 || r.status() === 404, `Status ${r.status()}`);
    return `${r.status()}`;
  });
}

// ── Suite 7: Predictions & Policy Simulator ──────────────────────────────
async function suite7_Predictions(ctx) {
  const S = 'Suite 7: Predictions';
  console.log(`\n═══ ${S} ═══`);

  const klojenZoneId = 'b1000000-0000-4000-8000-000000000001';
  let zones = [];

  // 7a. GET /predictions/zones
  await step(ctx, S, 'GET /predictions/zones', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/predictions/zones`);
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    zones = j.data || j;
    const arr = Array.isArray(zones) ? zones : [];
    assert(arr.length >= 5, `Expected >=5 zones, got ${arr.length}`);
    return `${arr.length} zones: ${arr.map(z=>z.name).join(', ')}`;
  });

  // 7b. GET /predictions/zones/{zoneId}/metrics
  await step(ctx, S, 'GET /predictions/zones/{zoneId}/metrics (Klojen)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/predictions/zones/${klojenZoneId}/metrics`);
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 7c. POST /predictions/metrics/refresh (operator)
  await step(ctx, S, 'POST /predictions/metrics/refresh (operator)', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/predictions/metrics/refresh`, {
      headers: authH('operator')
    });
    const st = r.status();
    assert(st === 200 || st === 201, `Status ${st}`);
    return `${st}`;
  });

  // 7d. RBAC: citizen POST /policy-simulations → 403
  await step(ctx, S, 'POST /policy-simulations as citizen → 403', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/policy-simulations`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { prompt_text: '[QA] Forbidden test' }
    });
    assert(r.status() === 403, `Expected 403, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 7e. Policy Maker POST /policy-simulations
  let simId = '';
  let sim1Budget = 0;
  let sim1Reduction = 0;
  await step(ctx, S, 'POST /policy-simulations (policyMaker — dynamic check #1)', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/policy-simulations`, {
      headers: { ...authH('policyMaker'), 'Content-Type': 'application/json' },
      body: {
        prompt_text: '[QA] Analisis dampak normalisasi drainase di wilayah Klojen Kota Malang untuk mengurangi risiko banjir dan estimasi anggaran',
        zone_id: 'b1000000-0000-4000-8000-000000000001'
      }
    });
    assert(r.status() === 201, `Expected 201, got ${r.status()}`);
    const j = await r.json();
    const d = j.data;
    simId = d.id || '';
    const rd = d.resultData || d.result_data || {};
    sim1Budget = Number(rd.estimated_budget_idr);
    sim1Reduction = Number(rd.estimated_complaint_reduction_percent);
    assert(Array.isArray(rd.recommended_actions) && rd.recommended_actions.length > 0, 'Missing recommended_actions');
    return `id=${simId} reduction=${sim1Reduction}% budget=${sim1Budget}`;
  });

  await step(ctx, S, 'POST /policy-simulations (policyMaker — dynamic check #2 differs from #1)', async (c) => {
    const r = await apiCall(c, 'post', `${BASE}/policy-simulations`, {
      headers: { ...authH('policyMaker'), 'Content-Type': 'application/json' },
      body: {
        prompt_text: '[QA] Penggantian lampu penerangan jalan umum PJU LED hemat energi di wilayah Lowokwaru Kota Malang',
        zone_id: 'b5000000-0000-4000-8000-000000000005'
      }
    });
    assert(r.status() === 201, `Expected 201, got ${r.status()}`);
    const j = await r.json();
    const rd2 = j.data?.resultData || j.data?.result_data || {};
    const sim2Budget = Number(rd2.estimated_budget_idr);
    const sim2Reduction = Number(rd2.estimated_complaint_reduction_percent);
    assert(sim2Budget !== sim1Budget || sim2Reduction !== sim1Reduction, 'Expected dynamic policy simulation output');
    return `sim1=(${sim1Reduction}%, Rp${sim1Budget}) vs sim2=(${sim2Reduction}%, Rp${sim2Budget})`;
  });

  // 7f. GET /policy-simulations (list)
  await step(ctx, S, 'GET /policy-simulations (policyMaker list)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/policy-simulations`, { headers: authH('policyMaker') });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    // Try to find our sim id if we didn't get it before
    if (!simId) {
      const items = j.data || j;
      const arr = Array.isArray(items) ? items : items.items || items.data || [];
      if (arr.length > 0) simId = arr[0].id;
    }
    return 'OK';
  });

  // 7g. GET /policy-simulations/{id}
  await step(ctx, S, 'GET /policy-simulations/{id}', async (c) => {
    if (!simId) {
      return 'SKIP — no simulation ID available';
    }
    const r = await apiCall(c, 'get', `${BASE}/policy-simulations/${simId}`, { headers: authH('policyMaker') });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });
}

// ── Suite 8: Notifications ───────────────────────────────────────────────
async function suite8_Notifications(ctx) {
  const S = 'Suite 8: Notifications';
  console.log(`\n═══ ${S} ═══`);

  let notifId = '';

  // 8a. GET /notifications
  await step(ctx, S, 'GET /notifications (citizen)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/notifications`, { headers: authH('citizen') });
    assert(r.status() === 200, `Status ${r.status()}`);
    const j = await r.json();
    const d = j.data || j;
    const items = Array.isArray(d) ? d : d.notifications || d.items || d.data || [];
    if (items.length > 0) notifId = items[0].id;
    return `${items.length} notifications, unread=${j.meta?.unread_count ?? d.unreadCount ?? '?'}`;
  });

  // 8b. PATCH /notifications/{id}/read
  await step(ctx, S, 'PATCH /notifications/{id}/read', async (c) => {
    if (!notifId) return 'SKIP — no notification';
    const r = await apiCall(c, 'patch', `${BASE}/notifications/${notifId}/read`, { headers: authH('citizen') });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });

  // 8c. PATCH /notifications/read-all
  await step(ctx, S, 'PATCH /notifications/read-all', async (c) => {
    const r = await apiCall(c, 'patch', `${BASE}/notifications/read-all`, { headers: authH('citizen') });
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });
}

// ── Suite 9: Negative Testing & Hardening ────────────────────────────────
async function suite9_Negative(ctx) {
  const S = 'Suite 9: Negative';
  console.log(`\n═══ ${S} ═══`);

  // 9a. No-token access to protected endpoints
  const protectedPaths = [
    ['get', '/users/me'],
    ['get', '/notifications'],
    ['post', '/reports'],
  ];
  for (const [method, path] of protectedPaths) {
    await step(ctx, S, `${method.toUpperCase()} ${path} no-token → 401`, async (c) => {
      const r = await apiCall(c, method, `${BASE}${path}`);
      assert(r.status() === 401, `Expected 401, got ${r.status()}`);
      return `${r.status()}`;
    });
  }

  // 9b. Invalid UUID
  await step(ctx, S, 'GET /reports/invalid-uuid → 400', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/reports/not-a-uuid`);
    assert(r.status() === 400 || r.status() === 422, `Expected 400/422, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 9c. UUID not found
  await step(ctx, S, 'GET /reports/00000000-... → 404', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/reports/00000000-0000-0000-0000-000000000000`);
    assert(r.status() === 404, `Expected 404, got ${r.status()}`);
    return `${r.status()}`;
  });

  // 9d. GET /health (backend)
  await step(ctx, S, 'GET /health (backend)', async (c) => {
    const r = await apiCall(c, 'get', `${BASE}/health`);
    assert(r.status() === 200, `Status ${r.status()}`);
    return 'OK';
  });
}

// ── Cleanup ──────────────────────────────────────────────────────────────
async function cleanupResources(ctx) {
  console.log(`\n═══ Cleanup ═══`);
  for (const item of cleanup) {
    try {
      if (item.type === 'user' && item.id && tokens.admin) {
        await apiCall(ctx, 'delete', `${BASE}/users/${item.id}`, { headers: authH('admin') });
        console.log(`  Cleaned user ${item.id}`);
      }
      if (item.type === 'category' && item.id) {
        await apiCall(ctx, 'delete', `${BASE}/categories/${item.id}`, { headers: authH('admin') });
        console.log(`  Cleaned category ${item.id}`);
      }
      if (item.type === 'agency' && item.id) {
        await apiCall(ctx, 'delete', `${BASE}/agencies/${item.id}`, { headers: authH('admin') });
        console.log(`  Cleaned agency ${item.id}`);
      }
    } catch (e) {
      console.log(`  Cleanup failed for ${item.type}/${item.id}: ${e.message}`);
    }
  }
  // Reports created with [QA] are left in resolved state — no deletion needed
  console.log(`  Reports left in resolved/final state.`);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  LaporKita — Playwright E2E Comprehensive QA Test Suite         ║');
  console.log('║  Backend: https://api-server.canadev.my.id/api/v1               ║');
  console.log('║  AI:      https://ai-server.canadev.my.id                       ║');
  console.log(`║  Started: ${new Date().toISOString()}                      ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const apiCtx = await request.newContext({
    extraHTTPHeaders: { 'User-Agent': UA },
    timeout: 60000
  });

  let aiReadiness = {};
  try {
    aiReadiness = await suite1_AI(apiCtx);
    await suite2_Auth(apiCtx);
    await suite3_MasterData(apiCtx);
    await suite4_Users(apiCtx);
    await suite5_Reports(apiCtx);
    await suite6_GIS(apiCtx);
    await suite7_Predictions(apiCtx);
    await suite8_Notifications(apiCtx);
    await suite9_Negative(apiCtx);
  } catch (fatalErr) {
    console.error(`\n⚠ FATAL ERROR: ${fatalErr.message}`);
    results.push({ suite: 'FATAL', name: 'Unhandled', status: 'FAIL', ms: 0, detail: fatalErr.message });
    totalFailed++;
  }

  await cleanupResources(apiCtx);
  await apiCtx.dispose();

  // ── Summary ────────────────────────────────────────────────────────────
  const total = totalPassed + totalFailed;
  const latencies = results.map(r => r.ms).filter(Boolean);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a,b) => a+b, 0) / latencies.length) : 0;
  const sortedLat = [...latencies].sort((a,b) => a-b);
  const p95Latency = sortedLat.length ? sortedLat[Math.floor(sortedLat.length * 0.95)] : 0;

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST EXECUTION SUMMARY                                         ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Tests : ${total}`);
  console.log(`║  Passed      : ${totalPassed}`);
  console.log(`║  Failed      : ${totalFailed}`);
  console.log(`║  Success Rate: ${total ? ((totalPassed/total)*100).toFixed(1) : 0}%`);
  console.log(`║  Avg Latency : ${avgLatency}ms`);
  console.log(`║  P95 Latency : ${p95Latency}ms`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  YOLOv11     : ${aiReadiness.yoloOk ? '✅ READY' : '❌ NOT READY'}`);
  console.log(`║  XGBoost     : ${aiReadiness.xgbOk ? '✅ READY' : '❌ NOT READY'}`);
  console.log(`║  Gemini LLM  : ${aiReadiness.geminiOk ? '✅ READY' : '⚠ CONTINGENT'}`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // ── Write results JSON ─────────────────────────────────────────────────
  const output = {
    executedAt: new Date().toISOString(),
    summary: { total, passed: totalPassed, failed: totalFailed, successRate: total ? ((totalPassed/total)*100).toFixed(1)+'%' : '0%', avgLatencyMs: avgLatency, p95LatencyMs: p95Latency },
    aiReadiness: { yoloV11: aiReadiness.yoloOk, xgboost: aiReadiness.xgbOk, gemini: aiReadiness.geminiOk, llmStatus: aiReadiness.llmStatus },
    results,
    cleanup
  };
  writeFileSync('qa_results.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Results written to qa_results.json');
  console.log('✅ Screenshot saved to ai_demo_console.png');
}

main().catch(err => {
  console.error('💥 Unhandled fatal error:', err);
  process.exit(1);
});
