import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IGeocodingService, ReverseGeocodeResult } from './maps.interface.js';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

interface NominatimReverseResponse {
  display_name?: string;
  address?: {
    road?: string;
    suburb?: string;
    city_district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  licence?: string;
}

@Injectable()
export class MapsService implements IGeocodingService {
  private readonly logger = new Logger(MapsService.name);
  private readonly cache = new Map<string, ReverseGeocodeResult>();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Mengonversi koordinat lat/lng menjadi alamat teks terstruktur via OpenStreetMap / Nominatim.
   * Dilengkapi in-memory caching berdasarkan koordinat yang dibulatkan (~11 meter presisi).
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    // 1. Cek Cache koordinat (pembulatan 4 desimal ~11 meter)
    const cacheKey = `${Number(latitude).toFixed(4)},${Number(longitude).toFixed(4)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit untuk reverse geocode: ${cacheKey}`);
      return { ...cached, cached: true };
    }

    const baseUrl =
      this.configService.get<string>('NOMINATIM_BASE_URL') ?? 'https://nominatim.openstreetmap.org';
    const userAgent =
      this.configService.get<string>('NOMINATIM_USER_AGENT') ??
      'LaporKita-CityIntelligence/1.0 (contact@laporkita.id)';

    try {
      this.logger.log(
        `Memanggil OpenStreetMap Nominatim reverse geocode: ${latitude}, ${longitude}`,
      );

      const response = await firstValueFrom(
        this.httpService.get<NominatimReverseResponse>(`${baseUrl}/reverse`, {
          params: {
            format: 'jsonv2',
            lat: latitude,
            lon: longitude,
            addressdetails: 1,
          },
          headers: {
            'User-Agent': userAgent,
            Accept: 'application/json',
          },
          timeout: 5000,
        }),
      );

      const data = response.data;
      const formattedAddress = this.formatNominatimAddress(data, latitude, longitude);

      const result: ReverseGeocodeResult = {
        address: formattedAddress,
        displayName: data.display_name ?? formattedAddress,
        attribution: OSM_ATTRIBUTION,
        cached: false,
      };

      // Simpan ke cache
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.warn(
        `Nominatim reverse geocode gagal untuk (${latitude}, ${longitude}): ${
          error instanceof Error ? error.message : String(error)
        }. Menggunakan fallback alamat koordinat.`,
      );

      const fallbackAddress = `Jl. Sekitar Titik (${latitude.toFixed(6)}, ${longitude.toFixed(6)}), Kota Malang`;
      return {
        address: fallbackAddress,
        displayName: fallbackAddress,
        attribution: OSM_ATTRIBUTION,
        cached: false,
      };
    }
  }

  private formatNominatimAddress(data: NominatimReverseResponse, lat: number, lng: number): string {
    if (!data.address) {
      return data.display_name ?? `Lokasi (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }

    const addr = data.address;
    const parts: string[] = [];

    if (addr.road) parts.push(addr.road);
    if (addr.suburb) parts.push(addr.suburb);
    if (addr.city_district) parts.push(addr.city_district);
    if (addr.city) parts.push(addr.city);

    if (parts.length === 0) {
      return data.display_name ?? `Lokasi (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    }

    return parts.join(', ');
  }
}
