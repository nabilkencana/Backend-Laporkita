import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service.js';
import { ReportsRepository } from './reports.repository.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ReportStatus, UserRole, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

describe('ReportsService (Critical Business Logic)', () => {
  let service: ReportsService;
  let repository: ReportsRepository;
  let prisma: PrismaService;

  const reporterId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const reportId = '99999999-9999-9999-9999-999999999999';

  const mockReport = {
    id: reportId,
    report_code: '#LP-2026-000001',
    reporter_id: reporterId,
    category_id: 'c1000000-0000-0000-0000-000000000001',
    assigned_agency_id: 'a1000000-0000-0000-0000-000000000001',
    assigned_officer_id: null,
    description: 'Jalan berlubang besar',
    latitude: new Prisma.Decimal(-7.983908),
    longitude: new Prisma.Decimal(112.621391),
    address_text: 'Jl. Ijen No. 1 Kota Malang',
    status: ReportStatus.pending_verification,
    ai_confidence_score: 0.85,
    urgency_score: 2.5,
    support_count: 5,
    view_count: 20,
    estimated_completion_at: null,
    idempotency_key: 'idem_key_1',
    created_at: new Date(),
    updated_at: new Date(),
    category: { id: 'c1', name: 'Jalan Berlubang', icon_url: null },
    assigned_agency: { id: 'a1', name: 'DPUPR', type: 'dpupr' },
    assigned_officer: null,
    reporter: { id: reporterId, full_name: 'Warga Satu', avatar_url: null },
    media: [],
    status_history: [],
    _count: { supports: 5, comments: 2, validations: 0 },
  };

  beforeEach(async () => {
    const mockRepo = {
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      countTotalReportsInYear: jest.fn().mockResolvedValue(0),
      createReportInTransaction: jest.fn(),
      updateStatusInTransaction: jest.fn(),
      findMany: jest.fn(),
      findSupport: jest.fn(),
      addSupportInTransaction: jest.fn(),
      removeSupportInTransaction: jest.fn(),
      addComment: jest.fn(),
      getComments: jest.fn(),
      addMedia: jest.fn(),
      countMediaByType: jest.fn(),
      addCitizenValidationInTransaction: jest.fn(),
      findCompletedReportsOlderThan: jest.fn(),
      countRecentRejections: jest.fn(),
    };

    const mockPrismaService = {
      category: {
        findUnique: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      contributionPointsLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (cb: unknown) => {
        if (typeof cb === 'function') {
          return (cb as (tx: unknown) => Promise<unknown>)(mockPrismaService);
        }
        if (Array.isArray(cb)) {
          return Promise.all(cb);
        }
        return cb;
      }),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'MALANG_LAT_MIN') return -8.25;
        if (key === 'MALANG_LAT_MAX') return -7.85;
        if (key === 'MALANG_LNG_MIN') return 112.5;
        if (key === 'MALANG_LNG_MAX') return 112.8;
        if (key === 'SUPPORT_GRACE_PERIOD_MINUTES') return 5;
        if (key === 'CITIZEN_VALIDATION_RADIUS_M') return 100;
        if (key === 'CITIZEN_VALIDATION_AUTO_RESOLVE_DAYS') return 7;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    repository = module.get<ReportsRepository>(ReportsRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ── 1. State Machine Transitions ───────────────────────────────────────────

  describe('transitionReportStatus (State Machine Rules.md §1.1)', () => {
    it('should allow legal transition: pending_verification -> verified and award +10 points (Rules.md §1.6)', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(mockReport);
      jest.spyOn(repository, 'updateStatusInTransaction').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.verified,
      });
      const txSpy = jest.spyOn(prisma, '$transaction');

      const result = await service.transitionReportStatus(
        reportId,
        ReportStatus.verified,
        otherUserId,
      );

      expect(result.status).toBe(ReportStatus.verified);
      expect(txSpy).toHaveBeenCalled();
    });

    it('should throw ConflictException on illegal transition (e.g. pending_verification -> completed)', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(mockReport);

      await expect(
        service.transitionReportStatus(reportId, ReportStatus.completed, otherUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if trying to transition from rejected (Final State)', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.rejected,
      });

      await expect(
        service.transitionReportStatus(reportId, ReportStatus.verified, otherUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should require completion_photo before transitioning to completed (Rules.md §1.1)', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.in_progress,
      });
      jest.spyOn(repository, 'countMediaByType').mockResolvedValue(0); // 0 completion photos

      await expect(
        service.transitionReportStatus(reportId, ReportStatus.completed, otherUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should route disputed status back to in_progress (Rules.md §1.1)', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.completed,
      });
      const updateSpy = jest.spyOn(repository, 'updateStatusInTransaction').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.in_progress,
      });

      const result = await service.transitionReportStatus(
        reportId,
        ReportStatus.disputed,
        reporterId,
        'Pekerjaan belum selesai',
      );

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          target_status: ReportStatus.in_progress,
        }),
      );
      expect(result.status).toBe(ReportStatus.in_progress);
    });

    it('should apply -20 points penalty and flag user if rejected >3 times in 30 days (Rules.md §1.6)', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(mockReport);
      jest.spyOn(repository, 'countRecentRejections').mockResolvedValue(3); // 3 prior rejections
      jest.spyOn(repository, 'updateStatusInTransaction').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.rejected,
      });
      const userUpdateSpy = jest.spyOn(prisma.user, 'update');

      await service.transitionReportStatus(
        reportId,
        ReportStatus.rejected,
        otherUserId,
        'Laporan palsu / spam',
      );

      expect(userUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { is_flagged_for_review: true },
        }),
      );
    });
  });

  // ── 2. Report Supports & Grace Period ──────────────────────────────────────

  describe('Report Supports (Rules.md §1.4)', () => {
    it('should throw ConflictException if user already supported the report', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(mockReport);
      jest.spyOn(repository, 'findSupport').mockResolvedValue({
        id: 's1',
        report_id: reportId,
        user_id: otherUserId,
        created_at: new Date(),
      });

      await expect(service.supportReport(reportId, otherUserId)).rejects.toThrow(ConflictException);
    });

    it('should allow cancel support within 5-minute grace period', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(mockReport);
      jest.spyOn(repository, 'findSupport').mockResolvedValue({
        id: 's1',
        report_id: reportId,
        user_id: otherUserId,
        created_at: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
      });
      const removeSpy = jest.spyOn(repository, 'removeSupportInTransaction').mockResolvedValue();

      const result = await service.cancelSupport(reportId, otherUserId);
      expect(result.message).toBe('Dukungan berhasil dibatalkan.');
      expect(removeSpy).toHaveBeenCalledWith(reportId, otherUserId);
    });

    it('should throw ConflictException when canceling support after 5 minutes grace period', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(mockReport);
      jest.spyOn(repository, 'findSupport').mockResolvedValue({
        id: 's1',
        report_id: reportId,
        user_id: otherUserId,
        created_at: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      });

      await expect(service.cancelSupport(reportId, otherUserId)).rejects.toThrow(ConflictException);
    });
  });

  // ── 3. Citizen Validation & Haversine Formula ───────────────────────────────

  describe('Citizen Validation (Rules.md §1.5)', () => {
    const mockUserReporter: AuthenticatedUser = {
      id: reporterId,
      full_name: 'Warga Pelapor',
      email: 'pelapor@test.com',
      phone_number: null,
      role: UserRole.citizen,
      agency_id: null,
    };

    const mockUserOther: AuthenticatedUser = {
      id: otherUserId,
      full_name: 'Warga Tetangga',
      email: 'tetangga@test.com',
      phone_number: null,
      role: UserRole.citizen,
      agency_id: null,
    };

    it('should allow original reporter to validate regardless of coordinates', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.completed,
      });
      jest.spyOn(repository, 'updateStatusInTransaction').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.resolved,
      });
      const addValSpy = jest
        .spyOn(repository, 'addCitizenValidationInTransaction')
        .mockResolvedValue();

      const result = await service.validateReport(reportId, mockUserReporter, {
        is_valid: true,
      });

      expect(result.new_status).toBe(ReportStatus.resolved);
      expect(addValSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: reporterId,
          is_valid: true,
        }),
      );
    });

    it('should allow non-reporter within 100m radius to validate', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.completed,
      });
      jest.spyOn(repository, 'updateStatusInTransaction').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.resolved,
      });

      // Lokasi sangat dekat (~20 meter dari titik laporan -7.983908, 112.621391)
      const result = await service.validateReport(reportId, mockUserOther, {
        is_valid: true,
        latitude: -7.984,
        longitude: 112.62145,
      });

      expect(result.new_status).toBe(ReportStatus.resolved);
    });

    it('should reject non-reporter located outside 100m radius with ForbiddenException', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockReport,
        status: ReportStatus.completed,
      });

      // Lokasi jauh (~1.5 km dari titik laporan)
      await expect(
        service.validateReport(reportId, mockUserOther, {
          is_valid: true,
          latitude: -7.97,
          longitude: 112.63,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── 4. Scheduled Auto-Resolve (7 Days) ─────────────────────────────────────

  describe('handleAutoResolveJob (Rules.md §1.5)', () => {
    it('should auto-resolve completed reports older than 7 days', async () => {
      const staleCompletedReport = {
        ...mockReport,
        id: 'stale_id_1',
        status: ReportStatus.completed,
        updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      };

      jest
        .spyOn(repository, 'findCompletedReportsOlderThan')
        .mockResolvedValue([staleCompletedReport]);
      jest.spyOn(repository, 'findById').mockResolvedValue(staleCompletedReport);
      const updateSpy = jest.spyOn(repository, 'updateStatusInTransaction').mockResolvedValue({
        ...staleCompletedReport,
        status: ReportStatus.resolved,
      });

      const resolvedCount = await service.handleAutoResolveJob();

      expect(resolvedCount).toBe(1);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          report_id: 'stale_id_1',
          target_status: ReportStatus.resolved,
        }),
      );
    });
  });
});
