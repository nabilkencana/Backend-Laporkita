import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PrismaService — single entry point untuk semua akses database.
 *
 * Menggunakan PrismaPg adapter sesuai Prisma 7.x requirement
 * (driver adapter mandatory untuk koneksi langsung ke PostgreSQL).
 *
 * Tidak ada raw query di seluruh codebase kecuali ada justifikasi tertulis
 * di comment (misal: PostGIS spatial query pada tabel zones).
 *
 * Sesuai Rules.md §4.1 & Architecture.md §3.1.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    const adapter = new PrismaPg({ connectionString });

    super({
      adapter,
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
