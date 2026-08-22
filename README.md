# 🏛️ LaporKita Backend — City Intelligence Platform

<p align="center">
  <strong>Platform Intelijen Perkotaan & Pengaduan Fasilitas Publik Berbasis AI & Spasial</strong><br>
  <em>Pilot Project: Kota Malang — Entri Kompetisi MAGE 12</em><br>
  <strong>Tim "Saya Akan Lawan" — SMK Telkom Malang</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/NestJS-v11.0-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-Strict_5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-16_PostGIS-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-v7.9-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Redis-v7.0-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/BullMQ-v6.2-FF6600?style=for-the-badge&logo=redis&logoColor=white" alt="BullMQ" />
  <img src="https://img.shields.io/badge/Swagger-OpenAPI_3.0-85EA2D?style=for-the-badge&logo=swagger&logoColor=black" alt="Swagger" />
  <img src="https://img.shields.io/badge/Tests-78%2F78_Passed-success?style=for-the-badge&logo=jest&logoColor=white" alt="Tests" />
  <img src="https://img.shields.io/badge/E2E_Tests-8%2F8_Passed-success?style=for-the-badge&logo=jest&logoColor=white" alt="E2E Tests" />
</p>

---

## 📌 Daftar Isi

1. [Tentang LaporKita](#-tentang-laporkita)
2. [Fitur Unggulan Sistem](#-fitur-unggulan-sistem)
3. [Arsitektur Sistem (Visual Flow)](#-arsitektur-sistem-visual-flow)
4. [Diagram State Machine Laporan](#-diagram-state-machine-laporan)
5. [Daftar Lengkap REST API & Matriks RBAC](#-daftar-lengkap-rest-api--matriks-rbac)
6. [Panduan Instalasi & Menjalankan](#-panduan-instalasi--menjalankan)
7. [Dokumentasi API Swagger / OpenAPI](#-dokumentasi-api-swagger--openapi)
8. [Pengujian & Validasi Kualitas](#-pengujian--validasi-kualitas)
9. [Status Integrasi Eksternal & MOCK](#-status-integrasi-eksternal--mock)
10. [Spesifikasi Lingkungan (.env)](#-spesifikasi-lingkungan-env)

---

## 🌟 Tentang LaporKita

**LaporKita** adalah backend platform intelijen kota (*City Intelligence Platform*) dengan konsep **"From Report to Resolve"** melalui **Digital Accountability Loop**:

```
Report → AI Verification → Smart Priority → Government Action
       → Public Tracking → Citizen Validation → Resolve
```

- **Citizen App (B2C)**: Warga melapor kerusakan (foto + GPS otomatis), memantau progres, memberi dukungan (upvote), dan melakukan *Citizen Validation*.
- **Command Center (B2G)**: Operator OPD (DPUPR, Dishub, Diskominfo) memverifikasi, memprioritaskan, dan menindaklanjuti laporan berdasarkan data.
- **Backend Platform**: Orkestrasi data, pipeline AI asinkron (Computer Vision, XGBoost Decay, Gemini LLM), geocoding OpenStreetMap, rate limiting, dan geofencing Route Alert.

---

## 🚀 Fitur Unggulan Sistem

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             LAPORKITA INTELLIGENCE CORE                          │
├──────────────────────┬──────────────────────┬────────────────────────────────────┤
│ ⚡ Fast Ingestion    │ 🎯 Smart Routing     │ 🛡️ Anti-Abuse & Rate Limiting      │
│ • 202 Accepted       │ • Auto-assign OPD    │ • Idempotency key per submission   │
│ • Async BullMQ Queue │ • Dynamic Weights DB │ • 5-min cancel support window      │
│ • Non-blocking       │ • PostGIS Spatial    │ • Throttler: 10/min reports, 20/min│
├──────────────────────┼──────────────────────┼────────────────────────────────────┤
│ 👥 Citizen Loop      │ 🗺️ OpenStreetMap    │ 🤖 Predictive Policy               │
│ • 100m radius check  │ • Nominatim reverse  │ • Gemini LLM Policy Simulator      │
│ • Dispute re-routing │ • 1 req/s throttled  │ • XGBoost Zone Risk Prediction     │
│ • 7-day auto resolve │ • 4-decimal coord    │ • BMKG Weather Context Integration │
└──────────────────────┴──────────────────────┴────────────────────────────────────┘
```

---

## 📐 Arsitektur Sistem (Visual Flow)

```mermaid
flowchart TD
    subgraph Clients["📱 Client Layer"]
        CitizenApp["Flutter Mobile (Citizen App)"]
        OperatorWeb["Command Center (Web Dashboard)"]
        PolicyPortal["Policy Maker Dashboard"]
    end

    subgraph Gateway["🚪 API Gateway & Common Layer"]
        Prefix["/api/v1 Global Prefix"]
        Swagger["Swagger UI (/api/docs)"]
        RateLimiter["Throttler Guard (@nestjs/throttler)"]
        AuthGuard["JWT Auth Guard & Passport"]
        RBAC["Roles Guard (RBAC per PRD §3)"]
        ValPipe["Global ValidationPipe (class-validator)"]
        Interceptor["Response Envelope Interceptor"]
        Filter["Global Exception Filter"]
    end

    subgraph Modules["🧩 Domain Modules Layer"]
        AuthMod["Auth Module\n(JWT, Refresh Token)"]
        UserMod["Users Module\n(Profile, Gamification Points)"]
        ReportMod["Reports Module\n(State Machine, Upvotes, Validations)"]
        AIVerifyMod["AI Verification Module\n(CV Vision Worker)"]
        SmartPriorityMod["Smart Priority Module\n(Multi-factor Scoring)"]
        MapsMod["Maps Module\n(OSM Nominatim Geocoder)"]
        PredictionMod["Prediction Module\n(XGBoost Zone Metrics & Weather)"]
        PolicyMod["Policy Simulator Module\n(Gemini 2.5 LLM)"]
        NotifMod["Notifications & Route Alert\n(Geofencing Proximity)"]
    end

    subgraph Infra["🗄️ Database & Storage Layer"]
        Postgres["PostgreSQL 16 + PostGIS\n(Prisma ORM 7.9)"]
        Redis["Redis 7 (BullMQ Queue)\n- verify-report\n- reverse-geocode"]
    end

    Clients --> Gateway
    Gateway --> Modules
    Modules --> Infra
```

---

## 🔄 Diagram State Machine Laporan

Status laporan bertransisi secara ketat sesuai **Rules.md §1.1**:

```mermaid
stateDiagram-v2
    [*] --> pending_verification: Submit Laporan (Warga)
    
    pending_verification --> verified: AI Verification / Operator Approval
    pending_verification --> rejected: Ditolak Operator (Note Wajib)
    
    verified --> assigned: Ditugaskan ke OPD / Petugas
    assigned --> in_progress: Pengerjaan Dimulai
    
    in_progress --> completed: Selesai Pengerjaan (+ Bukti Foto Wajib)
    
    completed --> resolved: Citizen Validation (Valid / 7-Hari Auto)
    completed --> disputed: Citizen Validation (Tidak Sesuai)
    
    disputed --> in_progress: Kembali Dikerjakan (+ Urgency Naik)
    
    resolved --> [*]
    rejected --> [*]
```

---

## 📋 Daftar Lengkap REST API & Matriks RBAC

Semua response API dibungkus dalam **Response Envelope Standar**:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 100, "limit": 20, "nextCursor": "uuid" },
  "message": "Operasi berhasil"
}
```

### 1. Autentikasi (`/api/v1/auth`)
| Method | Endpoint | Role Access | Keterangan |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Publik | Registrasi akun warga (202 Accepted, kirim OTP 4-digit via SMS) |
| `POST` | `/api/v1/auth/verify-otp` | Publik | Verifikasi OTP 4-digit & aktivasi akun (`is_active=true`) |
| `POST` | `/api/v1/auth/resend-otp` | Publik | Kirim ulang OTP (Cooldown 45 detik sesuai mockup Figma) |
| `POST` | `/api/v1/auth/login` | Publik | Login email / no. HP + password (Wajib terverifikasi OTP) |
| `POST` | `/api/v1/auth/refresh` | Publik | Rotasi access token via refresh token |

> 📱 **Catatan Provider SMS Gateway & Verifikasi OTP**:
> - Pengiriman SMS di dunia nyata **selalu berbayar** (biaya pulsa/jaringan telco).
> - Backend LaporKita menyediakan provider modular via `SMS_PROVIDER`:
>   - `mock` (Default Dev & Testing): Mencetak OTP ke console/log server `[MOCK SMS] to +62xxx: your OTP is 1234` tanpa biaya.
>   - `zenziva`, `fonnte`, `twilio`: Integrasi gateway SMS/WhatsApp production (memerlukan `SMS_PROVIDER_API_KEY` & `SMS_PROVIDER_BASE_URL`).
> - *Nomor tim untuk uji manual di device / Postman*: `+62 856-4889-8807`.

### 2. Pengguna & Gamifikasi (`/api/v1/users`)
| Method | Endpoint | Role Access | Keterangan |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | Authenticated | Profil user saat ini |
| `PATCH` | `/api/v1/users/me` | Authenticated | Update profil user saat ini |
| `GET` | `/api/v1/users/me/points` | Authenticated | Riwayat poin kontribusi warga |
| `GET` | `/api/v1/users` | `admin` | Daftar seluruh user (Pagination) |
| `GET` | `/api/v1/users/:id` | `admin` | Detail user tertentu |
| `PATCH` | `/api/v1/users/:id` | `admin` | Update role / flag review user |
| `DELETE` | `/api/v1/users/:id` | `admin` | Hapus akun user |

### 3. Laporan Kerusakan Fasilitas (`/api/v1/reports`)
| Method | Endpoint | Role Access | Keterangan |
|---|---|---|---|
| `POST` | `/api/v1/reports` | Authenticated | Submit laporan (Rate limit: 10/min, 202 Accepted) |
| `GET` | `/api/v1/reports` | Publik | List laporan & pin peta (Filter & Cursor Pagination) |
| `GET` | `/api/v1/reports/:id` | Publik | Detail lengkap laporan & timeline status |
| `PATCH` | `/api/v1/reports/:id/status` | `operator`, `admin` | Transisi status pengerjaan laporan |
| `POST` | `/api/v1/reports/:id/support` | Authenticated | Beri upvote / dukungan (Rate limit: 30/min) |
| `DELETE` | `/api/v1/reports/:id/support` | Authenticated | Batalkan upvote (Grace period 5 menit) |
| `POST` | `/api/v1/reports/:id/comments` | Authenticated | Kirim komentar (Rate limit: 20/min, Profanity masked) |
| `GET` | `/api/v1/reports/:id/comments` | Publik | List komentar laporan (Cursor pagination) |
| `POST` | `/api/v1/reports/:id/validate` | Authenticated | Citizen validation (Resolved / Disputed) |
| `POST` | `/api/v1/reports/:id/media` | Authenticated | Tambah foto pengerjaan / penyelesaian |

### 4. Prediksi & Metrik Zona (`/api/v1/predictions`)
| Method | Endpoint | Role Access | Keterangan |
|---|---|---|---|
| `GET` | `/api/v1/predictions/zones` | Publik | Daftar zona Kota Malang & stress level terkini |
| `GET` | `/api/v1/predictions/zones/:zoneId/metrics` | Publik | Histori metrik risiko & cuaca zona |
| `POST` | `/api/v1/predictions/metrics/refresh` | `operator`, `policy_maker`, `admin` | Trigger refresh prediksi risiko seluruh zona |

### 5. Policy Simulator (`/api/v1/policy-simulations`)
| Method | Endpoint | Role Access | Keterangan |
|---|---|---|---|
| `POST` | `/api/v1/policy-simulations` | `policy_maker`, `admin` | Jalankan simulasi kebijakan tata ruang via LLM Gemini |
| `GET` | `/api/v1/policy-simulations` | `policy_maker`, `admin` | Riwayat simulasi kebijakan publik |
| `GET` | `/api/v1/policy-simulations/:id` | `policy_maker`, `admin` | Detail narasi & data proyeksi kebijakan |

### 6. Notifikasi & Route Alert (`/api/v1/notifications` & `/api/v1/route-alerts`)
| Method | Endpoint | Role Access | Keterangan |
|---|---|---|---|
| `POST` | `/api/v1/route-alerts/subscribe` | Authenticated | Daftar / update token FCM & koordinat Route Alert |
| `DELETE` | `/api/v1/route-alerts/unsubscribe` | Authenticated | Hapus langganan Route Alert |
| `POST` | `/api/v1/route-alerts/check` | Authenticated | Trigger simulasi geofencing proximity check (radius 500m) |
| `GET` | `/api/v1/notifications` | Authenticated | List notifikasi in-app pengguna |
| `PATCH` | `/api/v1/notifications/:id/read` | Authenticated | Tandai satu notifikasi telah dibaca |
| `PATCH` | `/api/v1/notifications/read-all` | Authenticated | Tandai seluruh notifikasi telah dibaca |

### 7. Master Data Kategori & Instansi (`/api/v1/categories` & `/api/v1/agencies`)
| Method | Endpoint | Role Access | Keterangan |
|---|---|---|---|
| `GET` | `/api/v1/categories` | Publik | Daftar kategori fasilitas publik aktif |
| `POST` / `PATCH` / `DELETE` | `/api/v1/categories` | `admin` | Manajemen master kategori |
| `GET` | `/api/v1/agencies` | Publik | Daftar instansi / dinas (DPUPR, Dishub, dll) |
| `POST` / `PATCH` / `DELETE` | `/api/v1/agencies` | `admin` | Manajemen master instansi |

---

## 🛠️ Panduan Instalasi & Menjalankan

### 1. Prasyarat Sistem
- **Node.js**: `v20.x` atau lebih baru
- **Docker & Docker Compose**: Untuk PostgreSQL 16 (PostGIS) dan Redis 7
- **npm**: `v10.x` atau lebih baru

### 2. Clone & Setup Environment
```bash
# Clone repository
git clone https://github.com/nabilkencana/Backend-Laporkita.git
cd backend-laporkita

# Salin environment file
cp .env.example .env
```

### 3. Menjalankan Database Stack (Docker)
```bash
# Jalankan PostgreSQL (PostGIS) dan Redis di latar belakang
docker compose up -d
```

### 4. Setup Database & Migrasi Prisma
```bash
# Install seluruh dependensi
npm install

# Generate Prisma Client
npm run db:generate

# Deploy migrasi database
npx prisma migrate deploy

# Seed data awal (3 Instansi, 5 Kategori, 5 Zona Malang, Bobot Prioritas DB, & Akun Admin)
npm run db:seed
```

### 5. Menjalankan Server Backend
```bash
# Mode Development (Hot Reload)
npm run dev
# atau: npm run start:dev

# Mode Production Build
npm run build
npm run start:prod
```
> Server aktif di: **`http://localhost:3000/api/v1`** (Health check: `GET /api/v1/health`).

---

## 📖 Dokumentasi API Swagger / OpenAPI

Dokumentasi interaktif OpenAPI 3.0 tersedia secara otomatis saat server berjalan:

🔗 **URL Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

Fitur Swagger UI:
- **Try it out** langsung dari browser.
- **Authorize Bearer Token**: Masukkan access token JWT untuk mencoba endpoint yang dilindungi role RBAC.
- Kontrak request, DTO schema, response envelope, dan HTTP status code.

---

## 🧪 Pengujian & Validasi Kualitas

Backend LaporKita dilengkapi dengan test suite lengkap (Unit Tests, Audit Trail Integration Tests, dan End-to-End Supertest Tests):

```bash
# 1. Menjalankan seluruh Unit Tests & Integration Tests (13 test suites, 78 tests)
npm test

# 2. Menjalankan End-to-End Tests (Supertest)
npm run test:e2e

# 3. Menjalankan Linter TypeScript strict
npm run lint

# 4. Menjalankan Test Coverage
npm run test:cov
```

---

## 🔌 Status Integrasi Eksternal & MOCK

Modul backend dibangun dengan arsitektur interface adapter yang dapat beralih antara **MOCK** (untuk pengujian lokal & offline) dan **Layanan Eksternal Asli** tanpa mengubah kode pemanggil:

| Modul | Komponen | Status Saat Ini | Cara Beralih ke Asli |
|---|---|---|---|
| `ai-verification` | Computer Vision Service | **HTTP Client + MOCK Fallback** | Jalankan service Python FastAPI (`AI_SERVICE_URL`) |
| `prediction` | XGBoost & BMKG Weather | **HTTP Client + MOCK Fallback** | Jalankan microservice Python (`AI_SERVICE_URL`) |
| `policy-simulator` | Gemini 2.5 Flash LLM | **Gemini API + MOCK Fallback** | Isi `GEMINI_API_KEY` di file `.env` |
| `maps` | OpenStreetMap / Nominatim | **Aktif (OSM Public API)** | Menggunakan public Nominatim (Throttled 1 req/s) |
| `notifications` | FCM Push Notifications | **In-App Notif (FCM TODO)** | Tambahkan Firebase Admin SDK credentials |

### Rekomendasi Urutan Integrasi Eksternal Selanjutnya:
1. **Google Gemini API Key**: Cukup pasang `GEMINI_API_KEY` di `.env` untuk mengaktifkan output LLM asli pada Policy Simulator.
2. **AI Microservice Python FastAPI**: Deploy FastAPI service dengan model YOLOv11 & XGBoost untuk evaluasi akurasi Computer Vision real-time.
3. **Firebase Cloud Messaging (FCM)**: Pasang `firebase-admin` service account untuk push notification background ke aplikasi Flutter mobile warga.
4. **Self-Hosted Nominatim / Photon**: Jika skala laporan meningkat pesat, swap `NOMINATIM_BASE_URL` ke server lokal/Photon.

---

## ⚙️ Spesifikasi Lingkungan (.env)

| Variabel | Deskripsi | Default / Contoh |
|---|---|---|
| `NODE_ENV` | Mode runtime aplikasi | `development` |
| `PORT` | Port server aplikasi | `3000` |
| `DATABASE_URL` | Koneksi PostgreSQL PostGIS | `postgresql://laporkita:laporkita_dev@localhost:5433/laporkita_db?schema=public` |
| `REDIS_URL` | URL instance Redis | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key Access Token | `[Min 32 characters secret key]` |
| `JWT_REFRESH_SECRET` | Secret key Refresh Token | `[Min 32 characters secret key]` |
| `NOMINATIM_BASE_URL` | Base URL Geocoding OpenStreetMap | `https://nominatim.openstreetmap.org` |
| `NOMINATIM_USER_AGENT` | Header User-Agent wajib OSM | `LaporKita-CityIntelligence/1.0 (contact@laporkita.id)` |
| `AI_SERVICE_URL` | URL AI Microservice Python | `http://localhost:8000` |
| `GEMINI_API_KEY` | API Key Google Gemini Flash | `AIzaSy...` |
| `MALANG_LAT_MIN` | Batas Selatan Kota Malang | `-8.2500` |
| `MALANG_LAT_MAX` | Batas Utara Kota Malang | `-7.8500` |
| `MALANG_LNG_MIN` | Batas Barat Kota Malang | `112.5000` |
| `MALANG_LNG_MAX` | Batas Timur Kota Malang | `112.8000` |

---

<p align="center">
  Dibuat dengan ❤️ dan dedikasi oleh <strong>Tim "Saya Akan Lawan" — SMK Telkom Malang</strong><br>
  <em>Entri Kompetisi MAGE 12 (Multimedia and Game Event)</em>
</p>
