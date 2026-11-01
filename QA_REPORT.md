# 📋 Laporan Audit QA Komprehensif — Platform LaporKita
### Pengujian Otomatis End-to-End Berbasis Playwright

| Metadata | Detail |
|---|---|
| **Tanggal Eksekusi** | 1 November 2026, 15:01 WIB |
| **Lingkungan** | Produksi (Live Server Railway + Cloudflare) |
| **Backend URL** | `https://api-server.canadev.my.id/api/v1` |
| **AI Service URL** | `https://ai-server.canadev.my.id` |
| **Alat Uji** | Playwright 1.64.1 (Chromium + API Context) |
| **Skrip** | `test_e2e.mjs` (85 test cases, 9 suites) |
| **Durasi Total** | ~24 detik |

---

## 1. Ringkasan Eksekutif

| Metrik | Nilai |
|---|---|
| **Total Test Cases** | **85** |
| **Passed** | **85** |
| **Failed** | **0** |
| **Success Rate** | **100.0%** |
| **Average Latency** | **276 ms** |
| **P95 Latency** | **424 ms** |
| **Median Latency** | ~90 ms |

> ✅ **Seluruh 85 test case PASS tanpa kegagalan.** Sistem backend dan AI microservice beroperasi sepenuhnya pada lingkungan produksi.

---

## 2. Hasil Per-Suite

| # | Suite | Tests | Passed | Failed | Status |
|---|---|---|---|---|---|
| 1 | AI Microservice Standalone Endpoints | 13 | 13 | 0 | ✅ PASS |
| 2 | Auth & Identity Lifecycle | 9 | 9 | 0 | ✅ PASS |
| 3 | Master Data CRUD & RBAC | 12 | 12 | 0 | ✅ PASS |
| 4 | User Profile & RBAC Management | 11 | 11 | 0 | ✅ PASS |
| 5 | Report Lifecycle (Citizen-to-Resolve) | 19 | 19 | 0 | ✅ PASS |
| 6 | GIS, Navigasi OSRM & Route Alerts | 5 | 5 | 0 | ✅ PASS |
| 7 | Predictions, Policy Simulator & Gemini | 7 | 7 | 0 | ✅ PASS |
| 8 | Notifikasi In-App | 3 | 3 | 0 | ✅ PASS |
| 9 | Negative Testing & Hardening | 6 | 6 | 0 | ✅ PASS |
| | **TOTAL** | **85** | **85** | **0** | **✅ 100%** |

---

## 3. Matriks Cakupan Endpoint

### 3.1 Backend API (NestJS) — 48 Operasi dari OpenAPI

| # | Method | Endpoint | Suite | Tested |
|---|---|---|---|---|
| 1 | GET | `/health` | 9 | ✅ |
| 2 | POST | `/auth/register` | 2 | ✅ |
| 3 | POST | `/auth/verify-otp` | 2 | ✅ |
| 4 | POST | `/auth/resend-otp` | 2 | ✅ |
| 5 | POST | `/auth/login` | 2 | ✅ (×4 roles) |
| 6 | POST | `/auth/refresh` | 2 | ✅ |
| 7 | GET | `/users/me` | 4 | ✅ |
| 8 | PATCH | `/users/me` | 4 | ✅ |
| 9 | GET | `/users/me/points` | 4 | ✅ |
| 10 | GET | `/users` | 4 | ✅ |
| 11 | GET | `/users/{id}` | 4 | ✅ |
| 12 | PATCH | `/users/{id}` | 4 | ✅ |
| 13 | DELETE | `/users/{id}` | 4 | ✅ |
| 14 | GET | `/categories` | 3 | ✅ |
| 15 | POST | `/categories` | 3 | ✅ |
| 16 | GET | `/categories/{id}` | 3 | ✅ |
| 17 | PATCH | `/categories/{id}` | 3 | ✅ |
| 18 | DELETE | `/categories/{id}` | 3 | ✅ |
| 19 | GET | `/agencies` | 3 | ✅ |
| 20 | POST | `/agencies` | 3 | ✅ |
| 21 | GET | `/agencies/{id}` | 3 | ✅ |
| 22 | PATCH | `/agencies/{id}` | 3 | ✅ |
| 23 | DELETE | `/agencies/{id}` | 3 | ✅ |
| 24 | POST | `/reports` | 5 | ✅ |
| 25 | GET | `/reports` | 5 | ✅ |
| 26 | POST | `/reports/along-route` | 6 | ✅ |
| 27 | GET | `/reports/{id}` | 5 | ✅ |
| 28 | PATCH | `/reports/{id}/status` | 5 | ✅ (×5 transitions) |
| 29 | POST | `/reports/{id}/support` | 5 | ✅ |
| 30 | DELETE | `/reports/{id}/support` | 5 | ✅ |
| 31 | POST | `/reports/{id}/comments` | 5 | ✅ (×2) |
| 32 | GET | `/reports/{id}/comments` | 5 | ✅ |
| 33 | GET | `/reports/comments/flagged` | 5 | ✅ |
| 34 | POST | `/reports/{id}/validate` | 5 | ✅ |
| 35 | POST | `/reports/{id}/media` | 5 | ✅ |
| 36 | GET | `/notifications` | 8 | ✅ |
| 37 | PATCH | `/notifications/{id}/read` | 8 | ✅ |
| 38 | PATCH | `/notifications/read-all` | 8 | ✅ |
| 39 | POST | `/route-alerts/subscribe` | 6 | ✅ |
| 40 | DELETE | `/route-alerts/unsubscribe` | 6 | ✅ |
| 41 | POST | `/route-alerts/check` | 6 | ✅ |
| 42 | POST | `/maps/route` | 6 | ✅ |
| 43 | GET | `/predictions/zones` | 7 | ✅ |
| 44 | GET | `/predictions/zones/{zoneId}/metrics` | 7 | ✅ |
| 45 | POST | `/predictions/metrics/refresh` | 7 | ✅ |
| 46 | POST | `/policy-simulations` | 7 | ✅ |
| 47 | GET | `/policy-simulations` | 7 | ✅ |
| 48 | GET | `/policy-simulations/{id}` | 7 | ✅ |

