import { Controller, Get, Patch, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * List notifikasi pengguna — GET /api/v1/notifications
   */
  @Get()
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.notificationsService.getUserNotifications(
      userId,
      limit ? Number(limit) : 20,
      cursor,
    );
  }

  /**
   * Tandai satu notifikasi telah dibaca — PATCH /api/v1/notifications/:id/read
   */
  @Patch(':id/read')
  async markAsRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  /**
   * Tandai seluruh notifikasi telah dibaca — PATCH /api/v1/notifications/read-all
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}
