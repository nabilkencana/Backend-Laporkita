# Antigravity Prompt — LaporKita (Backend NestJS Only)

Cara pakai ada di paling bawah. **Bagian 0** ditempel sekali di awal sesi,
**Fase 1–7** ditempel satu per satu (jangan digabung), tunggu tiap fase
selesai & direview sebelum lanjut ke fase berikutnya.

---

## 0. MISSION PROMPT (tempel pertama kali, sekali di awal sesi/repo)

```
Kamu adalah backend engineer untuk proyek "LaporKita" — City Intelligence
Platform, pilot project Kota Malang (entri kompetisi MAGE 12, tim "Saya
Akan Lawan", SMK Telkom Malang). Scope kerja kamu HANYA backend (NestJS +
TypeScript + PostgreSQL/Prisma + queue/worker + AI service integration).
Jangan menyentuh atau membuat kode Flutter/mobile sama sekali — anggap
frontend dikerjakan tim lain yang hanya butuh REST API dari kamu.

SUMBER KEBENARAN (Single Source of Truth). Sebelum menulis kode apa pun,
baca dan patuhi 4 dokumen berikut yang ada di /docs di root repo ini:
- /docs/PRD.md            → fitur, scope, user roles, KPI, out-of-scope
- /docs/Rules.md          → business rules, state machine, validation,
                             API design rules, coding standards backend
                             (WAJIB, ini dokumen paling sering kamu buka)
- /docs/ERD.md            → skema database (entity, kolom, relasi, index)
- /docs/Architecture.md   → struktur modul backend, layering, async flow,
                             deployment, integrasi AI service eksternal

(Ada juga Design.md tapi itu untuk frontend — abaikan, tidak relevan
untuk kerja kamu.)

ATURAN KERJA (non-negotiable):
1. Jangan pernah menebak nama field, enum, atau alur status. Kalau ragu,
   cek ulang ERD.md / Rules.md — JANGAN improvisasi skema atau state
   machine baru.
2. State machine laporan WAJIB persis seperti Rules.md §1.1:
   pending_verification → verified|rejected
   verified → assigned → in_progress → completed → resolved|disputed
   disputed kembali ke in_progress. rejected = final, tidak bisa
   diproses ulang. Implementasikan sebagai satu method terpusat di
   service, bukan endpoint per-transisi lepas-lepas.
3. Setiap perubahan status laporan WAJIB tercatat ke
   report_status_history (siapa/changed_by, kapan, catatan) — ini
   dilakukan di service layer yang sama dengan transisi, bukan
   endpoint terpisah yang bisa dilewati.
4. Struktur: modular monolith per domain, 1 modul = folder berisi
   controller + service + dto + repository, persis sesuai
   Architecture.md §3.1. Prisma adalah SATU-SATUNYA jalur akses DB
   (tidak ada raw query kecuali ada justifikasi tertulis di comment).
5. Semua DTO pakai class-validator. Business logic HANYA di service,
   controller cuma orkestrasi (parse request → panggil service →
   return). Response envelope & error format WAJIB ikuti Rules.md §3
   persis: {success, data, meta, error}, HTTP status code standar
   (200/201/202/400/401/403/404/409/500), prefix /api/v1.
6. Penamaan: camelCase variabel/fungsi, PascalCase class/DTO,
   snake_case kolom database (Rules.md §4.1).
7. Proses berat/async (AI verification, prediction) WAJIB lewat job
   queue (BullMQ + Redis) sesuai Architecture.md §3.3 — endpoint submit
   laporan return cepat 202 Accepted, bukan menunggu hasil AI secara
   sinkron.
8. Setiap kali kamu membuat/mengubah business logic kritikal (state
   machine transition, Smart Priority scoring, grace period dukungan,
   radius citizen validation, perhitungan poin), tulis unit test-nya
   juga (Rules.md §4.1) — jangan skip ini walau MVP.
9. Kalau requirement di PRD/Rules "kabur" atau kurang detail untuk
   diimplementasi, JANGAN mengarang — tandai sebagai TODO/comment
   dengan pertanyaan spesifik, lanjutkan ke bagian lain yang jelas.
10. Kerjakan HANYA scope task yang saya berikan di setiap prompt fase.
    Jangan mulai fase berikutnya sebelum saya minta.
11. Di akhir setiap fase, berikan ringkasan singkat: file apa saja yang
    dibuat/diubah, endpoint baru (method + path), keputusan yang kamu
    ambil sendiri kalau ada bagian ambigu, dan apa yang masih pending/
    di-mock (misal AI service Python yang belum ada).

Konfirmasi kamu sudah membaca PRD.md, Rules.md, ERD.md, dan
Architecture.md sebelum mulai mengerjakan task pertama.
```

