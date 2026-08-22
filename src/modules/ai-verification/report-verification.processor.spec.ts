import { Test, TestingModule } from '@nestjs/testing';
import { ReportVerificationProcessor } from './report-verification.processor.js';
import { AIVerificationService } from './ai-verification.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { SmartPriorityService } from '../smart-priority/smart-priority.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReportStatus } from '@prisma/client';
import { Job } from 'bullmq';

describe('ReportVerificationProcessor (Rules.md §1.2 Threshold & Worker Logic)', () => {
  let processor: ReportVerificationProcessor;
  let aiService: AIVerificationService;
  let reportsService: ReportsService;
  let prisma: PrismaService;

  const mockReport = {
    id: '11111111-1111-1111-1111-111111111111',
    report_code: '#LP-2026-000001',
    reporter_id: 'user-1',
    status: ReportStatus.pending_verification,
  };

  beforeEach(async () => {
    const mockAiService = {
      verifyReport: jest.fn(),
    };

    const mockReportsService = {
      transitionReportStatus: jest.fn(),
    };

    const mockSmartPriorityService = {
      recalculateUrgencyScore: jest.fn().mockResolvedValue(3.5),
    };

    const mockPrisma = {
      report: {
        findUnique: jest.fn().mockResolvedValue(mockReport),
        update: jest.fn().mockResolvedValue(mockReport),
      },
      notification: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportVerificationProcessor,
        {
          provide: AIVerificationService,
          useValue: mockAiService,
        },
        { provide: ReportsService, useValue: mockReportsService },
        {
          provide: SmartPriorityService,
          useValue: mockSmartPriorityService,
        },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<ReportVerificationProcessor>(ReportVerificationProcessor);
    aiService = module.get<AIVerificationService>(AIVerificationService);
    reportsService = module.get<ReportsService>(ReportsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  const mockJob = {
    data: { reportId: '11111111-1111-1111-1111-111111111111' },
  } as unknown as Job<{ reportId: string }>;

  describe('Confidence Threshold 0.6 (Rules.md §1.2)', () => {
    it('should transition to verified when confidence >= 0.6 and GPS/timestamp are valid', async () => {
      jest.spyOn(aiService, 'verifyReport').mockResolvedValue({
        confidence: 0.85,
        category: 'Jalan Berlubang',
        isValidGps: true,
        isValidTimestamp: true,
        damageSeverity: 0.8,
        isMock: true,
      });
      const transitionSpy = jest.spyOn(reportsService, 'transitionReportStatus');
      const updateSpy = jest.spyOn(prisma.report, 'update');

      const result = await processor.process(mockJob);

      expect(result.status).toBe('VERIFIED');
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockReport.id },
        data: {
          ai_confidence_score: 0.85,
          damage_severity: 0.8,
        },
      });
      expect(transitionSpy).toHaveBeenCalledWith(
        mockReport.id,
        ReportStatus.verified,
        '00000000-0000-4000-8000-000000000001',
        expect.stringContaining('Lolos verifikasi AI'),
      );
    });

    it('should transition to verified at exact boundary confidence = 0.60', async () => {
      jest.spyOn(aiService, 'verifyReport').mockResolvedValue({
        confidence: 0.6,
        category: 'Jalan Berlubang',
        isValidGps: true,
        isValidTimestamp: true,
        damageSeverity: 0.5,
        isMock: true,
      });
      const transitionSpy = jest.spyOn(reportsService, 'transitionReportStatus');

      const result = await processor.process(mockJob);

      expect(result.status).toBe('VERIFIED');
      expect(transitionSpy).toHaveBeenCalledWith(
        mockReport.id,
        ReportStatus.verified,
        '00000000-0000-4000-8000-000000000001',
        expect.any(String),
      );
    });

    it('should route to manual review at confidence = 0.59 (< 0.6)', async () => {
      jest.spyOn(aiService, 'verifyReport').mockResolvedValue({
        confidence: 0.59,
        category: 'Jalan Berlubang',
        isValidGps: true,
        isValidTimestamp: true,
        damageSeverity: 0.5,
        isMock: true,
      });
      const transitionSpy = jest.spyOn(reportsService, 'transitionReportStatus');

      const result = await processor.process(mockJob);

      expect(result.status).toBe('MANUAL_REVIEW_REQUIRED');
      expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('should NOT auto-reject and keep pending_verification for manual review when confidence < 0.6', async () => {
      jest.spyOn(aiService, 'verifyReport').mockResolvedValue({
        confidence: 0.45, // < 0.6
        category: 'Jalan Berlubang',
        isValidGps: true,
        isValidTimestamp: true,
        damageSeverity: 0.4,
        isMock: true,
      });
      const transitionSpy = jest.spyOn(reportsService, 'transitionReportStatus');

      const result = await processor.process(mockJob);

      expect(result.status).toBe('MANUAL_REVIEW_REQUIRED');
      // Penting: Jangan panggil transitionReportStatus ke rejected (Rules.md §1.2)
      expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('should enter manual review when isValidGps is false even if confidence >= 0.6', async () => {
      jest.spyOn(aiService, 'verifyReport').mockResolvedValue({
        confidence: 0.95,
        category: 'Jalan Berlubang',
        isValidGps: false, // GPS anomaly
        isValidTimestamp: true,
        damageSeverity: 0.8,
        isMock: true,
      });
      const transitionSpy = jest.spyOn(reportsService, 'transitionReportStatus');

      const result = await processor.process(mockJob);

      expect(result.status).toBe('MANUAL_REVIEW_REQUIRED');
      expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('should enter manual review when isValidTimestamp is false even if confidence >= 0.6', async () => {
      jest.spyOn(aiService, 'verifyReport').mockResolvedValue({
        confidence: 0.9,
        category: 'Jalan Berlubang',
        isValidGps: true,
        isValidTimestamp: false, // Timestamp anomaly
        damageSeverity: 0.8,
        isMock: true,
      });
      const transitionSpy = jest.spyOn(reportsService, 'transitionReportStatus');

      const result = await processor.process(mockJob);

      expect(result.status).toBe('MANUAL_REVIEW_REQUIRED');
      expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('should enter manual review when both GPS and timestamp are false', async () => {
      jest.spyOn(aiService, 'verifyReport').mockResolvedValue({
        confidence: 0.95,
        category: 'Jalan Berlubang',
        isValidGps: false,
        isValidTimestamp: false,
        damageSeverity: 0.8,
        isMock: true,
      });
      const transitionSpy = jest.spyOn(reportsService, 'transitionReportStatus');

      const result = await processor.process(mockJob);

      expect(result.status).toBe('MANUAL_REVIEW_REQUIRED');
      expect(transitionSpy).not.toHaveBeenCalled();
    });
  });
});
