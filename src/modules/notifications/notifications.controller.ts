import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';

@ApiTags('Notifications')
@ApiBearerAuth('bearer')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * List notifikasi pengguna — GET /api/v1/notifications
   */
  @Get()
  @ApiOperation({
    summary: 'Daftar Notifikasi Pengguna (In-App Notifications)',
    description:
      'Mengambil daftar notifikasi in-app untuk pengguna yang sedang login beserta jumlah notifikasi yang belum dibaca (unreadCount).',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, example: '88888888-8888-4000-8000-000000000001' })
  @ApiResponse({
    status: 200,
    description: 'Daftar notifikasi berhasil diambil',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '88888888-8888-4000-8000-000000000001',
            user_id: '11111111-1111-4000-8000-000000000001',
            type: 'status_update',
            title: 'Laporan Anda Sedang Dikerjakan',
            message:
              'Status laporan REP-2026-0001 telah diubah menjadi in_progress oleh petugas DPUPR.',
            is_read: false,
            reference_report_id: '44444444-4444-4000-8000-000000000001',
            created_at: '2026-08-22T10:00:00.000Z',
          },
        ],
        meta: {
          total: 1,
          unreadCount: 1,
          limit: 20,
          nextCursor: null,
          hasPrevious: false,
        },
        error: null,
      },
    },
  })
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
  @ApiOperation({
    summary: 'Tandai Notifikasi Telah Dibaca',
    description: 'Mengubah status satu notifikasi menjadi sudah dibaca (is_read = true).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID notifikasi (UUID v4)',
    example: '88888888-8888-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifikasi berhasil ditandai telah dibaca',
    schema: {
      example: {
        success: true,
        data: {
          id: '88888888-8888-4000-8000-000000000001',
          is_read: true,
          updated_at: '2026-08-22T10:30:00.000Z',
        },
        meta: null,
        error: null,
      },
    },
  })
  async markAsRead(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }

  /**
   * Tandai seluruh notifikasi telah dibaca — PATCH /api/v1/notifications/read-all
   */
  @Patch('read-all')
  @ApiOperation({
    summary: 'Tandai Semua Notifikasi Telah Dibaca',
    description: 'Menandai seluruh notifikasi yang belum dibaca milik pengguna menjadi sudah dibaca.',
  })
  @ApiResponse({
    status: 200,
    description: 'Semua notifikasi berhasil ditandai telah dibaca',
    schema: {
      example: {
        success: true,
        data: {
          message: 'Seluruh notifikasi berhasil ditandai telah dibaca.',
          updatedCount: 4,
        },
        meta: null,
        error: null,
      },
    },
  })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}
