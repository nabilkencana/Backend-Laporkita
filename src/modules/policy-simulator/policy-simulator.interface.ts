export interface PolicySimulationResult {
  id: string;
  requestedBy: string;
  promptText: string;
  zoneId?: string | null;
  resultNarrative: string;
  resultData: Record<string, unknown>;
  createdAt: Date;
  isMock: boolean;
}

export interface IPolicySimulatorService {
  simulatePolicy(
    requestedBy: string,
    promptText: string,
    zoneId?: string,
  ): Promise<PolicySimulationResult>;
}
