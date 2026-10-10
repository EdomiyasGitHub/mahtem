# ADR 0009 — Hosting and deployment

**Status:** accepted · 2026-10-10

## Decision
- **Host on Cloudflare Workers static assets** (`wrangler.jsonc`), serving `dist/` with no Worker script.
- **Deploy from GitHub Actions**, not from Cloudflare's own build system, and only after the `check` and `browser` jobs pass on `main`.
- **Check the live site after every deployment** (`scripts/verify-live.sh`): poll for up to 3 minutes until the deployed URL serves **this build** (identified by its content-hashed script file name), then require the Content-Security-Policy with `connect-src 'none'`, `X-Frame-Options: DENY` and `nosniff`.

  *First-deploy lesson (2026-10-10):* the original check ran seconds after upload and met Cloudflare's generic 404 while the new Worker propagated; `curl --retry` does not retry 404s. Polling for the specific build also prevents a later deploy from passing on the previous version.

## Why
| Option | Assessment |
| --- | --- |
| Cloudflare Workers static assets | Static requests and bandwidth free and unmetered, so a whole class can use it at once; supports the `_headers` file the build already emits; Cloudflare's recommended path for new projects (2026) |
| Cloudflare Pages | Same network and limits, but Cloudflare now steers new projects to Workers |
| Netlify | Supports `_headers`; free tier is now credit-based |
| Vercel | Headers need separate configuration; the free plan is for non-commercial use, which could conflict with a future product |

Building in GitHub Actions means the deployed files come from the exact, tested toolchain (Node 22, npm 11, locked dependencies). Cloudflare's builder would run npm 10, which the project rejects (ADR 0003). It also means **nothing reaches production without passing every test**, including the browser tests in Chromium and Firefox.

## Supply chain
Every action is pinned to a commit hash, with the version in a comment: `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0, `actions/upload-artifact` v7.0.1, `cloudflare/wrangler-action` v4.1.3; Wrangler 4.141.0. All were at least 14 days old (ADR 0003). Newer `setup-node` 7.1.0 and `upload-artifact` 7.0.2 were skipped because they were 3 days old. Dependabot proposes updates with a 14-day cooldown.

## Secrets
`CLOUDFLARE_API_TOKEN` (scoped to *Workers Scripts: Edit* on one account) and `CLOUDFLARE_ACCOUNT_ID`, stored as GitHub Actions secrets in a `production` environment that only the deploy job uses. The app itself has no secrets.
