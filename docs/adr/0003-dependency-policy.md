# ADR 0003 — Dependency policy

**Status:** accepted · 2026-10-08

## Decision
1. **Few dependencies.** Runtime: React, React DOM, self-hosted fonts, and since Stage 2 `@peculiar/x509` 2.1.0 (MIT) with its required polyfill `reflect-metadata` 0.2.2 (see ADR 0005). Nothing else without a recorded reason.
2. **Exact versions** (`save-exact=true`), committed `package-lock.json`, `npm ci` in CI.
3. **Cooling-off period, for the whole tree:** every package, direct *and transitive*, must be at least 14 days old. Enforced with npm's `--before` flag, which makes npm resolve every version range to releases published before a cutoff date:
   ```bash
   npm install --save-exact <pkg>@<version> --before=<today minus 14 days>
   ```
   *Correction (Stage 2):* Stages 0–1 applied the rule to direct dependencies only. Re-resolving with `--before` showed that the Stage 1 lockfile already contained a transitive package (`source-map-js` 1.2.2) published 8 days earlier. The lockfile was regenerated with `--before=2026-09-25`.

   **Single exception: published security fixes.** If the cutoff resolves to a version with a known advisory, the fixed version is allowed even if newer, and the exception is recorded here:
   | Package | Version | Published | Reason | Exposure |
   |---|---|---|---|---|
   | `source-map-js` | 1.2.2 | 2026-09-30 | fixes GHSA-68fv-2mgg-jv7q (high, denial of service) present in 1.2.1 | build tooling only (vite → postcss); never shipped to the browser |
4. **npm ≥ 11.** npm 10.9 crashes (`Cannot read properties of null (reading 'edgesOut')`) resolving Vitest 5's optional peer dependencies. `engines` + `engine-strict` make the requirement explicit rather than a confusing crash.
5. **TypeScript 6.0**, not 7: `typescript-eslint` 8.70 supports `<6.1`. Dependabot proposed TypeScript 7.0.2 on 2026-10-10; CI's `npm ci` refused it on that peer range, as intended. `.github/dependabot.yml` now ignores TypeScript **major** updates until typescript-eslint supports 7; minor and patch updates still arrive.
6. **ESLint 10** (updated 2026-10-08 at the start of Stage 1). ESLint 9.39.5 was marked deprecated (end of support); 10.11.0 met the 14-day rule and both plugins support it. The guardrail tests passed unchanged after the upgrade.
7. **Node ≥ 22.13** (or 20.19+, or 24+): the true minimum across all dependencies, found by scanning every installed package's `engines` field.
8. **Cryptography comes only from Web Crypto** (and libraries layered on it). No hand-written cryptographic primitives. Lint enforces that only `src/crypto/` touches `crypto.subtle`.
