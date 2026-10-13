import { Controller, Post, Delete, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { RouteAlertSubscribeDto } from './dto/route-alert-subscribe.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Route Alerts')
@ApiBearerAuth('bearer')
@Controller('route-alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RouteAlertController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Daftarkan / perbarui subscription Route Alert — POST /api/v1/route-alerts/subscribe
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Daftarkan / Perbarui Subscription Route Alert',
    description:
      'Mendaftarkan FCM device token dan lokasi terkini pengguna untuk menerima peringatan bahaya rute secara geofencing.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription berhasil disimpan',
    schema: {
      example: {
        success: true,
        data: {
          user_id: '11111111-1111-4000-8000-000000000001',
          device_token: 'fcm_token_device_abc123xyz456...',
          last_lat: '-7.978469',
          last_long: '112.631782',
          updated_at: '2026-08-22T08:00:00.000Z',
        },
        meta: null,
        error: null,
      },
    },
  })
  async subscribe(@Body() dto: RouteAlertSubscribeDto, @CurrentUser('id') userId: string) {
    return this.notificationsService.subscribeRouteAlert(userId, dto);
  }

  /**
   * Hapus subscription Route Alert — DELETE /api/v1/route-alerts/unsubscribe
   */
  @Delete('unsubscribe')
  @ApiOperation({
    summary: 'Hentikan Langganan Route Alert',
    description: 'Menghapus data subscription FCM dan koordinat geofencing pengguna.',
  })
  @ApiResponse({
    status: 200,
    description: 'Langganan berhasil dibatalkan',
    schema: {
      example: {
        success: true,
        data: {
          message: 'Langganan Route Alert berhasil dibatalkan.',
        },
        meta: null,
        error: null,
      },
    },
  })
  async unsubscribe(@CurrentUser('id') userId: string) {
    return this.notificationsService.unsubscribeRouteAlert(userId);
  }

  /**
   * Simulasi / trigger manual pengecekan proximity — POST /api/v1/route-alerts/check
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger Pengecekan Proximity Route Alert Manual',
    description:
      'Memicu evaluasi geofencing manual antara lokasi pelanggan dan titik kerusakan aktif dalam radius 500 meter.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pengecekan selesai dijalankan',
    schema: {
      example: {
        success: true,
        data: {
          checkedSubscribers: 1,
          alertsTriggered: 0,
        },
        meta: null,
        error: null,
      },
    },
  })
  async triggerProximityCheck(@CurrentUser('id') userId: string) {
    return this.notificationsService.checkProximityAndTriggerAlerts(userId);
  }
}