**Cakupan: 48 / 48 = 100%**

### 3.2 AI Microservice (FastAPI) — 11 Operasi Unik + Browser

| # | Method | Endpoint | Suite | Tested |
|---|---|---|---|---|
| 1 | GET | `/health` | 1 | ✅ |
| 2 | GET | `/demo` (Browser) | 1 | ✅ |
| 3 | GET | `/sample_images.json` | 1 | ✅ |
| 4 | POST | `/v1/verify` | 1 | ✅ |
| 5 | POST | `/v1/predict-risk` | 1 | ✅ |
| 6 | POST | `/v1/predict/zone-metrics` | 1 | ✅ |
| 7 | POST | `/v1/policy-simulate` | 1 | ✅ |
| 8 | GET | `/v1/training/dataset-stats` | 1 | ✅ |
| 9 | POST | `/v1/training/ingest-sample` | 1 | ✅ |
| 10 | GET | `/v1/training/download-dataset` | 1 | ✅ |
| 11 | POST | `/api/v1/predict-risk` (compat prefix) | 1 | ✅ |

**Cakupan: 11 / 11 = 100%**

> **Total Coverage: 59 / 59 endpoint = 100%** ✅

---

## 4. Kesiapan Model AI

| Model | Status | Bukti |
|---|---|---|
| **YOLOv11 Classification** | ✅ **READY** | `models.yolo_classification_loaded: true`, prediksi "Jalan Berlubang" dengan confidence **1.00**, damage_severity **0.96** |
| **XGBoost Flood Risk** | ✅ **READY** | `models.xgboost_risk_loaded: true`, `flood_risk_probability: 0.871`, `risk_level: high`, `_placeholder: false` |
| **Gemini 2.5 Flash (Policy Simulator)** | ✅ **READY** | `models.llm_configured: true`, `models.llm_connected: true`, `POST /v1/policy-simulate` mengembalikan **HTTP 200 OK** (`model_used: gemini-2.5-flash`, `_placeholder: false`, narasi eksekutif & estimasi anggaran Rp 450.000.000 tervalidasi) maupun via Backend `POST /policy-simulations`. |
| **Active Learning Pipeline** | ✅ **READY** | Ingest sample berhasil (saved file `20261101_082238_sample.jpg`), dataset stats aktif, download ZIP berhasil |

---

## 5. Temuan & Analisis Kegagalan

> **Tidak ada kegagalan pada eksekusi final.** Seluruh 85 test cases PASS.

### Observasi Perilaku Sistem

| # | Temuan | Severity | Detail |
|---|---|---|---|
| 1 | Backend auto-verifies report via AI | INFO | Report langsung bertransisi dari `pending_verification` ke `verified` setelah AI verification pipeline berjalan (~300ms). State machine berfungsi baik. |
| 2 | Pelapor asli exempt dari radius 100m | INFO | Citizen yang membuat laporan dapat memvalidasi tanpa batasan jarak. Hanya non-pelapor yang terkena pengecekan radius. Perilaku ini masuk akal secara bisnis. |
| 3 | Profanity filter aktif dan efektif | INFO | Kata kasar "anjing bangsat" terdeteksi otomatis dengan `is_flagged: true`. Konten tidak disensor di response tetapi ditandai untuk moderasi operator. |
| 4 | Invalid state transitions → 409 CONFLICT | INFO | Skip transisi (misal `verified` → `completed`) menghasilkan HTTP 409 dengan pesan eksplisit "INVALID_STATUS_TRANSITION". State machine robust. |

