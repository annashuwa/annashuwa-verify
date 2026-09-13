import { VendorAdapter } from './vendor.js';

/**
 * Dojah identity-verification adapter.
 *
 * ACTIVATION (all server-side env — never frontend, never committed):
 *   DOJAH_BASE_URL=https://<official base url>
 *   DOJAH_API_KEY=<official secret key>
 *   DOJAH_AUTH_HEADER="AppId: {key}"                  (Dojah v1 uses AppId + secret;
 *                                                     map the official scheme here)
 *   DOJAH_METHOD=GET|POST                             (default POST)
 *   DOJAH_PATH_NIN_LOOKUP=/...                        (official NIN endpoint)
 *   DOJAH_PATH_NIN_PHONE=/...                         (official NIN phone-lookup endpoint)
 *   DOJAH_PATH_NIN_DEMOGRAPHICS=/...                  (official NIN demographic endpoint)
 *   DOJAH_PATH_BVN_LOOKUP=/...                        (official BVN endpoint)
 *   DOJAH_PATH_BVN_PHONE=/...                         (official BVN phone-lookup endpoint)
 *   DOJAH_PATH_CAC=/...                               (official CAC endpoint, if supported)
 *   DOJAH_PATH_STATUS=/...                            (optional async status endpoint)
 *   DOJAH_PATH_BALANCE=/...                           (optional balance endpoint → else NOT_SUPPORTED)
 *   DOJAH_PATH_HEALTH=/...                            (optional; else status assumed)
 *   DOJAH_DEFAULT_COST_KOBO=15000
 *
 * REQUIRED FROM DOJAH (official documentation):
 *   authentication scheme, base URL, per-operation endpoint paths,
 *   request field names, response + error shapes, timeout behaviour,
 *   status/reconciliation endpoint, pricing.
 * Until those are mapped into env, isConfigured() is false and the engine
 * routes around this vendor (PROVIDER_NOT_CONFIGURED) — nothing is faked.
 */
export class DojahAdapter extends VendorAdapter {
  name = 'dojah';
  providerName = 'Dojah';
  protected prefix = 'DOJAH';
}
