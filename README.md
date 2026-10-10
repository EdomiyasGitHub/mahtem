# Mahtem · ማኅተም

*Mahtem* is Amharic for **seal**. It is an interactive laboratory for learning how digital signatures and certificates really work: build a certificate hierarchy, sign a diploma, verify it as a stranger would, then try nine ways to fool the verifier and see exactly where each one is caught.

**Every value on screen is computed.** Keys, hashes, signatures and certificates come from your browser's own cryptography (Web Crypto), and they interoperate with OpenSSL: the same signature bytes, the same certificate checks.

> **Live:** [mahtem.rann.workers.dev](https://mahtem.rann.workers.dev)
> Built for CS486 Computer System Security at HiLCoE. Free to use in any classroom.

## What students learn

| Topic | Where in the lab |
| --- | --- |
| Hashing (SHA-256) and the avalanche effect | Verifier desk: change one character and watch all eight digest blocks change |
| RSA key pairs; signing is not encrypting | Lab bench: sign a diploma; verifier desk: check 3 |
| X.509 certificates and their extensions | Trust chain: the inspector explains each extension in plain words |
| CSRs and proof of possession | Lab bench, steps 2 and 3 |
| Root, intermediate and end-entity CAs; `CA:TRUE`, `pathlen:0` | Lab bench and trust chain |
| Chain validation and the trust store | Verifier desk: seven checks; un-trust the root and watch it fail |
| Attacks: tampering, signature swaps, impostor roots, pathlen breaches, expired certificates | Attack bench: ten live scenarios |

## Start with the lessons

The **Learn** tab has six short guided lessons tied to the course: read a little, try it (two playgrounds run real SHA-256 and RSA signing in the browser, the others send you into the lab), then check your understanding with a short quiz. A glossary explains every term. For classrooms, **Projector** enlarges the whole interface.

## The four places of the lab

- **Lab bench:** build Root CA → Ministry of Education CA → University, in the order of the course practical, then sign a diploma. Every step shows its real result and the equivalent OpenSSL command.
- **Trust chain:** each link is drawn only after its signature verifies. Inspect any certificate: fields, extensions, ASN.1 structure, PEM.
- **Attack bench:** ten scenarios built live against your own lab's keys. One is genuine; nine should be caught, and the path the verifier found is drawn with the broken part in red.
- **Verifier desk:** a stranger holding only a trust store. Seven checks, re-run whenever you edit the document or the trust store. Load and download bundles to check with OpenSSL.

## Real, and honest about it

- No server. Private keys are created non-extractable and never leave the browser tab. The Content Security Policy forbids every network request.
- What is computed and what is drawn are kept apart: drawings only ever show results that a real operation produced.
- Anything beyond the CS486 practical is labelled **Extension** in the interface.
- All authorities, institutions and people in the lab are **simulated or fictional**. It is a teaching tool, not a certificate authority.

## Run it yourself

Requires Node 22.13+ (or 20.19+, 24+) and npm 11.

```bash
npm install -g npm@11.20.0
npm ci
npm run build && npm run preview     # http://localhost:4173 with the real security headers
```

Check its cryptography against OpenSSL on your own machine:

```bash
npm run interop -- export            # the app signs; verify with the course's openssl commands
npm run interop -- pki-export        # the app builds the CA hierarchy; check it with openssl verify
npm run interop -- scenarios         # all ten scenarios as folders of real files
npm run interop -- verify-bundle <folder>
```

## Tests

```bash
npm run check        # type check, lint, 224 unit and integration tests, build, bundle check
npm run test:e2e     # 15 browser tests (first time: npx playwright install chromium)
```

The test suite runs the real OpenSSL program and requires the same answers as the app, including byte-identical signatures. Every browser test fails on any security-policy violation or console error.

## Project layout

```text
src/crypto/     Web Crypto wrappers: the only code allowed to touch crypto.subtle
src/pki/        Certificates, CSRs, the CA's rules, the DER reader
src/verify/     The seven-check verifier and path building
src/attacks/    Labelled attacker tooling, used only to build failure scenarios
src/scenarios/  The ten scenarios
src/state/      What each button does; the lab's memory
src/ui/         The screens
security/       HTTP security headers: one source for preview and deployment
docs/adr/       Architecture decisions and their reasons
docs/stages/    How the project was built, stage by stage, with test results
```

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, use [private reporting](https://github.com/EdomiyasGitHub/mahtem/security/advisories/new), as described in [SECURITY.md](SECURITY.md).

## Licence

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
