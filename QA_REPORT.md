# LAPORAN QA BACKEND — LaporKita (NestJS)

**Tanggal Pengujian:** 22 Agustus 2026
**Target:** http://localhost:3000 (API v1: `/api/v1`, Swagger: `/api/docs`)
**Penguji:** Hermes QA Agent (profesional)
**Basis Kode:** commit `d8317ae` (branch `main`)

---

## 1. Ringkasan Eksekutif

Backend LaporKita **layak lomba dan dalam kondisi sangat baik**. Dari **142 eksekusi kasus uji API**
(3 rangkaian: 86 + 36 + 20), **132 lolos langsung**, **7 lolos setelah payload uji disesuaikan
dengan DTO/aturan bisnis yang benar** (foto bukti penyelesaian & state machine — bukan bug, justru
indikasi kualitas), dan **3 gagal karena satu isu nyata** (auth endpoint agencies).

| Aspek | Hasil |
|---|---|
| Eksekusi kasus uji API | 142 (86 + 36 + 20) |
| Lolos | 139 (98%) — 3 sisanya = 1 isu nyata (auth agencies) |
| Unit test bawaan | 78/78 lolos (13 suite) |
| Lint (ESLint) | Bersih, tanpa error |
| Build (`nest build`) | Sukses |
| Isu nyata ditemukan | 1 (MEDIUM) + 1 celah keamanan (HIGH, via uji khusus) |
| Catatan minor | 7 (LOW/INFO) |

**Kekuatan utama:** validasi input sangat ketat & konsisten (whitelist + pesan Bahasa Indonesia),
RBAC diterapkan menyeluruh, state machine laporan dijaga ketat (409 + daftar transisi yang
diizinkan), idempotency berfungsi, rate limiting aktif (429), envelope respons konsisten
`{success, data, meta, error}`, AI verification & Smart Priority berjalan async
(`ai_confidence_score: 0.88`, `urgency_score: 3.26`), poin kontribusi & audit trail berfungsi,
integrasi Gemini (Policy Simulator) dan geofencing Route Alert terbukti jalan.

---

## 2. Lingkup & Metodologi

- **Metode:** black-box API testing (manual + scripted), positive & negative test, uji RBAC,
  uji state machine, uji idempotency, uji rate limiting, uji CORS, uji robustness (malformed JSON,
  unknown route, non-UUID, UUID acak).
- **Peran yang digunakan:** citizen (2 akun), operator (promosi via admin), admin (seed).
- **Kredensial admin (dari seed, dapat diubah via env):**
  email `admin@laporkita.malangkota.go.id` / password `AdminLaporKita2026!`
- **Data uji:** laporan dibuat di koordinat Kota Malang (-7.982, 112.630), kategori & instansi
  dari seed (5 kategori, 3 instansi).
- **Catatan:** data uji (user, laporan, kategori, instansi QA) tertinggal di DB lokal — aman
  untuk di-reset dengan `npm run db:reset && npm run db:seed`.

---

## 3. Hasil Pengujian per Modul

### 3.1 Base & Auth
| Endpoint | Kasus | Hasil |
|---|---|---|
| GET /health | health check | ✅ 200, envelope benar |
| POST /auth/register | sukses | ✅ 201 + token |
| | email duplikat | ✅ 409 (pesan jelas) |
| | password lemah / pendek / email invalid / field asing | ✅ 400 semua (VALIDATION_ERROR) |
| POST /auth/login | identifier email & nomor HP | ✅ 200 |
| | password salah / user tak dikenal | ✅ 401 (pesan seragam, tidak membocorkan mana yang salah) |
| POST /auth/refresh | refresh token valid | ✅ 200 token baru |
| GET /users/me | tanpa token / token rusak | ✅ 401 |
| | dengan token | ✅ 200 (nomor HP dimasking `+628\*\*\*\*`) |
| PATCH /users/me | update profil | ✅ 200 |
| | phone invalid / coba set role | ✅ 400 (role tidak bisa diubah sendiri) |
| GET /users/me/points | riwayat poin | ✅ 200 |

