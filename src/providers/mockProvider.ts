import { ProviderResult } from './types';

export function mockProvider(): ProviderResult {
  const routeScore = 80;
  const riskScore = 30;
  const reliabilityScore = 70;

  const swapScore = Math.round(
    (routeScore * 0.55) +
    ((100 - riskScore) * 0.25) +
    (reliabilityScore * 0.20)
  );

  return {
    id: 'mock',
    name: 'Mock Provider',
    source: 'mock',
    providerType: 'mock',
    isExternal: false,
    supportsExecution: false,

    outputAmount: 98,
    fee: 2,
    speed: 'fast',

    routeScore,
    riskScore,
    reliabilityScore,
    swapScore,

    scoringBreakdown: {
      routeContribution: routeScore * 0.55,
      safetyContribution: (100 - riskScore) * 0.25,
      reliabilityContribution: reliabilityScore * 0.20,
      formula: 'routeScore * 0.55 + (100 - riskScore) * 0.25 + reliabilityScore * 0.20'
    }
  };
}
