export interface ZonePredictionResult {
  zoneId: string;
  reportDensity: number;
  trafficDensity: number;
  floodRiskProbability: number;
  weatherContext: Record<string, unknown>;
  stressLevel: 'low' | 'medium' | 'high';
  isMock: boolean;
}

export interface IPredictionService {
  predictZoneMetrics(zoneId: string): Promise<ZonePredictionResult>;
  refreshAllZoneMetrics(): Promise<{ updatedCount: number; results: ZonePredictionResult[] }>;
}
