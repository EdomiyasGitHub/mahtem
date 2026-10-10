# Stage 2 — PKI core

**Status:** done
**Date:** 2026-10-08

## What we built
`src/pki/`: the certificate layer, with no UI yet.

| Operation | Function | Course command it mirrors |
|---|---|---|
| Self-signed root | `createRootCertificate` | `openssl req -x509 -new -sha256 -key rootCA-key.pem -out rootCA-cert.pem -days 3650` (§11) |
| CSR | `createCsr`, `verifyCsr` | `openssl req -new -sha256 -key … -out intermediateCA.csr -subj …` (§15) |
| Issue a certificate | `issueCertificate` | `openssl x509 -req -sha256 -in … -CA … -CAkey … -CAcreateserial -days 1825 -extfile intermediate-ext.cnf` (§17) |
| Inspect | `describeCertificate`, `describeCsr` | `openssl x509 -noout -subject -issuer -dates` / `-text` (§12, §18) |
| One chain link | `checkIssuedBy` | part of `openssl verify` (§19); the full validator is Stage 3 |
| Whole lab hierarchy | `createLabHierarchy` | §10–17 in order, plus the University (§25, extension) |
| PEM in/out | `certificateFromPem`, `certificateToPem`, `csrFromPem`, `csrToPem` | `.pem` / `.csr` files |

The hierarchy:
```text
Demo National Root CA      RSA-4096  self-signed       10 y  CA:TRUE                    keyCertSign, cRLSign
  └─ Demo MoE Issuing CA   RSA-4096  CSR → Root         5 y  CA:TRUE, pathlen:0         keyCertSign, cRLSign   (= course §16)
       └─ Abay Valley Univ RSA-3072  CSR → Ministry     2 y  CA:FALSE                   digitalSignature, nonRepudiation  (extension)
```

Also: `npm run interop -- pki-export` and `pki-inspect`; `npm run smoke` (browser check page); the dependency-policy correction (ADR 0003).

## Why we built it
The diploma's trustworthiness rests entirely on this chain. It had to be correct, and accepted by OpenSSL, before verification (Stage 3) or screens (Stage 4) are built on it.

## Security principle
- **Binding identity to a key** (course §8): a certificate is the issuer's signature over "this name owns this public key".
- **Delegation of trust with limits** (§13, §16, §23): the root delegates to the ministry, and `pathlen:0` stops the ministry delegating further.
- **Proof of possession** (§15): a CSR is signed by the requester's own key.
- **Least privilege:** each key's `keyUsage` restricts what it may sign; CSRs cannot request their own extensions.
- **Fail closed:** eight explicit refusal rules (ADR 0005).

## Files created / modified
Created: `src/pki/{x509,errors,names,profiles,pem,csr,ca,inspect,hierarchy,index}.ts`, `src/crypto/random.ts`, `tests/pki/hierarchy.test.ts`, `tests/pki/openssl-pki.test.ts`, `smoke/{pki.html,pki.ts,smoke.css}`, `vite.smoke.config.ts`, `docs/adr/0005-…`, this file.
Modified: `src/crypto/index.ts` (exports `randomBytes`, `exportPublicKeyDer`), `scripts/interop.ts`, `eslint.config.js` (x509 import boundary; ignore build output), `package.json`, `package-lock.json` (regenerated with `--before`), `tsconfig.json`, `.gitignore`, `README.md`, `docs/adr/0003-…`.

## Dependencies
Runtime: `@peculiar/x509` 2.1.0 (MIT), `reflect-metadata` 0.2.2 (Apache-2.0). Whole tree re-resolved to releases before 2026-09-25, with one recorded security exception. `npm audit`: 0 vulnerabilities.

## Setup instructions
```bash
npm ci
npm run check
npm run smoke            # browser check page at http://localhost:4174/smoke/pki.html
```

## Testing instructions and results
| Suite | Tests | Result |
|---|---|---|
| PKI structure, extensions, CSR, PEM | 16 | pass |
| CA policy refusals (all 8 codes + CSR-extension injection) | 9 | pass |
| PKI ↔ OpenSSL 3.0.13 (course commands, both directions) | 11 | pass |
| Earlier stages | 76 | pass |
| **Total** | **112** | **pass** |

- **Sabotage check:** changing the ministry profile to `pathlen:1` makes 3 tests fail (profile, policy, and OpenSSL's own reading of the certificate).
- **Browser check (Chromium 141, production CSP):** full hierarchy generated in about 1.4–2 s, all links verify, zero CSP violations.
- **Manual walkthrough:** every course command from the `pki-export` printout gave the documented output. `pki-inspect` read a lab built with the exact course commands and directory layout, and refused a private-key file.

## Post-release fix (2026-10-08)
On the project owner's machine (Windows, **OpenSSL 3.2.3**) two interop tests failed while 110 passed. The certificates were correct; the tests were not. OpenSSL 3.0 prints names as `CN = Demo National Root CA` and 3.2 prints `CN=Demo National Root CA`, and three assertions had hard-coded the 3.0 spacing. They now accept both forms (`field()` helper in `tests/pki/openssl-pki.test.ts`), verified against real 3.0 output and the exact 3.2 output from the failing run, and still reject a different name.

Lesson recorded: interop tests must assert what a certificate *contains*, never how a particular OpenSSL version *formats* it. Every other OpenSSL assertion in the suite was already format-tolerant (`/verify OK/`, splitting fingerprints on `=`).

## Known limitations
- No full chain validator yet (validity, trust anchor, constraints across the path): Stage 3.
- No revocation (CRL): listed as Could Have.
- Firefox not tested in the build environment; `npm run smoke` lets the project owner check it.
- CI tests against the OpenSSL that ships with Ubuntu (3.0.x); the owner's machine provides 3.2.x coverage.
- Name comparison does not apply RFC 4518 string preparation (case folding, whitespace); exact attribute matching only.

## Security considerations
- `pki-inspect` refuses files containing `PRIVATE KEY` and never reads private keys.
- Certificate and CSR input is capped at 64 KiB and parsed in try/catch; malformed input raises `PkiError`.
- `hierarchyPublicFiles` cannot include private keys (tested).

## Future improvements
- An "attacker" module that forges policy-violating chains for the Stage 3 scenarios.
- RFC 4518 name matching; CRL issuance.
