# 🏛️ LaporKita Backend — City Intelligence Platform

<p align="center">
  <strong>Platform Intelijen Perkotaan &amp; Pengaduan Fasilitas Publik Berbasis AI &amp; Spasial</strong><br>
  <em>Pilot Project: Kota Malang — Entri Kompetisi MAGE 12 (MAGEITS)</em><br>
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
  <img src="https://img.shields.io/badge/Tests-110%2F110_Passed-success?style=for-the-badge&logo=jest&logoColor=white" alt="Tests" />
  <img src="https://img.shields.io/badge/E2E_Tests-8%2F8_Passed-success?style=for-the-badge&logo=jest&logoColor=white" alt="E2E Tests" />
</p>

---

## 📌 Daftar Isi

1. [Tentang LaporKita](#-tentang-laporkita)
2. [Tech Stack & Dependensi](#-tech-stack--dependensi)
3. [Arsitektur Sistem High-Level](#-arsitektur-sistem-high-level)
4. [Arsitektur Modular NestJS](#-arsitektur-modular-nestjs)
5. [Alur Async AI Pipeline](#-alur-async-ai-pipeline)
6. [Diagram State Machine Laporan](#-diagram-state-machine-laporan)
7. [Entity Relationship Diagram ERD](#-entity-relationship-diagram-erd)
8. [Daftar Lengkap REST API dan Matriks RBAC](#-daftar-lengkap-rest-api-dan-matriks-rbac)
9. [Panduan Instalasi dan Menjalankan](#-panduan-instalasi-dan-menjalankan)
10. [Troubleshooting Database dan Migrasi](#-troubleshooting-database-dan-migrasi)
11. [Dokumentasi API Swagger OpenAPI](#-dokumentasi-api-swagger--openapi)
12. [Pengujian dan Validasi Kualitas](#-pengujian-dan-validasi-kualitas)
13. [Status Integrasi Eksternal dan MOCK](#-status-integrasi-eksternal-dan-mock)
14. [Spesifikasi Lingkungan env](#-spesifikasi-lingkungan-env)
15. [Struktur Direktori Proyek](#-struktur-direktori-proyek)
16. [Keamanan Arsitektur](#-keamanan-arsitektur)
17. [KPI dan Target Performa](#-kpi-dan-target-performa)

---

## 🌟 Tentang LaporKita

**LaporKita** adalah backend *City Intelligence Platform* dengan konsep **"From Report to Resolve"** melalui **Digital Accountability Loop**. Platform ini menghubungkan warga, pemerintah daerah, dan kecerdasan buatan dalam satu ekosistem pelaporan yang transparan, terdata, dan dapat dipertanggungjawabkan.

```
  📸 Warga Foto Kerusakan
          │
          ▼
  📤 Submit Laporan (3-tap, 202 Accepted)
          │
          ▼
  🤖 AI Verification async (BullMQ + CV YOLOv11)
          │
          ▼
  🎯 Smart Priority Engine (multi-factor scoring)
          │
          ▼
  📌 Ditugaskan ke OPD / Petugas Lapangan
          │
          ▼
  🔧 In Progress → Completed (bukti foto wajib)
          │
          ▼
  👍 Citizen Validation ──────► ✅ Resolved
          │
          └──── 👎 Disputed ──► 🔁 Kembali Dikerjakan
```

| Layer | Deskripsi |
|---|---|
| **Citizen App (B2C)** | Warga melapor kerusakan (foto + GPS), pantau progres, upvote, Citizen Validation |
| **Command Center (B2G)** | Operator OPD (DPUPR, Dishub, Diskominfo) verifikasi, prioritas, tindak lanjut |
| **Backend Platform** | Orkestrasi data, async AI pipeline, geocoding OSM, rate limiting, geofencing Route Alert |

---

## 🛠️ Tech Stack & Dependensi

| Kategori | Teknologi | Versi |
|---|---|---|
| Runtime | Node.js | v20+ |
| Framework | NestJS | v11.0 |
| Bahasa | TypeScript (strict mode) | 5.7 |
| ORM | Prisma | v7.9 |
| Database | PostgreSQL + PostGIS | v16 / 3.4 |
| Job Queue | BullMQ + Redis | v6.2 / v7.0 |
| Auth | JWT (access + refresh) + bcrypt | — |
| HTTP Client | Axios | v1.19 |
| Validasi | class-validator + class-transformer | — |
| File Upload | Multer + Sharp (kompresi) | — |
| Storage | Supabase Storage (S3-compatible) | — |
| Geocoding | OpenStreetMap Nominatim | Public API |
| AI Gateway | HTTP client → AI Service FastAPI | — |
| LLM | Google Gemini 2.5 Flash | — |
| Push Notif | Firebase Cloud Messaging (FCM) | — |
| Dokumentasi | Swagger / OpenAPI 3.0 | — |
| Testing | Jest + Supertest | — |
| Scheduler | @nestjs/schedule (cron) | — |
| Rate Limit | @nestjs/throttler | — |

---

## 📐 Arsitektur Sistem High-Level

```mermaid
flowchart TD
    subgraph Clients["📱 Client Layer"]
        direction LR
        CitizenApp["Flutter Mobile\n(Citizen App — B2C)"]
        OperatorWeb["Command Center\n(Web Dashboard — B2G)"]
        PolicyPortal["Policy Maker\nDashboard"]
    end

    subgraph Gateway["🚪 API Gateway & Common Layer"]
        RateLimiter["Throttler Guard\n@nestjs/throttler"]
        AuthGuard["JWT Auth Guard\nPassport-JWT"]
        RBAC["Roles Guard\ncitizen / operator / policy_maker / admin"]
        ValPipe["Global ValidationPipe\nwhitelist + forbidNonWhitelisted"]
        Interceptor["Response Envelope Interceptor\n{success, data, meta, message}"]
        Filter["Global Exception Filter\nHTTP + Prisma errors"]
        Swagger["Swagger UI\n/api/docs"]
    end

    subgraph Modules["🧩 Domain Modules"]
        AuthMod["🔑 Auth\nJWT, Refresh Token, OTP SMS"]
        UserMod["👤 Users\nProfile, Gamification Points"]
        ReportMod["📋 Reports\nState Machine, Upvotes, Validation"]
        AIVerifyMod["🤖 AI Verification\nBullMQ Worker, CV Client"]
        SmartPriorityMod["🎯 Smart Priority\nMulti-factor Scoring Engine"]
        MapsMod["🗺️ Maps\nOSM Nominatim Geocoder"]
        PredictionMod["📊 Prediction\nXGBoost + BMKG Weather"]
        PolicyMod["🏛️ Policy Simulator\nGemini 2.5 Flash LLM"]
        NotifMod["🔔 Notifications\nRoute Alert, Cron Geofencing"]
        CategoryMod["📂 Categories & Agencies\nMaster Data"]
    end

    subgraph Queue["⚡ Async Queue Layer"]
        BullMQ["BullMQ Queues\nverify-report\nreverse-geocode"]
        Workers["Background Workers\nAI Verification Worker\nGeocode Worker"]
    end

    subgraph Infra["🗄️ Infrastructure Layer"]
        Postgres["PostgreSQL 16 + PostGIS\nPrisma ORM v7.9\nsrc/prisma/migrations/"]
        Redis["Redis 7\nBullMQ + ioredis"]
        Supabase["Supabase Storage\nS3-compatible\nfoto laporan"]
    end

    subgraph External["🌐 External Services"]
        OSM["OpenStreetMap\nNominatim"]
        AIService["AI Microservice\nFastAPI Python\nYOLOv11 + XGBoost"]
        GeminiAPI["Google Gemini API\n2.5 Flash"]
        FCM["Firebase\nCloud Messaging"]
        BMKG["BMKG\nWeather API"]
        SMSGw["SMS Gateway\nmock/fonnte/twilio"]
    end

    Clients -->|"REST HTTPS + JWT Bearer"| Gateway
    Gateway --> Modules
    Modules --> Queue
    Queue --> Workers
    Workers --> Infra
    Modules --> Infra
    Modules -->|"HTTP calls"| External
```

---

## 🧩 Arsitektur Modular NestJS

```mermaid
graph LR
    subgraph Core["⚙️ Core & Common"]
        PS["PrismaService\nDatabase Client Singleton"]
        G["Guards\nAuth + Roles + Throttler"]
        I["Interceptors\nResponse Envelope"]
        F["Exception Filters"]
        D["Custom Decorators\n@CurrentUser @Roles @ApiAuth"]
    end

    subgraph Domain["🧩 Domain Modules"]
        Auth["AuthModule\nregister / verify-otp\nlogin / refresh token"]
        Users["UsersModule\nprofile CRUD\ngamification points"]
        Reports["ReportsModule\nsubmit 202 Accepted\nstate transitions\nupvote / comments\ncitizen validation"]
        AIV["AIVerificationModule\nBullMQ Worker\nCV HTTP client\nMOCK fallback"]
        SP["SmartPriorityModule\nscoring engine\ndynamic weights DB"]
        Maps["MapsModule\nNominatim wrapper\nrate-limit 1 req/s"]
        Pred["PredictionModule\nzone metrics\nXGBoost HTTP\nBMKG weather"]
        Pol["PolicySimulatorModule\nGemini 2.5 Flash\nMOCK fallback"]
        Notifs["NotificationsModule\nin-app notifications\nRoute Alert cron\nFCM planned"]
        Cat["CategoriesModule\nmaster data\ndefault agency routing"]
        Ag["AgenciesModule\ninstansi OPD\nuser assignment"]
    end

    Auth --> PS
    Reports --> PS
    Reports --> AIV
    Reports --> SP
    Reports --> Maps
    Reports --> Notifs
    Notifs --> PS
    Pred --> PS
    Pol --> PS
    Users --> PS
    G --> Auth
    I --> Domain
    F --> Domain
    D --> Domain
```

---

## ⚡ Alur Async AI Pipeline

Semua laporan baru diproses **asinkron via BullMQ** sehingga response client selalu cepat (`202 Accepted`):

```mermaid
sequenceDiagram
    autonumber
    participant CA as 📱 Citizen App
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as BullMQ Queue
    participant W as AI Worker
    participant AI as AI Microservice (FastAPI)
    participant NS as Notification Service

    CA->>API: POST /api/v1/reports<br/>(foto, GPS, kategori, idempotency_key)
    API->>DB: INSERT report<br/>status = pending_verification
    API-->>CA: 202 Accepted {reportId, status}
    API->>Q: Enqueue verify-report job<br/>{reportId, imageUrl, lat, lng}

    Q->>W: Dequeue job

    W->>AI: POST /verify {imageUrl, lat, lng}
    AI-->>W: {valid, confidence, severity, category}

    alt confidence >= 0.6 (VALID)
        W->>DB: UPDATE status = verified<br/>ai_confidence_score, damage_severity
        W->>API: Trigger Smart Priority Engine
        API->>DB: UPDATE urgency_score (multi-factor)
        W->>NS: Emit event: laporan terverifikasi
        NS-->>CA: Push / in-app notif
    else confidence < 0.6 (PERLU REVIEW)
        W->>DB: UPDATE needs_manual_review = true
        W->>NS: Emit event: perlu review operator
        NS-->>API: Notif operator Command Center
    end

    W->>Q: Enqueue reverse-geocode job<br/>{reportId, lat, lng}
    Q->>W: Dequeue geocode job
    W->>API: GET Nominatim /reverse?lat&lon
    API-->>W: {address_text}
    W->>DB: UPDATE address_text on report
```

---

## 🔄 Diagram State Machine Laporan

Status laporan bertransisi secara ketat sesuai **Rules.md §1.1** — semua transisi di-validate di service layer:

```mermaid
stateDiagram-v2
    [*] --> pending_verification : Submit Laporan\n202 Accepted

    pending_verification --> verified : AI Verification Lulus\nconfidence >= 0.6\natau Operator Manual Approve
    pending_verification --> rejected : Ditolak Operator\nnote wajib diisi

    verified --> assigned : Ditugaskan ke OPD\nassigned_officer_id set

    assigned --> in_progress : Pengerjaan Dimulai\noperator update status

    in_progress --> completed : Selesai Pengerjaan\ncompletion_photo wajib

    completed --> resolved : Citizen Validation Valid\natau 7-Hari Auto-Resolve cron
    completed --> disputed : Citizen Validation Tidak Sesuai\nnote dispute wajib

    disputed --> in_progress : Kembali Dikerjakan\nurgency_score dinaikkan otomatis

    resolved --> [*]
    rejected --> [*]
```

> **Catatan penting:**
> - `needs_manual_review = true` jika AI confidence < 0.6, anomali GPS/timestamp, atau user terflag (>3 reject/30 hari)
> - Saat `disputed → in_progress`: `urgency_score` otomatis dinaikkan agar laporan naik antrian prioritas
> - Auto-resolve setelah 7 hari jika warga tidak melakukan validasi (cron job terjadwal)

---

## 🗄️ Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    users {
        UUID id PK
        VARCHAR full_name
        VARCHAR email UK
        VARCHAR phone_number UK
        VARCHAR password_hash
        ENUM role
        UUID agency_id FK
        INT contribution_points
        VARCHAR avatar_url
        BOOLEAN is_active
        TIMESTAMP phone_verified_at
        BOOLEAN is_flagged_for_review
        TEXT refresh_token_hash
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    agencies {
        UUID id PK
        VARCHAR name
        ENUM type
        VARCHAR contact_email
        TIMESTAMP created_at
    }

    categories {
        UUID id PK
        VARCHAR name
        VARCHAR icon_url
        UUID default_agency_id FK
        FLOAT urgency_weight
    }

    reports {
        UUID id PK
        VARCHAR report_code UK
        UUID reporter_id FK
        UUID category_id FK
        UUID assigned_agency_id FK
        UUID assigned_officer_id FK
        TEXT description
        DECIMAL latitude
        DECIMAL longitude
        VARCHAR address_text
        ENUM status
        FLOAT ai_confidence_score
        FLOAT damage_severity
        FLOAT urgency_score
        BOOLEAN needs_manual_review
        VARCHAR idempotency_key UK
        INT support_count
        INT view_count
        TIMESTAMP estimated_completion_at
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    report_media {
        UUID id PK
        UUID report_id FK
        ENUM type
        VARCHAR url
        UUID uploaded_by FK
        TIMESTAMP created_at
    }

    report_status_history {
        UUID id PK
        UUID report_id FK
        ENUM status
        TEXT note
        UUID changed_by FK
        TIMESTAMP created_at
    }

    report_supports {
        UUID id PK
        UUID report_id FK
        UUID user_id FK
        TIMESTAMP created_at
    }

    report_comments {
        UUID id PK
        UUID report_id FK
        UUID user_id FK
        TEXT content
        BOOLEAN is_flagged
        TIMESTAMP created_at
    }

    citizen_validations {
        UUID id PK
        UUID report_id FK
        UUID user_id FK
        BOOLEAN is_valid
        TEXT note
        TIMESTAMP created_at
    }

    contribution_points_log {
        UUID id PK
        UUID user_id FK
        INT points
        ENUM reason
        UUID reference_report_id FK
        TIMESTAMP created_at
    }

    zones {
        UUID id PK
        VARCHAR name
        GEOMETRY geo_boundary
        ENUM stress_level
        TIMESTAMP updated_at
    }

    zone_metrics {
        UUID id PK
        UUID zone_id FK
        INT report_density
        JSONB weather_context
        FLOAT traffic_density
        FLOAT flood_risk_probability
        TIMESTAMP recorded_at
    }

    policy_simulations {
        UUID id PK
        UUID requested_by FK
        TEXT prompt_text
        UUID zone_id FK
        TEXT result_narrative
        JSONB result_data
        TIMESTAMP created_at
    }

    route_alert_subscriptions {
        UUID id PK
        UUID user_id FK UK
        VARCHAR device_token
        DECIMAL last_lat
        DECIMAL last_long
        TIMESTAMP updated_at
    }

    notifications {
        UUID id PK
        UUID user_id FK
        ENUM type
        VARCHAR title
        TEXT body
        UUID reference_report_id FK
        BOOLEAN is_read
        TIMESTAMP created_at
    }

    otp_verifications {
        UUID id PK
        UUID user_id FK
        VARCHAR phone_number
        VARCHAR otp_code_hash
        ENUM purpose
        TIMESTAMP expires_at
        INT attempt_count
        BOOLEAN is_used
        TIMESTAMP last_sent_at
        TIMESTAMP created_at
    }

    users ||--o{ reports : "melapor"
    users ||--o{ reports : "ditugaskan"
    users ||--o| agencies : "bekerja di"
    agencies ||--o{ reports : "menangani"
    categories ||--o{ reports : "dikategorikan"
    agencies ||--o{ categories : "default routing"
    reports ||--o{ report_media : "memiliki media"
    reports ||--o{ report_status_history : "riwayat status"
    reports ||--o{ report_supports : "didukung warga"
    reports ||--o{ report_comments : "dikomentari"
    reports ||--o{ citizen_validations : "divalidasi"
    users ||--o{ report_supports : "memberi dukungan"
    users ||--o{ report_comments : "menulis komentar"
    users ||--o{ citizen_validations : "memvalidasi"
    users ||--o{ contribution_points_log : "poin kontribusi"
    users ||--o{ policy_simulations : "mengajukan simulasi"
    users ||--o| route_alert_subscriptions : "berlangganan alert"
    users ||--o{ notifications : "menerima notif"
    users ||--o{ otp_verifications : "verifikasi OTP"
    zones ||--o{ zone_metrics : "punya histori metrik"
    zones ||--o{ policy_simulations : "subjek simulasi"
    reports ||--o{ notifications : "memicu notif"
```

---

## 📋 Daftar Lengkap REST API dan Matriks RBAC

Semua response dibungkus dalam **Response Envelope Standar**:

```json
{
  "success": true,
  "data": { "...": "..." },
  "meta": { "total": 100, "limit": 20, "nextCursor": "uuid" },
  "message": "Operasi berhasil"
}
```

### 1. Autentikasi — `/api/v1/auth`

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/auth/register` | Publik | Registrasi (202 Accepted, kirim OTP 4-digit via SMS) |
| `POST` | `/auth/verify-otp` | Publik | Verifikasi OTP → aktivasi akun (`is_active=true`) |
| `POST` | `/auth/resend-otp` | Publik | Kirim ulang OTP (cooldown 45 detik) |
| `POST` | `/auth/login` | Publik | Login email/HP + password (wajib terverifikasi OTP) |
| `POST` | `/auth/refresh` | Publik | Rotasi access token via refresh token (single-use) |

> **📱 SMS Gateway:** Modular via `SMS_PROVIDER` env — `mock` (log ke console, gratis) atau `fonnte`/`twilio`/`zenziva` untuk production.

### 2. Pengguna & Gamifikasi — `/api/v1/users`

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/users/me` | Authenticated | Profil user saat ini |
| `PATCH` | `/users/me` | Authenticated | Update profil user saat ini |
| `GET` | `/users/me/points` | Authenticated | Riwayat poin kontribusi |
| `GET` | `/users` | `admin` | Daftar seluruh user (cursor pagination) |
| `GET` | `/users/:id` | `admin` | Detail user tertentu |
| `PATCH` | `/users/:id` | `admin` | Update role / flag review user |
| `DELETE` | `/users/:id` | `admin` | Hapus akun user |

### 3. Laporan Kerusakan — `/api/v1/reports`

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/reports` | Authenticated | Submit laporan (Rate limit 10/min, **202 Accepted**) |
| `GET` | `/reports` | Publik | List laporan & pin peta (filter + cursor pagination) |
| `GET` | `/reports/:id` | Publik | Detail + timeline status audit trail |
| `PATCH` | `/reports/:id/status` | `operator`, `admin` | Transisi status laporan |
| `POST` | `/reports/:id/support` | Authenticated | Beri upvote (rate limit 30/min) |
| `DELETE` | `/reports/:id/support` | Authenticated | Batalkan upvote (grace period 5 menit) |
| `POST` | `/reports/:id/comments` | Authenticated | Kirim komentar (rate limit 20/min, profanity masked) |
| `GET` | `/reports/:id/comments` | Publik | List komentar (cursor pagination) |
| `POST` | `/reports/:id/validate` | Authenticated | Citizen validation (`resolved` / `disputed`) |
| `POST` | `/reports/:id/media` | Authenticated | Upload foto pengerjaan / penyelesaian |

### 4. Prediksi & Metrik Zona — `/api/v1/predictions`

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/predictions/zones` | Publik | Daftar zona Kota Malang & stress level |
| `GET` | `/predictions/zones/:zoneId/metrics` | Publik | Histori metrik risiko & cuaca per zona |
| `POST` | `/predictions/metrics/refresh` | `operator`, `policy_maker`, `admin` | Trigger refresh prediksi seluruh zona |

### 5. Policy Simulator — `/api/v1/policy-simulations`

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/policy-simulations` | `policy_maker`, `admin` | Jalankan simulasi kebijakan via Gemini LLM |
| `GET` | `/policy-simulations` | `policy_maker`, `admin` | Riwayat simulasi kebijakan |
| `GET` | `/policy-simulations/:id` | `policy_maker`, `admin` | Detail narasi & proyeksi kebijakan |

### 6. Notifikasi & Route Alert — `/api/v1/notifications` & `/api/v1/route-alerts`

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/route-alerts/subscribe` | Authenticated | Daftar / update token FCM & koordinat |
| `DELETE` | `/route-alerts/unsubscribe` | Authenticated | Hapus langganan Route Alert |
| `POST` | `/route-alerts/check` | Authenticated | Trigger geofencing proximity check (500m) |
| `GET` | `/notifications` | Authenticated | List notifikasi in-app |
| `PATCH` | `/notifications/:id/read` | Authenticated | Tandai satu notifikasi dibaca |
| `PATCH` | `/notifications/read-all` | Authenticated | Tandai semua notifikasi dibaca |

### 7. Master Data — `/api/v1/categories` & `/api/v1/agencies`

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/categories` | Publik | Daftar kategori fasilitas aktif |
| `POST` / `PATCH` / `DELETE` | `/categories` | `admin` | Manajemen master kategori |
| `GET` | `/agencies` | Publik | Daftar instansi OPD |
| `POST` / `PATCH` / `DELETE` | `/agencies` | `admin` | Manajemen master instansi |

### Matriks RBAC

```mermaid
flowchart LR
    subgraph Roles["User Roles"]
        C["👤 citizen"]
        O["🏢 operator"]
        PM["📊 policy_maker"]
        A["⚙️ admin"]
    end

    subgraph Access["Hak Akses per Modul"]
        Pub["🌐 Public\n(tanpa auth)"]
        Auth["🔒 Authenticated\n(semua role)"]
        OpA["🔧 Operator + Admin\nverifikasi & status laporan"]
        PMonly["📋 Policy Maker + Admin\nPolicy Simulator"]
        AdminOnly["⚙️ Admin Only\nmanajemen user, kategori, instansi"]
    end

    C --> Auth
    O --> Auth
    O --> OpA
    PM --> Auth
    PM --> PMonly
    A --> Auth
    A --> OpA
    A --> PMonly
    A --> AdminOnly
```

---

## 🚀 Panduan Instalasi dan Menjalankan

### Prasyarat

| Alat | Versi Minimum | Cara Install |
|---|---|---|
| Node.js | v20.x | [nodejs.org](https://nodejs.org) atau `nvm install 20` |
| npm | v10.x | Sudah bundled dengan Node.js v20 |
| Docker | v24+ | [docker.com](https://docker.com) |
| Docker Compose | v2.x | Bundled dengan Docker Desktop |

### Setup Lengkap (Dev)

```bash
# 1. Clone repository
git clone https://github.com/nabilkencana/Backend-Laporkita.git
cd backend-laporkita

# 2. Setup environment variables
cp .env.example .env
# Edit .env sesuai kebutuhan (DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, dll.)

# 3. Jalankan database stack
docker compose up -d postgres redis
# Tunggu health check OK (~15 detik)

# 4. Install dependensi Node.js
npm install

# 5. Generate Prisma Client
npm run db:generate

# 6. ⚠️ PENTING: Apply migrasi ke database
npm run db:migrate:prod

# 7. Seed data awal
#    (3 instansi OPD, 5 kategori, 5 zona Malang, bobot prioritas, akun admin)
npm run db:seed

# 8. Jalankan server development
npm run dev

# ✅ Server: http://localhost:3000/api/v1
# ✅ Swagger: http://localhost:3000/api/docs
# ✅ Health:  GET http://localhost:3000/api/v1/health
```

### Full Docker Stack

```bash
# Jalankan semua service (postgres + redis + app)
docker compose --profile full up -d

# Apply migrasi dari dalam container
docker exec -it laporkita_app npm run db:migrate:prod

# Seed data awal
docker exec -it laporkita_app npm run db:seed
```

### NPM Scripts Lengkap

| Script | Perintah | Keterangan |
|---|---|---|
| `npm run dev` | `nest start --watch` | Development mode dengan hot reload |
| `npm run build` | `nest build` | Build production bundle ke `./dist/` |
| `npm run start:prod` | `node dist/main` | Jalankan hasil build production |
| `npm run db:generate` | `prisma generate` | Regenerate Prisma Client dari schema |
| `npm run db:migrate` | `prisma migrate dev` | Buat & apply migrasi baru (dev only) |
| `npm run db:migrate:prod` | `prisma migrate deploy` | Apply migrasi ke database (staging/prod) |
| `npm run db:push` | `prisma db push` | Push schema tanpa file migrasi (prototyping) |
| `npm run db:studio` | `prisma studio` | GUI browser untuk inspect database |
| `npm run db:reset` | `prisma migrate reset` | Reset database + re-migrate + re-seed |
| `npm run db:seed` | `ts-node src/prisma/seed.ts` | Seed data awal |
| `npm test` | `jest` | Jalankan seluruh unit + integration tests |
| `npm run test:e2e` | `jest --config test/jest-e2e.json` | End-to-end tests (Supertest) |
| `npm run test:cov` | `jest --coverage` | Coverage report (HTML di `./coverage/`) |
| `npm run lint` | `eslint ... --fix` | Lint & auto-fix TypeScript |

---

## 🚨 Troubleshooting Database dan Migrasi

### Error P2021: Table does not exist

```
PrismaClientKnownRequestError: The table 'public.route_alert_subscriptions' does not exist
```

Error ini terjadi karena **migrasi belum dijalankan** ke database. Tabel sudah didefinisikan di schema & migration SQL, tapi belum di-apply ke database instance yang sedang berjalan.

```mermaid
flowchart TD
    Err["🔴 Error P2021\ntable does not exist"] --> Q1{Data di DB\nperlu dipertahankan?}

    Q1 -->|Ya| Mig["Jalankan migrasi saja\ntanpa reset"]
    Q1 -->|Tidak| Reset["Reset total\ndata hilang"]

    Mig --> M1["Dari host machine:\nnpm run db:migrate:prod"]
    Mig --> M2["Dari dalam container:\ndocker exec -it laporkita_app\nnpm run db:migrate:prod"]
    Mig --> M3["Manual DATABASE_URL:\nDATABASE_URL=postgresql://laporkita:laporkita_dev@localhost:5433/laporkita_db npx prisma migrate deploy --schema=src/prisma/schema.prisma"]

    Reset --> R1["docker compose down -v"]
    R1 --> R2["docker compose --profile full up -d"]
    R2 --> R3["docker exec laporkita_app\nnpm run db:migrate:prod"]
    R3 --> R4["docker exec laporkita_app\nnpm run db:seed"]

    M1 --> OK["✅ Tabel terbuat\nRestart app jika perlu"]
    M2 --> OK
    M3 --> OK
    R4 --> OK
```

**Solusi cepat:**

```bash
# Option 1: Dari host (database port 5433 di-expose)
DATABASE_URL="postgresql://laporkita:laporkita_dev@localhost:5433/laporkita_db?schema=public" \
  npx prisma migrate deploy --schema=src/prisma/schema.prisma

# Option 2: Dari dalam container app
docker exec -it laporkita_app npm run db:migrate:prod

# Option 3: Reset total (data hilang!)
docker compose down -v && docker compose --profile full up -d
docker exec -it laporkita_app npm run db:migrate:prod
docker exec -it laporkita_app npm run db:seed
```

### Error: PostGIS extension tidak ada

```bash
docker exec -it laporkita_postgres psql -U laporkita -d laporkita_db
# Di dalam psql:
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

### Perbedaan DATABASE_URL berdasarkan environment

| Context | DATABASE_URL |
|---|---|
| Host machine (npm run dev) | `postgresql://laporkita:laporkita_dev@localhost:5433/laporkita_db?schema=public` |
| Dalam Docker container | `postgresql://laporkita:laporkita_dev@postgres:5432/laporkita_db?schema=public` |

> **Port 5433** di host = port **5432** di dalam container postgres (mapped via docker-compose).

---

## 📖 Dokumentasi API Swagger / OpenAPI

Dokumentasi interaktif OpenAPI 3.0 tersedia otomatis saat server berjalan:

🔗 **Swagger UI:** [`http://localhost:3000/api/docs`](http://localhost:3000/api/docs)

```mermaid
flowchart LR
    Dev["Developer / QA"] -->|Buka browser| UI["Swagger UI\nlocalhost:3000/api/docs"]
    UI -->|Authorize Bearer| JWT["Input JWT\naccess token dari /auth/login"]
    JWT -->|Try it out| Endpoints["Coba semua endpoint\nlangsung dari browser"]
    Endpoints -->|Live response| UI
```

**Fitur Swagger UI:**
- **Try it out** langsung dari browser — tanpa perlu Postman
- **Authorize Bearer Token** — masukkan JWT dari `POST /auth/login`
- Schema lengkap: request DTO, response envelope, HTTP status codes, error formats
- Semua endpoint terorganisir per tag domain module

---

## 🧪 Pengujian dan Validasi Kualitas

### Suite Ringkasan

| Tipe Test | Runner | Total | Status |
|---|---|---|---|
| Unit & Integration Tests | Jest | 110 tests / 14 suites | ✅ 110/110 Passed |
| End-to-End Tests | Jest + Supertest | 8 tests | ✅ 8/8 Passed |

### Menjalankan Test

```bash
# Seluruh unit & integration tests
npm test

# End-to-end tests (memerlukan DB running)
npm run test:e2e

# Coverage report HTML (./coverage/)
npm run test:cov

# Linter TypeScript strict
npm run lint
```

---

## 🔌 Status Integrasi Eksternal dan MOCK

Backend menggunakan **Adapter Pattern** — setiap integrasi eksternal bisa beralih antara MOCK dan layanan asli **tanpa mengubah kode pemanggil**:

```mermaid
flowchart LR
    subgraph NestJS["NestJS Modules"]
        AI["AI Verification\nModule"]
        Pred["Prediction\nModule"]
        Pol["Policy Simulator\nModule"]
        Maps["Maps\nModule"]
        Auth["Auth Module\nOTP"]
        Notifs["Notifications\nModule"]
    end

    subgraph Mock["🟡 MOCK Layer\n(dev / offline)"]
        MAI["Mock CV Response\n{valid: true, confidence: 0.88}"]
        MWeather["Mock Weather\n{rain: false, temp: 28}"]
        MLLM["Mock LLM Narrative\nPredefined text"]
        MSMS["Mock SMS\nconsole.log OTP code"]
        MNotif["In-App Only\nNo FCM push"]
    end

    subgraph Real["🟢 Real External Services"]
        FastAPI["AI Microservice\nFastAPI Python\nYOLOv11 + XGBoost"]
        Nominatim["OSM Nominatim\nGeocoder"]
        Gemini["Google Gemini API\n2.5 Flash"]
        SMSGw["SMS Gateway\nfonnte / twilio"]
        FCM["Firebase\nCloud Messaging"]
        BMKG["BMKG\nWeather API"]
    end

    AI -->|"AI_SERVICE_URL tidak di-set"| MAI
    AI -->|"AI_SERVICE_URL set"| FastAPI

    Pred -->|"AI_SERVICE_URL tidak di-set"| MWeather
    Pred -->|"AI_SERVICE_URL set"| FastAPI
    Pred -->|"AI_SERVICE_URL set"| BMKG

    Pol -->|"GEMINI_API_KEY tidak di-set"| MLLM
    Pol -->|"GEMINI_API_KEY set"| Gemini

    Maps -->|"Always active"| Nominatim

    Auth -->|"SMS_PROVIDER=mock"| MSMS
    Auth -->|"SMS_PROVIDER=fonnte"| SMSGw

    Notifs -->|"FCM TODO"| MNotif
    Notifs -->|"Firebase credentials set"| FCM
```

### Status Terkini

| Modul | Komponen | Status Saat Ini | Cara Aktifkan Asli |
|---|---|---|---|
| `ai-verification` | Computer Vision Service | HTTP Client + **MOCK Fallback** | Deploy FastAPI, isi `AI_SERVICE_URL` |
| `prediction` | XGBoost + BMKG Weather | HTTP Client + **MOCK Fallback** | Deploy FastAPI, isi `AI_SERVICE_URL` |
| `policy-simulator` | Gemini 2.5 Flash LLM | Gemini API + **MOCK Fallback** | Isi `GEMINI_API_KEY` di `.env` |
| `maps` | OpenStreetMap Nominatim | ✅ **Aktif** (OSM Public API) | Throttled 1 req/s via BullMQ queue |
| `notifications` | FCM Push | In-app only (**FCM TODO**) | Tambah Firebase Admin SDK + credentials |
| `auth` | SMS Gateway OTP | **MOCK** (log ke console) | Set `SMS_PROVIDER=fonnte` atau `twilio` |

### Urutan Integrasi yang Direkomendasikan

1. **Google Gemini API Key** — set `GEMINI_API_KEY` di `.env` → Policy Simulator LLM langsung aktif
2. **AI Microservice Python FastAPI** — deploy service dengan YOLOv11 & XGBoost untuk CV & prediksi real
3. **Firebase Cloud Messaging** — tambahkan service account → push notification ke Flutter mobile
4. **Self-Hosted Nominatim / Photon** — jika volume laporan besar, swap `NOMINATIM_BASE_URL` ke server lokal

---

## ⚙️ Spesifikasi Lingkungan (.env)

```bash
# Salin dari template
cp .env.example .env
```

| Variabel | Deskripsi | Default / Contoh |
|---|---|---|
| `NODE_ENV` | Mode runtime | `development` |
| `PORT` | Port server | `3000` |
| **Database** | | |
| `DATABASE_URL` | Koneksi PostgreSQL PostGIS (host) | `postgresql://laporkita:laporkita_dev@localhost:5433/laporkita_db?schema=public` |
| `REDIS_URL` | URL instance Redis | `redis://localhost:6379` |
| **Auth & Security** | | |
| `JWT_SECRET` | Secret key Access Token | Min 32 karakter acak |
| `JWT_REFRESH_SECRET` | Secret key Refresh Token | Min 32 karakter acak |
| **Geocoding** | | |
| `NOMINATIM_BASE_URL` | Base URL geocoding OSM | `https://nominatim.openstreetmap.org` |
| `NOMINATIM_USER_AGENT` | Header User-Agent wajib OSM | `LaporKita-CityIntelligence/1.0` |
| **AI Services** | | |
| `AI_SERVICE_URL` | URL AI Microservice FastAPI | `http://localhost:8000` |
| `GEMINI_API_KEY` | API Key Google Gemini Flash | `AIzaSy...` |
| **SMS Gateway (OTP)** | | |
| `SMS_PROVIDER` | Provider OTP | `mock` / `fonnte` / `twilio` / `zenziva` |
| `SMS_PROVIDER_API_KEY` | API Key SMS Gateway | `your_api_key` |
| `SMS_PROVIDER_BASE_URL` | Base URL SMS Gateway | `https://api.fonnte.com` |
| `OTP_EXPIRY_MINUTES` | Masa berlaku OTP (menit) | `5` |
| `OTP_RESEND_COOLDOWN_SECONDS` | Cooldown kirim ulang OTP (detik) | `45` |
| `OTP_MAX_ATTEMPTS` | Maks percobaan OTP salah | `5` |
| **Storage** | | |
| `SUPABASE_URL` | Base URL Supabase Project | `https://your-project.supabase.co` |
| `SUPABASE_KEY` | Supabase Service / Anon Key | `eyJhbGciOi...` |
| `SUPABASE_STORAGE_BUCKET` | Nama bucket upload foto | `reports` |
| **Geofencing Kota Malang** | | |
| `MALANG_LAT_MIN` | Batas Selatan | `-8.2500` |
| `MALANG_LAT_MAX` | Batas Utara | `-7.8500` |
| `MALANG_LNG_MIN` | Batas Barat | `112.5000` |
| `MALANG_LNG_MAX` | Batas Timur | `112.8000` |

---

## 📁 Struktur Direktori Proyek

```
backend-laporkita/
├── src/
│   ├── main.ts                          # Entrypoint: Swagger, CORS, global pipes
│   ├── app.module.ts                    # Root module
│   │
│   ├── prisma/
│   │   ├── schema.prisma                # Single source of truth DB schema (16 model)
│   │   ├── seed.ts                      # Seed: 3 OPD, 5 kategori, 5 zona Malang, admin
│   │   ├── prisma.service.ts            # PrismaService singleton
│   │   └── migrations/                  # Prisma migration files
│   │       ├── 20260822070200_init/           # Skema awal lengkap
│   │       ├── 20260822073900_add_user_flag_and_idempotency/
│   │       ├── 20260822082700_add_damage_severity_and_system_config/
│   │       ├── 20260822105814_add_otp_verification/
│   │       ├── 20260822160823_add_manual_review_comment_flag_refresh_token/
│   │       └── 20260822230400_restore_gist_spatial_indexes/
│   │
│   ├── common/
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts        # JWT authentication guard (Passport-JWT)
│   │   │   └── roles.guard.ts           # RBAC roles guard
│   │   ├── interceptors/
│   │   │   └── response.interceptor.ts  # Response envelope {success, data, meta}
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts # Global exception handler
│   │   └── decorators/
│   │       ├── current-user.decorator.ts
│   │       ├── roles.decorator.ts
│   │       └── api-auth.decorator.ts    # Swagger @ApiBearerAuth shortcut
│   │
│   └── modules/
│       ├── auth/                        # JWT, OTP SMS, refresh token rotation
│       ├── users/                       # Profil, gamifikasi poin kontribusi
│       ├── reports/                     # State machine, upvote, komentar, validasi
│       ├── ai-verification/             # BullMQ worker, CV HTTP client, MOCK
│       ├── smart-priority/              # Scoring engine multi-faktor
│       ├── maps/                        # OSM Nominatim wrapper + rate-limit queue
│       ├── prediction/                  # XGBoost + BMKG weather integration
│       ├── policy-simulator/            # Gemini 2.5 Flash LLM integration
│       ├── notifications/               # In-app notif + Route Alert cron geofencing
│       ├── categories/                  # Master kategori fasilitas publik
│       └── agencies/                    # Master instansi OPD
│
├── test/
│   ├── app.e2e-spec.ts                  # Supertest E2E tests (8 tests)
│   └── jest-e2e.json
│
├── prisma.config.ts                     # Prisma 7 config (schema path + datasource)
├── docker-compose.yml                   # PostgreSQL PostGIS + Redis + App stack
├── Dockerfile                           # Multi-stage Docker build
├── .env.example                         # Template environment variables
├── package.json                         # Scripts & dependencies
├── Architecture.md                      # Arsitektur detail sistem
├── ERD.md                               # Entity Relationship Design dokumen
└── PRD.md                               # Product Requirements Document
```

---

## 🔒 Keamanan Arsitektur

```mermaid
flowchart TD
    Req["📡 Incoming Request"] --> TLS["🔐 HTTPS / TLS\nSemua komunikasi terenkripsi"]
    TLS --> RL["⚡ Rate Limiter\n@nestjs/throttler\n10/min laporan\n20/min komentar\n30/min upvote"]
    RL --> JWT["🔑 JWT Auth Guard\nPassport-JWT\nAccess token short-lived\nRefresh token single-use rotation"]
    JWT --> RBAC["🛡️ RBAC Roles Guard\ncitizen / operator / policy_maker / admin"]
    RBAC --> VP["✅ Global ValidationPipe\nclass-validator\nwhitelist: true\nforbidNonWhitelisted: true"]
    VP --> Idem["🔁 Idempotency Key Check\nMencegah submit laporan duplikat\nper idempotency_key unique constraint"]
    Idem --> Ctrl["📋 Controller → Service"]
    Ctrl --> Audit["📝 Audit Trail\nreport_status_history\nSetiap transisi status dicatat\ntermasuk siapa yang mengubah"]
    Ctrl --> DB["🗄️ PostgreSQL\nPrisma parameterized queries\nSQL injection safe"]
```

**Lapisan keamanan yang sudah diimplementasi:**

| Lapisan | Implementasi |
|---|---|
| Transport | HTTPS only (TLS termination) |
| Authentication | JWT access token + single-use refresh token rotation |
| Authorization | RBAC guard per endpoint |
| Rate Limiting | Multi-tier throttler (laporan, komentar, upvote) |
| Anti-Duplikat | Idempotency key per submit laporan |
| File Upload | Validasi MIME type + ukuran via Multer + Sharp compress |
| Audit Trail | `report_status_history` — setiap perubahan status tercatat |
| OTP Storage | Hash bcrypt (bukan plaintext) di kolom `otp_code_hash` |
| Refresh Token | SHA-256 digest → bcrypt hash di kolom `refresh_token_hash` |
| Content Moderation | Profanity masking pada komentar publik |
| Spam Detection | Auto-flag `is_flagged_for_review` jika >3 laporan ditolak/30 hari |

---

## 📊 KPI dan Target Performa

| Metrik | Target |
|---|---|
| API response time (non-AI endpoints) | < 500ms |
| AI verification latency (async job) | < 5 detik |
| Pengguna aktif pilot Kota Malang (SOM) | 15.000 – 20.000 |
| Akurasi klasifikasi AI (YOLOv11) | > 85% |
| Citizen validation rate | > 60% laporan selesai divalidasi warga |
| Uptime target MVP | 99% |
| Unit test coverage | 110 / 110 passed |
| E2E test coverage | 8 / 8 passed |

---

<p align="center">
  Dibuat dengan ❤️ dan dedikasi oleh <strong>Tim "Saya Akan Lawan" — SMK Telkom Malang</strong><br>
  <em>Entri Kompetisi MAGE 12 — Multimedia and Game Event (MAGEITS)</em><br><br>
  <strong>🏙️ From Report to Resolve — Kota yang Lebih Responsif, Dimulai dari Warganya</strong>
</p>
