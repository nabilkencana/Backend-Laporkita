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
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiHeader, ApiConsumes } from '@nestjs/swagger';
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
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { FileValidationPipe } from '../../common/pipes/file-validation.pipe.js';
import { PaginatedResult } from '../../common/interceptors/response.interceptor.js';
import { StorageService } from '../storage/storage.service.js';
import { Report, UserRole, ReportStatus, MediaType } from '@prisma/client';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Submit Laporan — POST /api/v1/reports
   * WAJIB multipart/form-data dengan upload file 'photo' (Rules.md §2.1 & Architecture.md §7)
   * Response: 202 Accepted (Rules.md §3 & Architecture.md §3.3)
   * Rate limited: max 10 requests / menit (Architecture.md §7)
   */
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: 'X-Idempotency-Key',
    description:
      'Kunci idempotensi untuk mencegah duplikasi submit laporan (diprioritaskan dibanding body idempotency_key)',
    required: false,
  })
  @Post()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('photo'))
  async submitReport(
    @Body() dto: CreateReportDto,
    @CurrentUser('id') reporterId: string,
    @UploadedFile(new FileValidationPipe({ optional: false })) file: Express.Multer.File,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
  ): Promise<Report> {
    const finalIdempotencyKey = headerIdempotencyKey || dto.idempotency_key;
    const photoUrl = await this.storageService.uploadFile(file, 'reports');
    return this.reportsService.submitReport(
      { ...dto, idempotency_key: finalIdempotencyKey, photo_url: photoUrl },
      reporterId,
    );
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
  async findById(@Param('id', new UuidValidationPipe()) id: string): Promise<ReportDetail> {
    return this.reportsService.findById(id);
  }

  /**
   * Mutasi Status Laporan — PATCH /api/v1/reports/:id/status
   * Operator & Admin only (Rules.md §1.1)
   */
  @Patch(':id/status')
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.admin)
  async transitionStatus(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser('id') actorId: string,
  ): Promise<Report> {
    return this.reportsService.transitionReportStatus(id, dto.status, actorId, dto.note);
  }

  /**
   * Beri Dukungan / Upvote — POST /api/v1/reports/:id/support
   * Rate limited: max 30 requests / menit (Architecture.md §7)
   */
  @Post(':id/support')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async supportReport(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string; support_count: number }> {
    return this.reportsService.supportReport(id, userId);
  }

  /**
   * Batalkan Dukungan (Grace Period 5 Menit) — DELETE /api/v1/reports/:id/support
   */
  @Delete(':id/support')
  @ApiBearerAuth()
  async cancelSupport(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string; support_count: number }> {
    return this.reportsService.cancelSupport(id, userId);
  }

  /**
   * Kirim Komentar — POST /api/v1/reports/:id/comments
   * Rate limited: max 20 requests / menit (Architecture.md §7)
   */
  @Post(':id/comments')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async addComment(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<{ id: string; content: string; created_at: Date }> {
    return this.reportsService.addComment(id, userId, dto);
  }

  /**
   * SA-1: Daftar Komentar Terflag (Moderator) — GET /api/v1/reports/comments/flagged
   * Hanya operator/admin. Menampilkan komentar dengan kata kasar untuk review & tindakan.
   * WAJIB didefinisikan SEBELUM ':id/comments' agar tidak di-intercept sebagai UUID param.
   */
  @Get('comments/flagged')
  @ApiBearerAuth()
  @Roles(UserRole.operator, UserRole.admin)
  async getFlaggedComments(
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<
    PaginatedResult<{
      id: string;
      content: string;
      is_flagged: boolean;
      created_at: Date;
      user: { id: string; full_name: string; avatar_url: string | null; role: string };
      report: { id: string; report_code: string };
    }>
  > {
    return this.reportsService.getFlaggedComments(limit ? Number(limit) : 20, cursor);
  }

  /**
   * List Komentar — GET /api/v1/reports/:id/comments (Cursor-based)
   */
  @Public()
  @Get(':id/comments')
  async getComments(
    @Param('id', new UuidValidationPipe()) id: string,
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
  @ApiBearerAuth()
  async validateReport(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateReportDto,
  ): Promise<{ message: string; new_status: ReportStatus }> {
    return this.reportsService.validateReport(id, user, dto);
  }

  /**
   * Upload Media (Progress Photo / Completion Photo) — POST /api/v1/reports/:id/media
   * WAJIB multipart/form-data dengan upload file 'photo' (Rules.md §2.1 & Architecture.md §7)
   */
  @ApiConsumes('multipart/form-data')
  @Post(':id/media')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('photo'))
  async uploadMedia(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadMediaDto,
    @UploadedFile(new FileValidationPipe({ optional: false })) file: Express.Multer.File,
  ): Promise<{ id: string; url: string; type: MediaType }> {
    const mediaUrl = await this.storageService.uploadFile(file, 'reports');
    return this.reportsService.uploadMedia(id, user, { ...dto, url: mediaUrl });
  }
}