---

## 1. FASE 1 — Bootstrap NestJS Project & Tooling

```
Setup project backend LaporKita dari nol di folder `backend/`.

- Init NestJS project (TypeScript strict mode).
- Setup Prisma + koneksi PostgreSQL (.env.example dengan DATABASE_URL
  placeholder, jangan hardcode credential apa pun).
- Buat struktur folder persis sesuai Architecture.md §3.1:
  src/modules/, src/common/{guards,interceptors,filters,decorators},
  src/prisma/schema.prisma, src/main.ts.
- Global exception filter yang menangkap semua error (validation error,
  not found, conflict, unhandled) dan membungkusnya ke format
  {success:false, data:null, error:{code, message}} sesuai Rules.md §3.
- Global response interceptor yang otomatis membungkus response sukses
  ke {success:true, data, meta, error:null}.
- Enable global ValidationPipe (whitelist + forbidNonWhitelisted) untuk
  class-validator di semua DTO.
- Setup versioning prefix /api/v1 secara global (app.setGlobalPrefix
  atau VersioningType.URI).
- Setup ESLint + Prettier sesuai coding standards Rules.md §4.1.
- Setup config module (@nestjs/config) untuk env vars, termasuk
  placeholder untuk: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET,
  REDIS_URL, AI_SERVICE_URL, GEMINI_API_KEY, NOMINATIM_BASE_URL
  (default https://nominatim.openstreetmap.org, tanpa API key),
  NOMINATIM_USER_AGENT (wajib diisi identitas aplikasi sesuai usage
  policy Nominatim, mis. "LaporKita/1.0 (contact@laporkita.id)").
  Peta/geocoding TIDAK pakai Google Maps Platform (berbayar) — pakai
  OpenStreetMap/Nominatim yang gratis, detail di Fase 6.
- Setup Docker: Dockerfile untuk NestJS app + docker-compose.yml lokal
  (postgres + redis + backend) untuk dev environment, sesuai
  Architecture.md §6.

Jangan implementasikan module bisnis apa pun dulu di fase ini — murni
skeleton, tooling, dan infra lokal.
```

---

## 2. FASE 2 — Database Schema (Prisma) dari ERD.md

```
Implementasikan backend/prisma/schema.prisma yang merepresentasikan
SEMUA entity di ERD.md §2 — jangan ada yang terlewat:
users, agencies, categories, reports, report_media,
report_status_history, report_supports, report_comments,
citizen_validations, contribution_points_log, zones, zone_metrics,
policy_simulations, route_alert_subscriptions, notifications.

Ketentuan:
- Semua PK UUID (default uuid()).
- Semua enum di ERD.md jadi Prisma enum — termasuk reports.status
  dengan 8 value persis sesuai Rules.md §1.1 (pending_verification,
  verified, rejected, assigned, in_progress, completed, resolved,
  disputed).
- Semua relasi FK & nullable field sesuai ERD.md §2 dan §3 (mis.
  assigned_agency_id nullable, agency_id di users nullable untuk role
  citizen).
- Unique constraint (report_id, user_id) di report_supports (ERD.md
  §2.7, Rules.md §1.4). Unique juga untuk email dan phone_number di
  users, dan report_code di reports.
- Implementasikan indexing strategy ERD.md §4: index pada
  reports(status), reports(category_id), report_status_history
  (report_id, created_at), notifications(user_id, is_read). Untuk
  spatial index (lat/long, PostGIS/GIST) tulis sebagai raw SQL
  migration terpisah (Prisma tidak native support GIST) dan beri
  komentar jelas kenapa ini exception dari aturan "no raw query".
- Kolom support_count & view_count di reports adalah denormalized
  counter (ERD.md §5) — beri komentar di schema bahwa update-nya
  dilakukan di service layer dalam transaction, bukan DB trigger,
  supaya konsisten dengan aturan Rules.md §4.1.

Setelah schema selesai:
- Generate migration awal (`prisma migrate dev`).
- Buat backend/prisma/seed.ts: seed 5 kategori aktif (Jalan Berlubang,
  Lampu Jalan, Rambu Lalu Lintas, Trotoar, Drainase) masing-masing
  dengan default_agency_id terisi, dan 3 instansi (DPUPR, Dishub,
  Diskominfo) sesuai PRD.md §3 dan Rules.md §2.1/§1.7.
- Buat 1 admin user default via seed (email/password dari env, bukan
  hardcoded plaintext di kode).
```

