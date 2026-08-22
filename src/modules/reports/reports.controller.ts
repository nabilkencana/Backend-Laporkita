import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { ReportDetail } from './reports.repository.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { TransitionStatusDto } from './dto/transition-status.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { ValidateReportDto } from './dto/validate-report.dto.js';
import { UploadMediaDto } from './dto/upload-media.dto.js';
import { QueryReportsDto } from './dto/query-reports.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { PaginatedResult } from '../../common/interceptors/response.interceptor.js';
import { Report, UserRole, ReportStatus, MediaType } from '@prisma/client';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Submit Laporan — POST /api/v1/reports
   * Response: 202 Accepted (Rules.md §3 & Architecture.md §3.3)
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submitReport(
    @Body() dto: CreateReportDto,
    @CurrentUser('id') reporterId: string,
  ): Promise<Report> {
    return this.reportsService.submitReport(dto, reporterId);
  }

  /**
   * List Laporan (Peta Publik / Beranda / Filter) — GET /api/v1/reports
   * Cursor-based pagination sesuai Rules.md §3
   */
  @Public()
  @Get()
  async findAll(@Query() query: QueryReportsDto): Promise<PaginatedResult<ReportDetail>> {
    return this.reportsService.findAll(query);
  }

  /**
   * Detail Laporan — GET /api/v1/reports/:id
   */
  @Public()
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ReportDetail> {
    return this.reportsService.findById(id);
  }

  /**
   * Mutasi Status Laporan — PATCH /api/v1/reports/:id/status
   * Operator & Admin only (Rules.md §1.1)
   */
  @Patch(':id/status')
  @Roles(UserRole.operator, UserRole.admin)
  async transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser('id') actorId: string,
  ): Promise<Report> {
    return this.reportsService.transitionReportStatus(id, dto.status, actorId, dto.note);
  }

  /**
   * Beri Dukungan / Upvote — POST /api/v1/reports/:id/support
   */
  @Post(':id/support')
  @HttpCode(HttpStatus.CREATED)
  async supportReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string; support_count: number }> {
    return this.reportsService.supportReport(id, userId);
  }

  /**
   * Batalkan Dukungan (Grace Period 5 Menit) — DELETE /api/v1/reports/:id/support
   */
  @Delete(':id/support')
  async cancelSupport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string; support_count: number }> {
    return this.reportsService.cancelSupport(id, userId);
  }

  /**
   * Kirim Komentar — POST /api/v1/reports/:id/comments
   */
  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<{ id: string; content: string; created_at: Date }> {
    return this.reportsService.addComment(id, userId, dto);
  }

  /**
   * List Komentar — GET /api/v1/reports/:id/comments (Cursor-based)
   */
  @Public()
  @Get(':id/comments')
  async getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<
    PaginatedResult<{
      id: string;
      content: string;
      created_at: Date;
      user: { id: string; full_name: string; avatar_url: string | null; role: string };
    }>
  > {
    return this.reportsService.getComments(id, limit ? Number(limit) : 20, cursor);
  }

  /**
   * Citizen Validation — POST /api/v1/reports/:id/validate (Rules.md §1.5)
   */
  @Post(':id/validate')
  async validateReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateReportDto,
  ): Promise<{ message: string; new_status: ReportStatus }> {
    return this.reportsService.validateReport(id, user, dto);
  }

  /**
   * Upload Media (Progress Photo / Completion Photo) — POST /api/v1/reports/:id/media
   */
  @Post(':id/media')
  @HttpCode(HttpStatus.CREATED)
  async uploadMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') uploaderId: string,
    @Body() dto: UploadMediaDto,
  ): Promise<{ id: string; url: string; type: MediaType }> {
    return this.reportsService.uploadMedia(reportIdFromParam(id), uploaderId, dto);
  }
}

function reportIdFromParam(id: string): string {
  return id;
}
