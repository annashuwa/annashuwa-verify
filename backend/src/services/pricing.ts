import { IService } from '../models/catalog.js';

export function priceFor(service: IService, role: string, channel: 'web' | 'api' = 'web'): number {
  if (channel === 'api') return service.apiPriceKobo;
  if (role === 'reseller') return service.resellerPriceKobo;
  if (role === 'api_customer') return service.apiPriceKobo;
  return service.priceKobo;
}

export function profitFor(priceKobo: number, providerCostKobo: number): number {
  return Math.max(0, priceKobo - providerCostKobo);
}