---

## 3. FASE 3 — Modul Auth, Users, Categories, Agencies

```
Implementasikan 4 modul dasar sesuai Architecture.md §3.1, masing-
masing dengan struktur controller + service + dto + repository:

auth:
- POST /api/v1/auth/register, POST /api/v1/auth/login,
  POST /api/v1/auth/refresh.
- JWT access token (short-lived) + refresh token, sesuai
  Architecture.md §7.
- Validasi registrasi mengikuti Rules.md §2.2 UNTUK PASSWORD (min 8
  karakter kombinasi huruf & angka), TAPI untuk email/no HP mengikuti
  keputusan project (bukan Rules.md §2.2 versi lama yang bilang
  "salah satu"): **email DAN no HP wajib diisi keduanya**, karena no
  HP dipakai untuk OTP verification (lihat Fase 3B). Tandai di
  ringkasan akhir bahwa ini adalah override resmi terhadap Rules.md
  §2.2, sesuai keputusan project owner, bukan salah baca dokumen.
  Role default `citizen` dan TIDAK bisa diisi user lain saat
  self-register (role lain hanya settable lewat endpoint admin di
  modul users).
- User yang baru register berstatus **belum aktif** (`is_active=false`)
  sampai berhasil verifikasi OTP di Fase 3B — user belum aktif TIDAK
  bisa login (endpoint login harus menolak dengan error jelas, mis.
  `PHONE_NOT_VERIFIED`, bukan pesan generic).
- Guard RBAC (custom decorator + guard) untuk 4 role: citizen,
  operator, policy_maker, admin — pasang di semua endpoint modul lain
  mulai fase ini dan seterusnya.

users:
- GET /api/v1/users/me, PATCH /api/v1/users/me (profil sendiri).
- Admin-only: GET/PATCH/DELETE user lain, termasuk set role & agency_id.
- Endpoint contribution points READ-ONLY (agregat dari
  contribution_points_log) — JANGAN buat endpoint yang bisa langsung
  menulis angka contribution_points di tabel users (Rules.md §1.6).

categories:
- CRUD (create/update/delete admin-only, read publik/authenticated).
- default_agency_id WAJIB diisi saat create category (dipakai untuk
  routing otomatis, Rules.md §1.7) — validasi ini di DTO/service.

agencies:
- CRUD (admin-only untuk mutate, read authenticated).

Semua endpoint pakai response envelope & HTTP status standar. Tulis
unit test untuk: password/role validation di auth service, dan guard
RBAC behavior (boleh test di level service/guard, tidak perlu e2e).
```

---

## 3B. FASE 3B — OTP SMS Verification (sesuai mockup Figma "Lapor Kita")

