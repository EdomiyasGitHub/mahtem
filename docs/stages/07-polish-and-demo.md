# Stage 7 — Polish, browser tests and demonstration

**Status:** done
**Date:** 2026-10-09

## What we built
**Automated browser tests** (`npm run test:e2e`, Playwright 1.56.0). The manual Chromium walkthroughs of Stages 4–6 became 11 tests against the production build with its real security headers:
| Suite | What it proves |
|---|---|
| `bench-and-desk` | Full issuing flow with real key sizes; input validation; Verified with 7/7 checks; one-character tamper fails check 3 only; restore; un-trusting the root fails check 5; 384-byte signature download; desk empty state |
| `chain-and-inspector` | Empty chain; 3 links drawn only after verification; exactly 3 ledger entries after revisiting; inspector Fields, Extensions (arrow keys), ASN.1 labels, PEM download; diploma inspector |
| `attacks` | Set up the whole lab; Run all ten (10/10 as expected, each row's outcome); rogue root named an impostor; University as CA marks two certificates; missing issuer; tampering; open on desk; results kept; reset clears |
| `security` | CSP and other headers served; `fetch` to another site and to the same site both blocked by `connect-src 'none'`; every screen fits a 390 px phone |

**A guard on every test** (`tests/e2e/fixtures.ts`): any CSP violation, console error or warning, or uncaught page error fails the test. Sabotage check: one injected `console.warn` failed the flow test.

**CI:** a second job installs Chromium and Firefox and runs the browser tests in both, uploading traces on failure. Firefox is the project owner's browser.

**Polish:**
- At narrow laptop widths (≤ 1152 px) the header no longer wraps: the "keys stay in this tab" note moves into the bench introduction.
- Check 3's wording no longer produces "…Signing”’s certificate".

**Presentation materials** (delivered alongside the code, not in the repository): a slide deck and a timed demonstration script with likely questions and answers.

## Running the browser tests locally
```bash
npx playwright install chromium        # one-time download of the matching browser (~150 MB)
npm run test:e2e
```
Firefox too: `npx playwright install firefox`, then `E2E_ALL_BROWSERS=1 npm run test:e2e` (on PowerShell: `$env:E2E_ALL_BROWSERS=1; npm run test:e2e`).

## Dependencies
Dev: `@playwright/test` 1.56.0 (Apache-2.0). Version chosen to match a known browser build; resolved with `--before=2026-09-25` (ADR 0003). `npm audit`: 0 vulnerabilities.

## Results
| Suite | Tests | Result |
|---|---|---|
| Unit and integration (Vitest) | 215 | pass |
| Browser (Playwright, Chromium 141) | 11 | pass, 27 s |

## Known limitations
- Firefox browser tests run in CI, not in the build environment, which has no Firefox. The project owner tested every stage in Firefox by hand.
- The browser tests cover the main flows; file import from the Stage 3 scenario folders is covered by unit tests and was tested by hand.
