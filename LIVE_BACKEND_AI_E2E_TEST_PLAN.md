# Rencana Pengujian Lengkap Seluruh Endpoint & Workflow: Backend dan AI LaporKita

## Context
Pengguna meminta pengujian komprehensif seluruh endpoint pada folder backend (`backend-laporkita`) dan AI (`ai-service`), pengujian seluruh workflow end-to-end, serta verifikasi operasional API AI (apakah berfungsi dan model terisi) pada dua target URL live produksi:
- Backend API Server: `https://api-server.canadev.my.id`
- AI Microservice Server: `https://ai-server.canadev.my.id`

End-state yang dituju adalah eksekusi pengujian otomatis 100% endpoint (50 operasi backend + 11 operasi AI service = 61 operasi endpoint) beserta 8 workflow bisnis inti (Autentikasi 4 role, CRUD Master Data, Siklus Laporan Penuh Citizen-to-Resolve, Gamifikasi/Poin, Moderasi Kata Kasar, Geofencing & Navigasi OSRM, Peta Emosi Kota/XGBoost, Policy Simulator Gemini/DeepSeek, dan Computer Vision YOLOv11 & Active Learning), menghasilkan laporan audit status HTTP, latensi, respons JSON, dan verifikasi kesiapan model AI.

---

## Approach

Eksekusi pengujian dilakukan menggunakan skrip test runner otomatis terstruktur `test/qa/run-live-canadev-test.ts` yang dieksekusi via `npx tsx`, menggunakan `axios`, `form-data`, dan `sharp` untuk simulasi payload citra nyata beresolusi valid (640x480). Semua request wajib menyertakan `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LaporKita-QA/1.0` untuk mencegah proteksi bot/WAF Cloudflare.

Pengujian dikelompokkan ke dalam 8 Suite berurutan:

### Suite 1: AI Microservice Standalone Endpoints & Model Verifications (11 Endpoints)
Target base: `https://ai-server.canadev.my.id`, header `X-API-Key: laporkita-a0de63d362f6bb7e9b7fa125a0452196`.
1. **GET `/health`**:
   - Periksa HTTP 200, format envelope `success: true`.
   - Periksa flags model: `models.yolo_classification_loaded === true`, `models.xgboost_risk_loaded === true`, `models.gemini_configured === true`. Catat status `models.llm_connected`.
2. **GET `/demo`**:
   - Periksa HTTP 200, Content-Type `text/html`, pastikan body memuat title `LaporKita AI Console`.
3. **GET `/sample_images.json`**:
   - Periksa HTTP 200, validasi adanya 5 kategori fasilitas publik Kota Malang (`Drainase`, `Jalan Berlubang`, `Lampu Jalan`, `Rambu Lalu Lintas`, `Trotoar`) dengan dataset base64.
4. **POST `/v1/verify` (Computer Vision YOLOv11 + Forensik Citra + Smart Priority)**:
   - Request body: `image_base64` (dari `sample_images.json["Jalan Berlubang"]`), `claimed_category: "Jalan Berlubang"`, `latitude: -7.9826`, `longitude: 112.6308`, `support_count: 5`, `report_density: 3`.
   - Assert: HTTP 200, `data.predicted_category === "Jalan Berlubang"`, `data.ai_confidence_score >= 0.85`, `data.damage_severity > 0`, `data.authenticity.is_authentic === true`, `data.location_verification.is_location_consistent === true`.
5. **POST `/v1/predict-risk` (XGBoost Flood & Urban Risk)**:
   - Request body: `report_density: 15`, `rainfall_mm: 45.0`, `traffic_density: 0.8`, `category: "Drainase"`.
   - Assert: HTTP 200, `data.flood_risk_probability` bertipe float 0.0-1.0, `data.risk_level` salah satu dari `low|medium|high`, `data._placeholder === false`.
6. **POST `/v1/predict/zone-metrics` (Zone Batch Inference)**:
   - Request body: `zone_name: "Klojen"`, `active_reports: 12`.
   - Assert: HTTP 200, mengembalikan objek metrik dengan `weather_context`, `traffic_density`, dan `flood_risk_probability`.
7. **POST `/v1/policy-simulate` (Direct LLM Simulation)**:
   - Request body: `prompt_text: "Simulasi penambahan pompa portabel di Klojen"`.
   - Tangani respons: jika DeepSeek API key tidak terhubung ke upstream/kuota habis, catat kode HTTP yang dihasilkan (misal 502/503/504) beserta pesan error upstream untuk audit laporan.
