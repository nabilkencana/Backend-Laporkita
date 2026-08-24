# Panduan Deploy LaporKita ke Railway

> Disusun oleh Peter (ox-alpha) — 2026-08-23
> Project: https://railway.com/project/5ecd041e-3c94-4b95-b946-ddf99e50f0aa

---

## 0. Arsitektur di Railway

```
[Internet] → api.canadev.my.id ──┐
[Internet] → ai.canadev.my.id ───┤
                                 ▼
                    ┌─────────────────────────┐
                    │   RAILWAY PROJECT       │
                    │  ┌───────────────┐      │
                    │  │ backend       │ :3000│──┐
                    │  │ (NestJS)      │      │  │ private network
                    │  └───────┬───────┘      │  │
                    │          │              │  │
                    │  ┌───────▼───────┐      │  │
                    │  │ ai-service    │ :8000│──┤
                    │  │ (FastAPI+YOLO)│      │  │
                    │  └───────┬───────┘      │  │
                    │          │              │  │
                    │  ┌───────▼───────┐      │  │
                    │  │ postgres      │      │  │
                    │  │ (PostGIS)     │      │  │
                    │  └───────┴───────┘      │  │
                    │  ┌───────┴───────┐      │  │
                    │  │ redis         │      │  │
                    │  └───────────────┘      │  │
                    └─────────────────────────┘
```

**Perubahan penting dari setup lokal:**
1. Tidak perlu cloudflared tunnel lagi — Railway kasih domain HTTPS otomatis
2. INTERNAL_API_KEY & DEEPSEEK_API_KEY pindah ke "Variables" Railway
3. Postgres/Redis pakai plugin Railway, bukan container sendiri

---

## 1. Prasyarat (sekali saja)

```bash
npm i -g @railway/cli
railway login            # buka browser, login akun Nabil
```

Link project yang sudah dibuat:
```bash
cd "/Users/nabilkencana/Project /Lomba MAGEITS/backend-laporkita"
railway link -p 5ecd041e-3c94-4b95-b946-ddf99e50f0aa \
             -e d852a234-10cf-435f-ae7f-1fe165432bb4
```
(untuk folder ai-service, link ke project yang sama, environment sama)

---

##  railway init / services

## 2. Buat Service Database Dulu

Di dashboard (atau CLI):

```bash
# PostgreSQL + PostGIS (backend butuh ekstensi geometry untuk zones)
railway add --plugin postgresql
```
Railway Postgres default TIDAK punya PostGIS. Ada 2 opsi:
- **Opsi A (disarankan):** deploy image `postgis/postgis:16-3.4-alpine` sebagai service Docker dari repo backend (buat `Dockerfile.postgres` satu baris)
- Opsi B: pakai Postgres bawaan Railway, lalu `CREATE EXTENSION postgis;` — hanya jalan kalau imagenya menyertakan postgis (biasanya tidak) → pakai Opsi A

Redis:
```bash
railway add --plugin redis
```

Setelah dibuat, Railway otomatis set variabel `DATABASE_URL` / `REDIS_URL` privat.

---

## 3. Deploy Backend (NestJS)

```bash
cd "/Users/nabilkencana/Generate /Lomba MAGEITS/backend-laporkita"
railway up --service backend   # build dari Dockerfile (target production)
```

**Variables yang wajib diset** (dashboard → backend → Variables):

| Variable | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference) |
| `REDIS_URL` | `redis://default:${{Redis.REDIS_PASSWORD}}@${{Redis.RAILWAY_PRIVATE_DOMAIN}}:6379` |
| `INTERNAL_API_KEY` | (nilai key baru — lihat `.env` lokal, JANGAN commit) |
| `AI_SERVICE_URL` | `https://ai-service-production-xxxx.up.railway.app` (domain publik ai-service, atau private `http://ai-service.railway.internal:8000`) |
| `AI_SERVICE_API_KEY` | sama dengan INTERNAL_API_KEY |
| `SMS_PROVIDER` | `mock` (kalau belum ada provider SMS asli; guard NODE_ENV=production akan blok mock — lihat §6 Troubleshooting) |
| `JWT_SECRET` | secret acak kuat |
| `DEEPSEEK_API_KEY` | tidak perlu di backend (hanya ai-service) |

**Domain:** Settings → Networking → Generate Domain → port `3000` →
custom domain `api.canadev.my.id` (CNAME ke Railway sesuai instruksi).

---

## 4. Deploy AI Service

```bash
cd "/Users/nabilkencana/Project /Lomba MAGEITS/ai-service"
railway up --service ai-service
```

**Variables:**

| Variable | Nilai |
|---| guide |
|---|---|
| `PORT` | `8000` |
| `APP_ENV` | `production` |
| `AI_CONFIDENCE_THRESHOLD` | `0.6` |
| `AI_CONFIDENCE_AUTO_THRESHOLD` | `0.85` |
| `MALANG_BBOX_*`, `WEIGHT_*` | salin dari docker-compose.yml |
| `INTERNAL_API_KEY` | nilai key baru |
| `DEEPSEEK_API_KEY` | key DeepSeek tuan |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL_NAME` | `deepseek-chat` |

Model YOLO/XGBoost sudah ter-track di git (`models/`) — ikut ter-deploy otomatis.
RAM minimal 1 GB disarankan (YOLO + XGBoost inference).

**Domain:** Generate Domain port `8000` → custom domain `ai.canadev.my.id`.

---

## 5. Migrasi Data

Backend start pertama kali:
```bash
railway run --service backend -- npx prisma migrate deploy
```
(atau tambahkan ke start command: `npx prisma migrate deploy && node dist/main.js`)

Data laporan demo dari lokal (opsional):
```bash
pg_dump --no-owner --no-acl "$LOCAL_DATABASE_URL" > dump.sql
psql "$RAILWAY_DATABASE_URL" < dump.sql
```

---

## 6. Troubleshooting Umum

| Gejala | Penyebab & Solusi |
|---|---|
| Backend crash loop saat boot | Guard production memblok `SMS_PROVIDER=mock`. Set `SMS_PROVIDER=console` atau provider asli |
| `relation does not exist` | Lupa `prisma migrate deploy` — jalankan manual atau masukkan ke start command |
| ai-service 502 | Cek log build — biasanya RAM kurang saat load YOLO; naikkan memory |
| Backend→ai-service 401 | INTERNAL_API_KEY beda antar service — samakan nilainya |
| Redis connect refused | Format REDIS_URL salah; copy persis dari template variable Railway |
| Cold start lambat | Railway selalu-on (tidak sleep) — bukan cold start, cek CPU throttling di metrics |

---

## 7. Checklist Sebelum Demo

- [ ] `railway status` — semua service ACTIVE
- [ ] `curl https://api.canadev.my.id/api/v1/health` → 200
- [ ] `curl https://ai.canadev.my.id/health` → 200 + llm_connected:true
- [ ] Register → login → buat laporan → AI verify jalan (E2E via URL publik)
- [ ] INTERNAL_API_KEY sama di backend & ai-service
- [ ] Custom domain resolve (DNS propagated)
- [ ] Watchdog lokal dimatikan/pause (biar tidak ganggu deployment Railway)
