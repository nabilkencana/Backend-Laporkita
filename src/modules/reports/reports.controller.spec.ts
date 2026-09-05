import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { StorageService } from '../storage/storage.service.js';

describe('ReportsController', () => {
  let app: INestApplication;

  const mockReportsService = {
    findReportsAlongRoute: jest.fn(),
  };

  const mockStorageService = {};

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockReportsService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /along-route', () => {
    const validPayload = {
      route_points: [
        { lat: -7.9827, lng: 112.6304 },
        { lat: -7.9701, lng: 112.6412 },
      ],
      radius_meters: 300,
    };

    it('should return 200 with reports near route', async () => {
      mockReportsService.findReportsAlongRoute.mockResolvedValue([
        {
          id: 'report-1',
          report_code: '#LP-2026-000001',
          category: { name: 'Jalan Berlubang' },
          distance_from_route_meters: 45,
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/reports/along-route')
        .send(validPayload)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].distance_from_route_meters).toBe(45);
    });

    it('should return 400 for invalid body (missing route_points)', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/along-route')
        .send({ radius_meters: 300 })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should return 400 for lat outside range', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/along-route')
        .send({
          route_points: [{ lat: 999, lng: 112.6304 }],
          radius_meters: 300,
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });
});