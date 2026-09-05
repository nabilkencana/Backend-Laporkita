import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MapsController } from './maps.controller.js';
import { MapsService } from './maps.service.js';

describe('MapsController (e2e)', () => {
  let app: INestApplication;

  const mockMapsService = {
    getRoute: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MapsController],
      providers: [{ provide: MapsService, useValue: mockMapsService }],
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

  it('POST /maps/route should return 200 with route data for valid Java coordinates', async () => {
    mockMapsService.getRoute.mockResolvedValue({
      coordinates: [
        [112.63, -7.9827],
        [112.6412, -7.9701],
      ],
      distance_meters: 1520.4,
      duration_seconds: 245.8,
      cached: false,
    });

    const res = await request(app.getHttpServer())
      .post('/maps/route')
      .send({
        origin_lat: -7.9827,
        origin_lng: 112.6304,
        destination_lat: -7.9701,
        destination_lng: 112.6412,
      })
      .expect(200);

    expect(mockMapsService.getRoute).toHaveBeenCalledWith(
      -7.9827,
      112.6304,
      -7.9701,
      112.6412,
    );
    expect(res.body.coordinates).toBeDefined();
    expect(res.body.distance_meters).toBe(1520.4);
  });

  it('POST /maps/route should return 400 when origin is outside Java bounds', async () => {
    const res = await request(app.getHttpServer())
      .post('/maps/route')
      .send({
        origin_lat: -2.0, // lat > LAT_MAX (-5.75) → outside Java
        origin_lng: 106.0,
        destination_lat: -7.9701,
        destination_lng: 112.6412,
      })
      .expect(400);

    expect(mockMapsService.getRoute).not.toHaveBeenCalled();
    expect(res.body.message).toContain('Koordinat asal');
  });

  it('POST /maps/route should return 400 when destination is outside Java bounds', async () => {
    const res = await request(app.getHttpServer())
      .post('/maps/route')
      .send({
        origin_lat: -7.9827,
        origin_lng: 112.6304,
        destination_lat: 0.0, // equator → outside Java
        destination_lng: 116.0, // east of Java (lng > 115) → outside Java
      })
      .expect(400);

    expect(mockMapsService.getRoute).not.toHaveBeenCalled();
    expect(res.body.message).toContain('Koordinat tujuan');
  });

  it('POST /maps/route should return 400 for invalid coordinates (validation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/maps/route')
      .send({
        origin_lat: 'invalid',
        origin_lng: 112.6304,
        destination_lat: -7.9701,
        destination_lng: 112.6412,
      })
      .expect(400);

    expect(mockMapsService.getRoute).not.toHaveBeenCalled();
    expect(res.body.message).toBeDefined();
  });
});