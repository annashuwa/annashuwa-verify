import { VendorAdapter } from './vendor.js';

/**
 * Prembly identity-verification adapter.
 *
 * ACTIVATION (all server-side env — never frontend, never committed):
 *   PREMBLY_BASE_URL=https://<official base url>
 *   PREMBLY_API_KEY=<official secret key>
 *   PREMBLY_AUTH_HEADER="Authorization: Bearer {key}" (map the official scheme here)
 *   PREMBLY_METHOD=GET|POST                           (default POST)
 *   PREMBLY_PATH_NIN_LOOKUP=/...                      (official NIN endpoint)
 *   PREMBLY_PATH_BVN_LOOKUP=/...                      (official BVN endpoint)
 *   PREMBLY_PATH_CAC=/...                             (official CAC endpoint, if supported)
 *   PREMBLY_PATH_STATUS=/...                          (optional async status endpoint)
 *   PREMBLY_PATH_BALANCE=/...                         (optional balance endpoint → else NOT_SUPPORTED)
 *   PREMBLY_PATH_HEALTH=/...                          (optional; else status assumed)
 *   PREMBLY_DEFAULT_COST_KOBO=15000
 *
 * REQUIRED FROM PREMBLY (official documentation):
 *   authentication scheme, base URL, per-operation endpoint paths,
 *   request field names, response + error shapes, timeout behaviour,
 *   status/reconciliation endpoint, pricing.
 * Until those are mapped into env, isConfigured() is false and the engine
 * routes around this vendor (PROVIDER_NOT_CONFIGURED) — nothing is faked.
 */
export class PremblyAdapter extends VendorAdapter {
  name = 'prembly';
  providerName = 'Prembly';
  protected prefix = 'PREMBLY';
}
