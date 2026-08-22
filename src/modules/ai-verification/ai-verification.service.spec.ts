import { Test, TestingModule } from '@nestjs/testing';
import { AIVerificationService } from './ai-verification.service.js';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service.js';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { Prisma } from '@prisma/client';

describe('AIVerificationService', () => {
  let service: AIVerificationService;
  let httpService: HttpService;
  let prisma: PrismaService;
  let configService: ConfigService;

  const validReportId = '11111111-1111-1111-1111-111111111111';
  const mockReport = {
    id: validReportId,
    report_code: '#LP-2026-000001',
    latitude: new Prisma.Decimal(-7.983908),
    longitude: new Prisma.Decimal(112.621391),
    created_at: new Date(),
    category: {
      id: 'cat-1',
      name: 'Jalan Berlubang',
    },
    media: [
      {
        id: 'med-1',
        url: 'https://storage.laporkita.id/photos/report1.jpg',
        type: 'initial_photo',
      },
    ],
  };

  beforeEach(async () => {
    const mockPrisma = {
      report: {
        findUnique: jest.fn().mockResolvedValue(mockReport),
      },
    };

    const mockHttp = {
      post: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return null; // Default to MOCK
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttp },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AIVerificationService>(AIVerificationService);
    httpService = module.get<HttpService>(HttpService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('verifyReport (Mock Fallback)', () => {
    it('should return mock verification result when AI_SERVICE_URL is not configured', async () => {
      const result = await service.verifyReport(validReportId);

      expect(result.isMock).toBe(true);
      expect(result.confidence).toBe(0.88);
      expect(result.category).toBe('Jalan Berlubang');
      expect(result.isValidGps).toBe(true);
      expect(result.isValidTimestamp).toBe(true);
      expect(result.damageSeverity).toBe(0.75);
    });

    it('should flag isValidGps as false when coordinates are outside Malang bounds', async () => {
      jest.spyOn(prisma.report, 'findUnique').mockResolvedValue({
        ...mockReport,
        latitude: new Prisma.Decimal(-6.2), // Jakarta latitude
        longitude: new Prisma.Decimal(106.8),
      } as unknown as import('@prisma/client').Report);

      const result = await service.verifyReport(validReportId);

      expect(result.isValidGps).toBe(false);
      expect(result.confidence).toBe(0.88);
    });

    it('should flag isValidTimestamp as false when report timestamp is in the future', async () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours ahead
      jest.spyOn(prisma.report, 'findUnique').mockResolvedValue({
        ...mockReport,
        created_at: futureDate,
      } as unknown as import('@prisma/client').Report);

      const result = await service.verifyReport(validReportId);

      expect(result.isValidTimestamp).toBe(false);
    });

    it('should throw error when report is not found', async () => {
      jest.spyOn(prisma.report, 'findUnique').mockResolvedValue(null);

      await expect(service.verifyReport('non-existent-id')).rejects.toThrow(
        "Report dengan ID 'non-existent-id' tidak ditemukan.",
      );
    });
  });

  describe('verifyReport (HTTP Client to External Python AI Service)', () => {
    it('should call external AI service when AI_SERVICE_URL is configured and parse response', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('http://ai-service.internal:8000');

      const mockAxiosResponse: AxiosResponse = {
        data: {
          confidence: 0.92,
          category: 'Jalan Berlubang',
          is_valid_gps: true,
          is_valid_timestamp: true,
          damage_severity: 0.85,
          reason: 'YOLOv11: Road pothole detected with high accuracy',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as never },
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockAxiosResponse));

      const result = await service.verifyReport(validReportId);

      expect(result.isMock).toBe(false);
      expect(result.confidence).toBe(0.92);
      expect(result.category).toBe('Jalan Berlubang');
      expect(result.damageSeverity).toBe(0.85);
      expect(result.isValidGps).toBe(true);
      expect(result.isValidTimestamp).toBe(true);
    });

    it('should fallback to mock gracefully when external AI service fails/times out', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('http://ai-service.internal:8000');
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => new Error('Connection refused (ECONNREFUSED)')));

      const result = await service.verifyReport(validReportId);

      expect(result.isMock).toBe(true);
      expect(result.confidence).toBe(0.88);
      expect(result.category).toBe('Jalan Berlubang');
    });
  });
});
