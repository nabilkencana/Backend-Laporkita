import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { firstValueFrom } from 'rxjs';
import { IPredictionService, ZonePredictionResult } from './prediction.interface.js';
import { StressLevel, Prisma } from '@prisma/client';

@Injectable()
export class PredictionService implements IPredictionService {
  private readonly logger = new Logger(PredictionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Menghasilkan prediksi metrik risiko zona (XGBoost / BMKG Weather context)
   * Sesuai Architecture.md §3.2 & ERD.md §2.12
   */
  async predictZoneMetrics(zoneId: string): Promise<ZonePredictionResult> {
    const zone = await this.prisma.zone.findUnique({
      where: { id: zoneId },
    });

    if (!zone) {
      throw new NotFoundException(`Zona dengan ID '${zoneId}' tidak ditemukan.`);
    }

    const aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL');

    // 1. Ambil jumlah laporan aktif sebagai salah satu feature input
    const activeReportCount = await this.prisma.report.count({
      where: {
        status: {
          in: ['pending_verification', 'verified', 'assigned', 'in_progress'],
        },
      },
    });

    if (aiServiceUrl) {
      try {
        this.logger.log(
          `Mengirim request prediksi XGBoost ke AI microservice: ${aiServiceUrl}/api/v1/predict/zone-metrics`,
        );

        const response = await firstValueFrom(
          this.httpService.post<{
            report_density: number;
            traffic_density: number;
            flood_risk_probability: number;
            weather_context: Record<string, unknown>;
            stress_level: 'low' | 'medium' | 'high';
          }>(
            `${aiServiceUrl}/api/v1/predict/zone-metrics`,
            {
              zone_id: zoneId,
              zone_name: zone.name,
              active_reports: activeReportCount,
            },
            {
              headers: {
                'X-API-Key':
                  this.configService.get<string>('INTERNAL_API_KEY') ||
                  this.configService.get<string>('AI_SERVICE_API_KEY') ||
                  '',
              },
              timeout: 5000,
            },
          ),
        );

        const result: ZonePredictionResult = {
          zoneId,
          reportDensity: response.data.report_density,
          trafficDensity: response.data.traffic_density,
          floodRiskProbability: response.data.flood_risk_probability,
          weatherContext: response.data.weather_context,
          stressLevel: response.data.stress_level,
          isMock: false,
        };

        await this.persistZoneMetrics(result);
        return result;
      } catch (error) {
        this.logger.warn(
          `AI Service prediction (${aiServiceUrl}) gagal dihubungi: ${
            error instanceof Error ? error.message : String(error)
          }. Menggunakan fallback MOCK XGBoost.`,
        );
      }
    }

    // =========================================================================
    // MOCK — ganti ke HTTP call asli saat AI service Python XGBoost tersedia
    // =========================================================================
    const mockResult = this.mockPredictZoneMetrics(zoneId, zone.name, activeReportCount);
    await this.persistZoneMetrics(mockResult);
    return mockResult;
  }

  /**
   * Mock implementation simulasi model XGBoost & BMKG Weather context.
   */
  mockPredictZoneMetrics(
    zoneId: string,
    zoneName: string,
    activeReports: number,
  ): ZonePredictionResult {
    // Simulasi cuaca BMKG Malang
    const rainfallMm = Math.min(100, Math.max(5, activeReports * 4.5 + 10));
    const weatherContext = {
      source: 'BMKG Kota Malang (Simulasi)',
      temperature_celsius: 24.5,
      humidity_percentage: 82,
      rainfall_mm: rainfallMm,
      condition: rainfallMm > 40 ? 'Hujan Deras' : 'Hujan Ringan / Berawan',
    };

    // Simulasi probabilitas banjir dari curah hujan & kepadatan laporan
    const floodRisk = Math.min(
      0.95,
      Number(((rainfallMm / 100) * 0.7 + activeReports * 0.02).toFixed(2)),
    );
    const trafficDensity = Math.min(0.95, Number((0.3 + activeReports * 0.05).toFixed(2)));

    let stressLevel: 'low' | 'medium' | 'high' = 'low';
    if (floodRisk >= 0.65 || activeReports >= 8) {
      stressLevel = 'high';
    } else if (floodRisk >= 0.35 || activeReports >= 4) {
      stressLevel = 'medium';
    }

    return {
      zoneId,
      reportDensity: activeReports,
      trafficDensity,
      floodRiskProbability: floodRisk,
      weatherContext,
      stressLevel,
      isMock: true,
    };
  }

  /**
   * Menyimpan histori metrik ke zone_metrics & memperbarui status stress_level pada zona
   */
  private async persistZoneMetrics(result: ZonePredictionResult): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.zoneMetric.create({
        data: {
          zone_id: result.zoneId,
          report_density: result.reportDensity,
          traffic_density: result.trafficDensity,
          flood_risk_probability: result.floodRiskProbability,
          weather_context: result.weatherContext as Prisma.InputJsonValue,
        },
      }),
      this.prisma.zone.update({
        where: { id: result.zoneId },
        data: {
          stress_level: result.stressLevel,
        },
      }),
    ]);
  }

  /**
   * Memperbarui metrik seluruh zona di database
   */
  async refreshAllZoneMetrics(): Promise<{
    updatedCount: number;
    results: ZonePredictionResult[];
  }> {
    const zones = await this.prisma.zone.findMany();
    const results: ZonePredictionResult[] = [];

    for (const z of zones) {
      try {
        const res = await this.predictZoneMetrics(z.id);
        results.push(res);
      } catch (err) {
        this.logger.error(`Gagal update metrik untuk zona ${z.name} (${z.id})`, err);
      }
    }

    this.logger.log(`Berhasil memperbarui metrik untuk ${results.length}/${zones.length} zona.`);
    return { updatedCount: results.length, results };
  }

  /**
   * Cron Job: Refresh metrik prediksi seluruh zona setiap jam (Architecture.md §3.1)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyPredictionCron(): Promise<void> {
    this.logger.log('Menjalankan cron hourly zone metrics prediction...');
    await this.refreshAllZoneMetrics();
  }

  /**
   * Mengambil daftar zona dan status stress level terbarunya
   */
  async getZonesWithLatestMetrics(): Promise<
    {
      id: string;
      name: string;
      stress_level: StressLevel;
      latest_metric: {
        report_density: number;
        traffic_density: number | null;
        flood_risk_probability: number | null;
        weather_context: unknown;
        recorded_at: Date;
      } | null;
    }[]
  > {
    const zones = await this.prisma.zone.findMany({
      include: {
        metrics: {
          orderBy: { recorded_at: 'desc' },
          take: 1,
        },
      },
    });

    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      stress_level: z.stress_level,
      latest_metric: z.metrics[0]
        ? {
            report_density: z.metrics[0].report_density,
            traffic_density: z.metrics[0].traffic_density,
            flood_risk_probability: z.metrics[0].flood_risk_probability,
            weather_context: z.metrics[0].weather_context,
            recorded_at: z.metrics[0].recorded_at,
          }
        : null,
    }));
  }

  async getZoneMetricsHistory(zoneId: string, limit = 20) {
    const zone = await this.prisma.zone.findUnique({
      where: { id: zoneId },
    });
    if (!zone) {
      throw new NotFoundException(`Zona dengan ID '${zoneId}' tidak ditemukan.`);
    }

    const metrics = await this.prisma.zoneMetric.findMany({
      where: { zone_id: zoneId },
      orderBy: { recorded_at: 'desc' },
      take: limit,
    });

    return {
      zone: {
        id: zone.id,
        name: zone.name,
        stress_level: zone.stress_level,
      },
      metrics,
    };
  }
}
