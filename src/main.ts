import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Bootstrap aplikasi LaporKita Backend.
 *
 * Konfigurasi global:
 * - Global prefix /api/v1 (Rules.md §3)
 * - ValidationPipe (whitelist + forbidNonWhitelisted) (Rules.md §4.1)
 * - HttpExceptionFilter — format error envelope (Rules.md §3)
 * - ResponseInterceptor — format success envelope (Rules.md §3)
 * - Swagger OpenAPI docs di /api/docs
 * - CORS — akan di-restrict ke domain spesifik di production
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // ── Global API Prefix & URI Versioning (/api/v1/...) ─────────────────────
  // Sesuai Rules.md §3 — prefix /api/v1 sejak awal untuk API versioning.
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ── Global Validation Pipe ───────────────────────────────────────────────
  // whitelist: strip properti yang tidak ada di DTO
  // forbidNonWhitelisted: throw error jika ada properti asing
  // transform: otomatis transform tipe (string → number, dll.)
  // Sesuai Rules.md §4.1 — semua DTO wajib pakai class-validator.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Global Exception Filter ──────────────────────────────────────────────
  // Menangkap SEMUA exception dan format ke envelope Rules.md §3.
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Global Response Interceptor ─────────────────────────────────────────
  // Otomatis bungkus response sukses ke envelope Rules.md §3.
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── Swagger / OpenAPI Documentation ──────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('LaporKita — City Intelligence Platform API')
    .setDescription(
      'Dokumentasi REST API lengkap LaporKita Backend untuk Citizen App (B2C) dan Command Center (B2G).',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Masukkan access token JWT',
        in: 'header',
      },
      'bearer',
    )
    .addTag('Auth', 'Autentikasi & Token JWT')
    .addTag('Users', 'Profil & Manajemen Pengguna')
    .addTag('Categories', 'Kategori Fasilitas Publik')
    .addTag('Agencies', 'Dinas / Instansi Terkait')
    .addTag('Reports', 'Pelaporan, Status Tracking, Dukungan, Komentar, & Validasi')
    .addTag('Notifications', 'Notifikasi Pengguna')
    .addTag('Route Alerts', 'Peringatan Rute Geofencing')
    .addTag('Predictions', 'Prediksi Risiko Zona XGBoost & Cuaca')
    .addTag('Policy Simulator', 'Simulasi Kebijakan Tata Ruang Gemini LLM')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // ── CORS ─────────────────────────────────────────────────────────────────
  // TODO fase production: restrict origin ke domain Flutter app yang spesifik.
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 LaporKita Backend running on: http://localhost:${port}/api/v1`);
  logger.log(`📋 Environment: ${process.env.NODE_ENV ?? 'development'}`);
}

void bootstrap();
