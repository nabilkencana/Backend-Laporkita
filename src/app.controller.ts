import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Cek Status Kesehatan Layanan (Health Check)',
    description: 'Mengembalikan status operasional server, timestamp ISO, dan versi API.',
  })
  @ApiResponse({
    status: 200,
    description: 'Layanan berjalan normal',
    schema: {
      example: {
        success: true,
        data: {
          status: 'ok',
          timestamp: '2026-10-13T12:00:00.000Z',
          version: '1.0.0',
        },
        meta: null,
        error: null,
      },
    },
  })
  getHealth(): { status: string; timestamp: string; version: string } {
    return this.appService.getHealth();
  }
}
