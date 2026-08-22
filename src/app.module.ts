import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Domain Modules
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { AgenciesModule } from './modules/agencies/agencies.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';

/**
 * AppModule — root module aplikasi LaporKita backend.
 * Sesuai Architecture.md §3.1.
 */
@Module({
  imports: [
    // ── Config Module (global) ─────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // ── Prisma (global) ────────────────────────────────────────────────────
    PrismaModule,

    // ── Domain Modules ─────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CategoriesModule,
    AgenciesModule,
    ReportsModule,

    // Modul fase selanjutnya:
    // NotificationsModule,
    // MapsModule,
    // AiVerificationModule,
    // SmartPriorityModule,
    // PredictionModule,
    // PolicySimulatorModule,
    // PointsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
