export interface ReverseGeocodeResult {
  address: string;
  displayName: string;
  attribution: string;
  cached?: boolean;
}

export interface IGeocodingService {
  reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult>;
}

export interface ReverseGeocodeJobData {
  reportId: string;
  latitude: number;
  longitude: number;
}
