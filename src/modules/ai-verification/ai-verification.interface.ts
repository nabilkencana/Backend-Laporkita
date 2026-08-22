export interface AIVerificationResult {
  confidence: number;
  category: string;
  isValidGps: boolean;
  isValidTimestamp: boolean;
  damageSeverity: number;
  reason?: string;
  isMock: boolean;
}

export interface IAIVerificationService {
  verifyReport(reportId: string): Promise<AIVerificationResult>;
}
