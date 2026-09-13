import { VendorAdapter } from './vendor.js';

/**
 * Ninja identity-verification adapter.
 *
 * ACTIVATION (all server-side env — never frontend, never committed):
 *   NINJA_BASE_URL=https://<official base url>
 *   NINJA_API_KEY=<official secret key>
 *   NINJA_AUTH_HEADER="Authorization: Bearer {key}"   (optional override)
 *   NINJA_METHOD=GET|POST                             (default POST)
 *   NINJA_PATH_NIN_LOOKUP=/...                        (official NIN endpoint)
 *   NINJA_PATH_NIN_PHONE=/...                         (official NIN phone-lookup endpoint)
 *   NINJA_PATH_NIN_DEMOGRAPHICS=/...                  (official NIN demographic endpoint)
 *   NINJA_PATH_BVN_LOOKUP=/...                        (official BVN endpoint)
 *   NINJA_PATH_STATUS=/...                            (optional async status endpoint)
 *   NINJA_PATH_BALANCE=/...                           (optional balance endpoint → else NOT_SUPPORTED)
 *   NINJA_PATH_HEALTH=/...                            (optional; else status assumed)
 *   NINJA_DEFAULT_COST_KOBO=15000
 *
 * REQUIRED FROM NINJA (official documentation):
 *   authentication scheme, base URL, per-operation endpoint paths,
 *   request field names, response + error shapes, timeout behaviour,
 *   status/reconciliation endpoint, pricing.
 * Until those are mapped into env, isConfigured() is false and the engine
 * routes around this vendor (PROVIDER_NOT_CONFIGURED) — nothing is faked.
 */
export class NinjaAdapter extends VendorAdapter {
  name = 'ninja';
  providerName = 'Ninja';
  protected prefix = 'NINJA';
}
