# Stage 11 — Launch: version 1.0.0 (classroom edition, part E)

**Status:** done
**Date:** 2026-10-10

## What we built
- **Footer** on every screen: version, course credit, a note that every authority and person is simulated, and links to the source code, the licence, and the issue chooser ("Report a problem or suggest a lesson"). Links open in a new tab with `rel="noopener noreferrer"`. Following a link is navigation, which the CSP allows; fetching is still forbidden.
- **Favicon:** a seal, bundled as a hashed asset.
- **`CHANGELOG.md`** with the 1.0.0 notes; `src/version.ts` holds the version shown in the footer. (`package.json` is deliberately untouched, to keep patches free of conflicts with Dependabot's lockfile updates.)
- **Browser-test hardening** after one Firefox run stalled waiting for every font to load:
  - tests open pages with `waitUntil: 'domcontentloaded'` (`open()` in `tests/e2e/fixtures.ts`); each test still waits for the elements it needs;
  - CI retries a failed browser test once, and Playwright reports such tests as **flaky**, visibly. A real failure fails twice.

## Deferred, by decision
- Offline support (C3): built and then set aside before committing; it will return with the multi-course platform.
- Teaching materials (D): on hold until the multi-course platform's shared structure is planned.

## Testing results
| Suite | Tests | Result |
|---|---|---|
| Unit and integration | 244 | pass |
| Browser, including the new footer test | 20 | pass |

## Releasing
After this change is merged and deployed: create the GitHub release `v1.0.0` from `main`, with the CHANGELOG entry as its notes.