8. **GET `/v1/training/dataset-stats` (Active Learning Statistics)**:
   - Assert: HTTP 200, `data.class_distribution` mencakup 6 kelas (`Jalan_Berlubang`, `Lampu_Jalan`, `Rambu_Lalu_Lintas`, `Trotoar`, `Drainase`, `bukan_fasilitas`).
9. **POST `/v1/training/ingest-sample` (Active Learning Ingestion)**:
   - Request body: citra valid base64 >200px, `verified_category: "Jalan Berlubang"`, `original_prediction: "Trotoar"`, `confidence_score: 0.5`.
   - Assert: HTTP 200, `data.saved_file` ter-generate, `data.is_correction === true`.
10. **GET `/v1/training/samples/{class_name}/{filename}`**:
    - Unduh file yang baru saja di-ingest.
    - Assert: HTTP 200, Content-Type `image/jpeg`.
11. **GET `/v1/training/download-dataset`**:
    - Assert: HTTP 200, Content-Type `application/zip`.
12. **Verifikasi Kompatibilitas Prefix `/api/v1/*`**:
    - Uji probe `POST /api/v1/predict-risk` untuk memastikan endpoint kompatibel dengan pemanggil NestJS.

### Suite 2: Backend System, Swagger, & Master Data CRUD (13 Endpoints)
Target base: `https://api-server.canadev.my.id/api/v1`.
1. **GET `/health`**: Assert HTTP 200, `data.status === "ok"`.
2. **GET `/api/docs` & `/api/docs-json`**: Assert HTTP 200, Swagger UI & OpenAPI 3.0 schema valid.
3. **GET `/categories`**: Assert HTTP 200, array minimal 5 kategori aktif.
4. **GET `/categories/:id`**: Ambil salah satu kategori (e.g. Jalan Berlubang).
5. **POST `/categories`**: Gunakan `adminToken`, buat kategori test `Kategori QA Temp`.
6. **PATCH `/categories/:id`**: Update deskripsi kategori test.
7. **DELETE `/categories/:id`**: Soft-delete kategori test, pastikan tidak muncul lagi.
8. **GET `/agencies`**: Assert HTTP 200, minimal 3 dinas (DPUPR, Dishub, DLH/Diskominfo).
9. **GET `/agencies/:id`**: Ambil detail salah satu dinas.
10. **POST `/agencies`**: Gunakan `adminToken`, buat dinas test `Dinas QA Temp`.
11. **PATCH `/agencies/:id`**: Update kontak/email dinas test.
12. **DELETE `/agencies/:id`**: Soft-delete dinas test.

### Suite 3: Auth & Identity Lifecycle (9 Test Cases)
1. **POST `/auth/login` (Admin)**: `admin@laporkita.malangkota.go.id` / `AdminLaporKita2026!` -> Simpan `adminToken`.
2. **POST `/auth/login` (Citizen)**: `warga@laporkita.malangkota.go.id` / `Password123!` -> Simpan `citizenToken`.
3. **POST `/auth/login` (Operator DPUPR)**: `operator.dpupr@laporkita.malangkota.go.id` / `Password123!` -> Simpan `operatorToken`.
4. **POST `/auth/login` (Policy Maker)**: `policymaker@laporkita.malangkota.go.id` / `Password123!` -> Simpan `policyMakerToken`.
5. **POST `/auth/login` (Negative Check)**: Kirim password salah -> Assert HTTP 401 Unauthorized.
6. **POST `/auth/refresh`**: Ambil `refresh_token` warga, lakukan rotasi -> Assert HTTP 200 dan token baru terbit.
7. **POST `/auth/register`**: Registrasi user warga baru dengan email dan telepon acak (e.g. `test.qa.<timestamp>@malangkota.go.id`) -> Assert HTTP 202 Accepted.
8. **POST `/auth/resend-otp`**: Panggil resend OTP untuk user baru -> Assert HTTP 200 / cooldown logic.
9. **POST `/auth/verify-otp` (Negative Check)**: Panggil verifikasi dengan kode salah `0000` -> Assert HTTP 400 Bad Request ("Kode OTP salah").

### Suite 4: User Profile & RBAC Management (7 Endpoints)
1. **GET `/users/me`**: Assert data profil warga sesuai login (`role === "citizen"`).
2. **PATCH `/users/me`**: Update `full_name` warga menjadi `Warga Peduli Malang QA` -> Assert update tersimpan.
3. **GET `/users/me/points`**: Assert riwayat dan saldo poin kontribusi warga.
4. **GET `/users` (Admin)**: Query daftar user dengan parameter `page=1&limit=5` -> Assert pagination meta.
5. **GET `/users/:id` (Admin)**: Ambil detail user warga berdasarkan ID.
6. **PATCH `/users/:id` (Admin)**: Update status `is_verified` user oleh admin.
7. **DELETE `/users/:id` (Negative & Clean Test)**: Uji proteksi hapus user admin sendiri (400/403) atau hapus user dummy.

