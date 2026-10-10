# Changelog

## 1.0.0 — 2026-10-10

The first public release of the Mahtem classroom edition.

**The lab**
- Lab bench: build Root CA → Ministry of Education CA → University in the order of the CS486 practical, and sign a diploma. Every step runs real Web Crypto and shows the equivalent OpenSSL command.
- Trust chain: each link is drawn only after its signature verifies; a certificate inspector with fields, plain-language extensions, ASN.1 and PEM.
- Attack bench: ten scenarios (one genuine, nine attacks) built live, with the verifier's path drawn and broken links marked.
- Verifier desk: seven checks re-run on every change; edit the received bytes, manage the trust store, load and download bundles.

**Learning**
- Learn: six guided lessons tied to the course, two playgrounds (SHA-256, RSA signing), shuffled quizzes with explanations, a glossary.
- Exercises: Spot the fake (six unlabelled cases per round) and the course's three-message exercise, with OpenSSL-compatible files.
- Projector mode for classrooms.

**Quality and security**
- No server; private keys are non-extractable and never leave the tab; a strict Content Security Policy forbids every network request.
- Interoperates with OpenSSL: byte-identical signatures, certificates accepted by `openssl verify`, agreement on all ten scenarios.
- 244 unit and integration tests; 19 browser tests in Chromium and Firefox, each failing on any security-policy violation or console error.
- Deployed to Cloudflare only after every test passes, then verified live.
