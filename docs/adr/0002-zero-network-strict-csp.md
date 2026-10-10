# ADR 0002 — Zero network access and a strict Content-Security-Policy

**Status:** accepted · 2026-10-08

## Decision
- CSP: `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'none'`, `frame-ancestors 'none'`, no `unsafe-inline`, no `unsafe-eval`, no third-party origins. Full list in `security/headers.ts` (single source).
- Fonts are self-hosted via Fontsource packages (Latin, Latin Extended and Ethiopic subsets only) instead of Google Fonts.
- Vite never inlines assets as `data:` URIs (`assetsInlineLimit: 0`).
- Components style through CSS classes only, no inline `<style>` blocks.

## Why
`connect-src 'none'` means that even if an attacker found a way to run script in the page, the browser itself refuses to send anything anywhere: no fetch, XHR, WebSocket or beacon. For an app whose core asset is private keys, this is the strongest cheap control available.

## Verified by
- `tests/security-headers.test.ts`: policy contents
- `scripts/verify-dist.mjs`: the built bundle has no inline scripts/styles, remote URLs or data: fonts
- Browser smoke test (Stage 0 log): zero CSP violations on load; `fetch()` to both external and same origin is blocked

## Consequences
- `npm run dev` does not apply the CSP (Vite hot reload needs inline script and a WebSocket). Security behaviour must be tested with `npm run build && npm run preview`.
- The host must support custom headers (Cloudflare Pages, Netlify). GitHub Pages cannot set them and is not supported.
