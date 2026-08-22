import { Test, TestingModule } from '@nestjs/testing';
import { PredictionService } from './prediction.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { StressLevel } from '@prisma/client';

describe('PredictionService (XGBoost & Zone Metrics)', () => {
  let service: PredictionService;
  let prisma: PrismaService;
  let configService: ConfigService;
  let httpService: HttpService;

  const mockZone = {
    id: 'zone-1',
    name: 'Klojen',
    stress_level: StressLevel.low,
  };

  beforeEach(async () => {
    const mockPrisma = {
      zone: {
        findUnique: jest.fn().mockResolvedValue(mockZone),
        findMany: jest.fn().mockResolvedValue([mockZone]),
        update: jest.fn().mockResolvedValue(mockZone),
      },
      report: {
        count: jest.fn().mockResolvedValue(6),
      },
      zoneMetric: {
        create: jest.fn().mockResolvedValue({ id: 'zm-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(async (cb: unknown) => {
        if (Array.isArray(cb)) {
          return Promise.all(cb);
        }
        return cb;
      }),
    };

    const mockHttp = {
      post: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'AI_SERVICE_URL') return null; // Default to mock
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: HttpService, useValue: mockHttp },
      ],
    }).compile();

    service = module.get<PredictionService>(PredictionService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
    httpService = module.get<HttpService>(HttpService);
  });

  describe('predictZoneMetrics (Mock Fallback)', () => {
    it('should generate mock prediction and persist to database', async () => {
      const createSpy = jest.spyOn(prisma.zoneMetric, 'create');
      const updateSpy = jest.spyOn(prisma.zone, 'update');

      const result = await service.predictZoneMetrics('zone-1');

      expect(result.zoneId).toBe('zone-1');
      expect(result.isMock).toBe(true);
      expect(result.reportDensity).toBe(6);
      expect(result.floodRiskProbability).toBeGreaterThan(0);
      expect(result.weatherContext).toBeDefined();
      expect(createSpy).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if zone does not exist', async () => {
      jest.spyOn(prisma.zone, 'findUnique').mockResolvedValue(null);

      await expect(service.predictZoneMetrics('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('predictZoneMetrics (HTTP Client to Python XGBoost Service)', () => {
    it('should call external AI service when configured and persist result', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('http://ai-service:8000');

      const mockResponse: AxiosResponse = {
        data: {
          report_density: 8,
          traffic_density: 0.75,
          flood_risk_probability: 0.82,
          weather_context: { condition: 'Hujan Deras', rainfall_mm: 65 },
          stress_level: 'high',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as never },
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.predictZoneMetrics('zone-1');

      expect(result.isMock).toBe(false);
      expect(result.floodRiskProbability).toBe(0.82);
      expect(result.stressLevel).toBe('high');
    });

    it('should fallback to mock when external service fails', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('http://ai-service:8000');
      jest.spyOn(httpService, 'post').mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

      const result = await service.predictZoneMetrics('zone-1');

      expect(result.isMock).toBe(true);
      expect(result.zoneId).toBe('zone-1');
    });
  });

  describe('refreshAllZoneMetrics', () => {
    it('should refresh metrics for all zones', async () => {
      const res = await service.refreshAllZoneMetrics();

      expect(res.updatedCount).toBe(1);
      expect(res.results.length).toBe(1);
    });
  });
});
