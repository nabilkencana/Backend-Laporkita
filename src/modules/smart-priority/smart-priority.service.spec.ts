import { Test, TestingModule } from '@nestjs/testing';
import { SmartPriorityService, DEFAULT_WEIGHTS } from './smart-priority.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

describe('SmartPriorityService (Rules.md §1.3 Formula & Recalculation)', () => {
  let service: SmartPriorityService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      systemConfig: {
        findUnique: jest.fn().mockResolvedValue({
          key: 'smart_priority_weights',
          value: DEFAULT_WEIGHTS,
        }),
      },
      report: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SmartPriorityService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<SmartPriorityService>(SmartPriorityService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('computeScore (Pure Formula Tests)', () => {
    it('should calculate correct urgency_score with default weights', () => {
      // damage: 0.8 * 0.35 = 0.28
      // support: 50/100 * 0.20 = 0.10
      // density: 4/10 * 0.25 = 0.10
      // category: 1.5/2.0 * 0.20 = 0.15
      // sum = 0.63 -> scaled to 5.0 = 3.15
      const result = service.computeScore(0.8, 50, 4, 1.5, DEFAULT_WEIGHTS);

      expect(result.urgency_score).toBe(3.15);
      expect(result.components.damage_severity_raw).toBe(0.8);
      expect(result.components.support_normalized).toBe(0.5);
      expect(result.components.location_density_factor).toBe(0.4);
    });

    it('should clamp values exceeding upper bounds', () => {
      // damage: 1.5 -> clamped to 1.0 (0.35)
      // support: 150 -> clamped to 100/100 = 1.0 (0.20)
      // density: 15 -> clamped to 10/10 = 1.0 (0.25)
      // category: 2.5 -> clamped to 2.0/2.0 = 1.0 (0.20)
      // sum = 1.0 -> scaled to 5.0 = 5.0
      const result = service.computeScore(1.5, 150, 15, 2.5, DEFAULT_WEIGHTS);

      expect(result.urgency_score).toBe(5.0);
    });

    it('should support dynamic custom weights from database', () => {
      const customWeights = {
        w1_damage_severity: 0.5,
        w2_support: 0.1,
        w3_density: 0.2,
        w4_category: 0.2,
        density_radius_meters: 300,
        support_cap: 50,
      };

      // damage: 1.0 * 0.50 = 0.50
      // support: 25/50 = 0.5 * 0.10 = 0.05
      // density: 0/10 = 0.0
      // category: 1.0/2.0 = 0.5 * 0.20 = 0.10
      // sum = 0.65 -> scaled to 5.0 = 3.25
      const result = service.computeScore(1.0, 25, 0, 1.0, customWeights);

      expect(result.urgency_score).toBe(3.25);
    });
  });

  describe('getWeights (Database Configuration)', () => {
    it('should return weights from database when available', async () => {
      const dbWeights = {
        w1_damage_severity: 0.4,
        w2_support: 0.3,
        w3_density: 0.15,
        w4_category: 0.15,
        density_radius_meters: 250,
        support_cap: 80,
      };

      jest.spyOn(prisma.systemConfig, 'findUnique').mockResolvedValue({
        key: 'smart_priority_weights',
        value: dbWeights,
      } as unknown as import('@prisma/client').SystemConfig);

      const weights = await service.getWeights();

      expect(weights.w1_damage_severity).toBe(0.4);
      expect(weights.w2_support).toBe(0.3);
      expect(weights.density_radius_meters).toBe(250);
      expect(weights.support_cap).toBe(80);
    });

    it('should fallback to DEFAULT_WEIGHTS when db record is not found', async () => {
      jest.spyOn(prisma.systemConfig, 'findUnique').mockResolvedValue(null);

      const weights = await service.getWeights();

      expect(weights).toEqual(DEFAULT_WEIGHTS);
    });
  });

  describe('recalculateNearbyReports', () => {
    it('should recalculate score for nearby active reports within radius', async () => {
      const centerLat = -7.983908;
      const centerLng = 112.621391;

      // rep-nearby is ~10m away
      const nearbyReport = {
        id: 'rep-nearby',
        latitude: new Prisma.Decimal(-7.98395),
        longitude: new Prisma.Decimal(112.6214),
        support_count: 5,
        damage_severity: 0.6,
        ai_confidence_score: 0.8,
        category: { urgency_weight: 1.0 },
      };

      jest.spyOn(prisma.report, 'findMany').mockResolvedValue([
        {
          id: 'rep-nearby',
          latitude: nearbyReport.latitude,
          longitude: nearbyReport.longitude,
        },
      ] as unknown as import('@prisma/client').Report[]);

      jest
        .spyOn(prisma.report, 'findUnique')
        .mockResolvedValue(nearbyReport as unknown as import('@prisma/client').Report);
      const updateSpy = jest
        .spyOn(prisma.report, 'update')
        .mockResolvedValue(nearbyReport as unknown as import('@prisma/client').Report);

      const updatedCount = await service.recalculateNearbyReports(centerLat, centerLng, 200);

      expect(updatedCount).toBe(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      const updateCall = updateSpy.mock.calls[0] as unknown as [
        { where: { id: string }; data: { urgency_score?: number } },
      ];
      expect(updateCall[0].where.id).toBe('rep-nearby');
      expect(typeof updateCall[0].data.urgency_score).toBe('number');
    });
  });

  describe('recalculateUrgencyScore', () => {
    it('should fetch report, count nearby reports, compute score, and update database', async () => {
      const mockReport = {
        id: 'rep-1',
        report_code: '#LP-2026-000001',
        latitude: new Prisma.Decimal(-7.983908),
        longitude: new Prisma.Decimal(112.621391),
        support_count: 10,
        damage_severity: 0.7,
        ai_confidence_score: 0.9,
        category: { urgency_weight: 1.5 },
      };

      jest
        .spyOn(prisma.report, 'findUnique')
        .mockResolvedValue(mockReport as unknown as import('@prisma/client').Report);
      jest.spyOn(prisma.report, 'findMany').mockResolvedValue([
        {
          id: 'rep-2',
          latitude: new Prisma.Decimal(-7.98391),
          longitude: new Prisma.Decimal(112.6214),
        },
      ] as unknown as import('@prisma/client').Report[]);
      const updateSpy = jest
        .spyOn(prisma.report, 'update')
        .mockResolvedValue(mockReport as unknown as import('@prisma/client').Report);

      const score = await service.recalculateUrgencyScore('rep-1');

      expect(score).toBeGreaterThan(0);
      expect(updateSpy).toHaveBeenCalled();
    });
  });
});
