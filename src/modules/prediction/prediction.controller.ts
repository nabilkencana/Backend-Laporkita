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
import { ApiBearerAuth } from '@nestjs/swagger';
import { PredictionService } from './prediction.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { UserRole } from '@prisma/client';

@Controller('predictions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  /**
   * List seluruh zona beserta metrik terkini — GET /api/v1/predictions/zones
   */
  @Public()
  @Get('zones')
  async getZones() {
    return this.predictionService.getZonesWithLatestMetrics();
  }

  /**
   * Histori metrik zona — GET /api/v1/predictions/zones/:zoneId/metrics
   */
  @Public()
  @Get('zones/:zoneId/metrics')
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
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.policy_maker, UserRole.admin)
  @HttpCode(HttpStatus.OK)
  async refreshMetrics() {
    return this.predictionService.refreshAllZoneMetrics();
  }
}
