import { Test, TestingModule } from '@nestjs/testing';
import { MapsService, OSM_ATTRIBUTION } from './maps.service.js';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('MapsService (OpenStreetMap Nominatim)', () => {
  let service: MapsService;
  let httpService: HttpService;

  beforeEach(async () => {
    const mockHttp = {
      get: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'NOMINATIM_BASE_URL') return 'https://nominatim.openstreetmap.org';
        if (key === 'NOMINATIM_USER_AGENT') return 'LaporKita-Test/1.0 (test@laporkita.id)';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapsService,
        { provide: HttpService, useValue: mockHttp },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<MapsService>(MapsService);
    httpService = module.get<HttpService>(HttpService);
  });

  describe('reverseGeocode', () => {
    it('should call Nominatim with User-Agent and return formatted address and attribution', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          display_name: 'Jl. Ijen No. 2, Oro-oro Dowo, Klojen, Kota Malang, Jawa Timur',
          address: {
            road: 'Jl. Ijen',
            suburb: 'Oro-oro Dowo',
            city_district: 'Klojen',
            city: 'Kota Malang',
          },
          licence: 'Data © OpenStreetMap contributors',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as never },
      };

      const getSpy = jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = await service.reverseGeocode(-7.983908, 112.621391);

      expect(result.address).toBe('Jl. Ijen, Oro-oro Dowo, Klojen, Kota Malang');
      expect(result.attribution).toBe(OSM_ATTRIBUTION);
      expect(result.cached).toBe(false);
      expect(getSpy).toHaveBeenCalledTimes(1);
      const callArgs = getSpy.mock.calls[0];
      expect(callArgs[0]).toBe('https://nominatim.openstreetmap.org/reverse');
      expect(callArgs[1]?.headers?.['User-Agent']).toBe('LaporKita-Test/1.0 (test@laporkita.id)');
    });

    it('should hit cache for subsequent calls on identical / rounded coordinates', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          display_name: 'Jl. Veteran, Lowokwaru, Kota Malang',
          address: {
            road: 'Jl. Veteran',
            suburb: 'Ketawanggede',
            city_district: 'Lowokwaru',
            city: 'Kota Malang',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as never },
      };

      const getSpy = jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      // Call 1
      const res1 = await service.reverseGeocode(-7.954, 112.613);
      expect(res1.cached).toBe(false);
      expect(getSpy).toHaveBeenCalledTimes(1);

      // Call 2 with very close coordinate (rounded to 4 decimals: -7.9540, 112.6130)
      const res2 = await service.reverseGeocode(-7.954012, 112.613022);
      expect(res2.cached).toBe(true);
      expect(getSpy).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should fallback gracefully when Nominatim request fails', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => new Error('HTTP 503 Service Unavailable')));

      const result = await service.reverseGeocode(-7.983908, 112.621391);

      expect(result.address).toContain('Jl. Sekitar Titik');
      expect(result.attribution).toBe(OSM_ATTRIBUTION);
    });
  });
});
