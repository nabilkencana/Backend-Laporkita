import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * prisma.config.ts — Konfigurasi Prisma 7.x
 *
 * Prisma 7 memindahkan konfigurasi datasource dari schema.prisma
 * ke file ini. DATABASE_URL dibaca dari environment variable.
 *
 * Sesuai: https://pris.ly/d/config-datasource
 */
export default defineConfig({
  schema: 'src/prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'src/prisma/migrations',
  },
});
