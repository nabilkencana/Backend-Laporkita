import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ReportStatus,
  MediaType,
  ContributionReason,
  Report,
  NotificationType,
  UserRole,
} from '@prisma/client';
import { ReportsRepository, ReportDetail } from './reports.repository.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SmartPriorityService } from '../smart-priority/smart-priority.service.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { ValidateReportDto } from './dto/validate-report.dto.js';
import { UploadMediaDto } from './dto/upload-media.dto.js';
import { QueryReportsDto } from './dto/query-reports.dto.js';
import { isWithinMalangBounds, calculateHaversineDistanceMeters } from './utils/geo.util.js';
import { maskProfanity } from './utils/profanity-filter.util.js';
import { generateReportCode } from './utils/report-code.util.js';
import { validateMediaUrlFormat } from './utils/file-upload.util.js';
import { PaginatedResult } from '../../common/interceptors/response.interceptor.js';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly reportsRepository: ReportsRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly smartPriorityService: SmartPriorityService,
    @Optional() @InjectQueue('verify-report') private readonly verifyReportQueue?: Queue,
  ) {}

  // ── 1. Submit Laporan (Rules.md §2.1 & Architecture.md §3.3) ────────────────

  async submitReport(dto: CreateReportDto, reporterId: string): Promise<Report> {
    // 1. Validasi idempotency key
    if (dto.idempotency_key) {
      const existing = await this.reportsRepository.findByIdempotencyKey(dto.idempotency_key);
      if (existing) {
        this.logger.warn(
          `Laporan duplikat terdeteksi dengan idempotency_key: ${dto.idempotency_key}`,
        );
        return existing;
      }
    }

    // 2. Validasi format & tipe file URL foto (Architecture.md §7)
    validateMediaUrlFormat(dto.photo_url);

    // 3. Validasi Geografis Kota Malang (Bounding Box) — Rules.md §2.1
    const latMin = Number(this.configService.get<number>('MALANG_LAT_MIN') ?? -8.25);
    const latMax = Number(this.configService.get<number>('MALANG_LAT_MAX') ?? -7.85);
    const lngMin = Number(this.configService.get<number>('MALANG_LNG_MIN') ?? 112.5);
    const lngMax = Number(this.configService.get<number>('MALANG_LNG_MAX') ?? 112.8);

    const isInBounds = isWithinMalangBounds(dto.latitude, dto.longitude, {
      LAT_MIN: latMin,
      LAT_MAX: latMax,
      LNG_MIN: lngMin,
      LNG_MAX: lngMax,
    });

    if (!isInBounds) {
      throw new BadRequestException(
        `Lokasi laporan (${dto.latitude}, ${dto.longitude}) berada di luar wilayah pilot Kota Malang (Rules.md §2.1).`,
      );
    }

    // 3. Validasi kategori aktif & dapatkan default_agency_id untuk auto routing (Rules.md §1.7)
    const category = await this.prisma.category.findUnique({
      where: { id: dto.category_id },
    });
    if (!category) {
      throw new BadRequestException(`Kategori dengan ID '${dto.category_id}' tidak ditemukan.`);
    }

    // 4. Generate report_code format #LP-YYYY-NNNNNN (ERD.md §2.4)
    const currentYear = new Date().getFullYear();
    const countThisYear = await this.reportsRepository.countTotalReportsInYear(currentYear);
    const reportCode = generateReportCode(countThisYear + 1, currentYear);

    // 5. Simpan laporan ke DB dalam satu transaksi (Rules.md §1.1: status pending_verification)
    const report = await this.reportsRepository.createReportInTransaction({
      report_code: reportCode,
      reporter_id: reporterId,
      category_id: dto.category_id,
      assigned_agency_id: category.default_agency_id,
      description: dto.description ? maskProfanity(dto.description) : null,
      latitude: dto.latitude,
      longitude: dto.longitude,
      address_text: dto.address_text,
      idempotency_key: dto.idempotency_key,
      photo_url: dto.photo_url,
    });

    this.logger.log(`Laporan baru berhasil disubmit: ${report.report_code} (${report.id})`);

    // 6. Enqueue background AI verification job ke queue 'verify-report' (Architecture.md §3.3)
    if (this.verifyReportQueue) {
      try {
        await this.verifyReportQueue.add(
          'verify-report-job',
          { reportId: report.id },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
          },
        );
      } catch (err) {
        this.logger.error(`Gagal enqueue job verify-report untuk ${report.id}`, err);
      }
    }

    // 7. Hitung ulang skor urgensi laporan di sekitar lokasi laporan baru (Rules.md §1.3)
    void this.smartPriorityService.recalculateNearbyReports(
      Number(report.latitude),
      Number(report.longitude),
    );

    return report;
  }

  // ── 2. State Machine Transitions (Rules.md §1.1) ───────────────────────────

  /**
   * Method terpusat untuk transisi status laporan persis sesuai diagram Rules.md §1.1:
   * pending_verification → verified | rejected
   * verified → assigned
   * assigned → in_progress
   * in_progress → completed (wajib completion_photo)
   * completed → resolved | disputed
   * disputed → kembali ke in_progress (recalculate priority)
   * rejected = final
   */
  async transitionReportStatus(
    reportId: string,
    targetStatus: ReportStatus,
    actorId?: string | null,
    note?: string | null,
  ): Promise<Report> {
    const report = await this.reportsRepository.findById(reportId);
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID '${reportId}' tidak ditemukan.`);
    }

    const currentStatus = report.status;

    // 1. Validasi status rejected adalah FINAL
    if (currentStatus === ReportStatus.rejected) {
      throw new ConflictException(
        `INVALID_STATUS_TRANSITION: Laporan berstatus 'rejected' bersifat final dan tidak dapat diubah lagi (Rules.md §1.1).`,
      );
    }

    // 2. Validasi transisi legal
    this.validateStatusTransition(currentStatus, targetStatus);

    // 3. Validasi khusus: Transisi ke `completed` WAJIB ada completion_photo (Rules.md §1.1)
    if (targetStatus === ReportStatus.completed) {
      const completionPhotoCount = await this.reportsRepository.countMediaByType(
        reportId,
        MediaType.completion_photo,
      );
      if (completionPhotoCount === 0) {
        throw new BadRequestException(
          'COMPLETION_PHOTO_REQUIRED: Foto bukti penyelesaian (completion_photo) wajib diunggah sebelum menandai laporan selesai (Rules.md §1.1).',
        );
      }
    }

    // 4. Logika khusus per target status
    let effectiveTargetStatus = targetStatus;
    let newUrgencyScore: number | undefined = undefined;

    // A. Transisi ke `disputed`: otomatis balik ke `in_progress` & naikkan urgency_score (Rules.md §1.1 & §1.3)
    if (targetStatus === ReportStatus.disputed) {
      effectiveTargetStatus = ReportStatus.in_progress;
      // TODO: Fase 5 panggil Smart Priority service untuk kalkulasi ulang urgency_score
      newUrgencyScore = (report.urgency_score ?? 1.0) * 1.3; // Boost prioritas saat dispute
      this.logger.warn(
        `Laporan ${report.report_code} di-dispute! Kembali ke in_progress dengan skor prioritas dinaikkan.`,
      );
    }

    // B. Transisi pertama kali ke `verified`: beri +10 poin ke pelapor (Rules.md §1.6) dan insert row notifikasi (status_update)
    if (
      currentStatus === ReportStatus.pending_verification &&
      targetStatus === ReportStatus.verified
    ) {
      await this.awardPoints(report.reporter_id, 10, ContributionReason.report_verified, report.id);

      const isAiVerified = actorId === '00000000-0000-4000-8000-000000000001' || !actorId;
      const notificationBody = isAiVerified
        ? `Laporan ${report.report_code} telah terverifikasi secara otomatis oleh sistem kecerdasan LaporKita dan diteruskan ke instansi terkait.`
        : `Laporan ${report.report_code} telah diverifikasi oleh petugas operator dan diteruskan ke instansi terkait.`;

      await this.prisma.notification.create({
        data: {
          user_id: report.reporter_id,
          type: NotificationType.status_update,
          title: 'Laporan Anda Terverifikasi',
          body: notificationBody,
          reference_report_id: report.id,
        },
      });
      // TODO: Integrasi eksternal FCM Push Notification ke aplikasi mobile warga
    }

    // C. Transisi ke `rejected`: periksa apakah pelapor memiliki >3 penolakan dalam 30 hari (Rules.md §1.6)
    if (targetStatus === ReportStatus.rejected) {
      if (!note) {
        throw new BadRequestException(
          'Catatan (note) wajib diisi saat menolak laporan (Rules.md §3).',
        );
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentRejections = await this.reportsRepository.countRecentRejections(
        report.reporter_id,
        thirtyDaysAgo,
      );

      // Jika ini adalah penolakan ke-4 atau lebih dalam 30 hari -> penalti -20 poin & flag akun
      if (recentRejections >= 3) {
        await this.awardPoints(
          report.reporter_id,
          -20,
          ContributionReason.report_submitted,
          report.id,
        );
        await this.prisma.user.update({
          where: { id: report.reporter_id },
          data: { is_flagged_for_review: true },
        });
        this.logger.warn(
          `User ${report.reporter_id} di-flag review dan diberi penalti -20 poin karena >3 laporan rejected dalam 30 hari.`,
        );
      }
    }

    // 5. Eksekusi transisi status & simpan history dalam database transaction
    return this.reportsRepository.updateStatusInTransaction({
      report_id: reportId,
      target_status: effectiveTargetStatus,
      actor_id: actorId,
      note:
        note ??
        (targetStatus === ReportStatus.disputed
          ? 'Warga menyatakan pekerjaan belum sesuai (Disputed)'
          : null),
      urgency_score: newUrgencyScore,
    });
  }

  private validateStatusTransition(from: ReportStatus, to: ReportStatus): void {
    const validTransitions: Record<ReportStatus, ReportStatus[]> = {
      [ReportStatus.pending_verification]: [ReportStatus.verified, ReportStatus.rejected],
      [ReportStatus.verified]: [ReportStatus.assigned],
      [ReportStatus.assigned]: [ReportStatus.in_progress],
      [ReportStatus.in_progress]: [ReportStatus.completed],
      [ReportStatus.completed]: [ReportStatus.resolved, ReportStatus.disputed],
      [ReportStatus.resolved]: [], // resolved is final
      [ReportStatus.disputed]: [ReportStatus.in_progress],
      [ReportStatus.rejected]: [], // rejected is final
    };

    const allowed = validTransitions[from] || [];
    if (!allowed.includes(to)) {
      throw new ConflictException(
        `INVALID_STATUS_TRANSITION: Tidak dapat mengubah status dari '${from}' ke '${to}'. Alur yang diperbolehkan dari '${from}' adalah: [${allowed.join(', ')}] (Rules.md §1.1).`,
      );
    }
  }

  // ── 3. Dukungan Warga / Upvote (Rules.md §1.4) ──────────────────────────────

  async supportReport(
    reportId: string,
    userId: string,
  ): Promise<{ message: string; support_count: number }> {
    const report = await this.reportsRepository.findById(reportId);
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID '${reportId}' tidak ditemukan.`);
    }

    const existingSupport = await this.reportsRepository.findSupport(reportId, userId);
    if (existingSupport) {
      throw new ConflictException(
        'ALREADY_SUPPORTED: Anda sudah memberikan dukungan untuk laporan ini (Rules.md §1.4).',
      );
    }

    await this.reportsRepository.addSupportInTransaction(reportId, userId);

    // Hitung ulang skor urgensi berdasarkan jumlah dukungan baru (Rules.md §1.3)
    void this.smartPriorityService.recalculateUrgencyScore(reportId);

    return {
      message: 'Dukungan berhasil ditambahkan.',
      support_count: report.support_count + 1,
    };
  }

  async cancelSupport(
    reportId: string,
    userId: string,
  ): Promise<{ message: string; support_count: number }> {
    const report = await this.reportsRepository.findById(reportId);
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID '${reportId}' tidak ditemukan.`);
    }

    const support = await this.reportsRepository.findSupport(reportId, userId);
    if (!support) {
      throw new NotFoundException('Anda belum memberikan dukungan untuk laporan ini.');
    }

    // Grace Period: hanya boleh dibatalkan dalam 5 menit pertama sejak dibuat (Rules.md §1.4)
    const gracePeriodMinutes = Number(
      this.configService.get<number>('SUPPORT_GRACE_PERIOD_MINUTES') ?? 5,
    );
    const timeDiffMinutes = (Date.now() - support.created_at.getTime()) / (1000 * 60);

    if (timeDiffMinutes > gracePeriodMinutes) {
      throw new ConflictException(
        `GRACE_PERIOD_EXPIRED: Dukungan tidak dapat dibatalkan setelah ${gracePeriodMinutes} menit pertama (Rules.md §1.4).`,
      );
    }

    await this.reportsRepository.removeSupportInTransaction(reportId, userId);

    // Hitung ulang skor urgensi setelah pembatalan dukungan (Rules.md §1.3)
    void this.smartPriorityService.recalculateUrgencyScore(reportId);

    return {
      message: 'Dukungan berhasil dibatalkan.',
      support_count: Math.max(0, report.support_count - 1),
    };
  }

  // ── 4. Comments (Rules.md §2.3) ───────────────────────────────────────────

  async addComment(
    reportId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<{ id: string; content: string; created_at: Date }> {
    const report = await this.reportsRepository.findById(reportId);
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID '${reportId}' tidak ditemukan.`);
    }

    const cleanContent = maskProfanity(dto.content);
    const comment = await this.reportsRepository.addComment(reportId, userId, cleanContent);

    return {
      id: comment.id,
      content: comment.content,
      created_at: comment.created_at,
    };
  }

  async getComments(
    reportId: string,
    limit = 20,
    cursor?: string,
  ): Promise<
    PaginatedResult<{
      id: string;
      content: string;
      created_at: Date;
      user: { id: string; full_name: string; avatar_url: string | null; role: string };
    }>
  > {
    const { comments, total, nextCursor } = await this.reportsRepository.getComments(
      reportId,
      limit,
      cursor,
    );

    return {
      data: comments,
      meta: {
        total,
        limit,
        nextCursor,
        hasPrevious: !!cursor,
      },
    };
  }

  // ── 5. Citizen Validation (Rules.md §1.5) ───────────────────────────────────

  async validateReport(
    reportId: string,
    user: AuthenticatedUser,
    dto: ValidateReportDto,
  ): Promise<{ message: string; new_status: ReportStatus }> {
    const report = await this.reportsRepository.findById(reportId);
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID '${reportId}' tidak ditemukan.`);
    }

    if (report.status !== ReportStatus.completed) {
      throw new ConflictException(
        `Hanya laporan berstatus 'completed' yang dapat divalidasi oleh warga (status saat ini: '${report.status}').`,
      );
    }

    // Eligibility check: Pelapor asli ATAU warga dalam radius 100m (Rules.md §1.5)
    const isReporter = report.reporter_id === user.id;
    let isNearby = false;

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      const allowedRadiusM = Number(
        this.configService.get<number>('CITIZEN_VALIDATION_RADIUS_M') ?? 100,
      );
      const distanceMeters = calculateHaversineDistanceMeters(
        dto.latitude,
        dto.longitude,
        Number(report.latitude),
        Number(report.longitude),
      );

      if (distanceMeters <= allowedRadiusM) {
        isNearby = true;
      }
    }

    if (!isReporter && !isNearby) {
      throw new ForbiddenException(
        'NOT_ELIGIBLE_FOR_VALIDATION: Hanya pelapor asli atau warga dalam radius 100m dari lokasi kerusakan yang dapat melakukan validasi (Rules.md §1.5).',
      );
    }

    // Simpan data validasi & beri +5 poin kontribusi
    await this.reportsRepository.addCitizenValidationInTransaction({
      report_id: reportId,
      user_id: user.id,
      is_valid: dto.is_valid,
      note: dto.note,
    });

    // Transisi status: true -> resolved, false -> disputed (kembali ke in_progress)
    const targetStatus = dto.is_valid ? ReportStatus.resolved : ReportStatus.disputed;
    const updated = await this.transitionReportStatus(reportId, targetStatus, user.id, dto.note);

    return {
      message: dto.is_valid
        ? 'Laporan berhasil divalidasi dan ditandai selesai (Resolved).'
        : 'Laporan disengketakan (Disputed) dan dikembalikan ke penanganan petugas.',
      new_status: updated.status,
    };
  }

  // ── 6. Media Management ───────────────────────────────────────────────────

  async uploadMedia(
    reportId: string,
    uploader: AuthenticatedUser,
    dto: UploadMediaDto,
  ): Promise<{ id: string; url: string; type: MediaType }> {
    validateMediaUrlFormat(dto.url);
    const report = await this.reportsRepository.findById(reportId);
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID '${reportId}' tidak ditemukan.`);
    }

    // ── Validasi Otorisasi Media (Rules.md §1.1 & Anti-IDOR) ──────────────────
    const isReporter = uploader.id === report.reporter_id;
    const isAdmin = uploader.role === UserRole.admin;
    const isOperator = uploader.role === UserRole.operator;
    const isAgencyMatched =
      !report.assigned_agency_id || uploader.agency_id === report.assigned_agency_id;

    if (dto.type === MediaType.initial_photo) {
      if (!isReporter) {
        throw new ForbiddenException(
          'FORBIDDEN_MEDIA: Anda tidak memiliki izin mengunggah media initial_photo untuk laporan ini.',
        );
      }
    } else if (dto.type === MediaType.progress_photo) {
      const isAllowedProgress = isReporter || isAdmin || (isOperator && isAgencyMatched);
      if (!isAllowedProgress) {
        throw new ForbiddenException(
          'FORBIDDEN_MEDIA: Anda tidak memiliki izin mengunggah media progress_photo untuk laporan ini.',
        );
      }
    } else if (dto.type === MediaType.completion_photo) {
      const isAllowedCompletion = isAdmin || (isOperator && isAgencyMatched);
      if (!isAllowedCompletion) {
        throw new ForbiddenException(
          'FORBIDDEN_MEDIA: Anda tidak memiliki izin mengunggah media completion_photo untuk laporan ini.',
        );
      }
    }

    const media = await this.reportsRepository.addMedia(reportId, uploader.id, dto.type, dto.url);
    return {
      id: media.id,
      url: media.url,
      type: media.type,
    };
  }

  // ── 7. Read / List Queries ────────────────────────────────────────────────

  async findAll(query: QueryReportsDto): Promise<PaginatedResult<ReportDetail>> {
    const { reports, total, nextCursor } = await this.reportsRepository.findMany(query);

    return {
      data: reports,
      meta: {
        total,
        limit: query.limit,
        nextCursor,
        hasPrevious: !!query.cursor,
      },
    };
  }

  async findById(id: string): Promise<ReportDetail> {
    const report = await this.reportsRepository.findById(id);
    if (!report) {
      throw new NotFoundException(`Laporan dengan ID '${id}' tidak ditemukan.`);
    }
    return report;
  }

  // ── 8. Scheduled Auto-Resolve (Rules.md §1.5) ──────────────────────────────

  /**
   * Cron Job harian: Otomatis menyelesaikan (resolved) laporan berstatus 'completed'
   * yang sudah lebih dari 7 hari tanpa validasi/dispute dari warga.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleAutoResolveJob(): Promise<number> {
    const days = Number(
      this.configService.get<number>('CITIZEN_VALIDATION_AUTO_RESOLVE_DAYS') ?? 7,
    );
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);

    const staleReports = await this.reportsRepository.findCompletedReportsOlderThan(thresholdDate);
    this.logger.log(`Running auto-resolve job: found ${staleReports.length} reports to resolve.`);

    let resolvedCount = 0;
    for (const r of staleReports) {
      try {
        await this.transitionReportStatus(
          r.id,
          ReportStatus.resolved,
          null,
          `Otomatis diselesaikan oleh sistem setelah ${days} hari tanpa sanggahan warga (Rules.md §1.5).`,
        );
        resolvedCount++;
      } catch (err: unknown) {
        this.logger.error(`Failed to auto-resolve report ${r.id}:`, err);
      }
    }

    this.logger.log(`Auto-resolve completed: ${resolvedCount}/${staleReports.length} resolved.`);
    return resolvedCount;
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async awardPoints(
    userId: string,
    points: number,
    reason: ContributionReason,
    reportId?: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.contributionPointsLog.create({
        data: {
          user_id: userId,
          points,
          reason,
          reference_report_id: reportId,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { contribution_points: { increment: points } },
      }),
    ]);
  }
}
