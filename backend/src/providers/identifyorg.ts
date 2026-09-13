import { VendorAdapter } from './vendor.js';

/**
 * IdentifyOrg identity-verification adapter.
 *
 * ACTIVATION (all server-side env — never frontend, never committed):
 *   IDENTIFYORG_BASE_URL=https://<official base url>
 *   IDENTIFYORG_API_KEY=<official secret key>
 *   IDENTIFYORG_AUTH_HEADER="Authorization: Bearer {key}" (map the official scheme here)
 *   IDENTIFYORG_METHOD=GET|POST                           (default POST)
 *   IDENTIFYORG_PATH_NIN_LOOKUP=/...                      (official NIN endpoint)
 *   IDENTIFYORG_PATH_BVN_LOOKUP=/...                      (official BVN endpoint)
 *   IDENTIFYORG_PATH_CAC=/...                             (official CAC endpoint, if supported)
 *   IDENTIFYORG_PATH_STATUS=/...                          (optional async status endpoint)
 *   IDENTIFYORG_PATH_BALANCE=/...                         (optional balance endpoint → else NOT_SUPPORTED)
 *   IDENTIFYORG_PATH_HEALTH=/...                          (optional; else status assumed)
 *   IDENTIFYORG_DEFAULT_COST_KOBO=15000
 *
 * REQUIRED FROM IDENTIFYORG (official documentation):
 *   authentication scheme, base URL, per-operation endpoint paths,
 *   request field names, response + error shapes, timeout behaviour,
 *   status/reconciliation endpoint, pricing.
 * Until those are mapped into env, isConfigured() is false and the engine
 * routes around this vendor (PROVIDER_NOT_CONFIGURED) — nothing is faked.
 */
export class IdentifyOrgAdapter extends VendorAdapter {
  name = 'identifyorg';
  providerName = 'IdentifyOrg';
  protected prefix = 'IDENTIFYORG';
}
