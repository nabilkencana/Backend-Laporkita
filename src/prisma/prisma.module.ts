import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * PrismaModule — global module agar PrismaService tersedia di semua modul
 * tanpa perlu import eksplisit di setiap modul domain.
 *
 * Sesuai Architecture.md §3.1 — Prisma adalah SATU-SATUNYA jalur akses DB.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