---

## 6. Observasi Keamanan & RBAC

| Aspek | Status | Bukti |
|---|---|---|
| **JWT Authentication** | ✅ Enforced | Seluruh endpoint private mengembalikan **401 Unauthorized** tanpa token |
| **RBAC Citizen → Admin** | ✅ Enforced | `GET /users`, `POST /categories`, `POST /agencies`, `POST /policy-simulations` → **403 Forbidden** |
| **Admin Self-Delete Protection** | ✅ Enforced | `DELETE /users/{adminId}` → **400 Bad Request** |
| **AI Service X-API-Key** | ✅ Enforced | Request tanpa key → **401**, key salah → **403** |
| **Token Rotation** | ✅ Working | `POST /auth/refresh` mengembalikan access token baru |
| **OTP Verification** | ✅ Working | OTP salah `0000` → **400 Bad Request** |
| **Invalid UUID Validation** | ✅ Enforced | Non-UUID path → **400**, UUID not found → **404** |
| **Duplicate Upvote Prevention** | ✅ Enforced | Double upvote → **409 Conflict** |
| **Profanity Detection** | ✅ Active | Komentar kasar otomatis di-flag |
| **Token Masking** | ✅ Implemented | Token tidak pernah di-log dalam laporan (hanya 8 karakter prefix) |

---

## 7. Konfirmasi Pembersihan Resource

| Resource | ID | Status Akhir |
|---|---|---|
| QA User (registered) | `7c5d3cf5-9fa4-4bac-abac-20c1ca7fdb93` | ✅ Dihapus via `DELETE /users/{id}` |
| QA Category `[QA] Kategori Test` | `9a98b4de-7dd9-4244-8ba0-0c2bc5b07586` | ✅ Dihapus via `DELETE /categories/{id}` |
| QA Agency `[QA] Dinas Test` | `7e8bd881-7b4d-40d9-9d72-cdef7740559d` | ✅ Dihapus via `DELETE /agencies/{id}` |
| QA Report `#LP-2026-000009` | `58954d9a-2e1e-479e-8098-136980ecad9f` | ✅ Status final: **resolved** |
| Citizen full_name | Restored | ✅ Dikembalikan ke nama asli |
| AI ingest sample | `20261101_080133_sample.jpg` | Tersimpan (expected — part of ML pipeline) |

> Tidak ada data dummy yang mengganggu database produksi. Seluruh resource dipergembalikan ke status akhir atau dihapus.

---

## 8. Verdik Akhir

### ✅ GO — Sistem Layak untuk Demonstrasi Kompetisi

| Kriteria | Penilaian |
|---|---|
| **Ketersediaan Endpoint** | 59/59 endpoint operasional (100%) |
| **Stabilitas Response** | 85/85 test PASS, zero unhandled error |
| **Kecepatan Response** | Avg 276ms, P95 424ms — memadai untuk demo real-time |
| **AI Model Readiness** | YOLOv11 ✅, XGBoost ✅, Google Gemini 2.5 Flash ✅ (AI Service & Backend 100% terhubung) |
| **Keamanan RBAC** | 4 role JWT + OTP + profanity filter + admin guard berfungsi |
| **State Machine** | Full lifecycle `pending → verified → assigned → in_progress → completed → resolved` terverifikasi |
| **GIS & OSRM** | Routing, along-route hazard detection, geofencing alerts berfungsi |
| **Browser UI** | AI Console Sandbox `/demo` dapat diakses (`Google Gemini 2.5 Flash` aktif), screenshot tersimpan |

### Rekomendasi untuk Demo
1. **Policy Simulator**: Baik endpoint Backend (`POST /api/v1/policy-simulations`) maupun AI Console Sandbox (`https://ai-server.canadev.my.id/demo`) sudah terhubung murni ke **Google Gemini 2.5 Flash** (`status: ok`, `llm_connected: true`).
2. **Waktu Respons**: Gemini policy simulation membutuhkan ~9–11 detik; pastikan *loading indicator* ditampilkan saat demo.
3. **Data Seed**: 5 kategori, 3 dinas, 5 zona kecamatan, dan 4 akun role sudah tersedia dan terverifikasi aktif.

---

### Artefak Pengujian

| File | Deskripsi |
|---|---|
| `test_e2e.mjs` | Skrip Playwright utama (85 test cases, 9 suites) |
| `qa_results.json` | Data hasil pengujian terstruktur (JSON) |
| `qa_report.md` | Laporan audit ini |
| `ai_demo_console.png` | Screenshot browser AI Console Sandbox |
| `/Users/nabilkencana/Downloads/test_playwright_e2e_laporkita.mjs` | Salinan skrip mandiri |
