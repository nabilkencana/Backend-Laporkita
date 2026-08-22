import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Domain Modules
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { AgenciesModule } from './modules/agencies/agencies.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SmartPriorityModule } from './modules/smart-priority/smart-priority.module.js';
import { AIVerificationModule } from './modules/ai-verification/ai-verification.module.js';

import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { MapsModule } from './modules/maps/maps.module.js';
import { PredictionModule } from './modules/prediction/prediction.module.js';
import { PolicySimulatorModule } from './modules/policy-simulator/policy-simulator.module.js';

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

    // ── BullMQ Redis Connection (global) ───────────────────────────────────
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        return {
          connection: {
            url: redisUrl,
          },
        };
      },
    }),

    // ── Prisma (global) ────────────────────────────────────────────────────
    PrismaModule,

    // ── Domain Modules ─────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CategoriesModule,
    AgenciesModule,
    ReportsModule,
    SmartPriorityModule,
    AIVerificationModule,
    NotificationsModule,
    MapsModule,
    PredictionModule,
    PolicySimulatorModule,

    // Modul fase selanjutnya:
    // PointsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
