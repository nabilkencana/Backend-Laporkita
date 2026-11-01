/**
 * Step 2: Phase 1 Complete Endpoint Testing & Raw Payload Capture
 * Exercises 100% of Backend (48 operations) + AI Service (19 operations: 17 OpenAPI + /demo + /sample_images.json)
 * Writes raw JSON captures to qa-contract-audit/captures/<slug>.json and screenshot to qa-contract-audit/ai_demo_console.png
 * Writes summary to qa-contract-audit/phase1_capture_summary.json
 */
import { chromium, request } from '/Users/nabilkencana/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import sharpMod from 'sharp';
import { QA_CONFIG } from './env_config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTURES_DIR = resolve(__dirname, 'captures');
mkdirSync(CAPTURES_DIR, { recursive: true });

// ── Config ──────────────────────────────────────────────────────────────
const BASE = QA_CONFIG.baseUrl;
const AI   = QA_CONFIG.aiUrl;
const AI_KEY = QA_CONFIG.aiKey;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LaporKita-QA/1.0';

const SEEDS = QA_CONFIG.seeds;

const ALUN_ALUN = { lat: -7.9826, lng: 112.6308 };
const LOWOKWARU = { lat: -7.9454, lng: 112.6137 };
const SURABAYA  = { lat: -7.2575, lng: 112.7521 };
const JAKARTA   = { lat: -6.2088, lng: 106.8456 };
const BALI      = { lat: -8.4095, lng: 115.1889 };
const RING_ZONE = { lat: -8.1500, lng: 112.6000 }; // Passes Backend [-8.25,-7.85], fails AI [-8.05,-7.90]
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const SEED_CAT_ID = 'c1000000-0000-4000-8000-000000000001';
const SEED_AGENCY_ID = 'a1000000-0000-4000-8000-000000000001';
const SEED_ZONE_ID = 'b1000000-0000-4000-8000-000000000001';

// ── State ───────────────────────────────────────────────────────────────
const tokens = {};
const results = [];
const capturesIndex = [];
const exercisedOps = new Set();
let totalPassed = 0;
let totalFailed = 0;
const cleanup = [];

// Sliding-window rate limit pacer for Backend (100 req/60s global, 10 req/60s POST /reports)
const backendCallTimestamps = [];
const postReportTimestamps = [];