```
Tambahan alur registrasi sesuai mockup Figma: setelah Sign Up, user
diarahkan ke layar "Verifikasi Nomor" — masukkan kode 4 digit yang
dikirim ke no HP, ada tombol resend dengan countdown timer. Kerjakan
fase ini SETELAH Fase 3 (auth/users) selesai, karena ini extend modul
auth yang sudah ada, bukan modul baru terpisah.

Skema tambahan ke schema.prisma (ERD.md belum punya ini — JUSTIFIKASI
penambahan, bukan penyimpangan bebas):
- Tambah kolom di `users`: `is_active` (boolean, default false),
  `phone_verified_at` (timestamp, nullable).
- Tambah tabel baru `otp_verifications`: id (UUID), user_id (FK →
  users.id), phone_number, otp_code_hash (HASH, jangan simpan OTP
  plaintext — pakai bcrypt/argon2 sama seperti password), purpose
  (enum: register, login, reset_password — untuk MVP baru dipakai
  `register`), expires_at, attempt_count (default 0), is_used
  (boolean default false), last_sent_at (dipakai untuk cooldown
  resend), created_at.

Endpoint:

1. POST /api/v1/auth/register (extend dari Fase 3):
   - Setelah create user (is_active=false), generate OTP 4 digit
     random, expiry 5 menit (expiry OTP ini KONSEP BEDA dari cooldown
     resend 45 detik di UI — jangan disamakan keduanya).
   - Hash OTP sebelum insert ke otp_verifications, set last_sent_at
     = now.
   - Panggil OTPSmsService.send(phoneNumber, otpCode) — lihat catatan
     provider di bawah.
   - Response 202 Accepted, JANGAN PERNAH mengembalikan OTP plaintext
     di response body dalam kondisi apa pun (termasuk saat development)
     — kalau perlu lihat OTP saat development, cukup lewat server log,
     bukan response API.

2. POST /api/v1/auth/verify-otp (body: userId atau phoneNumber +
   otp_code):
   - Tolak kalau: OTP sudah expired (`OTP_EXPIRED`), sudah dipakai
     (`OTP_ALREADY_USED`), attempt_count >= 5 dalam window OTP yang
     sama (`OTP_MAX_ATTEMPTS`, ini mencegah brute-force 4 digit yang
     ruang kemungkinannya cuma 10.000).
   - Kalau kode tidak cocok: increment attempt_count, response error
     `OTP_INVALID`.
   - Kalau valid: set users.is_active=true, users.phone_verified_at=
     now, otp_verifications.is_used=true — dalam satu transaction.

3. POST /api/v1/auth/resend-otp (body: userId atau phoneNumber):
   - Cek last_sent_at dari record OTP aktif — kalau belum lewat 45
     detik sejak last_sent_at, tolak dengan error `OTP_RESEND_COOLDOWN`
     dan sertakan `remainingSeconds` di response data supaya frontend
     bisa render countdown yang sama persis seperti mockup Figma
     ("Kirim ulang kode 00:45").
   - Kalau cooldown sudah lewat: invalidate OTP lama (is_used=true atau
     hapus), generate OTP baru, reset attempt_count, kirim ulang via
     OTPSmsService.

4. Login (endpoint dari Fase 3) WAJIB dicek is_active — user yang
   belum verifikasi OTP tidak boleh login, response error
   `PHONE_NOT_VERIFIED` (bukan pesan generic "unauthorized").

Provider SMS — desain sebagai interface, BUKAN panggilan langsung ke
satu vendor SDK:
- Buat interface `OTPSmsService.send(phoneNumber, code): Promise<void>`
  di common/ atau modules/auth/.
- Implementasi PRODUCTION: HTTP client ke provider SMS gateway
  (contoh: Zenziva, Fonnte/WhatsApp API, atau Twilio) — nomor/kredensial
  provider dari env (`SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_BASE_URL`),
  jangan hardcode. SMS sungguhan SELALU berbayar (biaya jaringan
  telco), tidak ada alternatif gratis yang reliable seperti kasus Maps
  — ini catat jelas di README supaya tim tidak kaget.
- Implementasi DEVELOPMENT (dipakai default kalau
  `NODE_ENV=development` atau `SMS_PROVIDER=mock`): JANGAN benar-benar
  kirim SMS, cukup log OTP ke server console/log file dengan format
  jelas (mis. `[MOCK SMS] to +62xxx: your OTP is 1234`). Ini supaya
  tim bisa demo & develop tanpa biaya SMS asli. Pastikan mock ini TIDAK
  PERNAH aktif secara tidak sengaja di production (guard eksplisit di
  awal startup: kalau NODE_ENV=production tapi SMS_PROVIDER=mock,
  throw error saat boot, jangan biarkan silent).

Env vars tambahan (update .env.example dari Fase 1): SMS_PROVIDER
(mock|zenziva|fonnte|twilio, default mock), SMS_PROVIDER_API_KEY,
SMS_PROVIDER_BASE_URL, OTP_EXPIRY_MINUTES (default 5),
OTP_RESEND_COOLDOWN_SECONDS (default 45), OTP_MAX_ATTEMPTS (default 5).

Nomor test manual (BUKAN untuk dikirim otomatis oleh agent, BUKAN
untuk dimasukkan ke seed/fixture/test otomatis — ini catatan untuk
project owner test manual sendiri di device/Postman lokal setelah
provider production terpasang): +62 856-4889-8807. JANGAN commit
nomor ini ke file test/seed apa pun di repo — cukup dokumentasikan di
README sebagai "nomor tim untuk uji manual", karena ini data pribadi.

Testing (WAJIB pakai mock, JANGAN PERNAH memanggil provider SMS asli
dari automated test):
- Unit test: OTP expiry, attempt limit brute-force, cooldown resend
  (termasuk hitung remainingSeconds benar), hash matching OTP,
  login ditolak kalau is_active=false.
- Semua test di atas pakai `OTPSmsService` mock/stub, tidak pernah
  hit HTTP eksternal sungguhan.
```

