import { VendorAdapter } from './vendor.js';

/**
 * VerifyMe identity-verification adapter.
 *
 * ACTIVATION (all server-side env — never frontend, never committed):
 *   VERIFYME_BASE_URL=https://<official base url>
 *   VERIFYME_API_KEY=<official secret key>
 *   VERIFYME_AUTH_HEADER="Authorization: Bearer {key}" (map the official scheme here)
 *   VERIFYME_METHOD=GET|POST                           (default POST)
 *   VERIFYME_PATH_NIN_LOOKUP=/...                      (official NIN endpoint)
 *   VERIFYME_PATH_BVN_LOOKUP=/...                      (official BVN endpoint)
 *   VERIFYME_PATH_CAC=/...                             (official CAC endpoint, if supported)
 *   VERIFYME_PATH_STATUS=/...                          (optional async status endpoint)
 *   VERIFYME_PATH_BALANCE=/...                         (optional balance endpoint → else NOT_SUPPORTED)
 *   VERIFYME_PATH_HEALTH=/...                          (optional; else status assumed)
 *   VERIFYME_DEFAULT_COST_KOBO=15000
 *
 * REQUIRED FROM VERIFYME (official documentation):
 *   authentication scheme, base URL, per-operation endpoint paths,
 *   request field names, response + error shapes, timeout behaviour,
 *   status/reconciliation endpoint, pricing.
 * Until those are mapped into env, isConfigured() is false and the engine
 * routes around this vendor (PROVIDER_NOT_CONFIGURED) — nothing is faked.
 */
export class VerifyMeAdapter extends VendorAdapter {
  name = 'verifyme';
  providerName = 'VerifyMe';
  protected prefix = 'VERIFYME';
}
