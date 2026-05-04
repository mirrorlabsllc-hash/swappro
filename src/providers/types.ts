export type ProviderSource = 'mock' | 'external' | 'live';
export type ProviderType = 'dex-aggregator' | 'instant-swap' | 'cross-chain' | 'market-data' | 'mock';

export interface ProviderResult {
  id: string;
  name: string;
  source: ProviderSource;
  providerType: ProviderType;
  isExternal: boolean;
  supportsExecution: boolean;

  outputAmount: number;
  fee: number;
  speed: 'fast' | 'medium' | 'slow';

  routeScore: number;
  riskScore: number;
  reliabilityScore: number;

  swapScore: number;

  scoringBreakdown: {
    routeContribution: number;
    safetyContribution: number;
    reliabilityContribution: number;
    formula: string;
  };
}
