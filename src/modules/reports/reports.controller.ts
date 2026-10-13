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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service.js';
import { ReportDetail } from './reports.repository.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { TransitionStatusDto } from './dto/transition-status.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { ValidateReportDto } from './dto/validate-report.dto.js';
import { UploadMediaDto } from './dto/upload-media.dto.js';
import { QueryReportsDto } from './dto/query-reports.dto.js';
import { ReportsAlongRouteDto } from './dto/reports-along-route.dto.js';
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

@ApiTags('Reports')
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
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Kirim Laporan Kerusakan Baru (Citizen)',
    description:
      'Mengunggah laporan baru dengan foto bukti kerusakan (multipart/form-data). Memproses verifikasi AI awal secara asinkron (202 Accepted).',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    description:
      'Kunci idempotensi untuk mencegah duplikasi submit laporan (diprioritaskan dibanding body idempotency_key)',
    required: false,
  })
  @ApiBody({
    description: 'Data laporan dan foto bukti kerusakan fasilitas publik',
    schema: {
      type: 'object',
      required: ['photo', 'category_id', 'latitude', 'longitude'],
      properties: {
        photo: {
          type: 'string',
          format: 'binary',
          description: 'Foto bukti kerusakan fisik fasilitas (JPG/PNG/WEBP, max 5MB)',
        },
        category_id: {
          type: 'string',
          format: 'uuid',
          example: '33333333-3333-4000-8000-000000000001',
          description: 'ID kategori laporan',
        },
        latitude: {
          type: 'number',
          example: -7.978469,
          description: 'Koordinat latitude lokasi kerusakan (Pulau Jawa)',
        },
        longitude: {
          type: 'number',
          example: 112.631782,
          description: 'Koordinat longitude lokasi kerusakan (Pulau Jawa)',
        },
        address_text: {
          type: 'string',
          example: 'Jl. Ijen No. 12, Klojen, Kota Malang',
          description: 'Deskripsi alamat fisik lokasi kerusakan',
        },
        description: {
          type: 'string',
          example:
            'Terdapat lubang jalan berdiameter sekitar 50cm dengan kedalaman 10cm di lajur kiri arah simpang balapan.',
          description: 'Detail deskripsi kerusakan fasilitas publik',
        },
        idempotency_key: {
          type: 'string',
          example: 'idem-rep-20260822-001',
          description: 'Kunci idempotensi opsional jika tidak dikirim via header X-Idempotency-Key',
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Laporan diterima untuk verifikasi AI asinkron',
    schema: {
      example: {
        success: true,
        data: {
          id: '44444444-4444-4000-8000-000000000001',
          report_code: 'REP-2026-0001',
          reporter_id: '11111111-1111-4000-8000-000000000001',
          category_id: '33333333-3333-4000-8000-000000000001',
          status: 'pending_verification',
          latitude: -7.978469,
          longitude: 112.631782,
          address_text: 'Jl. Ijen No. 12, Klojen, Kota Malang',
          description: 'Terdapat lubang jalan berdiameter sekitar 50cm...',
          created_at: '2026-08-22T08:00:00.000Z',
        },
        meta: null,
        error: null,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validasi gagal atau berkas tidak sesuai spesifikasi',
  })
  @Post()
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
   * Laporan di Sepanjang Rute — POST /api/v1/reports/along-route
   * Mengembalikan laporan aktif dalam radius tertentu dari setiap titik rute.
   */
  @Public()
  @Post('along-route')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Laporan di Sepanjang Rute Jalan (Publik)',
    description:
      'Mengembalikan laporan aktif yang berada dalam radius dari titik-titik rute yang diberikan. Hasil diurutkan dari yang terdekat.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar laporan di sepanjang rute',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '44444444-4444-4000-8000-000000000001',
            report_code: 'REP-2026-0001',
            status: 'verified',
            latitude: -7.978469,
            longitude: 112.631782,
            distance_meters: 42.5,
            category: { name: 'Jalan Rusak / Berlubang' },
          },
        ],
        meta: null,
        error: null,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validasi gagal / data rute tidak valid' })
  async findReportsAlongRoute(@Body() dto: ReportsAlongRouteDto) {
    return this.reportsService.findReportsAlongRoute(
      dto.route_points,
      dto.radius_meters,
    );
  }

  /**
   * List Laporan (Peta Publik / Beranda / Filter) — GET /api/v1/reports
   * Cursor-based pagination sesuai Rules.md §3
   */
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Daftar Laporan Publik & Filter Peta (Publik)',
    description:
      'Mengambil daftar laporan dengan cursor-based pagination dan filter status, kategori, atau bounding box wilayah.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar laporan berhasil diambil',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '44444444-4444-4000-8000-000000000001',
            report_code: 'REP-2026-0001',
            status: 'verified',
            latitude: -7.978469,
            longitude: 112.631782,
            address_text: 'Jl. Ijen No. 12, Klojen, Kota Malang',
            urgency_score: 85,
            category: {
              id: '33333333-3333-4000-8000-000000000001',
              name: 'Jalan Rusak / Berlubang',
              icon_url: 'https://storage.laporkita.id/icons/road.svg',
            },
            assigned_agency: {
              id: '22222222-2222-4000-8000-000000000001',
              name: 'Dinas Pekerjaan Umum dan Penataan Ruang (DPUPR)',
              type: 'dpupr',
            },
            reporter: {
              id: '11111111-1111-4000-8000-000000000001',
              full_name: 'Budi Santoso',
              avatar_url: null,
            },
            media: [
              {
                id: '55555555-5555-4000-8000-000000000001',
                url: 'https://storage.laporkita.id/reports/photo-1.jpg',
                type: 'initial_photo',
              },
            ],
            _count: { supports: 15, comments: 4, validations: 0 },
            created_at: '2026-08-22T08:00:00.000Z',
          },
        ],
        meta: {
          total: 1,
          limit: 20,
          nextCursor: null,
          hasPrevious: false,
        },
        error: null,
      },
    },
  })
  async findAll(@Query() query: QueryReportsDto): Promise<PaginatedResult<ReportDetail>> {
    return this.reportsService.findAll(query);
  }

  /**
   * Detail Laporan — GET /api/v1/reports/:id
   */
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Detail Lengkap Laporan (Publik)',
    description:
      'Mengambil informasi lengkap laporan, riwayat status, foto pengerjaan, dan jumlah dukungan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail laporan berhasil diambil',
  })
  @ApiResponse({
    status: 404,
    description: 'Laporan tidak ditemukan',
  })
  async findById(@Param('id', new UuidValidationPipe()) id: string): Promise<ReportDetail> {
    return this.reportsService.findById(id);
  }

  /**
   * Mutasi Status Laporan — PATCH /api/v1/reports/:id/status
   * Operator & Admin only (Rules.md §1.1)
   */
  @Patch(':id/status')
  @ApiBearerAuth('bearer')
  @Roles(UserRole.operator, UserRole.admin)
  @ApiOperation({
    summary: 'Perbarui Status Laporan (Operator & Admin Only)',
    description: 'Memproses transisi status laporan sesuai state machine resmi.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Status laporan berhasil diubah',
  })
  @ApiResponse({
    status: 400,
    description: 'Transisi status tidak valid / melanggar state machine',
  })
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
  @ApiBearerAuth('bearer')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Beri Dukungan / Upvote pada Laporan (Citizen)',
    description: 'Menambahkan 1 dukungan warga untuk mempercepat penanganan perbaikan fasilitas.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 201,
    description: 'Dukungan berhasil ditambahkan',
    schema: {
      example: {
        success: true,
        data: { message: 'Dukungan berhasil ditambahkan.', support_count: 15 },
        meta: null,
        error: null,
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Pengguna sudah mendukung laporan ini',
  })
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
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Batalkan Dukungan (Grace Period 5 Menit)',
    description: 'Membatalkan dukungan yang telah diberikan dalam waktu maksimal 5 menit.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Dukungan berhasil dibatalkan',
    schema: {
      example: {
        success: true,
        data: { message: 'Dukungan berhasil dibatalkan.', support_count: 14 },
        meta: null,
        error: null,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Batas waktu pembatalan 5 menit telah terlewat',
  })
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
  @ApiBearerAuth('bearer')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tulis Komentar pada Laporan',
    description: 'Mengirimkan tanggapan atau informasi tambahan terkait laporan perbaikan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 201,
    description: 'Komentar berhasil ditambahkan',
    schema: {
      example: {
        success: true,
        data: {
          id: '66666666-6666-4000-8000-000000000001',
          content: 'Apakah perbaikan jalan ini sudah dijadwalkan oleh dinas terkait?',
          created_at: '2026-08-22T09:00:00.000Z',
        },
        meta: null,
        error: null,
      },
    },
  })
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
  @ApiBearerAuth('bearer')
  @Roles(UserRole.operator, UserRole.admin)
  @ApiOperation({
    summary: 'Daftar Komentar Terflag Kata Kasar (Operator & Admin Only)',
    description:
      'Menampilkan antrian komentar yang terdeteksi mengandung kata kasar untuk tindakan moderasi.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, example: '66666666-6666-4000-8000-000000000001' })
  @ApiResponse({
    status: 200,
    description: 'Daftar komentar terflag berhasil diambil',
  })
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
  @ApiOperation({
    summary: 'Daftar Komentar Laporan (Publik)',
    description: 'Mengambil riwayat komentar warga dan tanggapan dinas pada satu laporan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, example: '66666666-6666-4000-8000-000000000001' })
  @ApiResponse({
    status: 200,
    description: 'Daftar komentar berhasil diambil',
  })
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
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Validasi Penyelesaian oleh Warga (Citizen Verification)',
    description:
      'Warga memverifikasi apakah laporan yang berstatus completed benar-benar sudah selesai (menjadi resolved) atau belum tuntas (disputed).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Validasi berhasil dicatat',
    schema: {
      example: {
        success: true,
        data: {
          message: 'Validasi berhasil dicatat. Status laporan kini RESOLVED.',
          new_status: 'resolved',
        },
        meta: null,
        error: null,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Laporan belum berstatus COMPLETED atau berada di luar radius 100m',
  })
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
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('photo'))
  @ApiOperation({
    summary: 'Upload Foto Progres atau Penyelesaian Perbaikan',
    description:
      'Petugas dinas / operator mengunggah dokumentasi foto perkembangan (progress_photo) atau hasil perbaikan tuntas (completion_photo).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID laporan (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @ApiBody({
    description: 'Upload foto progres atau penyelesaian perbaikan',
    schema: {
      type: 'object',
      required: ['photo', 'type'],
      properties: {
        photo: {
          type: 'string',
          format: 'binary',
          description: 'File foto pengerjaan (JPG/PNG/WEBP, max 5MB)',
        },
        type: {
          type: 'string',
          enum: ['progress_photo', 'completion_photo'],
          example: 'progress_photo',
          description: 'Jenis dokumentasi foto pengerjaan',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Media foto berhasil diunggah',
    schema: {
      example: {
        success: true,
        data: {
          id: '55555555-5555-4000-8000-000000000001',
          url: 'https://storage.laporkita.id/reports/progress-1.jpg',
          type: 'progress_photo',
        },
        meta: null,
        error: null,
      },
    },
  })
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