async function paceBackendRequest(method, url) {
  if (!url.startsWith(BASE)) return;
  const now = Date.now();
  while (backendCallTimestamps.length && now - backendCallTimestamps[0] > 60000) {
    backendCallTimestamps.shift();
  }
  while (postReportTimestamps.length && now - postReportTimestamps[0] > 60000) {
    postReportTimestamps.shift();
  }
  const isPostReport = method.toUpperCase() === 'POST' && /\/reports$/.test(url);
  if (isPostReport && postReportTimestamps.length >= 7) {
    const waitMs = 60500 - (now - postReportTimestamps[0]);
    if (waitMs > 0) {
      console.log(`    [RateLimitPacer] Waiting ${Math.ceil(waitMs / 1000)}s for POST /reports window...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  if (backendCallTimestamps.length >= 82) {
    const waitMs = 60500 - (Date.now() - backendCallTimestamps[0]);
    if (waitMs > 0) {
      console.log(`    [RateLimitPacer] Waiting ${Math.ceil(waitMs / 1000)}s for global 100/60s window...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  const ts = Date.now();
  backendCallTimestamps.push(ts);
  if (isPostReport) postReportTimestamps.push(ts);
}

function maskToken(val) {
  if (!val || typeof val !== 'string') return val;
  if (val.startsWith('Bearer ')) {
    const raw = val.slice(7);
    return `Bearer ${raw.slice(0, 8)}...`;
  }
  return val.length > 10 ? `${val.slice(0, 8)}...` : '***';
}

function maskHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (/authorization|x-api-key/i.test(k)) {
      out[k] = maskToken(String(v));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function maskBodySecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(maskBodySecrets);
  const copy = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/^(access_token|refresh_token|password)$/i.test(k) && typeof v === 'string') {
      copy[k] = `${v.slice(0, 8)}...`;
    } else if (k === 'image_base64' && typeof v === 'string' && v.length > 120) {
      copy[k] = `${v.slice(0, 64)}...[base64 len=${v.length}]`;
    } else if (typeof v === 'object' && v !== null) {
      copy[k] = maskBodySecrets(v);
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

function summarizeMultipart(multipart) {
  if (!multipart) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(multipart)) {
    if (v && typeof v === 'object' && Buffer.isBuffer(v.buffer)) {
      out[k] = { name: v.name, mimeType: v.mimeType, sizeBytes: v.buffer.length };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function saveCapture(slug, captureData, preserveTokensForDownstream = false) {
  if (!slug) return;
  const filePath = resolve(CAPTURES_DIR, `${slug}.json`);
  const sanitized = {
    capturedAt: new Date().toISOString(),
    request: {
      method: captureData.method,
      url: captureData.url,
      headersMasked: maskHeaders(captureData.reqHeaders),
      bodySummary: captureData.multipart
        ? summarizeMultipart(captureData.multipart)
        : maskBodySecrets(captureData.reqBody),
    },
    status: captureData.status,
    latencyMs: captureData.latencyMs,
    headers: captureData.resHeaders,
    body: preserveTokensForDownstream ? maskBodySecrets(captureData.resBody) : maskBodySecrets(captureData.resBody),
  };
  writeFileSync(filePath, JSON.stringify(sanitized, null, 2));
  capturesIndex.push({
    slug,
    file: `qa-contract-audit/captures/${slug}.json`,
    method: captureData.method,
    url: captureData.url,
    status: captureData.status,
    latencyMs: captureData.latencyMs,
  });
}

async function apiCall(ctx, method, url, opts = {}) {
  const { body, multipart, headers: extra = {}, captureSlug, opKey, maxRetries = 2 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await paceBackendRequest(method, url);
    const t0 = Date.now();
    try {
      const callOpts = { headers: { ...extra } };
      if (multipart !== undefined) {
        callOpts.multipart = multipart;
      } else if (body !== undefined) {
        callOpts.data = body;
      }
      const res = await ctx[method.toLowerCase()](url, callOpts);
      const latencyMs = Date.now() - t0;

      if (res.status() === 429 && attempt < maxRetries) {
        const retryAfter = Number(res.headers()['retry-after'] || 60);
        console.log(`    [429 Retry-After] Sleeping ${retryAfter}s before retry...`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if ((res.status() === 502 || res.status() === 503 || res.status() === 504) && attempt < maxRetries) {
        console.log(`    [${res.status()} Upstream] Sleeping 3s before retry...`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      if (opKey) exercisedOps.add(opKey);

      if (captureSlug) {
        const ct = res.headers()['content-type'] || '';
        let parsedBody;
        if (/application\/json/i.test(ct)) {
          parsedBody = await res.json().catch(() => null);
        } else if (/zip|octet|image\//i.test(ct)) {
          const buf = await res.body();
          parsedBody = { _binary: true, contentType: ct, byteLength: buf.length };
        } else {
          const txt = await res.text().catch(() => '');
          parsedBody = txt.length > 1000 ? `${txt.slice(0, 1000)}...[truncated len=${txt.length}]` : txt;
        }
        saveCapture(captureSlug, {
          method: method.toUpperCase(),
          url,
          reqHeaders: extra,
          reqBody: body,
          multipart,
          status: res.status(),
          latencyMs,
          resHeaders: res.headers(),
          resBody: parsedBody,
        });
      }

      return { res, latencyMs };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && /ECONN|ETIMEDOUT|EAI_AGAIN|socket/i.test(String(err))) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function step(ctx, suite, name, methodPath, fn) {
  const t0 = Date.now();
  const label = `[${suite}] ${name} (${methodPath})`;
  process.stdout.write(`  ${label} ... `);
  try {
    const out = await fn(ctx);
    const ms = out?.latencyMs ?? (Date.now() - t0);
    const status = out?.status ?? 'OK';
    const detail = out?.detail ? ` — ${out.detail}` : '';
    console.log(`PASS (${status}, ${ms}ms)${detail}`);
    results.push({ suite, name, methodPath, outcome: 'PASS', status, ms, detail: out?.detail || '' });
    totalPassed++;
    return true;
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = String(err?.message || err).slice(0, 300);
    console.log(`FAIL (ERR, ${ms}ms) — ${msg}`);
    results.push({ suite, name, methodPath, outcome: 'FAIL', status: 'ERR', ms, detail: msg });
    totalFailed++;
    return false;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function authH(role) {
  return { Authorization: `Bearer ${tokens[role]}` };
}
function aiH() {
  return { 'X-API-Key': AI_KEY };
}

// ── Image Builders ───────────────────────────────────────────────────────
let _validJpegCache = null;
async function makeValidJpeg() {
  if (_validJpegCache) return _validJpegCache;
  // Create a textured image so sharpness >= 1.5 if needed, or use sample image
  const width = 640, height = 480;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      raw[idx] = (x * 7 + y * 13) % 256;
      raw[idx + 1] = (x * 11 + y * 3) % 256;
      raw[idx + 2] = (x * 5 + y * 17) % 256;
    }
  }
  _validJpegCache = await sharpMod(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  return _validJpegCache;
}

async function makeBlurrySolidGrayJpeg() {
  return sharpMod({
    create: { width: 640, height: 480, channels: 3, background: { r: 128, g: 128, b: 128 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function makeSmall320x240Jpeg() {
  return sharpMod({
    create: { width: 320, height: 240, channels: 3, background: { r: 100, g: 120, b: 140 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function makeWebpBuffer() {
  return sharpMod({
    create: { width: 640, height: 480, channels: 3, background: { r: 90, g: 110, b: 130 } },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

async function makeTamperedFacilityJpeg(sampleBase64) {
  const cleanB64 = sampleBase64.replace(/^data:image\/\w+;base64,/, '');
  const srcBuf = Buffer.from(cleanB64, 'base64');
  // Create a high-frequency 1px checkerboard strip (640x96) + zero-noise flat patch (192x192)
  const patchW = 192, patchH = 192;
  const flatPatch = await sharpMod({
    create: { width: patchW, height: patchH, channels: 3, background: { r: 30, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();

  const cbW = 320, cbH = 120;
  const cbRaw = Buffer.alloc(cbW * cbH * 3);
  for (let y = 0; y < cbH; y++) {
    for (let x = 0; x < cbW; x++) {
      const v = (x + y) % 2 === 0 ? 255 : 0;
      const i = (y * cbW + x) * 3;
      cbRaw[i] = v;
      cbRaw[i + 1] = v;
      cbRaw[i + 2] = v;
    }
  }
  const cbPatch = await sharpMod(cbRaw, { raw: { width: cbW, height: cbH, channels: 3 } }).png().toBuffer();

  return sharpMod(srcBuf)
    .resize(640, 480, { fit: 'fill' })
    .composite([
      { input: flatPatch, left: 40, top: 40 },
      { input: cbPatch, left: 260, top: 260 },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ── Suite 1: AI Service Complete Matrix (19 Operations) ──────────────────
let sampleImagesMap = {};
let roadPotholeSampleBuffer = null;

async function suite1_AIService(ctx) {
  const S = 'Phase1-AI';
  console.log(`\n═══ ${S}: AI Service Complete Matrix (19 Operations) ═══`);

  // 1. GET /health
  await step(ctx, S, 'AI Health Check', 'GET /health', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${AI}/health`, {
      headers: aiH(),
      captureSlug: 'ai_get_health',
      opKey: 'AI:GET /health',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.success === true && j.data?.models?.yolo_classification_loaded === true, 'Models not loaded');
    return { status: res.status(), latencyMs, detail: `yolo=${j.data.models.yolo_classification_loaded} xgb=${j.data.models.xgboost_risk_loaded}` };
  });

  // 2. GET /demo (Playwright Browser)
  await step(ctx, S, 'AI Interactive Demo Console (Browser)', 'GET /demo', async (c) => {
    const t0 = Date.now();
    const { res } = await apiCall(c, 'get', `${AI}/demo`, {
      headers: { 'User-Agent': UA },
      captureSlug: 'ai_get_demo_html',
      opKey: 'AI:GET /demo',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);

    const browser = await chromium.launch({ channel: 'chrome' });
    try {
      const page = await browser.newPage({ userAgent: UA });
      await page.goto(`${AI}/demo`, { waitUntil: 'networkidle', timeout: 30000 });
      const title = await page.title();
      assert(title.includes('LaporKita AI Console'), `Unexpected title: ${title}`);
      const screenshotPath = resolve(__dirname, 'ai_demo_console.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const latencyMs = Date.now() - t0;
      return { status: 200, latencyMs, detail: `title="${title}", saved qa-contract-audit/ai_demo_console.png` };
    } finally {
      await browser.close();
    }
  });

  // 3. GET /sample_images.json
  await step(ctx, S, 'AI Sample Images Static JSON', 'GET /sample_images.json', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${AI}/sample_images.json`, {
      headers: aiH(),
      captureSlug: 'ai_get_sample_images',
      opKey: 'AI:GET /sample_images.json',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    sampleImagesMap = await res.json();
    const jbB64 = (sampleImagesMap['Jalan Berlubang'] || Object.values(sampleImagesMap)[0]).replace(/^data:image\/\w+;base64,/, '');
    roadPotholeSampleBuffer = await sharpMod(Buffer.from(jbB64, 'base64'))
      .resize(640, 480, { fit: 'fill' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { status: res.status(), latencyMs, detail: `classes=${Object.keys(sampleImagesMap).join(', ')}` };
  });

  // 4. Auth checks on /v1/verify and /api/v1/verify (no key -> 401, wrong key -> 403)
  await step(ctx, S, 'AI Auth Missing X-API-Key -> 401', 'POST /v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/verify`, {
      headers: { 'Content-Type': 'application/json' },
      body: { latitude: ALUN_ALUN.lat, longitude: ALUN_ALUN.lng },
      captureSlug: 'ai_v1_verify_401_no_key',
    });
    assert(res.status() === 401, `Expected 401, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'AI Auth Wrong X-API-Key -> 403', 'POST /v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/verify`, {
      headers: { 'X-API-Key': 'wrong-key', 'Content-Type': 'application/json' },
      body: { latitude: ALUN_ALUN.lat, longitude: ALUN_ALUN.lng },
      captureSlug: 'ai_v1_verify_403_wrong_key',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 5. All 5 facility classes on POST /v1/verify and POST /api/v1/verify
  const facilityClasses = ['Drainase', 'Jalan Berlubang', 'Lampu Jalan', 'Rambu Lalu Lintas', 'Trotoar'];
  for (const cls of facilityClasses) {
    const slugSuffix = cls.toLowerCase().replace(/\s+/g, '_');
    const rawB64 = (sampleImagesMap[cls] || '').replace(/^data:image\/\w+;base64,/, '');

    await step(ctx, S, `Verify Facility Class "${cls}" (Envelope)`, 'POST /v1/verify', async (c) => {
      const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/verify`, {
        headers: { ...aiH(), 'Content-Type': 'application/json' },
        body: {
          image_base64: rawB64,
          claimed_category: cls,
          latitude: ALUN_ALUN.lat,
          longitude: ALUN_ALUN.lng,
          timestamp: new Date().toISOString(),
        },
        captureSlug: `ai_v1_verify_${slugSuffix}`,
        opKey: 'AI:POST /v1/verify',
      });
      assert(res.status() === 200, `Expected 200, got ${res.status()}`);
      const j = await res.json();
      assert(j.success === true && j.data?.predicted_category, 'Missing predicted_category');
      return {
        status: res.status(),
        latencyMs,
        detail: `pred=${j.data.predicted_category} conf=${j.data.ai_confidence_score?.toFixed(2)} valid=${j.data.is_valid}`,
      };
    });

    await step(ctx, S, `Verify Facility Class "${cls}" (NestJS Flat Compat)`, 'POST /api/v1/verify', async (c) => {
      const { res, latencyMs } = await apiCall(c, 'post', `${AI}/api/v1/verify`, {
        headers: { ...aiH(), 'Content-Type': 'application/json' },
        body: {
          image_base64: rawB64,
          reported_category: cls,
          latitude: ALUN_ALUN.lat,
          longitude: ALUN_ALUN.lng,
          created_at: new Date().toISOString(),
        },
        captureSlug: `ai_api_v1_verify_${slugSuffix}`,
        opKey: 'AI:POST /api/v1/verify',
      });
      assert(res.status() === 200, `Expected 200, got ${res.status()}`);
      const j = await res.json();
      assert(typeof j.confidence === 'number' && j.category, 'Missing flat confidence/category');
      return {
        status: res.status(),
        latencyMs,
        detail: `cat=${j.category} conf=${j.confidence?.toFixed(2)} hasIsValid=${'is_valid' in j}`,
      };
    });
  }

  // 6. 6th Class OOD / Blur trigger on /v1/verify and /api/v1/verify
  const blurryBuf = await makeBlurrySolidGrayJpeg();
  const blurryB64 = blurryBuf.toString('base64');

  await step(ctx, S, 'Verify 6th Class OOD / Blurry Image (Envelope)', 'POST /v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/verify`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: blurryB64,
        claimed_category: 'Jalan Berlubang',
        latitude: ALUN_ALUN.lat,
        longitude: ALUN_ALUN.lng,
        timestamp: new Date().toISOString(),
      },
      captureSlug: 'ai_v1_verify_ood_blurry',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.data?.predicted_category === 'bukan_fasilitas', `Expected bukan_fasilitas, got ${j.data?.predicted_category}`);
    assert(j.data?.is_valid === false && j.data?.needs_manual_review === true, 'Expected is_valid=false, needs_manual_review=true');
    return {
      status: res.status(),
      latencyMs,
      detail: `pred=${j.data.predicted_category} conf=${j.data.ai_confidence_score} is_valid=${j.data.is_valid} manual=${j.data.needs_manual_review}`,
    };
  });

  await step(ctx, S, 'Verify 6th Class OOD / Blurry Image (NestJS Flat)', 'POST /api/v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/api/v1/verify`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: blurryB64,
        reported_category: 'Jalan Berlubang',
        latitude: ALUN_ALUN.lat,
        longitude: ALUN_ALUN.lng,
        created_at: new Date().toISOString(),
      },
      captureSlug: 'ai_api_v1_verify_ood_blurry',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.category === 'bukan_fasilitas', `Expected bukan_fasilitas, got ${j.category}`);
    return {
      status: res.status(),
      latencyMs,
      detail: `cat=${j.category} conf=${j.confidence} is_valid_field=${j.is_valid}`,
    };
  });

  // 7. Non-authentic / Tampered image trigger on /v1/verify and /api/v1/verify
  const tamperedBuf = await makeTamperedFacilityJpeg(sampleImagesMap['Jalan Berlubang']);
  const tamperedB64 = tamperedBuf.toString('base64');

  await step(ctx, S, 'Verify Tampered / Spliced Image (Envelope)', 'POST /v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/verify`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: tamperedB64,
        claimed_category: 'Jalan Berlubang',
        latitude: ALUN_ALUN.lat,
        longitude: ALUN_ALUN.lng,
        timestamp: new Date().toISOString(),
      },
      captureSlug: 'ai_v1_verify_tampered',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.data?.authenticity?.is_authentic === false, `Expected is_authentic=false, got ${JSON.stringify(j.data?.authenticity)}`);
    return {
      status: res.status(),
      latencyMs,
      detail: `is_authentic=${j.data.authenticity.is_authentic} score=${j.data.authenticity.authenticity_score} indicators=${(j.data.authenticity.tampering_indicators || []).length}`,
    };
  });

  await step(ctx, S, 'Verify Tampered / Spliced Image (NestJS Flat)', 'POST /api/v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/api/v1/verify`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: tamperedB64,
        reported_category: 'Jalan Berlubang',
        latitude: ALUN_ALUN.lat,
        longitude: ALUN_ALUN.lng,
        created_at: new Date().toISOString(),
      },
      captureSlug: 'ai_api_v1_verify_tampered',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.is_authentic === false, `Expected is_authentic=false, got ${j.is_authentic}`);
    return { status: res.status(), latencyMs, detail: `is_authentic=${j.is_authentic} conf=${j.confidence}` };
  });

  // 8. Out-of-Malang BBox (Jakarta + Ring-Zone -8.15, 112.60)
  const jbB64 = (sampleImagesMap['Jalan Berlubang'] || '').replace(/^data:image\/\w+;base64,/, '');
  await step(ctx, S, 'Verify Out-of-Malang BBox Jakarta', 'POST /v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/verify`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: jbB64,
        claimed_category: 'Jalan Berlubang',
        latitude: JAKARTA.lat,
        longitude: JAKARTA.lng,
        timestamp: new Date().toISOString(),
      },
      captureSlug: 'ai_v1_verify_out_of_malang_jakarta',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.data?.gps_valid === false && j.data?.location_verification?.is_location_consistent === false, 'Expected gps_valid=false');
    return { status: res.status(), latencyMs, detail: `gps_valid=${j.data.gps_valid} is_valid=${j.data.is_valid}` };
  });

  await step(ctx, S, 'Verify Ring-Zone (-8.15, 112.60) Passes Canonical Malang BBox', 'POST /v1/verify', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/verify`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        image_base64: jbB64,
        claimed_category: 'Jalan Berlubang',
        latitude: RING_ZONE.lat,
        longitude: RING_ZONE.lng,
        timestamp: new Date().toISOString(),
      },
      captureSlug: 'ai_v1_verify_ring_zone',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.data?.gps_valid === true, `Expected gps_valid=true at (-8.15,112.60), got ${j.data?.gps_valid}`);
    return { status: res.status(), latencyMs, detail: `gps_valid=${j.data.gps_valid} reason="${j.data.reason}"` };
  });

  // 9. POST /v1/predict-risk & POST /api/v1/predict-risk
  const predictRiskPayload = {
    zone_id: SEED_ZONE_ID,
    report_density: 12,
    rainfall_mm: 64,
    temperature_c: 28,
    weather_context: { rainfall_mm: 64, temperature_c: 28, condition: 'Hujan Deras', drainage_issue_ratio: 0.4 },
    traffic_density: 0.8,
    category: 'Drainase',
  };

  await step(ctx, S, 'Predict Risk (Canonical /v1)', 'POST /v1/predict-risk', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/predict-risk`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: predictRiskPayload,
      captureSlug: 'ai_v1_predict_risk',
      opKey: 'AI:POST /v1/predict-risk',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(typeof j.data?.flood_risk_probability === 'number', 'Missing flood_risk_probability');
    return { status: res.status(), latencyMs, detail: `prob=${j.data.flood_risk_probability} level=${j.data.risk_level}` };
  });

  await step(ctx, S, 'Predict Risk (Compat /api/v1)', 'POST /api/v1/predict-risk', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/api/v1/predict-risk`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: predictRiskPayload,
      captureSlug: 'ai_api_v1_predict_risk',
      opKey: 'AI:POST /api/v1/predict-risk',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 10. POST /v1/predict/zone-metrics & POST /api/v1/predict/zone-metrics
  const zoneMetricsPayload = {
    zone_id: SEED_ZONE_ID,
    zone_name: 'Klojen',
    active_reports: 13,
    rainfall_mm: 82,
    temperature_c: 27,
    traffic_density: 0.65,
    condition: 'Hujan Ringan',
  };

  await step(ctx, S, 'Predict Zone Metrics (Canonical /v1)', 'POST /v1/predict/zone-metrics', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/predict/zone-metrics`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: zoneMetricsPayload,
      captureSlug: 'ai_v1_predict_zone_metrics',
      opKey: 'AI:POST /v1/predict/zone-metrics',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Predict Zone Metrics (Compat /api/v1)', 'POST /api/v1/predict/zone-metrics', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/api/v1/predict/zone-metrics`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: zoneMetricsPayload,
      captureSlug: 'ai_api_v1_predict_zone_metrics',
      opKey: 'AI:POST /api/v1/predict/zone-metrics',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 11. POST /v1/policy-simulate & POST /api/v1/policy-simulate
  const policyPayload = {
    prompt_text: '[QA] Analisis dampak kebijakan normalisasi drainase di wilayah Klojen Kota Malang. Berikan proyeksi penurunan risiko banjir dan estimasi anggaran.',
    zone_id: SEED_ZONE_ID,
    time_horizon_months: 12,
    parameters: { drainage_coverage_pct: 80, budget_idr: 5000000000 },
  };

  await step(ctx, S, 'Policy Simulate (Canonical /v1)', 'POST /v1/policy-simulate', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/policy-simulate`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: policyPayload,
      captureSlug: 'ai_v1_policy_simulate',
      opKey: 'AI:POST /v1/policy-simulate',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    const rd = j.data?.result_data || j.data || {};
    assert(rd.budget_estimate_idr !== undefined, 'Missing budget_estimate_idr in result_data');
    return {
      status: res.status(),
      latencyMs,
      detail: `reduction=${rd.estimated_incident_reduction_pct}% budget=${rd.budget_estimate_idr} recs=${(j.data?.key_recommendations || []).length}`,
    };
  });

  await step(ctx, S, 'Policy Simulate (Compat /api/v1)', 'POST /api/v1/policy-simulate', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/api/v1/policy-simulate`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: {
        prompt_text: '[QA] Evaluasi program penggantian lampu jalan PJU LED hemat energi di Lowokwaru Kota Malang.',
        zone_id: 'b5000000-0000-4000-8000-000000000005',
        time_horizon_months: 6,
      },
      captureSlug: 'ai_api_v1_policy_simulate',
      opKey: 'AI:POST /api/v1/policy-simulate',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.success === true && j.data?.result_data?.budget_estimate_idr > 0, 'Missing result_data.budget_estimate_idr');
    return { status: res.status(), latencyMs, detail: `budget=${j.data.result_data.budget_estimate_idr}` };
  });

  // 12. Active Learning / Training endpoints (/v1 and /api/v1)
  let ingestedFilename = '';
  const ingestPayload = {
    image_base64: jbB64,
    verified_category: 'Jalan Berlubang',
    original_prediction: 'Jalan Berlubang',
    confidence_score: 0.94,
    source: 'qa_contract_audit',
    operator_notes: '[QA] Contract audit ingest sample',
  };

  await step(ctx, S, 'Training Ingest Sample (Canonical /v1)', 'POST /v1/training/ingest-sample', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/v1/training/ingest-sample`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: ingestPayload,
      captureSlug: 'ai_v1_training_ingest_sample',
      opKey: 'AI:POST /v1/training/ingest-sample',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    ingestedFilename = j.data?.filename || j.data?.saved_file || '';
    return { status: res.status(), latencyMs, detail: `filename=${ingestedFilename}` };
  });

  await step(ctx, S, 'Training Ingest Sample (Compat /api/v1)', 'POST /api/v1/training/ingest-sample', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${AI}/api/v1/training/ingest-sample`, {
      headers: { ...aiH(), 'Content-Type': 'application/json' },
      body: ingestPayload,
      captureSlug: 'ai_api_v1_training_ingest_sample',
      opKey: 'AI:POST /api/v1/training/ingest-sample',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    if (!ingestedFilename) ingestedFilename = j.data?.filename || j.data?.saved_file || '';
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Training Dataset Stats (Canonical /v1)', 'GET /v1/training/dataset-stats', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${AI}/v1/training/dataset-stats`, {
      headers: aiH(),
      captureSlug: 'ai_v1_training_dataset_stats',
      opKey: 'AI:GET /v1/training/dataset-stats',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Training Dataset Stats (Compat /api/v1)', 'GET /api/v1/training/dataset-stats', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${AI}/api/v1/training/dataset-stats`, {
      headers: aiH(),
      captureSlug: 'ai_api_v1_training_dataset_stats',
      opKey: 'AI:GET /api/v1/training/dataset-stats',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  const sampleClassSanitized = encodeURIComponent('Jalan Berlubang');
  const sampleFileEncoded = encodeURIComponent(ingestedFilename || 'nonexistent.jpg');

  await step(ctx, S, 'Training Get Sample Image (Canonical /v1)', 'GET /v1/training/samples/{class_name}/{filename}', async (c) => {
    const { res, latencyMs } = await apiCall(
      c,
      'get',
      `${AI}/v1/training/samples/${sampleClassSanitized}/${sampleFileEncoded}`,
      {
        headers: aiH(),
        captureSlug: 'ai_v1_training_get_sample',
        opKey: 'AI:GET /v1/training/samples/{class_name}/{filename}',
      },
    );
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs, detail: `file=${ingestedFilename}` };
  });

  await step(ctx, S, 'Training Get Sample Image (Compat /api/v1)', 'GET /api/v1/training/samples/{class_name}/{filename}', async (c) => {
    const { res, latencyMs } = await apiCall(
      c,
      'get',
      `${AI}/api/v1/training/samples/${sampleClassSanitized}/${sampleFileEncoded}`,
      {
        headers: aiH(),
        captureSlug: 'ai_api_v1_training_get_sample',
        opKey: 'AI:GET /api/v1/training/samples/{class_name}/{filename}',
      },
    );
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Training Download Dataset ZIP (Canonical /v1)', 'GET /v1/training/download-dataset', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${AI}/v1/training/download-dataset`, {
      headers: aiH(),
      captureSlug: 'ai_v1_training_download_dataset',
      opKey: 'AI:GET /v1/training/download-dataset',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Training Download Dataset ZIP (Compat /api/v1)', 'GET /api/v1/training/download-dataset', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${AI}/api/v1/training/download-dataset`, {
      headers: aiH(),
      captureSlug: 'ai_api_v1_training_download_dataset',
      opKey: 'AI:GET /api/v1/training/download-dataset',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });
}

// ── Suite 2: Backend Auth & Users Complete Matrix ────────────────────────
let qaTempUserId = '';
let qaTempPhone = '';
let qaTempEmail = '';

async function suite2_BackendAuthAndUsers(ctx) {
  const S = 'Phase1-AuthUsers';
  console.log(`\n═══ ${S}: Backend Health, Auth & Users (13 Operations) ═══`);

  // 1. GET /health
  await step(ctx, S, 'Backend Health Check', 'GET /api/v1/health', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/health`, {
      captureSlug: 'backend_get_health',
      opKey: 'BE:GET /api/v1/health',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 2. Login 4 seed roles
  for (const [role, cred] of Object.entries(SEEDS)) {
    await step(ctx, S, `Login Seed Role (${role})`, 'POST /api/v1/auth/login', async (c) => {
      const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/login`, {
        headers: { 'Content-Type': 'application/json' },
        body: { identifier: cred.email, password: cred.password },
        captureSlug: `backend_post_auth_login_${role}`,
        opKey: 'BE:POST /api/v1/auth/login',
      });
      assert(res.status() === 200, `Expected 200, got ${res.status()}`);
      const j = await res.json();
      tokens[role] = j.data.access_token;
      tokens[`${role}_refresh`] = j.data.refresh_token;
      return { status: res.status(), latencyMs, detail: `token=${maskToken(tokens[role])}` };
    });
  }

  // Negative login: wrong password (401) & extra field (400 VALIDATION_ERROR)
  await step(ctx, S, 'Login Wrong Password -> 401', 'POST /api/v1/auth/login', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: SEEDS.citizen.email, password: 'WrongPassword999!' },
      captureSlug: 'backend_post_auth_login_401',
    });
    assert(res.status() === 401, `Expected 401, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 3. POST /auth/refresh (single-use rotation + reuse old token -> 401 REFRESH_TOKEN_INVALID)
  const oldCitizenRefresh = tokens.citizen_refresh;
  await step(ctx, S, 'Refresh Token Single-Use Rotation', 'POST /api/v1/auth/refresh', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/refresh`, {
      headers: { 'Content-Type': 'application/json' },
      body: { refresh_token: oldCitizenRefresh },
      captureSlug: 'backend_post_auth_refresh',
      opKey: 'BE:POST /api/v1/auth/refresh',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    tokens.citizen = j.data.access_token;
    tokens.citizen_refresh = j.data.refresh_token;
    return { status: res.status(), latencyMs, detail: `rotated=${maskToken(tokens.citizen)}` };
  });

  await step(ctx, S, 'Refresh Token Reuse Old Token -> 401 REFRESH_TOKEN_INVALID', 'POST /api/v1/auth/refresh', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/refresh`, {
      headers: { 'Content-Type': 'application/json' },
      body: { refresh_token: oldCitizenRefresh },
      captureSlug: 'backend_post_auth_refresh_401_reused',
    });
    assert(res.status() === 401, `Expected 401, got ${res.status()}`);
    const j = await res.json();
    assert(j.error?.code === 'REFRESH_TOKEN_INVALID', `Expected REFRESH_TOKEN_INVALID, got ${j.error?.code}`);
    return { status: res.status(), latencyMs, detail: `code=${j.error?.code}` };
  });

  // 4. POST /auth/register (temporary [QA] user)
  qaTempEmail = `qa.contract.${Date.now()}@laporkita.test.go.id`;
  qaTempPhone = `0813${String(Date.now()).slice(-8)}`;
  await step(ctx, S, 'Register Temporary [QA] User -> 202', 'POST /api/v1/auth/register', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/register`, {
      headers: { 'Content-Type': 'application/json' },
      body: {
        full_name: '[QA] Contract Audit Citizen',
        email: qaTempEmail,
        phone_number: qaTempPhone,
        password: 'QaContract2026!',
      },
      captureSlug: 'backend_post_auth_register',
      opKey: 'BE:POST /api/v1/auth/register',
    });
    assert(res.status() === 202, `Expected 202, got ${res.status()}`);
    const j = await res.json();
    qaTempUserId = j.data?.user_id || '';
    assert(qaTempUserId, 'Missing user_id in register response');
    cleanup.push({ type: 'user', id: qaTempUserId });
    return { status: res.status(), latencyMs, detail: `user_id=${qaTempUserId}` };
  });

  // Unverified login -> 401 PHONE_NOT_VERIFIED
  await step(ctx, S, 'Login Unverified [QA] User -> 401 PHONE_NOT_VERIFIED', 'POST /api/v1/auth/login', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: qaTempEmail, password: 'QaContract2026!' },
      captureSlug: 'backend_post_auth_login_401_unverified',
    });
    assert(res.status() === 401, `Expected 401, got ${res.status()}`);
    const j = await res.json();
    assert(j.error?.code === 'PHONE_NOT_VERIFIED', `Expected PHONE_NOT_VERIFIED, got ${j.error?.code}`);
    return { status: res.status(), latencyMs, detail: `code=${j.error?.code}` };
  });

  // 5. POST /auth/resend-otp (within 45s cooldown -> 400 VALIDATION_ERROR trap)
  await step(ctx, S, 'Resend OTP Within 45s Cooldown -> 400 OTP_RESEND_COOLDOWN with remainingSeconds', 'POST /api/v1/auth/resend-otp', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/resend-otp`, {
      headers: { 'Content-Type': 'application/json' },
      body: { user_id: qaTempUserId, phone_number: qaTempPhone },
      captureSlug: 'backend_post_auth_resend_otp_cooldown',
      opKey: 'BE:POST /api/v1/auth/resend-otp',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    const j = await res.json();
    assert(j.error?.code === 'OTP_RESEND_COOLDOWN', `Expected OTP_RESEND_COOLDOWN, got ${j.error?.code}`);
    assert(typeof j.error?.details?.remainingSeconds === 'number', 'Missing remainingSeconds in error.details');
    return { status: res.status(), latencyMs, detail: `code=${j.error?.code} remainingSeconds=${j.error?.details?.remainingSeconds}` };
  });

  await step(ctx, S, 'Verify OTP Wrong Code 0000 -> 400 OTP_INVALID', 'POST /api/v1/auth/verify-otp', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/auth/verify-otp`, {
      headers: { 'Content-Type': 'application/json' },
      body: { user_id: qaTempUserId, phone_number: qaTempPhone, otp_code: '0000' },
      captureSlug: 'backend_post_auth_verify_otp_wrong',
      opKey: 'BE:POST /api/v1/auth/verify-otp',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    const j = await res.json();
    assert(j.error?.code === 'OTP_INVALID', `Expected OTP_INVALID, got ${j.error?.code}`);
    return { status: res.status(), latencyMs, detail: `code=${j.error?.code}` };
  });

  // 7. GET /users/me & PATCH /users/me (idempotent on seed citizen!)
  let currentCitizenFullName = '';
  let adminUserId = '';
  await step(ctx, S, 'Get Citizen Profile (/users/me)', 'GET /api/v1/users/me', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/users/me`, {
      headers: authH('citizen'),
      captureSlug: 'backend_get_users_me',
      opKey: 'BE:GET /api/v1/users/me',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    currentCitizenFullName = j.data.full_name;
    return { status: res.status(), latencyMs, detail: `name="${currentCitizenFullName}"` };
  });

  await step(ctx, S, 'Patch Citizen Profile Idempotent (/users/me)', 'PATCH /api/v1/users/me', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/users/me`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { full_name: currentCitizenFullName },
      captureSlug: 'backend_patch_users_me',
      opKey: 'BE:PATCH /api/v1/users/me',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs, detail: `preserved="${currentCitizenFullName}"` };
  });

  await step(ctx, S, 'Patch Citizen Profile Extra Field -> 400 VALIDATION_ERROR', 'PATCH /api/v1/users/me', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/users/me`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { full_name: currentCitizenFullName, extra_field: 'x' },
      captureSlug: 'backend_patch_users_me_400_extra_field',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 8. GET /users/me/points
  await step(ctx, S, 'Get Citizen Points History (/users/me/points)', 'GET /api/v1/users/me/points', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/users/me/points?limit=20`, {
      headers: authH('citizen'),
      captureSlug: 'backend_get_users_me_points',
      opKey: 'BE:GET /api/v1/users/me/points',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 9. GET /users (admin 200, citizen 403)
  await step(ctx, S, 'Get Users List as Citizen -> 403', 'GET /api/v1/users', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/users`, {
      headers: authH('citizen'),
      captureSlug: 'backend_get_users_403_citizen',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Get Users List as Admin -> 200', 'GET /api/v1/users', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/users?limit=10`, {
      headers: authH('admin'),
      captureSlug: 'backend_get_users',
      opKey: 'BE:GET /api/v1/users',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // Get admin own ID for self-delete guard
  const { res: adminMeRes } = await apiCall(ctx, 'get', `${BASE}/users/me`, { headers: authH('admin') });
  adminUserId = (await adminMeRes.json()).data.id;

  // 10. GET /users/{id}, PATCH /users/{id}, DELETE /users/{id} on temporary [QA] user
  await step(ctx, S, 'Get Temporary [QA] User by ID (Admin)', 'GET /api/v1/users/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/users/${qaTempUserId}`, {
      headers: authH('admin'),
      captureSlug: 'backend_get_user_by_id',
      opKey: 'BE:GET /api/v1/users/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Patch Temporary [QA] User by ID (Admin)', 'PATCH /api/v1/users/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/users/${qaTempUserId}`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { full_name: '[QA] Contract Audit Citizen Updated' },
      captureSlug: 'backend_patch_user_by_id',
      opKey: 'BE:PATCH /api/v1/users/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Admin Self-Delete Guard -> 400 BAD_REQUEST', 'DELETE /api/v1/users/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/users/${adminUserId}`, {
      headers: authH('admin'),
      captureSlug: 'backend_delete_user_self_400',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Delete Temporary [QA] User by ID (Admin)', 'DELETE /api/v1/users/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/users/${qaTempUserId}`, {
      headers: authH('admin'),
      captureSlug: 'backend_delete_user_by_id',
      opKey: 'BE:DELETE /api/v1/users/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const idx = cleanup.findIndex((x) => x.type === 'user' && x.id === qaTempUserId);
    if (idx !== -1) cleanup.splice(idx, 1);
    return { status: res.status(), latencyMs };
  });
}

// ── Suite 3: Categories & Agencies Complete Matrix (10 Operations) ────────
async function suite3_MasterData(ctx) {
  const S = 'Phase1-MasterData';
  console.log(`\n═══ ${S}: Categories & Agencies CRUD + Guards (10 Operations) ═══`);

  // 1. GET /categories & GET /categories/{id}
  await step(ctx, S, 'Get Categories List', 'GET /api/v1/categories', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/categories`, {
      captureSlug: 'backend_get_categories',
      opKey: 'BE:GET /api/v1/categories',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Get Category by ID', 'GET /api/v1/categories/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/categories/${SEED_CAT_ID}`, {
      captureSlug: 'backend_get_category_by_id',
      opKey: 'BE:GET /api/v1/categories/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 2. Category RBAC (citizen 403) + Admin CRUD + Duplicate Name (409) + Relational Delete Guard (400)
  await step(ctx, S, 'Create Category as Citizen -> 403', 'POST /api/v1/categories', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/categories`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { name: '[QA] Forbidden Cat', urgency_weight: 1.0 },
      captureSlug: 'backend_post_categories_403_citizen',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  let qaCatId = '';
  const qaCatName = `[QA] Kategori Audit ${Date.now()}`;
  await step(ctx, S, 'Create [QA] Category (Admin)', 'POST /api/v1/categories', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/categories`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: {
        name: qaCatName,
        default_agency_id: SEED_AGENCY_ID,
        urgency_weight: 1.5,
        icon_url: 'https://example.com/qa-cat.svg',
      },
      captureSlug: 'backend_post_categories',
      opKey: 'BE:POST /api/v1/categories',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    qaCatId = j.data.id;
    cleanup.push({ type: 'category', id: qaCatId });
    return { status: res.status(), latencyMs, detail: `id=${qaCatId}` };
  });

  await step(ctx, S, 'Create Duplicate Category Name -> 409 CONFLICT', 'POST /api/v1/categories', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/categories`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: qaCatName, default_agency_id: SEED_AGENCY_ID, urgency_weight: 1.5 },
      captureSlug: 'backend_post_categories_409_duplicate',
    });
    assert(res.status() === 409, `Expected 409, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Update [QA] Category (Admin)', 'PATCH /api/v1/categories/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/categories/${qaCatId}`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: `${qaCatName} Updated` },
      captureSlug: 'backend_patch_category_by_id',
      opKey: 'BE:PATCH /api/v1/categories/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Delete Seed Category With Reports -> 400 BAD_REQUEST Guard', 'DELETE /api/v1/categories/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/categories/${SEED_CAT_ID}`, {
      headers: authH('admin'),
      captureSlug: 'backend_delete_category_with_reports_400',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Delete [QA] Category (Admin)', 'DELETE /api/v1/categories/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/categories/${qaCatId}`, {
      headers: authH('admin'),
      captureSlug: 'backend_delete_category_by_id',
      opKey: 'BE:DELETE /api/v1/categories/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const idx = cleanup.findIndex((x) => x.type === 'category' && x.id === qaCatId);
    if (idx !== -1) cleanup.splice(idx, 1);
    return { status: res.status(), latencyMs };
  });

  // 3. GET /agencies, GET /agencies/{id}, POST/PATCH/DELETE /agencies
  await step(ctx, S, 'Get Agencies List', 'GET /api/v1/agencies', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/agencies`, {
      captureSlug: 'backend_get_agencies',
      opKey: 'BE:GET /api/v1/agencies',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Get Agency by ID', 'GET /api/v1/agencies/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/agencies/${SEED_AGENCY_ID}`, {
      captureSlug: 'backend_get_agency_by_id',
      opKey: 'BE:GET /api/v1/agencies/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  let qaAgencyId = '';
  const qaAgencyName = `[QA] Dinas Audit ${Date.now()}`;
  await step(ctx, S, 'Create [QA] Agency (Admin)', 'POST /api/v1/agencies', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/agencies`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: qaAgencyName, type: 'lainnya', contact_email: 'qa.agency@laporkita.test.go.id' },
      captureSlug: 'backend_post_agencies',
      opKey: 'BE:POST /api/v1/agencies',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    qaAgencyId = j.data.id;
    cleanup.push({ type: 'agency', id: qaAgencyId });
    return { status: res.status(), latencyMs, detail: `id=${qaAgencyId}` };
  });

  await step(ctx, S, 'Update [QA] Agency (Admin)', 'PATCH /api/v1/agencies/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/agencies/${qaAgencyId}`, {
      headers: { ...authH('admin'), 'Content-Type': 'application/json' },
      body: { name: `${qaAgencyName} Updated` },
      captureSlug: 'backend_patch_agency_by_id',
      opKey: 'BE:PATCH /api/v1/agencies/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Delete [QA] Agency (Admin)', 'DELETE /api/v1/agencies/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/agencies/${qaAgencyId}`, {
      headers: authH('admin'),
      captureSlug: 'backend_delete_agency_by_id',
      opKey: 'BE:DELETE /api/v1/agencies/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const idx = cleanup.findIndex((x) => x.type === 'agency' && x.id === qaAgencyId);
    if (idx !== -1) cleanup.splice(idx, 1);
    return { status: res.status(), latencyMs };
  });
}

// ── Suite 4: Reports Complete Lifecycle & Edge Cases (11 Operations) ─────
async function suite4_ReportsLifecycle(ctx) {
  const S = 'Phase1-Reports';
  console.log(`\n═══ ${S}: Reports Complete Lifecycle, Media, Validation & Dispute (11 Operations) ═══`);

  const validJpeg = roadPotholeSampleBuffer || (await makeValidJpeg());
  const smallJpeg = await makeSmall320x240Jpeg();
  const webpBuf = await makeWebpBuffer();

  // 1. Photo pipe & BBox rejections on POST /reports
  await step(ctx, S, 'Reject < 480px Photo (320x240 JPEG) -> 400', 'POST /api/v1/reports', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports`, {
      headers: authH('citizen'),
      multipart: {
        category_id: SEED_CAT_ID,
        latitude: String(ALUN_ALUN.lat),
        longitude: String(ALUN_ALUN.lng),
        description: '[QA] Small photo rejection test',
        photo: { name: 'small.jpg', mimeType: 'image/jpeg', buffer: smallJpeg },
      },
      captureSlug: 'backend_post_reports_400_small_photo',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Reject WebP Magic Bytes -> 400', 'POST /api/v1/reports', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports`, {
      headers: authH('citizen'),
      multipart: {
        category_id: SEED_CAT_ID,
        latitude: String(ALUN_ALUN.lat),
        longitude: String(ALUN_ALUN.lng),
        description: '[QA] WebP magic byte rejection test',
        photo: { name: 'report_photo.jpg', mimeType: 'image/webp', buffer: webpBuf },
      },
      captureSlug: 'backend_post_reports_400_webp',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Reject Out-of-Malang BBox (Jakarta) -> 400', 'POST /api/v1/reports', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports`, {
      headers: authH('citizen'),
      multipart: {
        category_id: SEED_CAT_ID,
        latitude: String(JAKARTA.lat),
        longitude: String(JAKARTA.lng),
        description: '[QA] Out of Malang BBox rejection test',
        photo: { name: 'jakarta.jpg', mimeType: 'image/jpeg', buffer: validJpeg },
      },
      captureSlug: 'backend_post_reports_400_out_of_bbox',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 2. Create Report #1 with X-Idempotency-Key + Replay
  const idemKey = `qa_idem_${Date.now()}`;
  let report1Id = '';
  await step(ctx, S, 'Create [QA] Report #1 with X-Idempotency-Key -> 202', 'POST /api/v1/reports', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports`, {
      headers: { ...authH('citizen'), 'X-Idempotency-Key': idemKey },
      multipart: {
        category_id: SEED_CAT_ID,
        latitude: String(ALUN_ALUN.lat),
        longitude: String(ALUN_ALUN.lng),
        address_text: 'Jl. Merdeka Selatan, Alun-Alun Kota Malang',
        description: '[QA] Jalan berlubang parah di Alun-Alun Malang (Lifecycle #1)',
        photo: { name: 'report_photo.jpg', mimeType: 'image/jpeg', buffer: validJpeg },
      },
      captureSlug: 'backend_post_reports',
      opKey: 'BE:POST /api/v1/reports',
    });
    assert(res.status() === 202 || res.status() === 201, `Expected 202, got ${res.status()}`);
    const j = await res.json();
    report1Id = j.data.id;
    cleanup.push({ type: 'report', id: report1Id });
    return { status: res.status(), latencyMs, detail: `id=${report1Id} code=${j.data.report_code}` };
  });

  await step(ctx, S, 'Replay Same X-Idempotency-Key -> Returns Identical Report ID', 'POST /api/v1/reports', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports`, {
      headers: { ...authH('citizen'), 'X-Idempotency-Key': idemKey },
      multipart: {
        category_id: SEED_CAT_ID,
        latitude: String(ALUN_ALUN.lat),
        longitude: String(ALUN_ALUN.lng),
        description: '[QA] Idempotency replay',
        photo: { name: 'report_photo.jpg', mimeType: 'image/jpeg', buffer: validJpeg },
      },
      captureSlug: 'backend_post_reports_idempotent_replay',
    });
    assert(res.status() === 202 || res.status() === 201, `Expected 202, got ${res.status()}`);
    const j = await res.json();
    assert(j.data.id === report1Id, `Expected id=${report1Id}, got ${j.data.id}`);
    return { status: res.status(), latencyMs, detail: `sameId=${j.data.id}` };
  });

  // Wait 2.5s for BullMQ AI verification worker to process Report #1
  await new Promise((r) => setTimeout(r, 2500));

  // 3. GET /reports (list) & GET /reports/{id} (detail)
  await step(ctx, S, 'Get Reports List', 'GET /api/v1/reports', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports?limit=10&sort_by=newest`, {
      captureSlug: 'backend_get_reports_list',
      opKey: 'BE:GET /api/v1/reports',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  let report1Status = '';
  await step(ctx, S, 'Get Report #1 Detail', 'GET /api/v1/reports/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports/${report1Id}`, {
      captureSlug: 'backend_get_report_detail',
      opKey: 'BE:GET /api/v1/reports/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    report1Status = j.data.status;
    return { status: res.status(), latencyMs, detail: `status=${report1Status} ai_conf=${j.data.ai_confidence_score}` };
  });

  // 4. Support / Upvote lifecycle: POST -> duplicate 409 -> DELETE within 5m -> DELETE again 404 -> re-POST
  await step(ctx, S, 'Support Report #1 -> 201', 'POST /api/v1/reports/{id}/support', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/support`, {
      headers: authH('citizen'),
      captureSlug: 'backend_post_report_support',
      opKey: 'BE:POST /api/v1/reports/{id}/support',
    });
    assert(res.status() === 201 || res.status() === 200, `Expected 201, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Duplicate Support Report #1 -> 409 CONFLICT', 'POST /api/v1/reports/{id}/support', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/support`, {
      headers: authH('citizen'),
      captureSlug: 'backend_post_report_support_409_duplicate',
    });
    assert(res.status() === 409, `Expected 409, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Cancel Support Within 5m Grace Period -> 200', 'DELETE /api/v1/reports/{id}/support', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/reports/${report1Id}/support`, {
      headers: authH('citizen'),
      captureSlug: 'backend_delete_report_support',
      opKey: 'BE:DELETE /api/v1/reports/{id}/support',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Cancel Support Again When Not Supported -> 404 NOT_FOUND', 'DELETE /api/v1/reports/{id}/support', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/reports/${report1Id}/support`, {
      headers: authH('citizen'),
      captureSlug: 'backend_delete_report_support_404',
    });
    assert(res.status() === 404, `Expected 404, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Re-Support Report #1 -> 201', 'POST /api/v1/reports/{id}/support', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/support`, {
      headers: authH('citizen'),
    });
    assert(res.status() === 201 || res.status() === 200, `Expected 201, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 5. Comments: normal comment, profane comment (is_flagged: true), GET comments, GET flagged comments
  await step(ctx, S, 'Add Normal Comment -> is_flagged: false', 'POST /api/v1/reports/{id}/comments', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/comments`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { content: '[QA] Semoga cepat diperbaiki oleh dinas terkait.' },
      captureSlug: 'backend_post_report_comment_normal',
      opKey: 'BE:POST /api/v1/reports/{id}/comments',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    assert(j.data.is_flagged === false, `Expected is_flagged=false, got ${j.data.is_flagged}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Add Profane Comment -> is_flagged: true & Unmasked Content', 'POST /api/v1/reports/{id}/comments', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/comments`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { content: '[QA] Anjing bangsat jalan rusak parah!' },
      captureSlug: 'backend_post_report_comment_profane',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    assert(j.data.is_flagged === true, `Expected is_flagged=true, got ${j.data.is_flagged}`);
    return { status: res.status(), latencyMs, detail: `is_flagged=${j.data.is_flagged}` };
  });

  await step(ctx, S, 'Get Report Comments', 'GET /api/v1/reports/{id}/comments', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports/${report1Id}/comments?limit=20`, {
      captureSlug: 'backend_get_report_comments',
      opKey: 'BE:GET /api/v1/reports/{id}/comments',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Get Flagged Comments as Citizen -> 403', 'GET /api/v1/reports/comments/flagged', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports/comments/flagged`, {
      headers: authH('citizen'),
      captureSlug: 'backend_get_comments_flagged_403_citizen',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Get Flagged Comments as Operator -> 200', 'GET /api/v1/reports/comments/flagged', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports/comments/flagged`, {
      headers: authH('operator'),
      captureSlug: 'backend_get_comments_flagged',
      opKey: 'BE:GET /api/v1/reports/comments/flagged',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 6. State transitions on Report #1:
  // Ensure verified first if still pending_verification
  if (report1Status === 'pending_verification') {
    await step(ctx, S, 'Transition Report #1 pending_verification -> verified', 'PATCH /api/v1/reports/{id}/status', async (c) => {
      const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report1Id}/status`, {
        headers: { ...authH('operator'), 'Content-Type': 'application/json' },
        body: { status: 'verified', note: '[QA] Verified by operator' },
        opKey: 'BE:PATCH /api/v1/reports/{id}/status',
      });
      assert(res.status() === 200, `Expected 200, got ${res.status()}`);
      return { status: res.status(), latencyMs };
    });
  }

  // Invalid skip verified -> completed -> 409 CONFLICT
  await step(ctx, S, 'Invalid State Skip verified -> completed -> 409 CONFLICT', 'PATCH /api/v1/reports/{id}/status', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report1Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'completed' },
      captureSlug: 'backend_patch_report_status_409_invalid_skip',
      opKey: 'BE:PATCH /api/v1/reports/{id}/status',
    });
    assert(res.status() === 409, `Expected 409, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // verified -> assigned -> in_progress
  await step(ctx, S, 'Transition Report #1 verified -> assigned (with assigned_agency_id UUID)', 'PATCH /api/v1/reports/{id}/status', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report1Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: {
        status: 'assigned',
        assigned_agency_id: SEED_AGENCY_ID,
        note: '[QA] Ditugaskan ke DPUPR',
      },
      captureSlug: 'backend_patch_report_status',
      opKey: 'BE:PATCH /api/v1/reports/{id}/status',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    assert(j.data?.assigned_agency_id === SEED_AGENCY_ID, `Expected assigned_agency_id=${SEED_AGENCY_ID}, got ${j.data?.assigned_agency_id}`);
    return { status: res.status(), latencyMs, detail: `assigned_agency_id=${j.data.assigned_agency_id}` };
  });

  await step(ctx, S, 'Transition Report #1 assigned -> in_progress', 'PATCH /api/v1/reports/{id}/status', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report1Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'in_progress', note: '[QA] Pengerjaan dimulai [PROGRESS: 50%]' },
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // Attempt completed BEFORE completion_photo -> 400 BAD_REQUEST (COMPLETION_PHOTO_REQUIRED)
  await step(ctx, S, 'Transition in_progress -> completed WITHOUT completion_photo -> 400 BAD_REQUEST', 'PATCH /api/v1/reports/{id}/status', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report1Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'completed', note: '[QA] Coba selesai tanpa foto' },
      captureSlug: 'backend_patch_report_status_400_no_completion_photo',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    const j = await res.json();
    assert(String(j.error?.message || '').includes('COMPLETION_PHOTO_REQUIRED'), `Unexpected message: ${j.error?.message}`);
    return { status: res.status(), latencyMs, detail: j.error?.message };
  });

  // Citizen attempting completion_photo -> 403 FORBIDDEN (FORBIDDEN_MEDIA)
  await step(ctx, S, 'Citizen Uploading completion_photo -> 403 FORBIDDEN', 'POST /api/v1/reports/{id}/media', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/media`, {
      headers: authH('citizen'),
      multipart: {
        type: 'completion_photo',
        photo: { name: 'citizen_comp.jpg', mimeType: 'image/jpeg', buffer: validJpeg },
      },
      captureSlug: 'backend_post_report_media_403_citizen_completion',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // Operator uploads progress_photo & completion_photo -> 201
  await step(ctx, S, 'Operator Upload progress_photo -> 201', 'POST /api/v1/reports/{id}/media', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/media`, {
      headers: authH('operator'),
      multipart: {
        type: 'progress_photo',
        photo: { name: 'progress.jpg', mimeType: 'image/jpeg', buffer: validJpeg },
      },
      captureSlug: 'backend_post_report_media_progress',
      opKey: 'BE:POST /api/v1/reports/{id}/media',
    });
    assert(res.status() === 201 || res.status() === 200, `Expected 201, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Operator Upload completion_photo -> 201', 'POST /api/v1/reports/{id}/media', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/media`, {
      headers: authH('operator'),
      multipart: {
        type: 'completion_photo',
        photo: { name: 'completion.jpg', mimeType: 'image/jpeg', buffer: validJpeg },
      },
      captureSlug: 'backend_post_report_media_completion',
    });
    assert(res.status() === 201 || res.status() === 200, `Expected 201, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // Operator transitions in_progress -> completed -> 200
  await step(ctx, S, 'Transition Report #1 in_progress -> completed -> 200', 'PATCH /api/v1/reports/{id}/status', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report1Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'completed', note: '[QA] Perbaikan selesai 100%' },
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // Non-reporter > 100m validate (using operator token at Surabaya) -> 403 FORBIDDEN (NOT_ELIGIBLE_FOR_VALIDATION)
  await step(ctx, S, 'Validate Report #1 by Non-Reporter >100m (Surabaya) -> 403 FORBIDDEN', 'POST /api/v1/reports/{id}/validate', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/validate`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: {
        is_valid: true,
        note: '[QA] Non-reporter >100m validation test',
        latitude: SURABAYA.lat,
        longitude: SURABAYA.lng,
      },
      captureSlug: 'backend_post_report_validate_403_non_reporter_far',
      opKey: 'BE:POST /api/v1/reports/{id}/validate',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    const j = await res.json();
    assert(String(j.error?.message || '').includes('NOT_ELIGIBLE_FOR_VALIDATION'), `Unexpected message: ${j.error?.message}`);
    return { status: res.status(), latencyMs, detail: j.error?.message };
  });

  // Reporter validates Report #1 (is_valid: true) -> 201 (resolved)
  await step(ctx, S, 'Validate Report #1 by Reporter (is_valid: true) -> resolved', 'POST /api/v1/reports/{id}/validate', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report1Id}/validate`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: {
        is_valid: true,
        note: '[QA] Perbaikan sudah sesuai dan rapi.',
        latitude: ALUN_ALUN.lat,
        longitude: ALUN_ALUN.lng,
      },
      captureSlug: 'backend_post_report_validate_resolved',
    });
    assert(res.status() === 201 || res.status() === 200, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    assert(j.data?.new_status === 'resolved', `Expected resolved, got ${j.data?.new_status}`);
    return { status: res.status(), latencyMs, detail: `new_status=${j.data.new_status}` };
  });

  // 7. Create Report #2 with blurry OOD image -> must stay pending_verification + needs_manual_review=true, then test reject-no-note (400) & Dispute flow
  const blurryJpeg = await makeBlurrySolidGrayJpeg();
  let report2Id = '';
  await step(ctx, S, 'Create [QA] Report #2 with Blurry OOD Image -> 202', 'POST /api/v1/reports', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports`, {
      headers: authH('citizen'),
      multipart: {
        category_id: SEED_CAT_ID,
        latitude: String(RING_ZONE.lat),
        longitude: String(RING_ZONE.lng),
        description: '[QA] Laporan #2 foto buram untuk pengujian antrean manual & Dispute flow',
        photo: { name: 'report2_blurry.jpg', mimeType: 'image/jpeg', buffer: blurryJpeg },
      },
    });
    assert(res.status() === 202, `Expected 202, got ${res.status()}`);
    const j = await res.json();
    report2Id = j.data.id;
    cleanup.push({ type: 'report', id: report2Id });
    return { status: res.status(), latencyMs, detail: `id=${report2Id}` };
  });

  // Wait 2.5s for AI worker -> verify blurry image stays pending_verification with needs_manual_review=true
  await new Promise((r) => setTimeout(r, 2500));
  await step(ctx, S, 'Verify Blurry Report #2 Stays pending_verification with needs_manual_review=true', 'GET /api/v1/reports/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports/${report2Id}`);
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const d = (await res.json()).data;
    assert(d.status === 'pending_verification', `Expected pending_verification, got ${d.status}`);
    assert(d.needs_manual_review === true, `Expected needs_manual_review=true, got ${d.needs_manual_review}`);
    return { status: res.status(), latencyMs, detail: `status=${d.status} needs_manual_review=${d.needs_manual_review}` };
  });

  await step(ctx, S, 'Reject Report Without Note -> 400 BAD_REQUEST', 'PATCH /api/v1/reports/{id}/status', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report2Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'rejected' },
      captureSlug: 'backend_patch_report_status_400_reject_no_note',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });
  await apiCall(ctx, 'patch', `${BASE}/reports/${report2Id}/status`, {
    headers: { ...authH('operator'), 'Content-Type': 'application/json' },
    body: { status: 'verified', note: '[QA] Verified manually by operator' },
  });
  await apiCall(ctx, 'patch', `${BASE}/reports/${report2Id}/status`, {
    headers: { ...authH('operator'), 'Content-Type': 'application/json' },
    body: { status: 'assigned', note: '[QA] Assigned' },
  });
  await apiCall(ctx, 'patch', `${BASE}/reports/${report2Id}/status`, {
    headers: { ...authH('operator'), 'Content-Type': 'application/json' },
    body: { status: 'in_progress', note: '[QA] In progress' },
  });
  await apiCall(ctx, 'post', `${BASE}/reports/${report2Id}/media`, {
    headers: authH('operator'),
    multipart: {
      type: 'completion_photo',
      photo: { name: 'comp2.jpg', mimeType: 'image/jpeg', buffer: validJpeg },
    },
  });
  await apiCall(ctx, 'patch', `${BASE}/reports/${report2Id}/status`, {
    headers: { ...authH('operator'), 'Content-Type': 'application/json' },
    body: { status: 'completed', note: '[QA] Completed #1' },
  });

  // Dispute validation (is_valid: false) -> rewrites status to in_progress
  await step(ctx, S, 'Dispute Report #2 (is_valid: false) -> Reopens to in_progress', 'POST /api/v1/reports/{id}/validate', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/${report2Id}/validate`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: {
        is_valid: false,
        note: '[QA] Masih berlubang di sisi timur, mohon diperbaiki ulang.',
        latitude: RING_ZONE.lat,
        longitude: RING_ZONE.lng,
      },
      captureSlug: 'backend_post_report_validate_disputed',
    });
    assert(res.status() === 201 || res.status() === 200, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    assert(j.data?.new_status === 'in_progress', `Expected in_progress on dispute, got ${j.data?.new_status}`);
    return { status: res.status(), latencyMs, detail: `new_status=${j.data.new_status}` };
  });

  // Complete and resolve Report #2 so it ends in final state 'resolved'
  await step(ctx, S, 'Re-Complete & Resolve Disputed Report #2 -> resolved', 'PATCH /api/v1/reports/{id}/status', async (c) => {
    await apiCall(c, 'patch', `${BASE}/reports/${report2Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'completed', note: '[QA] Perbaikan ulang selesai' },
    });
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/reports/${report2Id}/status`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { status: 'resolved', note: '[QA] Ditutup setelah perbaikan ulang' },
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs, detail: 'final=resolved' };
  });
}

// ── Suite 5: GIS, Notifications, Predictions & Policy Simulator (14 Ops) ─
async function suite5_GisNotificationsPredictionsPolicy(ctx) {
  const S = 'Phase1-GIS-Pred-Policy';
  console.log(`\n═══ ${S}: GIS, Notifications, Predictions & Policy Simulator (14 Operations) ═══`);

  // 1. POST /maps/route (Malang valid 200 + Bali outside Java 400)
  await step(ctx, S, 'OSRM Route Proxy (Malang)', 'POST /api/v1/maps/route', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/maps/route`, {
      headers: { 'Content-Type': 'application/json' },
      body: {
        origin_lat: ALUN_ALUN.lat,
        origin_lng: ALUN_ALUN.lng,
        destination_lat: LOWOKWARU.lat,
        destination_lng: LOWOKWARU.lng,
      },
      captureSlug: 'backend_post_maps_route',
      opKey: 'BE:POST /api/v1/maps/route',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    return {
      status: res.status(),
      latencyMs,
      detail: `dist=${j.data.distance_meters}m dur=${j.data.duration_seconds}s coords=${(j.data.coordinates || []).length} hasSteps=${'steps' in j.data}`,
    };
  });

  await step(ctx, S, 'OSRM Route Outside Java (Bali) -> 400 BAD_REQUEST', 'POST /api/v1/maps/route', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/maps/route`, {
      headers: { 'Content-Type': 'application/json' },
      body: {
        origin_lat: ALUN_ALUN.lat,
        origin_lng: ALUN_ALUN.lng,
        destination_lat: BALI.lat,
        destination_lng: BALI.lng,
      },
      captureSlug: 'backend_post_maps_route_400_outside_java',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 2. POST /reports/along-route
  await step(ctx, S, 'Reports Along Route Corridor', 'POST /api/v1/reports/along-route', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/reports/along-route`, {
      headers: { 'Content-Type': 'application/json' },
      body: {
        route_points: [
          { lat: ALUN_ALUN.lat, lng: ALUN_ALUN.lng },
          { lat: LOWOKWARU.lat, lng: LOWOKWARU.lng },
        ],
        radius_meters: 500,
      },
      captureSlug: 'backend_post_reports_along_route',
      opKey: 'BE:POST /api/v1/reports/along-route',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 3. Route alerts: subscribe -> check -> unsubscribe
  await step(ctx, S, 'Subscribe Route Alerts', 'POST /api/v1/route-alerts/subscribe', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/route-alerts/subscribe`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: {
        device_token: `qa-fcm-token-${Date.now()}`,
        last_lat: ALUN_ALUN.lat,
        last_long: ALUN_ALUN.lng,
      },
      captureSlug: 'backend_post_route_alerts_subscribe',
      opKey: 'BE:POST /api/v1/route-alerts/subscribe',
    });
    assert(res.status() === 200 || res.status() === 201, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Check Proximity Route Alerts', 'POST /api/v1/route-alerts/check', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/route-alerts/check`, {
      headers: { ...authH('citizen'), 'Content-Type': 'application/json' },
      body: { latitude: ALUN_ALUN.lat, longitude: ALUN_ALUN.lng },
      captureSlug: 'backend_post_route_alerts_check',
      opKey: 'BE:POST /api/v1/route-alerts/check',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Unsubscribe Route Alerts', 'DELETE /api/v1/route-alerts/unsubscribe', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'delete', `${BASE}/route-alerts/unsubscribe`, {
      headers: authH('citizen'),
      captureSlug: 'backend_delete_route_alerts_unsubscribe',
      opKey: 'BE:DELETE /api/v1/route-alerts/unsubscribe',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 4. Predictions: GET /predictions/zones, GET /predictions/zones/{zoneId}/metrics, POST /predictions/metrics/refresh
  await step(ctx, S, 'Get Prediction Zones', 'GET /api/v1/predictions/zones', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/predictions/zones`, {
      captureSlug: 'backend_get_predictions_zones',
      opKey: 'BE:GET /api/v1/predictions/zones',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Get Zone Metrics History (Klojen)', 'GET /api/v1/predictions/zones/{zoneId}/metrics', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/predictions/zones/${SEED_ZONE_ID}/metrics?limit=20`, {
      captureSlug: 'backend_get_zone_metrics_history',
      opKey: 'BE:GET /api/v1/predictions/zones/{zoneId}/metrics',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    return {
      status: res.status(),
      latencyMs,
      detail: `dataIsArray=${Array.isArray(j.data)} keys=${Object.keys(j.data || {}).join(',')}`,
    };
  });

  await step(ctx, S, 'Refresh Zone Metrics as Citizen -> 403', 'POST /api/v1/predictions/metrics/refresh', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/predictions/metrics/refresh`, {
      headers: authH('citizen'),
      captureSlug: 'backend_post_predictions_refresh_403_citizen',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Refresh Zone Metrics as Operator -> 200', 'POST /api/v1/predictions/metrics/refresh', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/predictions/metrics/refresh`, {
      headers: authH('operator'),
      captureSlug: 'backend_post_predictions_refresh',
      opKey: 'BE:POST /api/v1/predictions/metrics/refresh',
    });
    assert(res.status() === 200 || res.status() === 201, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 5. Policy Simulations: RBAC (citizen 403, operator 403) + POST, GET list, GET /{id}
  await step(ctx, S, 'Create Policy Simulation as Operator -> 403', 'POST /api/v1/policy-simulations', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/policy-simulations`, {
      headers: { ...authH('operator'), 'Content-Type': 'application/json' },
      body: { prompt_text: '[QA] Operator forbidden check' },
      captureSlug: 'backend_post_policy_simulations_403_operator',
    });
    assert(res.status() === 403, `Expected 403, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  let simId = '';
  let sim1Budget = 0;
  let sim1Reduction = 0;
  await step(ctx, S, 'Create Policy Simulation #1 (Drainase Klojen) as PolicyMaker -> 201', 'POST /api/v1/policy-simulations', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/policy-simulations`, {
      headers: { ...authH('policyMaker'), 'Content-Type': 'application/json' },
      body: {
        prompt_text: '[QA] Analisis dampak normalisasi drainase di wilayah Klojen Kota Malang terhadap pengurangan risiko banjir dan kebutuhan anggaran.',
        zone_id: SEED_ZONE_ID,
      },
      captureSlug: 'backend_post_policy_simulations',
      opKey: 'BE:POST /api/v1/policy-simulations',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    simId = j.data.id;
    const rd = j.data.resultData || j.data.result_data || {};
    sim1Budget = Number(rd.estimated_budget_idr);
    sim1Reduction = Number(rd.estimated_complaint_reduction_percent);
    assert(Array.isArray(rd.recommended_actions) && rd.recommended_actions.length > 0, 'Missing recommended_actions in resultData');
    assert(typeof rd.simulated_risk_score === 'number', 'Missing simulated_risk_score in resultData');
    return {
      status: res.status(),
      latencyMs,
      detail: `id=${simId} reduction=${sim1Reduction}% budget=${sim1Budget} recs=${rd.recommended_actions.length}`,
    };
  });

  await step(ctx, S, 'Create Policy Simulation #2 (PJU LED Lowokwaru) -> Proves Dynamic Non-Static Output', 'POST /api/v1/policy-simulations', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'post', `${BASE}/policy-simulations`, {
      headers: { ...authH('policyMaker'), 'Content-Type': 'application/json' },
      body: {
        prompt_text: '[QA] Penggantian lampu penerangan jalan umum (PJU) dengan lampu pintar hemat energi di Lowokwaru.',
        zone_id: 'b5000000-0000-4000-8000-000000000005',
      },
      captureSlug: 'backend_post_policy_simulations_second_prompt',
    });
    assert(res.status() === 201, `Expected 201, got ${res.status()}`);
    const j = await res.json();
    const rd2 = j.data.resultData || j.data.result_data || {};
    const sim2Budget = Number(rd2.estimated_budget_idr);
    const sim2Reduction = Number(rd2.estimated_complaint_reduction_percent);
    assert(sim2Budget !== sim1Budget || sim2Reduction !== sim1Reduction, `Expected dynamic output differing from sim1 (${sim1Reduction}%, ${sim1Budget}), got (${sim2Reduction}%, ${sim2Budget})`);
    return {
      status: res.status(),
      latencyMs,
      detail: `sim1=(${sim1Reduction}%, Rp${sim1Budget}) vs sim2=(${sim2Reduction}%, Rp${sim2Budget})`,
    };
  });

  await step(ctx, S, 'Get Policy Simulations List (PolicyMaker)', 'GET /api/v1/policy-simulations', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/policy-simulations?limit=10`, {
      headers: authH('policyMaker'),
      captureSlug: 'backend_get_policy_simulations',
      opKey: 'BE:GET /api/v1/policy-simulations',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Get Policy Simulation by ID (PolicyMaker)', 'GET /api/v1/policy-simulations/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/policy-simulations/${simId}`, {
      headers: authH('policyMaker'),
      captureSlug: 'backend_get_policy_simulation_by_id',
      opKey: 'BE:GET /api/v1/policy-simulations/{id}',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 6. Notifications: GET /notifications, PATCH /notifications/{id}/read, PATCH /notifications/read-all
  let notifId = '';
  await step(ctx, S, 'Get Notifications List (Citizen)', 'GET /api/v1/notifications', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/notifications?limit=20`, {
      headers: authH('citizen'),
      captureSlug: 'backend_get_notifications',
      opKey: 'BE:GET /api/v1/notifications',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    const j = await res.json();
    if (Array.isArray(j.data) && j.data.length > 0) notifId = j.data[0].id;
    return { status: res.status(), latencyMs, detail: `count=${(j.data || []).length} unreadCount=${j.meta?.unreadCount}` };
  });

  await step(ctx, S, 'Mark Notification Read by ID', 'PATCH /api/v1/notifications/{id}/read', async (c) => {
    assert(notifId, 'Expected at least 1 notification for citizen');
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/notifications/${notifId}/read`, {
      headers: authH('citizen'),
      captureSlug: 'backend_patch_notification_read',
      opKey: 'BE:PATCH /api/v1/notifications/{id}/read',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Mark All Notifications Read', 'PATCH /api/v1/notifications/read-all', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'patch', `${BASE}/notifications/read-all`, {
      headers: authH('citizen'),
      captureSlug: 'backend_patch_notifications_read_all',
      opKey: 'BE:PATCH /api/v1/notifications/read-all',
    });
    assert(res.status() === 200, `Expected 200, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  // 7. Malformed UUID (400) & Unknown UUID (404)
  await step(ctx, S, 'Malformed UUID Parameter -> 400 VALIDATION_ERROR', 'GET /api/v1/reports/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports/not-a-valid-uuid`, {
      captureSlug: 'backend_get_report_400_malformed_uuid',
    });
    assert(res.status() === 400, `Expected 400, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });

  await step(ctx, S, 'Unknown UUID Parameter -> 404 NOT_FOUND', 'GET /api/v1/reports/{id}', async (c) => {
    const { res, latencyMs } = await apiCall(c, 'get', `${BASE}/reports/${UNKNOWN_UUID}`, {
      captureSlug: 'backend_get_report_404_not_found',
    });
    assert(res.status() === 404, `Expected 404, got ${res.status()}`);
    return { status: res.status(), latencyMs };
  });
}

async function cleanupResources(ctx) {
  console.log(`\n═══ Cleanup ═══`);
  for (const item of cleanup) {
    try {
      if (item.type === 'user' && item.id && tokens.admin) {
        await apiCall(ctx, 'delete', `${BASE}/users/${item.id}`, { headers: authH('admin') });
        console.log(`  Cleaned temporary user ${item.id}`);
      } else if (item.type === 'category' && item.id && tokens.admin) {
        await apiCall(ctx, 'delete', `${BASE}/categories/${item.id}`, { headers: authH('admin') });
        console.log(`  Cleaned temporary category ${item.id}`);
      } else if (item.type === 'agency' && item.id && tokens.admin) {
        await apiCall(ctx, 'delete', `${BASE}/agencies/${item.id}`, { headers: authH('admin') });
        console.log(`  Cleaned temporary agency ${item.id}`);
      }
    } catch (e) {
      console.log(`  Cleanup warning for ${item.type}/${item.id}: ${e.message}`);
    }
  }
  console.log(`  All temporary [QA] reports left in final 'resolved' state.`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  Step 2: Phase 1 Complete Endpoint Testing & Raw Payload Capture     ║');
  console.log('║  Target: 48 Backend Operations + 19 AI Operations = 67 Operations    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const apiCtx = await request.newContext({
    extraHTTPHeaders: { 'User-Agent': UA },
    timeout: 60000,
  });

  try {
    await suite1_AIService(apiCtx);
    await suite2_BackendAuthAndUsers(apiCtx);
    await suite4_ReportsLifecycle(apiCtx);
    await suite3_MasterData(apiCtx);
    await suite5_GisNotificationsPredictionsPolicy(apiCtx);
  } finally {
    await cleanupResources(apiCtx);
    await apiCtx.dispose();
  }

  const beOpsCount = [...exercisedOps].filter((k) => k.startsWith('BE:')).length;
  const aiOpsCount = [...exercisedOps].filter((k) => k.startsWith('AI:')).length;

  const summary = {
    executedAt: new Date().toISOString(),
    operationsExercised: {
      backend: beOpsCount,
      aiService: aiOpsCount,
      total: beOpsCount + aiOpsCount,
      keys: [...exercisedOps].sort(),
    },
    testSteps: {
      total: totalPassed + totalFailed,
      passed: totalPassed,
      failed: totalFailed,
    },
    capturesCount: capturesIndex.length,
    captures: capturesIndex,
    results,
  };

  const summaryPath = resolve(__dirname, 'phase1_capture_summary.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log(`║  Operations Exercised : ${beOpsCount}/48 Backend + ${aiOpsCount}/19 AI = ${beOpsCount + aiOpsCount}/67 Total`);
  console.log(`║  Test Steps           : ${totalPassed}/${totalPassed + totalFailed} PASSED (${totalFailed} failed)`);
  console.log(`║  Saved Captures       : ${capturesIndex.length} files in qa-contract-audit/captures/`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (totalFailed > 0 || beOpsCount < 48 || aiOpsCount < 19) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in run_phase1_captures.mjs:', err);
  process.exit(1);
});
