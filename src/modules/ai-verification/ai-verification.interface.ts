export interface AIVerificationResult {
  confidence: number;
  category: string;
  isValidGps: boolean;
  isValidTimestamp: boolean;
  damageSeverity: number;
  isAuthentic?: boolean;
  isValid?: boolean;
  needsManualReview?: boolean;
  reason?: string;
  isMock: boolean;
}

export interface IAIVerificationService {
  verifyReport(reportId: string): Promise<AIVerificationResult>;
}
