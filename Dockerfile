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

# Copy source dan build
COPY . .
RUN npm run build

# Hasilkan Prisma Client
RUN npx prisma generate --schema=src/prisma/schema.prisma

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Hanya install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build hasil dari stage builder
COPY --from=builder /app/dist ./dist

# Copy Prisma client yang sudah di-generate
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy schema untuk prisma migrate (jika dijalankan saat startup)
COPY src/prisma/schema.prisma ./src/prisma/schema.prisma

# Non-root user untuk keamanan
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs
USER nestjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]
