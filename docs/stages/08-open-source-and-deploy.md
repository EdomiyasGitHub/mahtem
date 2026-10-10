# Stage 8 — Open source and deployment (classroom edition, stages A and B)

**Status:** done in the repository; awaiting the owner's first push and secrets
**Date:** 2026-10-10

## What we built
**Open-source readiness (A):** Apache-2.0 `LICENSE` (canonical text, SHA-256 verified) and `NOTICE`; `CONTRIBUTING.md` with the project's trust rules; `CODE_OF_CONDUCT.md`; `SECURITY.md` with private vulnerability reporting; issue templates (bug, teaching idea) and a pull-request checklist; Dependabot with a 14-day cooldown; `.gitattributes` forcing LF line endings so Windows checkouts build identically; a public-facing README.

**Deployment (B):** `wrangler.jsonc` for Cloudflare Workers static assets; CI rewritten with every action pinned to a commit hash; a `deploy` job that runs only on `main` after all checks and browser tests pass, then verifies the live site's security headers. See ADR 0009.

## Testing
- `wrangler deploy --dry-run`: reads all 35 build files, including `_headers`; no bindings, no server code.
- Workflow parsed; job order `check → browser → deploy`; action inputs and outputs verified against the pinned `wrangler-action` source.
- Full suite after the changes: see the Stage 8 results in the hand-off.

## Owner's steps
Create the empty GitHub repository, push, add two secrets, enable private vulnerability reporting. The first push to `main` deploys.
