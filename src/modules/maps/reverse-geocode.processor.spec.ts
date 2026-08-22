import { Test, TestingModule } from '@nestjs/testing';
import { ReverseGeocodeProcessor } from './reverse-geocode.processor.js';
import { MapsService } from './maps.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Job } from 'bullmq';
import { ReverseGeocodeJobData } from './maps.interface.js';

describe('ReverseGeocodeProcessor (BullMQ Concurrency 1 & 1 req/s)', () => {
  let processor: ReverseGeocodeProcessor;
  let mapsService: MapsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const mockMaps = {
      reverseGeocode: jest.fn().mockResolvedValue({
        address: 'Jl. Ijen No. 1, Klojen, Kota Malang',
        displayName: 'Jl. Ijen No. 1, Klojen, Kota Malang',
        attribution: '© OpenStreetMap contributors',
        cached: false,
      }),
    };

    const mockPrisma = {
      report: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReverseGeocodeProcessor,
        { provide: MapsService, useValue: mockMaps },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<ReverseGeocodeProcessor>(ReverseGeocodeProcessor);
    mapsService = module.get<MapsService>(MapsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should process job, call mapsService and update report address_text', async () => {
    const geoSpy = jest.spyOn(mapsService, 'reverseGeocode');
    const updateSpy = jest.spyOn(prisma.report, 'update');

    const mockJob = {
      data: {
        reportId: 'rep-1',
        latitude: -7.983908,
        longitude: 112.621391,
      },
    } as unknown as Job<ReverseGeocodeJobData>;

    const result = await processor.process(mockJob);

    expect(result.status).toBe('COMPLETED');
    expect(result.address).toBe('Jl. Ijen No. 1, Klojen, Kota Malang');
    expect(geoSpy).toHaveBeenCalledWith(-7.983908, 112.621391);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'rep-1' },
      data: { address_text: 'Jl. Ijen No. 1, Klojen, Kota Malang' },
    });
  });
});
