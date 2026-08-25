# =============================================================
# Dockerfile — LaporKita Backend (NestJS)
# Multi-stage build: builder → production
# Sesuai Architecture.md §6 — containerization dengan Docker.
# =============================================================

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies dulu (memanfaatkan Docker layer cache)
COPY package*.json ./
RUN npm ci

# Copy source (schema.prisma + prisma.config.ts WAJIB tersedia sebelum generate)
COPY . .

# FIX F1-1 QA: prisma generate WAJIB SEBELUM npm run build.
#
# Root cause 174× TS2305: PrismaClient/AgencyType/UserRole ter-export dari
# node_modules/.prisma/client — belum ada saat tsc berjalan sebelumnya.
#
# Catatan Prisma 7.x: prisma.config.ts memanggil env('DATABASE_URL').
# `prisma generate` adalah code-generation saja (TIDAK membuka koneksi DB),
# tapi Prisma 7.x tetap mencoba resolve env saat load config. Kita
# suplai dummy URL agar config loader bisa diinisialisasi; koneksi DB
# asli TIDAK digunakan selama generate.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma generate --schema=src/prisma/schema.prisma

# Compile TypeScript → dist/ (Prisma client sudah tersedia sekarang)
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Hanya install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build hasil dari stage builder
COPY --from=builder /app/dist ./dist

# Copy Prisma client yang sudah di-generate
# (.prisma = generated binding code; @prisma = runtime library)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy schema untuk referensi runtime Prisma 7.x
COPY src/prisma/schema.prisma ./src/prisma/schema.prisma

# Copy migrations — WAJIB untuk `prisma migrate deploy` di start command.
# Tanpa ini Prisma melaporkan "No migration found in prisma/migrations"
# dan tabel tidak pernah dibuat (DATABASE_ERROR 500).
COPY src/prisma/migrations ./src/prisma/migrations

# Copy prisma.config.ts (dibutuhkan oleh Prisma 7.x config loader di runtime)
COPY prisma.config.ts ./prisma.config.ts

# Non-root user untuk keamanan
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs
USER nestjs

EXPOSE 3000

# Health check — tunggu 15s start-period agar NestJS sempat bootstrap
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]
