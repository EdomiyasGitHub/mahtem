# Stage 0 — Project foundation

**Status:** done
**Date:** 2026-10-08

## What we built
A Vite + React + TypeScript static app shell with:
- strict HTTP security headers from one source file, served by `vite preview` and emitted as `dist/_headers` for deployment;
- lint rules that turn security decisions into build failures;
- an "instrument check" screen that inspects the real browser runtime (secure context, Web Crypto, secure randomness) before any cryptography runs;
- self-hosted fonts, CI, and this documentation structure.

No cryptographic features yet. That is Stage 1.

## Why we built it
Security controls are cheapest to add before there is code to retrofit. Every later stage handles private keys, so the "keys never leave the tab" guarantee had to exist, and be tested, from the first commit.

## Security principle
**Defence in depth and secure defaults.** Three independent layers stop key exfiltration and script injection:
1. Architecture: no backend exists to receive anything (ADR 0001).
2. Browser policy: CSP `connect-src 'none'`, `default-src 'none'`, no inline script (ADR 0002).
3. Code policy: ESLint bans network APIs, HTML sinks and plain storage; only `src/crypto/` may touch `crypto.subtle`.

Also **least privilege**: the CSP denies everything by default and grants each capability by name.

## Technical architecture
```text
security/headers.ts ──► vite.config.ts ──► preview server headers
        │                     └──────────► dist/_headers (deployment)
        └──► tests/security-headers.test.ts

src/crypto/environment.ts ──► src/ui/shell/EnvironmentPanel.tsx
   (the only layer allowed to touch Web Crypto)
```

## Files created
| File | Purpose |
|---|---|
| `package.json`, `.npmrc`, `.nvmrc`, `package-lock.json` | Exact pins, npm ≥ 11, Node 22 |
| `tsconfig.json` | Strict TypeScript (incl. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `vite.config.ts` | Build, preview headers, `_headers` emitter, test config |
| `security/headers.ts` | CSP and security headers: single source |
| `eslint.config.js` | Code quality + security guardrails |
| `src/crypto/environment.ts` | Runtime capability checks |
| `src/ui/shell/*` | Header, instrument check panel, styles |
| `src/styles/*` | Design tokens, base styles, font imports |
| `scripts/verify-dist.mjs` | Post-build CSP-compatibility check |
| `tests/*.test.ts` | 21 tests (environment, headers, guardrails) |
| `.github/workflows/ci.yml` | CI pipeline |
| `README.md`, `SECURITY.md`, `docs/adr/0001–0003`, `docs/stages/_TEMPLATE.md` | Documentation |

## Dependencies
Runtime: `react`/`react-dom` 19.3.0; five `@fontsource` packages 5.3.0.
Dev: `vite` 8.3.1, `@vitejs/plugin-react` 6.1.1, `vitest` 5.0.1, `typescript` 6.0.3, `eslint` 9.39.5, `typescript-eslint` 8.70.1, `eslint-plugin-react-hooks` 7.1.1, `globals`, `@types/*`.
Every version was at least 14 days old at install (ADR 0003). `npm audit`: 0 vulnerabilities.

## Configuration
None required. No environment variables or secrets exist, by design.

## Setup instructions
```bash
npm install -g npm@11.20.0     # npm 10 crashes on this dependency graph (ADR 0003)
npm ci
npm run check
npm run preview                # http://localhost:4173
```

## Testing instructions and results
| Test | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 warnings |
| `npm test` | 21/21 pass |
| `npm run build` + `verify:dist` | pass: 34 files, 1328 KiB, no inline script/style, no remote URLs |
| Preview server headers (curl) | all 8 headers present on HTML and JS responses |
| Headless Chromium 141, 1280 px and 390 px | renders; **0 CSP violations on load; 0 console messages**; no horizontal overflow; first Tab reaches the skip link |
| Exfiltration attempt from page context (`fetch` to external and same origin) | **both blocked** by `connect-src` |
| Sabotage: inline script injected into the built page | `verify:dist` fails ✔ |
| Sabotage: CSP weakened to `connect-src 'self' https:` | 2 header tests fail ✔ |
| Sabotage: `dangerouslySetInnerHTML` guardrail removed | guardrail test fails ✔ |

## Expected output
The page shows the headline, and an **Instrument check** panel reading *Ready for real cryptography* with three passing checks. Over plain HTTP on a non-localhost address it shows *This browser cannot run the lab* with a fix for each failed check.

## Post-release fix (2026-10-08)
`engines.node` originally said `>=20.19`, but `typescript-eslint` pulls in `eslint-visitor-keys@5`, which requires `^20.19.0 || ^22.13.0 || >=24`. On Node 22.12 this surfaced as a confusing `EBADENGINE` error from a transitive package. `engines.node` now states the true minimum, found by scanning every installed package's `engines` field.

## Known limitations
- The dev server does not apply the CSP; use `preview` for security testing.
- The insecure-context path is covered by unit tests only, not a browser test (it would need a non-localhost HTTP origin).
- The browser smoke test was run manually in the build environment; it is not yet in CI (planned for Stage 7).
- Font files ship as both woff2 and woff (Fontsource default), and browsers fetch only woff2.

## Security considerations
- `img-src` allows `data:` and `blob:` for future exports and QR codes. Revisit if unused by Stage 7.
- `worker-src 'self'` is reserved for moving RSA-4096 key generation off the main thread.
- Hosting must support custom headers (Cloudflare Pages or Netlify, not GitHub Pages).

## Future improvements
- Trusted Types (`require-trusted-types-for 'script'`) once React compatibility is confirmed in the browser test.
- Browser smoke test in CI.
- Licence choice (not yet decided by the project owner).