---

## 4. FASE 4 — Modul Reports: Submit, State Machine, Status History

```
Modul paling kritikal. Implementasikan modul `reports` merujuk Rules.md
§1.1, §1.2, §2.1, dan Architecture.md §3.3 (async flow):

Submit laporan — POST /api/v1/reports:
- Terima idempotency_key dari client (Rules.md §3) untuk cegah
  duplikasi akibat retry jaringan — simpan & cek key ini sebelum
  insert baru.
- Validasi input persis Rules.md §2.1: foto wajib JPEG/PNG max 8MB min
  480p, latitude/longitude wajib dalam bounding box Kota Malang
  (definisikan sebagai konstanta config, bukan angka hardcoded di
  tengah logic), category wajib salah satu dari 5 kategori aktif,
  description opsional saat submit, max 500 karakter kalau diedit
  manual.
- Response CEPAT: 202 Accepted, status awal `pending_verification`
  (jangan menunggu hasil AI verification secara sinkron — itu proses
  di Fase 5 lewat queue).
- Setiap create laporan otomatis insert entry pertama ke
  report_status_history (status pending_verification, changed_by =
  reporter, note = null) dalam transaction yang sama dengan create
  report.
- report_code otomatis di-generate format #LP-YYYY-NNNNNN (ERD.md
  §2.4).

State machine transition (method service terpusat, BUKAN satu endpoint
per transisi):
- `transitionReportStatus(reportId, targetStatus, actorId, note?)`
  yang memvalidasi transisi legal PERSIS sesuai diagram Rules.md §1.1.
  Transisi ilegal → throw custom exception → HTTP 409 sesuai Rules.md
  §3, dengan error.code yang jelas (mis. INVALID_STATUS_TRANSITION).
- Setiap transisi sukses WAJIB insert row baru ke
  report_status_history dalam transaction yang sama.
- Transisi ke `disputed`: otomatis balik ke `in_progress` dan trigger
  recalculation urgency_score (panggil interface dari modul
  smart-priority — boleh stub dulu kalau modul itu belum ada, tandai
  TODO, detail scoring diimplementasikan penuh di Fase 5).
- `rejected` final — tidak ada path transisi keluar dari rejected,
  pastikan ini dicegah baik di validasi transisi maupun test.
- Endpoint terkait: PATCH /api/v1/reports/:id/status (operator/admin,
  body: targetStatus + note, note wajib kalau override AI atau reject
  manual), dengan guard RBAC.

Dukungan/upvote — report_supports:
- POST /api/v1/reports/:id/support, DELETE
  /api/v1/reports/:id/support.
- 1 user 1 dukungan per laporan: unique constraint DB + cek eksplisit
  di service sebelum insert (biar error message-nya jelas, bukan
  cuma DB constraint error mentah).
- DELETE (cancel dukungan) hanya boleh dalam 5 menit pertama sejak
  created_at (grace period, Rules.md §1.4) — di luar itu, tolak dengan
  error code jelas.
- Update support_count (denormalized) di reports dalam transaction
  yang sama dengan insert/delete report_supports.

Comments — report_comments:
- POST /api/v1/reports/:id/comments, GET
  /api/v1/reports/:id/comments (cursor-based pagination sesuai
  Rules.md §3).
- Max 300 karakter, basic profanity filter sebelum simpan (Rules.md
  §2.3) — implementasikan sebagai util sederhana (word-list based),
  boleh basic dulu, tandai TODO untuk filter lebih canggih.

Citizen validation — citizen_validations:
- POST /api/v1/reports/:id/validate (body: is_valid, note?).
- Eligibility: HANYA reporter asli ATAU user dalam radius 100m dari
  lokasi laporan (hitung pakai formula haversine di service — jangan
  panggil API eksternal untuk ini). Tolak dengan error jelas kalau
  tidak eligible.
- is_valid=true → transitionReportStatus ke resolved. is_valid=false →
  ke disputed. (Rules.md §1.5)
- Scheduled job (@nestjs/schedule, cron harian): cari semua laporan
  status `completed` lebih dari 7 hari TANPA citizen validation →
  auto-transitionReportStatus ke resolved (Rules.md §1.5).

Poin kontribusi — contribution_points_log:
- Insert log entry untuk tiap event yang relevan sesuai tabel di
  Rules.md §1.6: submit laporan valid (+10, dipicu saat status jadi
  verified pertama kali), dukungan diberikan (+1), citizen validation
  diberikan (+5), laporan ditolak berulang >3x dalam 30 hari (-20 +
  set flag review di user, field flag boleh ditambah minor ke schema
  users kalau belum ada — tandai di ringkasan akhir kalau kamu
  menambah ini).
- JANGAN pernah update kolom contribution_points di users secara
  langsung dari endpoint mana pun — HARUS selalu lewat: insert log →
  recompute/increment counter, dalam satu DB transaction.

Media laporan — report_media:
- Endpoint upload progress_photo (saat in_progress) dan
  completion_photo (WAJIB ada saat transisi ke completed — validasi
  ini di service, tolak transisi ke completed kalau belum ada
  completion_photo ter-upload, sesuai Rules.md §1 state machine notes).

Semua endpoint pakai response envelope & HTTP status sesuai Rules.md
§3, list laporan pakai cursor-based pagination (bukan offset). Tulis
unit test untuk: semua transisi state machine (legal & ilegal), grace
period dukungan, radius haversine citizen validation, auto-resolve
7 hari, dan perhitungan poin kontribusi.
```