### Suite 5: Core Reporting Workflow & Digital Accountability Loop (15 Test Steps)
1. **POST `/reports` (Citizen Submit)**:
   - Buat file JPEG valid via `sharp` (640x480, simulasi lubang jalan).
   - Form-data: `category_id` (Jalan Berlubang), `latitude: "-7.9826"`, `longitude: "112.6308"` (Alun-Alun Malang, dalam Bounding Box), `description: "Lubang jalan aspal sedalam 15cm membahayakan pengendara motor di depan Alun-Alun"`.
   - Assert: HTTP 201 Created, `status: "pending_verification"`, simpan `activeReportId` dan `report_code`.
2. **GET `/reports/:id`**:
   - Assert: Data laporan memuat `report_code`, `media` terlampir, dan `urgency_score`.
3. **GET `/reports`**:
   - Query laporan dengan filter `status`, `category_id`, dan pagination.
4. **POST `/reports/:id/support` (Citizen Upvote)**:
   - Warga memberikan dukungan -> Assert `support_count` bertambah.
5. **POST `/reports/:id/support` (Duplicate Prevention)**:
   - Warga mencoba upvote kedua kali -> Assert HTTP 409 Conflict.
6. **DELETE `/reports/:id/support` (Cancel Upvote)**:
   - Batalkan upvote dalam batas grace period -> Assert HTTP 200 dan count berkurang.
7. **POST `/reports/:id/support` (Re-upvote)**:
   - Berikan dukungan kembali untuk workflow berikutnya.
8. **POST `/reports/:id/comments` (Constructive Comment)**:
   - Tambah komentar: "Banyak kendaraan roda dua terperosok di titik ini." -> Assert HTTP 201, `is_flagged === false`.
9. **POST `/reports/:id/comments` (Profanity Filter)**:
   - Tambah komentar mengandung kata kotor kasar -> Assert komentar otomatis disensor (masking) dan `is_flagged === true`.
10. **GET `/reports/:id/comments`**:
    - Assert kedua komentar muncul dalam daftar komentar laporan.
11. **GET `/reports/comments/flagged` (Admin Moderation)**:
    - Panggil dengan `adminToken` -> Assert komentar kasar tadi muncul di daftar review admin.
12. **PATCH `/reports/:id/status` (Operator: verified -> assigned)**:
    - Transisikan status menjadi `assigned`, sertakan `note: "Ditugaskan ke Tim Satgas Jalan DPUPR"`.
13. **PATCH `/reports/:id/status` (Operator: assigned -> in_progress)**:
    - Transisikan status menjadi `in_progress`, sertakan `note: "Pengerjaan perbaikan dan penambalan aspal dimulai"`.
14. **POST `/reports/:id/media` (Operator Upload Completion Photo)**:
    - Upload foto bukti perbaikan selesai via multipart form: `type: "completion_photo"`.
15. **PATCH `/reports/:id/status` (Operator: in_progress -> completed)**:
    - Transisikan status menjadi `completed`.
16. **POST `/reports/:id/validate` (Citizen Validation -> RESOLVED)**:
    - Warga memvalidasi hasil perbaikan di lokasi (radius <= 100m, lat `-7.9826`, lng `112.6308`, `is_valid: true`).
    - Assert: Status akhir laporan berubah menjadi `resolved` (Siklus Akuntabilitas Digital Selesai).

### Suite 6: GIS, Navigation & Route Alerts (6 Endpoints)
1. **POST `/maps/route`**:
   - Request: Rute Alun-Alun Malang (`-7.9827, 112.6304`) ke Lowokwaru (`-7.9701, 112.6412`).
   - Assert: HTTP 200, `distance_meters > 0`, `duration_seconds > 0`.
2. **POST `/reports/along-route`**:
   - Kirim polyline rute + `radius_meters: 1000`.
   - Assert: HTTP 200, mengembalikan array laporan yang berada dalam koridor rute.
3. **POST `/route-alerts/subscribe`**:
   - Daftarkan `device_token: "fcm-token-qa-live"`, koordinat `-7.9827, 112.6304`.
   - Assert: HTTP 200, langganan geofencing aktif.
4. **POST `/route-alerts/check`**:
   - Cek titik bahaya di sekitar `-7.9826, 112.6308`.
   - Assert: HTTP 200, mengembalikan daftar hazard aktif terdekat.
5. **DELETE `/route-alerts/unsubscribe`**:
   - Batalkan langganan geofencing.
   - Assert: HTTP 200, pesan konfirmasi pembatalan.

