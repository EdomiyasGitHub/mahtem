# Contributing to Mahtem

Thank you for helping students learn PKI. Contributions of every size are welcome: a clearer explanation, a new scenario, a bug fix, a translation.

## Setting up

Requires Node 22.13+ (or 20.19+, 24+) and npm 11.

```bash
npm install -g npm@11.20.0
npm ci
npm run check        # type check, lint, unit tests, build, bundle check
npm run preview      # http://localhost:4173 with the real security headers
npm run test:e2e     # browser tests (first time: npx playwright install chromium)
```

`npm run dev` is handy while coding but skips the security headers.

## The rules that keep the lab trustworthy

1. **Every value on screen must be computed.** Never draw a result that no real operation produced. Mark drawings of real results as such.
2. **Cryptography only through `src/crypto/`**, which uses the browser's Web Crypto. Never hand-write a cryptographic primitive. The linter enforces the boundary.
3. **No network, no HTML injection, no browser storage.** The Content Security Policy forbids connections; the linter forbids `innerHTML`, `dangerouslySetInnerHTML`, `fetch` and `localStorage` in app code.
4. **Trust only from the verifier's trust store.** Any change to `src/verify/` must keep the sabotage-tested rules described in ADR 0006.
5. **Dependencies:** exact versions, at least 14 days old, whole tree resolved with `npm install --before=<date>` (ADR 0003).
6. **Tests:** new behaviour comes with tests. Security-relevant changes come with a test that fails if the control is removed.
7. **Honesty about the course:** anything beyond the CS486 practical is labelled "Extension" in the interface.

## Where things live

See `README.md` ("Project layout") and the decision records in `docs/adr/`.

## Pull requests

Keep them focused, explain the why, and fill in the checklist. CI runs every check plus the browser tests in Chromium and Firefox.
