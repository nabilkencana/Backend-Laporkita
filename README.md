# 🏛️ LaporKita Backend — City Intelligence Platform

<p align="center">
  <img src="https://assets.laporkita.malangkota.go.id/branding/laporkita-banner.png" alt="LaporKita Banner" width="100%" onerror="this.src='https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80'" />
</p>

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
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Tests-26%2F26_Passed-success?style=for-the-badge&logo=jest&logoColor=white" alt="Tests" />
</p>

---

## 📌 Daftar Isi

1. [Tentang LaporKita](#-tentang-laporkita)
2. [Fitur Unggulan Sistem](#-fitur-unggulan-sistem)
3. [Arsitektur Sistem (Visual Flow)](#-arsitektur-sistem-visual-flow)
4. [Diagram State Machine Laporan](#-diagram-state-machine-laporan)
5. [Struktur Modul & Layering](#-struktur-modul--layering)
6. [Skema Database & Spasial PostGIS](#-skema-database--spasial-postgis)
7. [Desain API & Response Envelope](#-desain-api--response-envelope)
8. [Matriks Role-Based Access Control (RBAC)](#-matriks-role-based-access-control-rbac)
9. [Panduan Instalasi & Menjalankan](#-panduan-instalasi--menjalankan)
10. [Pengujian & Validasi Kualitas](#-pengujian--validasi-kualitas)
11. [Spesifikasi Lingkungan (.env)](#-spesifikasi-lingkungan-env)

---

## 🌟 Tentang LaporKita

**LaporKita** adalah backend sistem kecerdasan kota (*City Intelligence Platform*) yang merevolusi penanganan pengaduan kerusakan infrastruktur publik di **Kota Malang**. Berbeda dari aplikasi pelaporan tradisional yang bersifat statis dan manual, LaporKita mengintegrasikan:

- **AI Verification & Multi-Agent Routing**: Klasifikasi gambar kerusakan otomatis dan penugasan langsung ke OPD terkait (**DPUPRPKP**, **Dishub**, **Diskominfo**).
- **Smart Priority Engine**: Perhitungan skor urgensi multi-faktor (*kepadatan lalu lintas, probabilitas banjir, fasilitas vital, & bobot kategori*).
- **Citizen Spatial Validation**: Validasi warga berbasis geolokasi formula *Haversine 100m* untuk transparansi pengerjaan fisik di lapangan.
- **Urban Emotion Map**: Pemetaan zona stres perkotaan dinamis berbasis PostGIS Polygon.

---

## 🚀 Fitur Unggulan Sistem

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             LAPORKITA INTELLIGENCE CORE                          │
├──────────────────────┬──────────────────────┬────────────────────────────────────┤
│ ⚡ Fast Ingestion    │ 🎯 Smart Routing     │ 🛡️ Anti-Abuse & Grace Period       │
│ • 202 Accepted       │ • Auto-assign OPD    │ • Idempotency key per submission   │
│ • Async BullMQ Queue │ • Urgency-weighted   │ • 5-min cancel support window      │
│ • Non-blocking       │ • PostGIS Spatial    │ • Spammer review flag penalty      │
├──────────────────────┼──────────────────────┼────────────────────────────────────┤
│ 👥 Citizen Loop      │ 📊 Gamification      │ 🤖 Predictive Policy               │
│ • 100m radius check  │ • Atomic points log  │ • Gemini LLM Policy Simulator      │
│ • Dispute re-routing │ • Read-only points   │ • XGBoost Infrastructure Decay     │
│ • 7-day auto resolve │ • Anti-cheat tx      │ • BMKG Weather Context Integration │
└──────────────────────┴──────────────────────┴────────────────────────────────────┘
```

---

## 📐 Arsitektur Sistem (Visual Flow)

LaporKita mengadopsi arsitektur **Modular Monolith** dengan pemisahan domain yang bersih, komunikasi asinkron melalui message queue, serta isolasi database layer melalui Prisma ORM dan PostGIS Engine.

```mermaid
flowchart TD
    subgraph Clients["📱 Client Layer"]
        CitizenApp["Flutter Mobile (Warga)"]
        OperatorWeb["Admin Dashboard (Operator/OPD)"]
        PolicyPortal["Executive Dashboard (Pemerintah)"]
    end

    subgraph Gateway["🚪 API Gateway & Common Layer"]
        Prefix["/api/v1 Global Prefix"]
        AuthGuard["JWT Auth Guard & Passport"]
        RBAC["Roles Guard (RBAC)"]
        ValPipe["Global ValidationPipe (class-validator)"]
        Interceptor["Response Envelope Interceptor"]
        Filter["Global Exception Filter"]
    end

    subgraph Modules["🧩 Domain Modules Layer"]
        AuthMod["Auth Module\n(JWT, Refresh Token)"]
        UserMod["Users Module\n(Profile, Gamification Points)"]
        ReportMod["Reports Module\n(State Machine, Upvotes, Validations)"]
        CategoryMod["Categories Module\n(Auto-routing defaults)"]
        AgencyMod["Agencies Module\n(DPUPR, Dishub, Diskominfo)"]
        WorkerQueue["Async Queue Layer\n(BullMQ Engine)"]
    end

    subgraph Intelligence["🧠 AI & External Services"]
        GeminiAI["Gemini 2.0 / Vision\n(Image Verification & Policy Sim)"]
        XGBoostEngine["ML Service\n(Urgency & Decay Prediction)"]
        BMKG["BMKG Weather API"]
    end

    subgraph Storage["💾 Persistence & State Layer"]
        Postgres[(PostgreSQL 16 + PostGIS\nSpatial GIST Indexes)]
        RedisCache[(Redis 7\nQueue State & Rate Limits)]
    end

    Clients --> Gateway
    Gateway --> Modules
    ReportMod -->|Dispatch Job| WorkerQueue
    WorkerQueue <--> RedisCache
    WorkerQueue --> Intelligence
    Modules <--> Postgres
```

---

## 🔄 Diagram State Machine Laporan

Seluruh alur status laporan fasilitas umum dikontrol secara ketat melalui metode terpusat `transitionReportStatus()` sesuai dengan aturan **[Rules.md §1.1](file:///Users/nabilkencana/Project%20/backend-laporkita/Rules.md)**.

```mermaid
stateDiagram-v2
    [*] --> pending_verification: POST /reports (202 Accepted)
    
    pending_verification --> verified: AI Confidence ≥ 0.70 / Operator Lolos (+10 Poin)
    pending_verification --> rejected: AI / Manual Reject (Wajib Note)
    
    note right of rejected
        FINAL STATE
        Jika user >3x reject dlm 30 hari:
        -20 Poin & is_flagged_for_review = true
    end note
    
    verified --> assigned: Auto/Manual Routing ke Instansi (DPUPR / Dishub)
    assigned --> in_progress: Petugas Turun Lapangan
    
    in_progress --> completed: Pekerjaan Selesai (Wajib Foto Completion!)
    
    completed --> resolved: Validasi Warga (is_valid: true) (+5 Poin)
    completed --> resolved: Cron Job 7 Hari Tanpa Sanggahan
    completed --> disputed: Validasi Warga (is_valid: false) (Sengketa)
    
    disputed --> in_progress: Otomatis Re-Route & Skor Urgensi Naik
    
    resolved --> [*]
```

---

## 📁 Struktur Modul & Layering

Struktur direktori dibangun persis mengikuti panduan **[Architecture.md §3.1](file:///Users/nabilkencana/Project%20/backend-laporkita/Architecture.md)**:

```
backend-laporkita/
├── src/
│   ├── common/                          # Global Shared Utilities
│   │   ├── decorators/                  # @Roles(), @Public(), @CurrentUser()
│   │   ├── filters/                     # HttpExceptionFilter (Error Envelope)
│   │   ├── guards/                      # JwtAuthGuard, RolesGuard (RBAC)
│   │   └── interceptors/                # ResponseInterceptor (Success Envelope)
│   │
│   ├── modules/                         # Domain Modules (Controller + Service + DTO + Repo)
│   │   ├── auth/                        # Register, Login, Refresh JWT, Passport Strategy
│   │   ├── users/                       # Profil Pengguna, Read-Only Gamifikasi, Admin RBAC
│   │   ├── reports/                     # State Machine, Validasi Spasial Haversine, Upvote
│   │   │   ├── dto/                     # CreateReport, TransitionStatus, ValidateReport, dll.
│   │   │   ├── utils/                   # geo.util (Malang BBox), profanity-filter, report-code
│   │   │   ├── reports.controller.ts
│   │   │   ├── reports.service.ts
│   │   │   ├── reports.repository.ts
│   │   │   └── reports.service.spec.ts  # Unit Tests State Machine & Spasial
│   │   ├── categories/                  # 5 Kategori Aktif, Default Agency Routing
│   │   ├── agencies/                    # DPUPRPKP, Dishub, Diskominfo Kota Malang
│   │   ├── notifications/               # (Fase 4) Push Notification & Route Alert
│   │   ├── maps/                        # (Fase 4) Urban Emotion Map PostGIS
│   │   ├── ai-verification/             # (Fase 5) Worker Klasifikasi Gambar Gemini
│   │   ├── smart-priority/              # (Fase 5) Algoritma Scoring Multi-Faktor
│   │   ├── prediction/                  # (Fase 5) Model XGBoost Prediksi Kerusakan
│   │   ├── policy-simulator/            # (Fase 5) Gemini LLM Simulasi Kebijakan
│   │   └── points/                      # (Fase 5) Leaderboard & Reward Warga
│   │
│   ├── prisma/                          # Database & Migration Engine
│   │   ├── migrations/                  # SQL Migrations (PostGIS Extension & GIST Indexes)
│   │   ├── schema.prisma                # 15 Models + 7 Enums
│   │   ├── prisma.service.ts            # Prisma 7.x Driver Adapter (PrismaPg)
│   │   └── seed.ts                      # Seeding Kategori, Instansi, & Default Admin
│   │
│   ├── app.module.ts                    # Root Application Module
│   └── main.ts                          # Bootstrap, Versioning (/api/v1), Pipes, CORS
│
├── Dockerfile                           # Multi-stage Production Build
├── docker-compose.yml                   # PostgreSQL PostGIS + Redis Stack
├── prisma.config.ts                     # Prisma 7 Datasource Configuration
├── package.json
└── tsconfig.json                        # Strict Mode Enabled
```

---

## 🗄️ Skema Database & Spasial PostGIS

Sistem menggunakan **15 Model Entitas Relasional** yang didefinisikan secara presisi pada **[ERD.md](file:///Users/nabilkencana/Project%20/backend-laporkita/ERD.md)**:

```mermaid
erDiagram
    users ||--o{ reports : "melaporkan"
    users ||--o{ report_supports : "mendukung"
    users ||--o{ report_comments : "berkomentar"
    users ||--o{ citizen_validations : "memvalidasi"
    users ||--o{ contribution_points_log : "riwayat poin"
    users }o--|| agencies : "terikat instansi"
    
    agencies ||--o{ categories : "instansi default"
    agencies ||--o{ reports : "ditugaskan ke"
    
    categories ||--o{ reports : "kategori fasilitas"
    
    reports ||--o{ report_media : "lampiran foto"
    reports ||--o{ report_status_history : "audit status"
    reports ||--o{ report_supports : "didukung oleh"
    reports ||--o{ report_comments : "komentar warga"
    reports ||--o{ citizen_validations : "divalidasi"
    
    zones ||--o{ zone_metrics : "histori metrik"
    zones ||--o{ policy_simulations : "zona simulasi"
```

### 📍 Justifikasi Index Spasial PostGIS (Raw SQL)
Prisma schema DSL tidak mendukung ekspresi indeks spasial `USING GIST`. Oleh karena itu, migrasi SQL ([`src/prisma/migrations/`](file:///Users/nabilkencana/Project%20/backend-laporkita/src/prisma/migrations/)) menyertakan raw SQL:
1. **`reports_spatial_location_gist_idx`**: Indeks spasial GIST berbasis koordinat laporan `ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)` untuk akselerasi query peta interaktif dan filter Bounding Box Kota Malang.
2. **`zones_geo_boundary_gist_idx`**: Indeks spasial GIST untuk polygon zona wilayah Urban Emotion Map.

---

## 📬 Desain API & Response Envelope

Semua endpoint backend LaporKita mengembalikan format envelope yang seragam dan konsisten sesuai **[Rules.md §3](file:///Users/nabilkencana/Project%20/backend-laporkita/Rules.md)**.

### 1. Format Response Sukses
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 120,
    "limit": 20,
    "nextCursor": "b19c9c26-dba5-468e-bd99-101ae853fb74",
    "hasPrevious": false
  },
  "error": null
}
```

### 2. Format Response Error
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Tidak dapat mengubah status dari 'pending_verification' ke 'completed'.",
    "details": []
  }
}
```

### 3. Ringkasan Endpoint Utama

| Modul | Method | Endpoint | Status | Akses | Fungsi |
|---|---|---|---|---|---|
| **Auth** | `POST` | `/api/v1/auth/register` | `201` | Public | Registrasi warga (`role: citizen`) |
| **Auth** | `POST` | `/api/v1/auth/login` | `200` | Public | Login akun & perolehan token pair |
| **Auth** | `POST` | `/api/v1/auth/refresh` | `200` | Public | Pembaruan Access Token JWT |
| **Users** | `GET` | `/api/v1/users/me` | `200` | Auth | Profil user terautentikasi |
| **Users** | `GET` | `/api/v1/users/me/points` | `200` | Auth | **Read-only** riwayat gamifikasi poin |
| **Users** | `GET` | `/api/v1/users` | `200` | Admin | List & filter seluruh user |
| **Reports** | `POST` | `/api/v1/reports` | **`202`** | Auth | Submit laporan (Idempotent & cepat) |
| **Reports** | `GET` | `/api/v1/reports` | `200` | Public | List laporan (Peta / Cursor Pagination) |
| **Reports** | `GET` | `/api/v1/reports/:id` | `200` | Public | Detail laporan & histori audit status |
| **Reports** | `PATCH` | `/api/v1/reports/:id/status`| `200` | Operator/Admin | Transisi status state machine |
| **Reports** | `POST` | `/api/v1/reports/:id/support`| `201` | Auth | Beri dukungan/upvote laporan (+1 poin) |
| **Reports** | `DELETE`| `/api/v1/reports/:id/support`| `200` | Auth | Batal dukungan (**Grace period 5 menit**) |
| **Reports** | `POST` | `/api/v1/reports/:id/validate`| `200`| Auth | Citizen validation (**Radius 100m**) |
| **Reports** | `POST` | `/api/v1/reports/:id/media` | `201` | Auth | Upload foto progres / completion |
| **Categories**| `GET` | `/api/v1/categories` | `200` | Public | List 5 kategori aktif fasilitas |
| **Agencies** | `GET` | `/api/v1/agencies` | `200` | Auth | List OPD Kota Malang & relasi laporan |

---

## 🛡️ Matriks Role-Based Access Control (RBAC)

| Resource / Tindakan | `citizen` (Warga) | `operator` (Petugas OPD) | `policy_maker` (Pemerintah) | `admin` (Super Admin) |
|---|:---:|:---:|:---:|:---:|
| Submit Laporan Baru | ✅ | ✅ | ✅ | ✅ |
| Upvote / Dukung Laporan | ✅ | ✅ | ✅ | ✅ |
| Validasi Selesai (100m) | ✅ | ❌ | ❌ | ✅ |
| Mutasi Status Laporan | ❌ | ✅ | ❌ | ✅ |
| Upload Bukti Pengerjaan | ❌ | ✅ | ❌ | ✅ |
| Simulasi Kebijakan AI | ❌ | ❌ | ✅ | ✅ |
| CRUD Kategori & Instansi | ❌ | ❌ | ❌ | ✅ |
| Kelola Akun & Role User | ❌ | ❌ | ❌ | ✅ |

---

## 🛠️ Panduan Instalasi & Menjalankan

### 1. Prasyarat Sistem
- **Node.js**: `v20.x` atau lebih baru
- **Docker & Docker Compose**: Untuk PostgreSQL + PostGIS dan Redis
- **npm** / **pnpm**

### 2. Kloning & Konfigurasi Environment
```bash
# Clone repository
git clone https://github.com/nabilkencana/Backend-Laporkita.git
cd backend-laporkita

# Salin template environment variables
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

# Generate Prisma Client (Prisma 7)
npm run db:generate

# Deploy migrasi DDL & PostGIS Index
npx prisma migrate deploy

# Seed data awal (3 Instansi, 5 Kategori Aktif, & 1 Admin User)
npm run db:seed
```

### 5. Menjalankan Server Backend
```bash
# Mode Development (Watch Mode)
npm run start:dev

# Mode Production
npm run build
npm run start:prod
```
> Server akan aktif di: **`http://localhost:3000/api/v1`** (Health check: `GET /api/v1/health`).

---

## 🧪 Pengujian & Validasi Kualitas

Backend LaporKita dilengkapi dengan automated testing suite untuk memverifikasi keandalan bisnis:

```bash
# Menjalankan seluruh unit test suite
npm run test

# Menjalankan linter TypeScript strict
npm run lint

# Menjalankan pengujian cakupan kode (Code Coverage)
npm run test:cov
```

### 🎯 Cakupan Pengujian Otomatis
- ✅ **State Machine**: Verifikasi seluruh transisi status legal dan penolakan status ilegal (`ConflictException: 409`).
- ✅ **Completion Photo Gate**: Penguncian transisi status `completed` tanpa bukti foto pengerjaan.
- ✅ **Upvote Grace Period**: Pembatalan dukungan sukses dlm 5 menit dan ditolak setelah 5 menit.
- ✅ **Haversine Distance**: Pengecekan radius spasial 100m untuk Citizen Validation non-pelapor.
- ✅ **Automated 7-Day Resolver**: Pengujian Cron Job pembersihan laporan `completed` menggantung.
- ✅ **Anti-Spam Penalty**: Sanksi penalti `-20 poin` dan review flag jika user ditolak >3x dlm 30 hari.

---

## ⚙️ Spesifikasi Lingkungan (.env)

| Variabel | Deskripsi | Default / Contoh |
|---|---|---|
| `NODE_ENV` | Mode runtime aplikasi | `development` |
| `PORT` | Port server aplikasi | `3000` |
| `DATABASE_URL` | Koneksi PostgreSQL PostGIS | `postgresql://laporkita:laporkita_dev@localhost:5433/laporkita_db?schema=public` |
| `JWT_SECRET` | Secret key Access Token (min 32 char) | `[Random Secret Key]` |
| `JWT_REFRESH_SECRET` | Secret key Refresh Token (min 32 char) | `[Random Secret Key]` |
| `REDIS_URL` | URL instance Redis | `redis://localhost:6379` |
| `MALANG_LAT_MIN` | Bounding Box Selatan Kota Malang | `-8.2500` |
| `MALANG_LAT_MAX` | Bounding Box Utara Kota Malang | `-7.8500` |
| `MALANG_LNG_MIN` | Bounding Box Barat Kota Malang | `112.5000` |
| `MALANG_LNG_MAX` | Bounding Box Timur Kota Malang | `112.8000` |
| `CITIZEN_VALIDATION_RADIUS_M` | Toleransi radius validasi warga | `100` (meter) |
| `SUPPORT_GRACE_PERIOD_MINUTES`| Jendela pembatalan dukungan | `5` (menit) |
| `CITIZEN_VALIDATION_AUTO_RESOLVE_DAYS`| Batas hari auto-resolve | `7` (hari) |

---

<p align="center">
  Dibuat dengan ❤️ dan dedikasi oleh <strong>Tim "Saya Akan Lawan" — SMK Telkom Malang</strong><br>
  <em>Entri Kompetisi MAGE 12 (Multimedia and Game Event)</em>
</p>
