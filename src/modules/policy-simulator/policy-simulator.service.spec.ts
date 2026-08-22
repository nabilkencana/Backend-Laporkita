import { Test, TestingModule } from '@nestjs/testing';
import { PolicySimulatorService } from './policy-simulator.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { StressLevel } from '@prisma/client';

describe('PolicySimulatorService (Gemini LLM & Policy Simulation)', () => {
  let service: PolicySimulatorService;
  let prisma: PrismaService;
  let configService: ConfigService;
  let httpService: HttpService;

  const mockUser = {
    id: 'user-policy-1',
    full_name: 'Kepala Dinas DPUPR',
  };

  const mockZone = {
    id: 'zone-1',
    name: 'Klojen',
    stress_level: StressLevel.medium,
  };

  const mockSimulation = {
    id: 'sim-1',
    requested_by: mockUser.id,
    prompt_text: 'Perbaikan trotoar dan drainase jalan utama',
    zone_id: mockZone.id,
    result_narrative: 'Analisis kebijakan menghasilkan penurunan keluhan 35%',
    result_data: { estimated_budget_idr: 450000000 },
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      zone: {
        findUnique: jest.fn().mockResolvedValue(mockZone),
      },
      policySimulation: {
        create: jest.fn().mockResolvedValue(mockSimulation),
        findUnique: jest.fn().mockResolvedValue(mockSimulation),
        findMany: jest.fn().mockResolvedValue([mockSimulation]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const mockHttp = {
      post: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return null; // Default to mock
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicySimulatorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: HttpService, useValue: mockHttp },
      ],
    }).compile();

    service = module.get<PolicySimulatorService>(PolicySimulatorService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
    httpService = module.get<HttpService>(HttpService);
  });

  describe('simulatePolicy (Mock Fallback)', () => {
    it('should generate structured mock policy simulation and persist to database', async () => {
      const createSpy = jest.spyOn(prisma.policySimulation, 'create');

      const result = await service.simulatePolicy(
        mockUser.id,
        'Perbaikan trotoar dan drainase jalan utama',
        mockZone.id,
      );

      expect(result.id).toBe(mockSimulation.id);
      expect(result.isMock).toBe(true);
      expect(result.resultNarrative).toBeDefined();
      expect(result.resultData).toBeDefined();
      expect(createSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if zone does not exist', async () => {
      jest.spyOn(prisma.zone, 'findUnique').mockResolvedValue(null);

      await expect(
        service.simulatePolicy(mockUser.id, 'Prompt', 'non-existent-zone'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('simulatePolicy (Gemini API Integration)', () => {
    it('should call Gemini API when API key is configured and persist response', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('AIzaSyFakeGeminiApiKey');

      const mockGeminiResponse: AxiosResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Hasil analisis Gemini 2.5: Kebijakan ini efektif mengurangi beban jalan.',
                  },
                ],
              },
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as never },
      };

      const postSpy = jest.spyOn(httpService, 'post').mockReturnValue(of(mockGeminiResponse));
      const createSpy = jest.spyOn(prisma.policySimulation, 'create');

      const result = await service.simulatePolicy(
        mockUser.id,
        'Kebijakan penataan lampu jalan',
        mockZone.id,
      );

      expect(result.isMock).toBe(false);
      expect(postSpy).toHaveBeenCalled();
      expect(createSpy).toHaveBeenCalled();
    });

    it('should fallback to mock when Gemini API call fails', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('AIzaSyFakeGeminiApiKey');
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => new Error('Gemini Quota Exceeded')));

      const result = await service.simulatePolicy(
        mockUser.id,
        'Kebijakan penataan lampu jalan',
        mockZone.id,
      );

      expect(result.isMock).toBe(true);
      expect(result.id).toBe(mockSimulation.id);
    });
  });

  describe('findAll & findById', () => {
    it('should return paginated list of simulations', async () => {
      const res = await service.findAll(10);
      expect(res.data.length).toBe(1);
      expect(res.meta.total).toBe(1);
    });

    it('should return simulation detail by ID', async () => {
      const res = await service.findById('sim-1');
      expect(res.id).toBe('sim-1');
    });

    it('should throw NotFoundException if simulation not found', async () => {
      jest.spyOn(prisma.policySimulation, 'findUnique').mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
