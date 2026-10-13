import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PredictionService } from './prediction.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { UserRole } from '@prisma/client';

@ApiTags('Predictions')
@Controller('predictions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  /**
   * List seluruh zona beserta metrik terkini — GET /api/v1/predictions/zones
   */
  @Public()
  @Get('zones')
  @ApiOperation({
    summary: 'Daftar Zona Kota & Prediksi Risiko Terkini (Publik)',
    description:
      'Mengembalikan daftar zona wilayah perkotaan beserta tingkat stres (stress_level) dan metrik risiko kepadatan laporan / cuaca terbaru.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar zona dengan metrik terkini berhasil diambil',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '55555555-5555-4000-8000-000000000001',
            name: 'Kecamatan Klojen',
            stress_level: 'medium',
            latest_metric: {
              report_density: 12.5,
              traffic_density: 0.75,
              flood_risk_probability: 0.35,
              weather_context: {
                condition: 'Hujan Ringan',
                temp_c: 24.5,
              },
              recorded_at: '2026-08-22T08:00:00.000Z',
            },
          },
        ],
        meta: null,
        error: null,
      },
    },
  })
  async getZones() {
    return this.predictionService.getZonesWithLatestMetrics();
  }

  /**
   * Histori metrik zona — GET /api/v1/predictions/zones/:zoneId/metrics
   */
  @Public()
  @Get('zones/:zoneId/metrics')
  @ApiOperation({
    summary: 'Histori Metrik Prediksi Risiko Zona (Publik)',
    description: 'Mengambil riwayat data rekaman metrik prediksi risiko pada satu zona tertentu.',
  })
  @ApiParam({
    name: 'zoneId',
    description: 'ID zona (UUID v4)',
    example: '55555555-5555-4000-8000-000000000001',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Histori metrik zona berhasil diambil',
    schema: {
      example: {
        success: true,
        data: {
          zone: {
            id: '55555555-5555-4000-8000-000000000001',
            name: 'Kecamatan Klojen',
            stress_level: 'medium',
          },
          metrics: [
            {
              id: '66666666-6666-4000-8000-000000000001',
              zone_id: '55555555-5555-4000-8000-000000000001',
              report_density: 12.5,
              traffic_density: 0.75,
              flood_risk_probability: 0.35,
              weather_context: { condition: 'Hujan Ringan', temp_c: 24.5 },
              recorded_at: '2026-08-22T08:00:00.000Z',
            },
          ],
        },
        meta: null,
        error: null,
      },
    },
  })
  async getZoneMetrics(
    @Param('zoneId', new UuidValidationPipe()) zoneId: string,
    @Query('limit') limit?: number,
  ) {
    return this.predictionService.getZoneMetricsHistory(zoneId, limit ? Number(limit) : 20);
  }

  /**
   * Trigger refresh prediksi metrik seluruh zona — POST /api/v1/predictions/metrics/refresh
   * Khusus operator, policy_maker, dan admin
   */
  @Post('metrics/refresh')
  @ApiBearerAuth('bearer')
  @Roles(UserRole.operator, UserRole.policy_maker, UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger Refresh Prediksi Risiko Seluruh Zona (Operator, Policy Maker, Admin Only)',
    description:
      'Memicu pembaruan metrik prediksi XGBoost dan cuaca untuk seluruh zona kota secara instan.',
  })
  @ApiResponse({
    status: 200,
    description: 'Metrik seluruh zona berhasil diperbarui',
    schema: {
      example: {
        success: true,
        data: {
          updatedCount: 5,
          results: [
            {
              zoneId: '55555555-5555-4000-8000-000000000001',
              zoneName: 'Kecamatan Klojen',
              reportDensity: 12.5,
              trafficDensity: 0.75,
              floodRiskProbability: 0.35,
              weatherContext: { condition: 'Hujan Ringan' },
              stressLevel: 'medium',
            },
          ],
        },
        meta: null,
        error: null,
      },
    },
  })
  async refreshMetrics() {
    return this.predictionService.refreshAllZoneMetrics();
  }
}
