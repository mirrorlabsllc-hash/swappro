import { mockProvider } from './mockProvider';
import { ProviderResult } from './types';

export function getProviders(): ProviderResult[] {
  // TODO: Replace with real providers (0x, ChangeNOW, SwapZone, LiFi)
  return [mockProvider()];
}
