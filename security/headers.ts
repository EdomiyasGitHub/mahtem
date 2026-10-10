/**
 * Single source of truth for Mahtem's HTTP security headers.
 *
 * Used in two places so they can never drift apart:
 *   1. `vite preview` serves them locally (vite.config.ts → preview.headers)
 *   2. the build emits them as `dist/_headers` for Cloudflare Pages / Netlify
 *
 * The dev server (`npm run dev`) deliberately does NOT apply the CSP: Vite's
 * hot-reload needs inline scripts and a WebSocket. Always test security
 * behaviour with `npm run build && npm run preview`.
 */

/** Content-Security-Policy directives. Order is preserved in the output. */
export const cspDirectives: ReadonlyArray<readonly [string, string]> = [
  // Deny everything by default; each capability below is granted explicitly.
  ['default-src', "'none'"],
  // Only our own bundled scripts. No inline script, no eval.
  ['script-src', "'self'"],
  // Only our own bundled stylesheets. No inline <style> blocks.
  ['style-src', "'self'"],
  // Fonts are self-hosted (see ADR 0002); no Google Fonts requests.
  ['font-src', "'self'"],
  // data:/blob: needed later for exported files and generated QR images.
  ['img-src', "'self' data: blob:"],
  // The app never talks to a network. Keys cannot be sent anywhere by
  // fetch/XHR/WebSocket/beacon, even if an attacker managed to run script.
  ['connect-src', "'none'"],
  // Reserved for moving RSA-4096 key generation off the main thread later.
  ['worker-src', "'self'"],
  ['manifest-src', "'self'"],
  ['object-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
  // Nobody may embed the lab in a frame (clickjacking).
  ['frame-ancestors', "'none'"],
];

export function buildCsp(): string {
  return cspDirectives.map(([name, value]) => `${name} ${value}`).join('; ');
}

export const securityHeaders: Readonly<Record<string, string>> = {
  'Content-Security-Policy': buildCsp(),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // Legacy equivalent of frame-ancestors for old browsers.
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), clipboard-read=()',
  // Ignored by browsers over plain-HTTP localhost; effective once hosted on HTTPS.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Render the headers in the `_headers` file format used by Cloudflare Pages and Netlify. */
export function renderHeadersFile(headers: Readonly<Record<string, string>> = securityHeaders): string {
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);
  return ['/*', ...lines, ''].join('\n');
}
