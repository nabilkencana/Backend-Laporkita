import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  Report,
  ReportStatus,
  MediaType,
  ContributionReason,
  Prisma,
  ReportMedia,
  ReportStatusHistory,
  ReportSupport,
  ReportComment,
} from '@prisma/client';
import { QueryReportsDto } from './dto/query-reports.dto.js';

export type ReportDetail = Report & {
  category: { id: string; name: string; icon_url: string | null };
  assigned_agency: { id: string; name: string; type: string } | null;
  assigned_officer: { id: string; full_name: string } | null;
  reporter: { id: string; full_name: string; avatar_url: string | null };
  media: ReportMedia[];
  status_history: (ReportStatusHistory & {
    changer: { id: string; full_name: string; role: string } | null;
  })[];
  _count: {
    supports: number;
    comments: number;
    validations: number;
  };
};

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countTotalReportsInYear(year: number): Promise<number> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    return this.prisma.report.count({
      where: {
        created_at: {
          gte: startDate,
          lt: endDate,
        },
      },
    });
  }

  async findByIdempotencyKey(key: string): Promise<Report | null> {
    return this.prisma.report.findUnique({
      where: { idempotency_key: key },
    });
  }

  async findById(id: string): Promise<ReportDetail | null> {
    return this.prisma.report.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true, icon_url: true },
        },
        assigned_agency: {
          select: { id: true, name: true, type: true },
        },
        assigned_officer: {
          select: { id: true, full_name: true },
        },
        reporter: {
          select: { id: true, full_name: true, avatar_url: true },
        },
        media: {
          orderBy: { created_at: 'asc' },
        },
        status_history: {
          orderBy: { created_at: 'desc' },
          include: {
            changer: {
              select: { id: true, full_name: true, role: true },
            },
          },
        },
        _count: {
          select: {
            supports: true,
            comments: true,
            validations: true,
          },
        },
      },
    });
  }

  async createReportInTransaction(data: {
    report_code: string;
    reporter_id: string;
    category_id: string;
    assigned_agency_id?: string | null;
    description?: string | null;
    latitude: number;
    longitude: number;
    address_text?: string | null;
    idempotency_key?: string | null;
    photo_url: string;
  }): Promise<Report> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Insert report utama dengan status awal pending_verification
      const report = await tx.report.create({
        data: {
          report_code: data.report_code,
          reporter_id: data.reporter_id,
          category_id: data.category_id,
          assigned_agency_id: data.assigned_agency_id ?? null,
          description: data.description ?? null,
          latitude: new Prisma.Decimal(data.latitude),
          longitude: new Prisma.Decimal(data.longitude),
          address_text: data.address_text ?? null,
          idempotency_key: data.idempotency_key ?? null,
          status: ReportStatus.pending_verification,
          support_count: 0,
          view_count: 0,
        },
      });

      // 2. Insert media awal (initial_photo)
      await tx.reportMedia.create({
        data: {
          report_id: report.id,
          type: MediaType.initial_photo,
          url: data.photo_url,
          uploaded_by: data.reporter_id,
        },
      });

      // 3. Insert entri pertama di report_status_history (Rules.md §1.1 & §3)
      await tx.reportStatusHistory.create({
        data: {
          report_id: report.id,
          status: ReportStatus.pending_verification,
          changed_by: data.reporter_id,
          note: null,
        },
      });

      return report;
    });
  }

  async updateStatusInTransaction(data: {
    report_id: string;
    target_status: ReportStatus;
    actor_id?: string | null;
    note?: string | null;
    urgency_score?: number | null;
    assigned_agency_id?: string | null;
  }): Promise<Report> {
    return this.prisma.$transaction(async (tx) => {
      const updatedReport = await tx.report.update({
        where: { id: data.report_id },
        data: {
          status: data.target_status,
          ...(data.urgency_score !== undefined ? { urgency_score: data.urgency_score } : {}),
          ...(data.assigned_agency_id !== undefined
            ? { assigned_agency_id: data.assigned_agency_id }
            : {}),
        },
      });

      await tx.reportStatusHistory.create({
        data: {
          report_id: data.report_id,
          status: data.target_status,
          changed_by: data.actor_id ?? null,
          note: data.note ?? null,
        },
      });

      return updatedReport;
    });
  }

  async findMany(query: QueryReportsDto): Promise<{
    reports: ReportDetail[];
    total: number;
    nextCursor: string | null;
  }> {
    const where: Prisma.ReportWhereInput = {};

    if (query.needs_manual_review || query.needsManualReview) {
      where.status = ReportStatus.pending_verification;
      where.OR = [{ ai_confidence_score: { lt: 0.6 } }, { ai_confidence_score: null }];
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.category_id) where.category_id = query.category_id;
    if (query.reporter_id) where.reporter_id = query.reporter_id;
    if (query.assigned_agency_id) where.assigned_agency_id = query.assigned_agency_id;

    // Bounding box filter (untuk peta publik)
    if (
      query.min_lat !== undefined &&
      query.max_lat !== undefined &&
      query.min_lng !== undefined &&
      query.max_lng !== undefined
    ) {
      where.latitude = {
        gte: new Prisma.Decimal(query.min_lat),
        lte: new Prisma.Decimal(query.max_lat),
      };
      where.longitude = {
        gte: new Prisma.Decimal(query.min_lng),
        lte: new Prisma.Decimal(query.max_lng),
      };
    }

    const total = await this.prisma.report.count({ where });

    // Ordering
    let orderBy: Prisma.ReportOrderByWithRelationInput = { created_at: 'desc' };
    if (query.sort_by === 'oldest') orderBy = { created_at: 'asc' };
    if (query.sort_by === 'urgency') orderBy = { urgency_score: 'desc' };
    if (query.sort_by === 'most_supported') orderBy = { support_count: 'desc' };

    const reports = await this.prisma.report.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor },
          }
        : {}),
      orderBy,
      include: {
        category: {
          select: { id: true, name: true, icon_url: true },
        },
        assigned_agency: {
          select: { id: true, name: true, type: true },
        },
        assigned_officer: {
          select: { id: true, full_name: true },
        },
        reporter: {
          select: { id: true, full_name: true, avatar_url: true },
        },
        media: {
          orderBy: { created_at: 'asc' },
        },
        status_history: {
          orderBy: { created_at: 'desc' },
          include: {
            changer: {
              select: { id: true, full_name: true, role: true },
            },
          },
        },
        _count: {
          select: {
            supports: true,
            comments: true,
            validations: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (reports.length > query.limit) {
      const nextItem = reports.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    return { reports, total, nextCursor };
  }

  // ── Support Operations ─────────────────────────────────────────────────────

  async findSupport(reportId: string, userId: string): Promise<ReportSupport | null> {
    return this.prisma.reportSupport.findUnique({
      where: {
        report_id_user_id: {
          report_id: reportId,
          user_id: userId,
        },
      },
    });
  }

  async addSupportInTransaction(reportId: string, userId: string): Promise<ReportSupport> {
    return this.prisma.$transaction(async (tx) => {
      const support = await tx.reportSupport.create({
        data: {
          report_id: reportId,
          user_id: userId,
        },
      });

      // Update denormalized support_count (Rules.md §4.1)
      await tx.report.update({
        where: { id: reportId },
        data: { support_count: { increment: 1 } },
      });

      // Insert +1 point ke user pendukung (Rules.md §1.6)
      await tx.contributionPointsLog.create({
        data: {
          user_id: userId,
          points: 1,
          reason: ContributionReason.support_given,
          reference_report_id: reportId,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { contribution_points: { increment: 1 } },
      });

      return support;
    });
  }

  async removeSupportInTransaction(reportId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.reportSupport.delete({
        where: {
          report_id_user_id: {
            report_id: reportId,
            user_id: userId,
          },
        },
      });

      await tx.report.update({
        where: { id: reportId },
        data: { support_count: { decrement: 1 } },
      });

      // Kurangi 1 point yang sebelumnya didapat
      await tx.contributionPointsLog.create({
        data: {
          user_id: userId,
          points: -1,
          reason: ContributionReason.support_given,
          reference_report_id: reportId,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { contribution_points: { decrement: 1 } },
      });
    });
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async addComment(reportId: string, userId: string, content: string): Promise<ReportComment> {
    return this.prisma.reportComment.create({
      data: {
        report_id: reportId,
        user_id: userId,
        content,
      },
      include: {
        user: {
          select: { id: true, full_name: true, avatar_url: true, role: true },
        },
      },
    });
  }

  async getComments(
    reportId: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<{
    comments: (ReportComment & {
      user: { id: string; full_name: string; avatar_url: string | null; role: string };
    })[];
    total: number;
    nextCursor: string | null;
  }> {
    const where = { report_id: reportId };
    const total = await this.prisma.reportComment.count({ where });

    const comments = await this.prisma.reportComment.findMany({
      where,
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { created_at: 'desc' },
      include: {
        user: {
          select: { id: true, full_name: true, avatar_url: true, role: true },
        },
      },
    });

    let nextCursor: string | null = null;
    if (comments.length > limit) {
      const nextItem = comments.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    return { comments, total, nextCursor };
  }

  // ── Media & Validation ─────────────────────────────────────────────────────

  async addMedia(
    reportId: string,
    uploadedBy: string,
    type: MediaType,
    url: string,
  ): Promise<ReportMedia> {
    return this.prisma.reportMedia.create({
      data: {
        report_id: reportId,
        type,
        url,
        uploaded_by: uploadedBy,
      },
    });
  }

  async countMediaByType(reportId: string, type: MediaType): Promise<number> {
    return this.prisma.reportMedia.count({
      where: {
        report_id: reportId,
        type,
      },
    });
  }

  async addCitizenValidationInTransaction(data: {
    report_id: string;
    user_id: string;
    is_valid: boolean;
    note?: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.citizenValidation.create({
        data: {
          report_id: data.report_id,
          user_id: data.user_id,
          is_valid: data.is_valid,
          note: data.note ?? null,
        },
      });

      // Jika validasi diberikan -> beri +5 poin kontribusi ke user pemvalidasi (Rules.md §1.6)
      await tx.contributionPointsLog.create({
        data: {
          user_id: data.user_id,
          points: 5,
          reason: ContributionReason.validation_given,
          reference_report_id: data.report_id,
        },
      });
      await tx.user.update({
        where: { id: data.user_id },
        data: { contribution_points: { increment: 5 } },
      });
    });
  }

  // ── Scheduled Auto-Resolve Lookups ─────────────────────────────────────────

  async findCompletedReportsOlderThan(date: Date): Promise<Report[]> {
    return this.prisma.report.findMany({
      where: {
        status: ReportStatus.completed,
        updated_at: { lt: date },
        validations: { none: {} },
      },
    });
  }

  async countRecentRejections(userId: string, sinceDate: Date): Promise<number> {
    return this.prisma.report.count({
      where: {
        reporter_id: userId,
        status: ReportStatus.rejected,
        updated_at: { gte: sinceDate },
      },
    });
  }
}
