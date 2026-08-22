import { Controller, Post, Delete, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { RouteAlertSubscribeDto } from './dto/route-alert-subscribe.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@ApiBearerAuth()
@Controller('route-alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RouteAlertController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Daftarkan / perbarui subscription Route Alert — POST /api/v1/route-alerts/subscribe
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(@Body() dto: RouteAlertSubscribeDto, @CurrentUser('id') userId: string) {
    return this.notificationsService.subscribeRouteAlert(userId, dto);
  }

  /**
   * Hapus subscription Route Alert — DELETE /api/v1/route-alerts/unsubscribe
   */
  @Delete('unsubscribe')
  async unsubscribe(@CurrentUser('id') userId: string) {
    return this.notificationsService.unsubscribeRouteAlert(userId);
  }

  /**
   * Simulasi / trigger manual pengecekan proximity — POST /api/v1/route-alerts/check
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  async triggerProximityCheck(@CurrentUser('id') userId: string) {
    return this.notificationsService.checkProximityAndTriggerAlerts(userId);
  }
}
