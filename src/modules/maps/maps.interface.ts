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

export interface RouteResult {
  coordinates: number[][]; // [lng, lat][] format OSRM
  distance_meters: number;
  duration_seconds: number;
  cached?: boolean;
}
