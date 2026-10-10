# ADR 0001 — Client-only application, no backend

**Status:** accepted · 2026-10-08

## Context
Mahtem demonstrates RSA key generation, SHA-256, RSA signatures, X.509 issuance and chain validation. All of these are available in the browser through Web Crypto (native) and `@peculiar/x509` (a TypeScript X.509 library built on Web Crypto, no custom cryptography).

## Decision
Ship a static single-page app. No server, no database, no accounts. Private keys are generated and used inside the browser tab and held in memory only.

## Consequences
- Private keys never cross a network boundary; there is no server to breach.
- The attack surface is the page itself, so the CSP and lint guardrails (ADR 0002, `eslint.config.js`) carry the security weight.
- "Real OpenSSL" evidence is provided by exporting files and running the course's own commands locally (scripts arrive in a later stage), not by running OpenSSL on a server, which would add command-injection risk and put keys on a server.
- Not production key custody: a browser tab is not an HSM, and JavaScript cannot guarantee memory is wiped. The UI says so where CA keys are created.