---

## 5. FASE 5 — AI Verification & Smart Priority

```
Implementasikan modul `ai-verification` dan `smart-priority` sesuai
Architecture.md §3.1–§3.3.

Queue infra:
- Setup BullMQ + Redis (dari Fase 1 infra) dengan queue `verify-report`.
- Saat POST /reports berhasil (Fase 4), enqueue job ke `verify-report`
  berisi reportId. Buat processor/worker terpisah yang consume job ini.

ai-verification module:
- Interface AIVerificationService dengan method
  `verifyReport(reportId): Promise<{confidence:number, category:string,
  isValidGps:boolean, isValidTimestamp:boolean}>`.
- Implementasi HTTP client ke AI_SERVICE_URL (service Python FastAPI
  eksternal, lihat Architecture.md §3.2) — kalau service itu belum
  jalan/tidak tersedia untuk development, buat MOCK implementation di
  balik interface yang sama (return nilai terkontrol/random), beri
  komentar jelas "// MOCK — ganti ke HTTP call asli saat AI service
  Python tersedia", supaya gampang di-swap nanti.
- Worker logic setelah dapat hasil verifikasi, terapkan Rules.md §1.2
  PERSIS:
  - confidence >= 0.6 → transitionReportStatus ke `verified` (actor =
    system/AI).
  - confidence < 0.6 → JANGAN reject otomatis, masuk ke antrian
    verifikasi manual operator (tetap status pending_verification,
    tapi tandai/flag agar muncul di list "perlu verifikasi manual" di
    endpoint operator — bisa pakai field atau query filter berdasarkan
    ai_confidence_score).
  - isValidGps atau isValidTimestamp false → masuk verifikasi manual
    juga (bukan auto-reject).
  - Simpan ai_confidence_score ke reports setelah verifikasi.
- Endpoint operator untuk verifikasi manual: GET
  /api/v1/reports?needsManualReview=true, dan endpoint existing PATCH
  status (Fase 4) dipakai untuk operator set verified/rejected manual.

smart-priority module:
- Implementasikan formula Rules.md §1.3 PERSIS:
  urgency_score = w1*damage_severity + w2*support_count_normalized +
  w3*location_density_factor + w4*category_urgency_weight
- Bobot w1..w4 disimpan sebagai config di database (bukan hardcoded di
  kode) — kalau ERD.md belum punya tabel untuk ini, tambahkan tabel
  kecil `system_config` atau serupa, tandai penambahan ini jelas di
  ringkasan akhir fase beserta alasannya.
- Method `recalculateUrgencyScore(reportId)` dipanggil dari: (a) modul
  reports saat ada dukungan baru, (b) saat ada laporan baru dalam
  radius 200m (default, configurable via config yang sama) dari lokasi
  yang sama — pakai haversine yang sama seperti Fase 4, jangan duplikat
  logic, extract ke shared util kalau perlu.
- location_density_factor dihitung dari jumlah laporan lain dalam
  radius tersebut (query sederhana pakai bounding box dulu sebagai
  optimasi sebelum haversine presisi, catat ini sebagai pendekatan di
  komentar kode).

Notifications (minimal untuk fase ini):
- Saat status berubah jadi verified (dari AI atau manual), insert row
  ke notifications (type=status_update). Push notification FCM asli
  ditandai TODO integrasi eksternal — cukup persist ke DB dulu.

Tulis unit test: threshold 0.6 di ai-verification (berbagai kombinasi
confidence/gps/timestamp), formula smart-priority (berbagai kombinasi
bobot & input), dan trigger recalculation saat dukungan baru.
```

