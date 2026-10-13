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
    summary: 'Routing Navigasi A→B via OSRM (Pulau Jawa)',
    description:
      'Proxy ke OSRM untuk menghitung rute berkendara antara 2 titik koordinat di Pulau Jawa dengan output GeoJSON coordinates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rute ditemukan',
    schema: {
      example: {
        success: true,
        data: {
          coordinates: [
            [112.631782, -7.978469],
            [112.63185, -7.9782],
            [112.615668, -7.942493],
          ],
          distance_meters: 5240.8,
          duration_seconds: 780.2,
          cached: false,
        },
        meta: null,
        error: null,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Koordinat di luar Pulau Jawa atau rute tidak ditemukan',
    schema: {
      example: {
        success: false,
        data: null,
        error: {
          code: 'BAD_REQUEST',
          message: 'Koordinat asal berada di luar wilayah Jawa. Rute hanya tersedia di Pulau Jawa.',
        },
      },
    },
  })
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