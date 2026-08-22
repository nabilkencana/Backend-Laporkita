# RINGKASAN AKHIR QA — BACKEND LAPORKITA (Fase 1–7)

**Penguji:** Senior QA Engineer (independen) | **Tanggal:** 22 Agustus 2026
**Basis:** main @ 167c864 (OTP) | **Lingkup:** PRD.md, Rules.md, ERD.md,
Architecture.md, ANTIGRAVITY_PROMPT_LaporKita_Backend.md, QA_REPORT.md (baseline)
**Metode:** black-box HTTP client (curl) + service-layer tests (AppModule asli,
test/qa/*.cjs) + verifikasi side-effect DB (psql) + audit source. QA TIDAK
menulis/mengubah kode fitur (src/modules/**). Semua hasil disertai evidence.

---

## 1. REKAP TEST CASE PER FASE

| Fase | Test case | PASS | FAIL | PARTIAL | SPEC AMBIGUITY | N/A |
|------|-----------|------|------|---------|----------------|-----|
| 1 (Infra/Bootstrap/Contract + 6 regresi QA_REPORT) | 15 | 13 | 2 | 0 | 0 | 0 |
| 2 (Schema Prisma vs ERD) | 5 | 4 | 0 | 1 | 0 | 0 |
| 3 (Auth/Users/Categories/Agencies) | 17 | 15 | 2 | 0 | 0 | 0 |
| 4 (Reports — state machine & semua sub-modul) | 33 | 29 | 2 | 1 | 1 | 0 |
| 5 (AI Verification & Smart Priority) | 11 | 10 | 1 | 0 | 0 | 0 |
| 6 (Maps/Nominatim, Policy Sim, Prediction) | 7 | 7 | 0 | 0 | 0 | 0 |
| 7 (Hardening: rate limit, JWT, audit, e2e, docs) | 10 | 8 | 0 | 0 | 1 | 1 |
| **TOTAL** | **98** | **86** | **7** | **2** | **2** | **1** |

Tambahan: e2e dev 8/8 (diverifikasi independen + flow HTTP penuh OTP),
unit/integration `npm test` 93/93 (13 suite), lint & build host bersih.

Rincian FAIL:
- F1-1 [BLOCKER] docker build gagal — urutan Dockerfile (prisma generate
  setelah build) → 174 error TS2305.
- F1-6 [MINOR] .env.example kehilangan NOMINATIM_BASE_URL /
  NOMINATIM_USER_AGENT (dipakai source); GOOGLE_MAPS_API_KEY dead config.
- F3-5/F3-6 [HIGH] register menerima email ATAU HP saja — spec Fase 3
  mewajibkan KEDUANYA (override resmi) → akun zombie tanpa OTP.
- F4-7/F4-8 [MEDIUM] tidak ada validasi ukuran file (8MB) & resolusi (480p).
- F4-9 [PARTIAL] .webp diterima (Rules: hanya JPEG/PNG); .gif ditolak.
- F5-6 [MEDIUM] needsManualReview tidak menangkap laporan gps/ts-invalid
  ber-confidence tinggi.

---

## 2. BLOCKER & CRITICAL — STATUS OPEN

| ID | Severity | Deskripsi | Status |
|----|----------|-----------|--------|
| F1-1 | **BLOCKER** | Dockerfile: `RUN npm run build` (baris 18) SEBELUM `RUN npx prisma generate` (baris 21) → `docker compose --profile full up` gagal build (174× TS2305). Root cause terisolasi: host build sukses; murni packaging, bukan logic aplikasi. Dampak: containerized deployment (Architecture.md §6) & demo via Docker TIDAK bisa. | **OPEN** — menunggu fix dev (tukar urutan). Re-test wajib: 1.1 + tetangga 1.2/1.6 dari clean state (aturan regresi #4). |
| Critical lain | — | Tidak ada temuan Critical lain yang terkonfirmasi. (F3-1 klasifikasi HIGH; F7-3 refresh token = risiko/ambiguitas, bukan Critical terkonfirmasi.) | — |

**Karena masih ada 1 Blocker Open → backend TIDAK direkomendasikan
untuk demo/integrasi FE sampai F1-1 ditutup** (lihat bagian 5).

---

## 3. SPEC AMBIGUITY — BELUM DIJAWAB PROJECT OWNER (wajib sebelum sign-off penuh)

| ID | Test | Pertanyaan | Perilaku aktual | Dampak jika tidak dijawab |
|----|------|------------|-----------------|---------------------------|
| SA-1 | 4.22 | Komentar berisi profanity: "ditolak" atau "disimpan tapi di-flag"? (Rules.md §2.3 hanya "filter sebelum disimpan") | Disimpan 201 dgn MASKING (`anjing`→`******`) | Frontend perlu tahu kontrak: apakah komentar tersensor dikirim apa adanya. |
| SA-2 | 7.4 | Refresh token: single-use atau reusable? (Architecture §7 tidak eksplisit) | Reusable tanpa batas; token baru identik (deterministik, tanpa jti/revocation) | Risiko keamanan: token curian valid 7 hari, bisa refresh berkali-kali. Keputusan desain (rotasi/jti) harus dari owner. |
| SA-3 | 4.10 | Boundary bounding box Malang: inclusive atau exclusive? | INCLUSIVE (`>=`/`<=`, 4 sisi) — konsisten | Kontrak geofencing FE; perilaku sudah konsisten, tinggal dikonfirmasi. |
| SA-4 | 4.25 | Radius citizen validation 100m: inclusive atau exclusive? | `distance <= 100m` diterima (inclusive); 100.08m ditolak | Kontrak FE utk tombol validasi. |

Catatan: SA-3/SA-4 perilaku sudah konsisten & masuk akal (inclusive) —
tinggal konfirmasi tertulis agar tidak jadi dispute di kemudian hari.
SA-1/SA-2 membutuhkan keputusan desain dari owner.

---

## 4. MODUL PALING SERING GAGAL → KANDIDAT REVIEW DESAIN

**Reports (Fase 4 + turunannya): 4 masalah (2 FAIL, 1 PARTIAL, 1 ambiguitas)**
— paling banyak gagal, dan ini modul inti.

Akar masalahnya BUKAN state machine (8/8 legal, 56/56 ilegal — sempurna),
melainkan:
1. **Arsitektur validasi foto** (F4-1): sistem URL-based (`photo_url` string),
   TIDAK ada upload file → tidak mungkin validasi ukuran/resolusi/MIME
   sungguhan. Ini keputusan arsitektur, bukan bug satu baris — perlu review
   desain: (a) tambah endpoint upload + Multer + validasi magic bytes, atau
   (b) dokumentasikan kontrak bahwa validasi foto sepenuhnya client-side
   (menyimpang Rules.md §2.1).
2. **Kontrak idempotency** (F4-2): header `X-Idempotency-Key` diizinkan CORS
   tapi hanya body yang dibaca — dua jalur kontrak yang saling bertentangan.
3. **Filter manual review** (F5-1, modul ai-verification): laporan
   gps/ts-invalid ber-confidence tinggi lolos dari antrian operator —
   butuh penanda eksplisit (flag), bukan derivasi dari confidence saja.

Modul kedua paling sering gagal: **Auth/Register** (F3-1 HIGH — validasi
email/HP "salah satu" vs spec "keduanya"), satu keputusan + satu baris,
tapi berdampak data (akun zombie).

---

## 5. REKOMENDASI EKSPLISIT

### ⛔ TIDAK READY untuk demo/integrasi FE — blocker berikut harus selesai dulu:

1. **F1-1 [BLOCKER]** Perbaiki Dockerfile: pindahkan `npx prisma generate`
   SEBELUM `npm run build` (atau gabung dalam satu RUN setelah install),
   lalu QA re-test dari clean state (`down -v` → `--profile full up -d
   --build`) + re-test tetangga 1.2 (404 envelope) & 1.6 (.env.example)
   sesuai aturan regresi #4.

### Setelah F1-1 ditutup, rekomendasi menjadi READY, DENGAN catatan backlog
### berikut WAJIB dikerjakan sebelum produksi penuh (tidak memblokir demo MVP):

Prioritas tinggi (sebelum rilis non-demo):
- F3-1 [HIGH] register wajib email+HP keduanya (anti akun zombie)
- F4-1 [MEDIUM] validasi foto sesuai Rules.md §2.1 (keputusan desain)
- F5-1 [MEDIUM] penanda manual review utk gps/ts-invalid
- F2-1 [MEDIUM] pulihkan zones GIST index (migration baru, bukan edit lama)

Sebelum sign-off penuh (butuh jawaban owner):
- SA-1 (profanity tolak-vs-flag), SA-2 (refresh token single-use?),
  SA-3/SA-4 (konfirmasi boundary inclusive)

Prioritas rendah / backlog dev:
- F1-6, F4-2, F4-3, F4-4, F7-1, F7-2, F7-3, F7-4, F1-NEW-1 (429 message)

---

### KESIMPULAN SATU KALIMAT
Fondasi backend (state machine, RBAC, audit trail, async pipeline, envelope,
rate limit, Swagger) TERBUKTI SOLID di 98 test case — satu-satunya hal yang
menahan sign-off penuh adalah F1-1 (packaging Docker), yang murni urutan
perintah di Dockerfile dan tidak menyentuh logic aplikasi; perbaiki, re-test,
dan backend siap rekomendasi READY untuk demo & integrasi FE.