---

## 6. FASE 6 — Prediction, Policy Simulator, Maps Integration (OSM, Fase 2 Roadmap)

```
Modul-modul fase 2 roadmap PRD.md §10 — kerjakan setelah Fase 1–5
backend inti stabil.

maps module (pakai OpenStreetMap/Nominatim, BUKAN Google Maps Platform
— proyek ini sengaja menghindari layanan berbayar, jangan ganti ke
Google Maps API meskipun itu yang tertulis di Architecture.md §5;
anggap §5 sudah digantikan aturan berikut):
- Wrapper HTTP client ke Nominatim (NOMINATIM_BASE_URL dari env,
  endpoint /reverse) untuk reverse geocoding: konversi lat/long →
  address_text saat laporan jadi `verified` (dipanggil dari flow
  Fase 5, bukan endpoint publik terpisah).
- WAJIB kirim header `User-Agent` sesuai NOMINATIM_USER_AGENT di setiap
  request — ini syarat usage policy Nominatim, request tanpa
  User-Agent yang jelas bisa diblokir.
- WAJIB throttle request ke Nominatim maksimal 1 request/detik (kalau
  pakai public server nominatim.openstreetmap.org) — implementasikan
  lewat BullMQ dengan concurrency=1 dan/atau rate limiter di HTTP
  client, JANGAN panggil paralel untuk banyak laporan sekaligus.
- Simpan hasil address_text ke reports, dan cache hasil geocoding per
  koordinat (rounded ke beberapa desimal) di tabel/key sederhana supaya
  tidak query ulang untuk lokasi yang sama persis — ini DIPERBOLEHKAN
  untuk Nominatim (beda dengan Google yang melarang caching hasil
  geocoding di ToS-nya).
- Tampilkan attribution "© OpenStreetMap contributors" di response
  metadata atau dokumentasikan bahwa frontend wajib menampilkannya di
  peta (syarat lisensi OSM) — catat ini di ringkasan akhir fase.
- Kalau nanti butuh geocoding lebih cepat/reliable daripada public
  Nominatim, interface yang sama bisa di-swap ke self-hosted Nominatim
  atau Photon tanpa mengubah kode pemanggil (service dari Fase 5) —
  desain sebagai interface, bukan panggilan langsung.

prediction module:
- Wrapper HTTP client ke AI service Python untuk XGBoost prediction
  (flood_risk_probability, dll ke zone_metrics) — sama seperti
  ai-verification, buat mock di balik interface yang sama kalau
  service Python belum tersedia.
- Endpoint/cron untuk update zone_metrics berkala.

policy-simulator module:
- POST /api/v1/policy-simulations (policy_maker/admin only): terima
  prompt_text + zone_id opsional, panggil Gemini API (GEMINI_API_KEY
  dari env), simpan result_narrative + result_data ke
  policy_simulations sesuai ERD.md §2.13.
- Kalau integrasi Gemini asli belum mau dikerjakan di fase ini, buat
  mock response terstruktur di balik interface yang sama, tandai TODO
  jelas.

route-alert (dasar, simulasi):
- Endpoint route_alert_subscriptions (register device_token + lokasi
  terakhir user, ERD.md §2.14) — logic pengecekan proximity & trigger
  notifikasi kontekstual boleh simple/simulasi dulu (cron cek jarak
  user-report verified terdekat), FCM asli tetap TODO.

Semua tetap ikuti response envelope, RBAC per role sesuai PRD.md §3,
dan modular monolith structure Architecture.md §3.1.
```