### Suite 7: Urban Emotion Map, Risk Prediction & Policy Simulator (6 Endpoints)
1. **GET `/predictions/zones`**:
   - Assert: HTTP 200, mengembalikan 5 kecamatan/zona Kota Malang (Klojen, Blimbing, Kedungkandang, Sukun, Lowokwaru).
2. **GET `/predictions/zones/:zoneId/metrics`**:
   - Ambil riwayat metrik time-series zona Klojen.
   - Assert: HTTP 200, data memuat `weather_context`, `report_density`, `flood_risk_probability`.
3. **POST `/predictions/metrics/refresh`**:
   - Panggil refresh metrik oleh operator.
   - Assert: HTTP 200, `updatedCount: 5`, terhubung ke microservice AI.
4. **POST `/policy-simulations`**:
   - Gunakan `policyMakerToken`, kirim skenario kebijakan tata ruang Kota Malang: `"Simulasi normalisasi drainase terpadu di kawasan Lowokwaru dan Klojen"`.
   - Assert: HTTP 201/200, `resultNarrative` terisi, `resultData.estimated_budget_idr` dan `estimated_complaint_reduction_percent` terisi.
5. **GET `/policy-simulations`**:
   - Query histori simulasi kebijakan -> Assert array simulasi yang pernah dijalankan.
6. **GET `/policy-simulations/:id`**:
   - Ambil detail spesifik dari simulasi yang baru saja dibuat.

### Suite 8: Notifications Lifecycle (3 Endpoints)
1. **GET `/notifications`**:
   - Ambil daftar notifikasi in-app untuk warga.
   - Assert: HTTP 200, memuat `unreadCount` dan array notifikasi pembaruan status laporan.
2. **PATCH `/notifications/:id/read`**:
   - Tandai salah satu notifikasi sebagai sudah dibaca (`is_read: true`).
3. **PATCH `/notifications/read-all`**:
   - Tandai semua notifikasi pengguna sebagai sudah dibaca.

---

## Critical files & anchors
1. `test/qa/run-live-canadev-test.ts`: Runner pengujian utama yang mengeksekusi ke-8 suite pengujian di atas terhadap endpoint live.
2. `test/qa/verify-public-endpoints.ts`: Referensi pengujian smoke publik sebelumnya.
3. `src/modules/reports/reports.controller.ts`: Acuan kontrak parameter dan validasi form data pelaporan.
4. `ai-service/app/main.py`: Acuan mapping routing internal AI microservice.
5. `ai-service/app/schemas/verification.py`: Acuan skema verifikasi computer vision dan format payload.

---

## Verification
- Eksekusi perintah pengujian:
  ```bash
  npx tsx test/qa/run-live-canadev-test.ts
  ```
- Output yang diharapkan:
  - Total pengujian: 61 endpoint/workflow check.
  - Rekapitulasi per-suite tabel rapi dengan waktu respons (ms), status code, dan status PASS/FAIL.
  - Verifikasi khusus AI: status model YOLOv11 (`yolo_classification_loaded`), status model XGBoost (`xgboost_risk_loaded`), dan status LLM Policy Simulator.
  - Laporan komprehensif tertulis format Markdown yang merangkum kesehatan setiap endpoint dan workflow.

---

## Assumptions & contingencies
1. **Fallback LLM Policy Simulator**: Jika DeepSeek API pada `https://ai-server.canadev.my.id/v1/policy-simulate` mengembalikan status 502/503 karena kendala kuota atau koneksi ke server upstream DeepSeek, runner test tetap menguji jalur backend `POST /api/v1/policy-simulations` (yang memiliki fallback internal Gemini / deterministic mock), dan mencatat diagnosis upstream DeepSeek secara eksplisit dalam laporan akhir.
2. **Kredensial Pengguna Seed**: Pengujian menggunakan kredensial default yang telah terverifikasi aktif pada server produksi:
   - Admin: `admin@laporkita.malangkota.go.id` / `AdminLaporKita2026!`
   - Warga: `warga@laporkita.malangkota.go.id` / `Password123!`
   - Operator: `operator.dpupr@laporkita.malangkota.go.id` / `Password123!`
   - Policy Maker: `policymaker@laporkita.malangkota.go.id` / `Password123!`
3. **Internal AI API Key**: Sesuai konfigurasi internal AI service, pengujian microservice langsung menggunakan header `X-API-Key: laporkita-a0de63d362f6bb7e9b7fa125a0452196`.
4. **Cloudflare WAF / User-Agent**: Seluruh HTTP request dari test runner wajib menyertakan User-Agent standar browser/QA untuk memastikan tidak diblokir oleh filter bot Cloudflare.