### 3.2 Users & RBAC
| Endpoint | Kasus | Hasil |
|---|---|---|
| GET /users, GET/PATCH/DELETE /users/:id | sebagai citizen | ✅ 403 (pesan mencantumkan role yang dibutuhkan) |
| | sebagai admin | ✅ 200 (list + detail) |
| PATCH /users/:id | promosi citizen → operator | ✅ 200 |
| | role invalid | ✅ 400 |

### 3.3 Categories & Agencies
| Endpoint | Kasus | Hasil |
|---|---|---|
| GET /categories | publik | ✅ 200 (5 seed) |
| POST /categories | citizen → 403; admin → 201 | ✅ |
| PATCH/DELETE /categories/:id | admin | ✅ 200; GET setelah hapus → 404 |
| GET /agencies, GET /agencies/:id | **tanpa token → 401** (lihat Temuan #2) | ⚠️ |
| | dengan token | ✅ 200 |
| POST/PATCH/DELETE /agencies | admin 201/200/200; citizen 403; type invalid 400 | ✅ |

### 3.4 Reports (Fitur Inti)
| Endpoint | Kasus | Hasil |
|---|---|---|
| POST /reports | valid → 202 + report_code (#LP-2026-xxxx) | ✅ |
| | idempotency key sama → laporan yang sama (202) | ✅ |
| | tanpa foto / UUID kategori salah / lat >90 / field asing / tanpa token | ✅ 400/401 |
| GET /reports | publik; filter status, kategori, bbox, sort (newest/oldest/urgency/most_supported), pagination cursor | ✅ |
| | limit invalid, sort invalid, status invalid | ✅ 400 |
| GET /reports/:id | 200; non-UUID → 400; UUID acak → 404 | ✅ |
| PATCH /reports/:id/status | **State machine penuh:** verified → assigned → in_progress → completed → resolved | ✅ 200 |
| | completed **tanpa** completion_photo → 400 `COMPLETION_PHOTO_REQUIRED` | ✅ (aturan bisnis) |
| | transisi ilegal (mis. pending→assigned, mundur) → 409 + daftar transisi diizinkan | ✅ |
| | citizen → 403; tanpa token → 401 | ✅ |
| POST/DELETE /reports/:id/support | support 201, double support 409, cancel 200, cancel ulang 404 | ✅ |
| POST /reports/:id/comments | 201; kosong → 400; **profanity disensor** (masking, bukan tolak) | ✅ |
| GET /reports/:id/comments | 200 (pagination) | ✅ |
| POST /reports/:id/validate | completed + reporter/nearby → `is_valid=true` → **resolved** | ✅ 201 |
| | `is_valid=false` → **disputed** → kembali in_progress | ✅ 201 |
| | status bukan completed → 409; bukan reporter & >100m → 403 | ✅ |
| POST /reports/:id/media | progress/completion photo → 201; type invalid → 400 | ✅ |
| | **user non-pemilik bisa upload media** (lihat Temuan #1) | 🔴 |

**Terverifikasi di detail laporan:** `status_history` (audit trail lengkap dengan nama & role
pengubah), `media` (initial_photo + completion_photo), `ai_confidence_score`, `damage_severity`,
`urgency_score`, notifikasi status untuk pelapor, poin kontribusi (`report_verified +10`,
`validation_given +5`).

### 3.5 Notifications & Route Alerts
| Endpoint | Kasus | Hasil |
|---|---|---|
| GET /notifications, PATCH /:id/read, PATCH /read-all | ✅ 200 (tanpa token 401) | ✅ |
| POST /route-alerts/subscribe | device_token FCM → 200; tanpa token → 400 | ✅ |
| POST /route-alerts/check | ✅ 200, **geofencing memicu 1 alert** | ✅ |
| DELETE /route-alerts/unsubscribe | ✅ 200 | ✅ |

### 3.6 Predictions & Policy Simulator
| Endpoint | Kasus | Hasil |
|---|---|---|
| GET /predictions/zones | ✅ 200 (belum ada data zona) | ✅ |
| GET /predictions/zones/:zoneId/metrics | zona tak dikenal → 404 rapi | ✅ |
| POST /predictions/metrics/refresh | admin → 200 | ✅ |
| POST /policy-simulations | prompt_text → **201 (Gemini LLM merespons)** | ✅ |
| | prompt kosong → 400; citizen → 403 | ✅ |
| GET /policy-simulations, /:id | ✅ 200; UUID acak → 404 | ✅ |

### 3.7 Robustness & Infrastruktur
| Kasus | Hasil |
|---|---|
| Rate limiting POST /reports (10/menit) | ✅ **429 muncul saat burst** |
| CORS preflight OPTIONS | ✅ 204, `Access-Control-Allow-Origin: *` (dev), metode lengkap |
| Malformed JSON | ✅ 400 + envelope (pesan teknis bocor — Temuan #5) |
| Unknown route | ✅ 404 |
| Envelope konsisten di semua respons | ✅ `{success, data, meta, error}` |

---

## 4. Temuan

### 🔴 Temuan #1 — HIGH: Missing Authorization pada Upload Media (IDOR)
**Lokasi:** `POST /api/v1/reports/:id/media` → `reports.service.ts:uploadMedia` (tidak ada cek kepemilikan/peran)
**Bukti:** Citizen B (bukan pelapor, bukan operator) berhasil upload `completion_photo` DAN
`progress_photo` ke laporan milik citizen A — status **201** untuk keduanya.
**Dampak:** siapapun yang login bisa (a) menempel foto "bukti penyelesaian" palsu ke laporan orang
lain (mempengaruhi keputusan operator), (b) spam media.
**Rekomendasi:** batasi — pelapor hanya `initial_photo`/`progress_photo`; `completion_photo` hanya
operator/admin yang ditugaskan; atau minimal: pelapor hanya bisa upload ke laporannya sendiri,
operator hanya ke laporan yang di-assign ke instansinya.

### 🟠 Temuan #2 — MEDIUM: GET /agencies & /agencies/:id Mewajibkan Auth (Inkonsisten)
**Lokasi:** `agencies.controller.ts` — guard class-level, GET tidak diberi `@Public()`.
**Bukti:** tanpa token → 401, padahal GET /categories & GET /reports bersifat publik, dan Swagger
mendokumentasikan agencies sebagai endpoint publik.
**Dampak:** viewer peta publik yang belum login tidak bisa melihat nama instansi penanggung jawab;
kontrak API tidak konsisten.
**Rekomendasi:** beri `@Public()` pada GET (dan samakan dengan categories), atau dokumentasikan
secara eksplisit sebagai authenticated.

### 🟡 Temuan #3 — LOW: Swagger Tidak Menampilkan Metadata Security per Endpoint
Semua operasi di OpenAPI tanpa `security` (tidak ada `@ApiBearerAuth()` di controller). Swagger UI
tidak menampilkan gembok 🔒 sehingga tester/juri sulit tahu endpoint mana yang butuh token.
**Rekomendasi:** tambahkan `@ApiBearerAuth()` di controller, atau set `security` global di
`DocumentBuilder`.

### 🟡 Temuan #4 — LOW: Pesan Error Invalid UUID Tidak Konsisten
`GET /reports/xyz` → `400 "Validation failed (uuid is expected)"` (bahasa Inggris, code BAD_REQUEST),
sementara error validasi lain memakai format `VALIDATION_ERROR` + Bahasa Indonesia.
**Rekomendasi:** ganti `ParseUUIDPipe` dengan pipe kustom berpesan lokal, atau tangkap
`BadRequestException` dari pipe.

### 🟡 Temuan #5 — LOW: Malformed JSON Membocorkan Pesan Parser
Body `{bad json` → `"Expected property name or '}' in JSON at position 1"`. Informasi internal
parser ter-expose. **Rekomendasi:** tangkap `SyntaxError` body parser → pesan generik.

### ⚪ INFO (Catatan, bukan bug)
1. **Profanity filter menyensor (masking) bukan menolak komentar** — pilihan desain yang wajar; pastikan sesuai PRD.
2. **Self-support diperbolehkan** (pelapor bisa support laporannya sendiri) — umumnya tidak masalah, tapi beberapa platform melarang; cek PRD.
3. **429 tanpa header `Retry-After`** — sebaiknya ditambahkan agar client tahu kapan boleh coba lagi.
4. **Fallback JWT secret hardcoded** (`default_dev_jwt_secret_min_32_chars` di jwt.strategy.ts) — pastikan `JWT_SECRET` selalu di-set di environment lomba/produksi.
5. **Password admin default dari seed** (`AdminLaporKita2026!`) — bisa diubah via env `ADMIN_PASSWORD`; disarankan diganti sebelum demo.
6. **CORS `*` di development** — sudah benar dikunci via `ALLOWED_ORIGINS` di production.
7. **/predictions/zones masih kosong** — seed zona + metrik akan membuat demo prediksi lebih meyakinkan.

---

## 5. Skor Kelayakan Lomba

| Kriteria | Nilai | Catatan |
|---|---|---|
| Kebenaran fungsional | 9.5/10 | Semua alur inti bekerja end-to-end |
| Keamanan & RBAC | 8.5/10 | Kuat, minus 1 celah media authz |
| Kualitas kode | 9/10 | 78 unit test, lint & build bersih |
| Dokumentasi API | 8/10 | Swagger lengkap, minus metadata auth |
| Error handling | 9/10 | Envelope konsisten, pesan lokal |
| Skalabilitas (queue, cron, throttling) | 9/10 | BullMQ, cron auto-resolve, rate limit |

**Kesimpulan: siap lomba** setelah memperbaiki Temuan #1 (wajib) dan #2 (sangat disarankan).

---

## 6. Cara Menggunakan File Postman

File disediakan di folder `postman/`:
- `postman/LaporKita_QA_Collection.json` — 43 request, 10 folder, lengkap dengan body contoh
  (sudah disesuaikan dengan DTO asli), script test otomatis (cek status code + envelope),
  dan auto-capture token (login/register → token tersimpan ke variable `accessToken`).
- `postman/LaporKita_QA_Environment.json` — environment lokal (baseUrl, kredensial admin/citizen,
  ID kategori/instansi).

**Langkah:**
1. Buka Postman → *Import* → pilih kedua file di atas.
2. Pilih environment **"LaporKita QA (Local)"**.
3. Jalankan **POST /auth/login** (folder 02) → token otomatis tersimpan.
4. Jalankan request lain; folder **06 - Reports (Core Flow)** berisi alur lengkap:
   buat laporan → ambil `id` dari respons → pakai di request berikutnya (ganti nilai `{id}`
   di URL, atau set variable `reportId`).
5. Untuk menguji alur operator: login admin → PATCH /users/{id} ubah role user lain jadi
   `operator` → login sebagai user itu.

> Semua request menggunakan `{{baseUrl}}` sehingga mudah dipindah ke server lain
> (tinggal ganti nilai di environment).

## 7. Lampiran — Ringkasan Eksekusi

- Script QA: `/tmp/qa_laporkita.py`, `/tmp/qa_laporkita2.py`, `/tmp/qa_laporkita3.py`
- Log eksekusi: `/tmp/qa_run_*.log`
- Spesifikasi OpenAPI: `/tmp/openapi.json` (dari http://localhost:3000/api/docs-json)