---

## 7. FASE 7 — Testing, Hardening, Deployment Readiness

```
Finalisasi backend agar siap dipakai tim frontend & demo:

- Rate limiting (@nestjs/throttler) di endpoint publik rawan spam:
  submit laporan, komentar, dukungan (Architecture.md §7).
- Review ulang semua endpoint: pastikan guard RBAC benar per role
  (citizen/operator/policy_maker/admin) sesuai tabel akses PRD.md §3.
- Validasi file upload (tipe & ukuran) terpasang di semua endpoint
  upload media, bukan cuma di DTO level tapi juga dicek ulang sebelum
  simpan ke storage (Architecture.md §7).
- Audit trail check: pastikan report_status_history benar-benar
  terisi untuk SEMUA jalur yang mengubah status (manual operator, AI
  otomatis, auto-resolve cron, disputed) — tulis test integrasi yang
  spesifik mengecek ini, bukan cuma unit test service.
- Lengkapi/rapikan semua unit test yang sempat ditandai TODO di fase
  sebelumnya.
- Tulis e2e test dasar (Supertest) untuk flow utama: register/login →
  submit laporan → (mock AI verified) → dukungan → operator ubah
  status sampai completed → citizen validation → resolved. Assert
  response envelope format di setiap step.
- Swagger/OpenAPI docs (@nestjs/swagger) untuk semua endpoint, supaya
  tim frontend Flutter bisa lihat kontrak API tanpa baca kode backend.
- Review docker-compose & Dockerfile dari Fase 1, pastikan bisa
  `docker compose up` dan seed jalan otomatis untuk environment dev.
- Buat README.md di backend/ berisi: cara run lokal, daftar env var
  wajib, cara run migration & seed, cara run test.

Di akhir fase ini, berikan daftar lengkap: semua endpoint (method +
path + role yang boleh akses), semua yang masih berstatus MOCK/TODO
(AI service Python, Gemini, FCM), dan rekomendasi urutan integrasi
eksternal berikutnya.
```

---

## Cara Pakai

1. **Siapkan repo**: taruh `PRD.md`, `Rules.md`, `ERD.md`, dan
   `Architecture.md` di folder `/docs` root repo backend — Antigravity
   perlu bisa membaca file-nya langsung, bukan cuma sekali ditempel di
   chat. `Design.md` tidak perlu disertakan karena tidak relevan untuk
   kerja backend.
2. Buka sesi Antigravity di root repo, tempel **Bagian 0** (Mission
   Prompt) sebagai pesan pertama, tunggu konfirmasi agent sudah baca
   keempat dokumen.
3. Tempel **Fase 1**, review hasil (struktur folder, docker-compose
   nyala, dsb), baru lanjut **Fase 2**, dst — satu fase per giliran.
4. Urutan fase: 1 → 2 → 3 → **3B (OTP SMS, extend dari Fase 3)** → 4 →
   5 → 6 → 7. Fase 3B sengaja disisipkan setelah Fase 3 karena dia
   extend modul auth yang sudah dibuat di sana, bukan modul mandiri.
5. Fase 1–5 (termasuk 3B) adalah inti MVP (harus jalan dulu). Fase 6
   (prediction, policy simulator, maps, route alert) adalah scope Fase
   2 roadmap PRD — bisa ditunda kalau fokus kompetisi cuma MVP. Fase 7
   selalu dikerjakan terakhir sebagai hardening sebelum demo/handoff ke
   frontend.
6. Kalau agent menyimpang dari dokumen (field yang tidak ada di ERD,
   state machine custom, response format beda dari Rules.md §3),
   tegur langsung dengan merujuk section spesifik — jangan lanjut ke
   fase berikutnya sebelum dikoreksi.