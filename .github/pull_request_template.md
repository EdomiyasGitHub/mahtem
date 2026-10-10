## What and why

## How it was tested
- [ ] `npm run check` passes
- [ ] `npm run test:e2e` passes (or explain why not run)
- [ ] New behaviour has tests; security-relevant changes have a test that fails without them

## Checklist
- [ ] No network requests, no HTML injection sinks, no browser storage (see SECURITY.md)
- [ ] Cryptography only through `src/crypto/`; no hand-written cryptographic primitives
- [ ] New dependencies follow ADR 0003 (exact version, at least 14 days old)
- [ ] Anything shown as a visualization corresponds to a real operation
