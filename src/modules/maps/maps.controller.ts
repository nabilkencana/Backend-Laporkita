import { Controller, Post, Body, BadRequestException, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapsService } from './maps.service.js';
import { CreateRouteDto } from './dto/create-route.dto.js';
import { isWithinJavaBounds } from '../reports/utils/geo.util.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Public } from '../../common/decorators/roles.decorator.js';

@ApiBearerAuth()
@ApiTags('Maps')
@Controller('maps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  /**
   * Routing A→B via OSRM — POST /api/v1/maps/route
   * Proxy ke OSRM untuk menghitung rute jalan antara 2 titik.
   * Hanya menerima koordinat di dalam bounding box Pulau Jawa.
   */
  @Public()
  @Post('route')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Routing A→B via OSRM',
    description: 'Proxy ke OSRM untuk menghitung rute jalan antara 2 titik. Output dalam format GeoJSON coordinates.',
  })
  @ApiResponse({ status: 200, description: 'Rute ditemukan' })
  @ApiResponse({ status: 400, description: 'Rute tidak ditemukan / koordinat luar Jawa' })
  async getRoute(@Body() dto: CreateRouteDto) {
    // Validasi bounding box Java untuk origin
    if (!isWithinJavaBounds(dto.origin_lat, dto.origin_lng)) {
      throw new BadRequestException(
        'Koordinat asal berada di luar wilayah Jawa. Rute hanya tersedia di Pulau Jawa.',
      );
    }

    // Validasi bounding box Java untuk destination
    if (!isWithinJavaBounds(dto.destination_lat, dto.destination_lng)) {
      throw new BadRequestException(
        'Koordinat tujuan berada di luar wilayah Jawa. Rute hanya tersedia di Pulau Jawa.',
      );
    }

    return this.mapsService.getRoute(
      dto.origin_lat,
      dto.origin_lng,
      dto.destination_lat,
      dto.destination_lng,
    );
  }
}