import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AIVerificationResult, IAIVerificationService } from './ai-verification.interface.js';
import { firstValueFrom } from 'rxjs';
import { isWithinMalangBounds } from '../reports/utils/geo.util.js';

@Injectable()
export class AIVerificationService implements IAIVerificationService {
  private readonly logger = new Logger(AIVerificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Memverifikasi laporan foto dan lokasi via AI Service (FastAPI / Gemini Vision).
   * Sesuai Architecture.md §3.2 & Rules.md §1.2.
   */
  async verifyReport(reportId: string): Promise<AIVerificationResult> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        category: true,
        media: {
          where: { type: 'initial_photo' },
          take: 1,
        },
      },
    });

    if (!report) {
      throw new Error(`Report dengan ID '${reportId}' tidak ditemukan.`);
    }

    const aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL');
    const photoUrl = report.media[0]?.url;
    const lat = Number(report.latitude);
    const lng = Number(report.longitude);

    // Validasi dasar GPS Bounding Box Kota Malang
    const isValidGps = isWithinMalangBounds(lat, lng);

    // Validasi timestamp (tidak boleh waktu di masa depan atau > 30 hari yang lalu)
    const reportTime = report.created_at.getTime();
    const now = Date.now();
    const isFuture = reportTime > now + 60000;
    const isTooOld = now - reportTime > 30 * 24 * 60 * 60 * 1000;
    const isValidTimestamp = !isFuture && !isTooOld;

    if (aiServiceUrl) {
      try {
        this.logger.log(
          `Mengirim job verifikasi AI ke microservice Python: ${aiServiceUrl}/api/v1/verify`,
        );
        const response = await firstValueFrom(
          this.httpService.post<{
            confidence: number;
            category: string;
            is_valid_gps: boolean;
            is_valid_timestamp: boolean;
            damage_severity: number;
            reason?: string;
          }>(
            `${aiServiceUrl}/api/v1/verify`,
            {
              report_id: report.id,
              photo_url: photoUrl,
              latitude: lat,
              longitude: lng,
              reported_category: report.category.name,
              created_at: report.created_at.toISOString(),
            },
            { timeout: 5000 },
          ),
        );

        return {
          confidence: Number(response.data.confidence),
          category: response.data.category,
          isValidGps: Boolean(response.data.is_valid_gps && isValidGps),
          isValidTimestamp: Boolean(response.data.is_valid_timestamp && isValidTimestamp),
          damageSeverity: Number(response.data.damage_severity ?? 0.5),
          reason: response.data.reason,
          isMock: false,
        };
      } catch (error) {
        this.logger.warn(
          `AI Service eksternal (${aiServiceUrl}) gagal dihubungi. Menggunakan fallback MOCK service.`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // =========================================================================
    // MOCK — ganti ke HTTP call asli saat AI service Python tersedia
    // Mengembalikan nilai simulasi realistis untuk pengembangan & testing
    // =========================================================================
    return this.mockVerifyReport(report.category.name, isValidGps, isValidTimestamp);
  }

  /**
   * Mock implementation terisolasi untuk development & fallback.
   * Memberikan confidence realistis (0.85 - 0.95 untuk foto valid)
   */
  mockVerifyReport(
    categoryName: string,
    isValidGps: boolean,
    isValidTimestamp: boolean,
  ): AIVerificationResult {
    this.logger.debug(
      `[AI Service MOCK] Memproses verifikasi mock untuk kategori: '${categoryName}' (GPS: ${isValidGps}, Time: ${isValidTimestamp})`,
    );

    return {
      confidence: 0.88,
      category: categoryName,
      isValidGps,
      isValidTimestamp,
      damageSeverity: 0.75,
      reason: 'MOCK AI: Terdeteksi kerusakan fisik sesuai kategori dengan keyakinan tinggi.',
      isMock: true,
    };
  }
}
