/**
 * Build-time configuration.
 *
 * NEVER put secrets here (API keys, passwords, tokens, signing keys). This file is compiled
 * into the JavaScript bundle that every visitor downloads, so anything in it is public: it is
 * visible in the browser's developer tools. Secrets belong on the server, or in CI's secret
 * store. This app has none: demo users have no passwords, and tokens are issued at runtime.
 */
export interface Environment {
  /**
   * Base URL of the backend API. The bearer token is only ever attached to requests under it.
   * Same origin by default, which the CSP's `connect-src 'self'` allows; a different origin
   * would also need adding to connect-src in src/index.html.
   */
  apiBaseUrl: string;
  /**
   * Answer API calls from the in-browser mock backend (src/app/core/mock) instead of a server.
   * To use a real backend, set this to false and point apiBaseUrl at it; no feature changes.
   * The mock plays the server at "/api", so keep that apiBaseUrl while this is true.
   */
  useMockApi: boolean;
}

export const environment: Environment = {
  apiBaseUrl: '/api',
  useMockApi: true,
};
