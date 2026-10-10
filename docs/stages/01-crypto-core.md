# Stage 1 — Crypto core

**Status:** done
**Date:** 2026-10-08

## What we built
The cryptography layer (`src/crypto/`), with no UI yet:

| Operation | Function | Course command it mirrors |
|---|---|---|
| Generate RSA key pair (2048/3072/4096, e=65537) | `generateRsaKeyPair` | `openssl genrsa -out private_key.pem 4096` |
| Export public key | `exportPublicKeyPem` | `openssl pkey -in private_key.pem -pubout -out public_key.pem` |
| Import public key | `importPublicKeyPem` | (reading `public_key.pem`) |
| Key details and fingerprint | `describePublicKey` | `openssl pkey -pubin -noout -text` |
| SHA-256 | `sha256` | `openssl dgst -sha256 message.txt` |
| Sign | `sign` | `openssl dgst -sha256 -sign private_key.pem -out signature.bin message.txt` |
| Verify | `verify` | `openssl dgst -sha256 -verify public_key.pem -signature signature.bin message.txt` |
| Avalanche comparison | `compareDigests` | (course §5: Hash A ≠ Hash B) |

Plus `npm run interop`, a command-line tool that lets anyone repeat the OpenSSL comparison with the course commands, and the upgrade to ESLint 10.

## Why we built it
Every later stage (certificates, the diploma, verification, the attack scenarios) is built on these few functions. They had to be proven correct against an independent implementation before anything is drawn on screen.

## Security principle
- **Integrity and authenticity through digital signatures** (course §1): the private key signs, the public key verifies, and any change to the message breaks verification.
- **Least privilege for keys:** private keys are non-extractable by default (ADR 0004).
- **Don't roll your own crypto:** every primitive is Web Crypto; this layer only validates inputs and converts formats.
- **Fail closed:** wrong key type, wrong algorithm, weak key size, oversized input and malformed PEM all raise a clear `CryptoInputError`; a malformed signature verifies as `false`, never as an exception that could be mishandled as success.

## Technical architecture
```text
src/crypto/
  constants.ts    algorithm, allowed key sizes, exponent, 1 MiB limit
  errors.ts       CryptoInputError (safe-to-display messages)
  encoding.ts     UTF-8, hex, Base64, PEM (RFC 7468; CRLF tolerant)
  bytes-guard.ts  size limit + ArrayBuffer normalisation
  hash.ts         sha256, compareDigests
  keys.ts         generate / export / import / describe
  signature.ts    sign / verify
  index.ts        the only import surface for the rest of the app
```
Relative imports carry `.ts` extensions so Node can run this same code directly (`scripts/interop.ts`) without a build.

## Files created / modified
Created: everything in `src/crypto/` above except `environment.ts`; `tests/crypto/{encoding,hash,signature,openssl-interop}.test.ts`; `tests/helpers/openssl.ts`; `scripts/interop.ts`; `docs/adr/0004-…`; this file.
Modified: `package.json` (ESLint 10, `interop` script), `eslint.config.js`, `tsconfig.json` (include `scripts`), `.gitignore` (`interop/`), `README.md`, `docs/adr/0003-…`.

## Dependencies
No new runtime dependencies. Dev: `eslint` 9.39.5 → 10.11.0, `@eslint/js` 9.39.5 → 10.0.1.

## Setup instructions
```bash
npm ci
npm run check
```
For the OpenSSL interop tests on Windows, `openssl` must be on PATH or named explicitly:
```powershell
$env:OPENSSL_BIN = "C:\Program Files\Git\usr\bin\openssl.exe"
npm test
```

## Testing instructions and results
| Suite | Tests | Result |
|---|---|---|
| Encoding (hex, Base64, UTF-8 incl. Amharic, PEM incl. CRLF and malformed input) | 17 | pass |
| SHA-256: 3 NIST vectors, Node/OpenSSL cross-check, size limits, avalanche | 11 | pass |
| Keys and signatures: sizes, non-extractable default, determinism, tampering, wrong key, bit flips, misuse | 20 | pass |
| OpenSSL interop (OpenSSL 3.0.13), both directions | 7 | pass |
| Stage 0 suites (environment, headers, guardrails) | 21 | pass |
| **Total** | **76** | **pass** |

Sabotage check: changing the signature hash to SHA-384 → 4 interop tests fail.
Manual run of `npm run interop`: OpenSSL printed `Verified OK` / `Verification failure` for the exported files; the three-message exercise reported messages 1 and 3 modified, 2 intact.

## Expected output
`npm run check` ends with `Tests 76 passed (76)` and `verify-dist OK`. If OpenSSL is not found locally, the 7 interop tests show as skipped (in CI they are mandatory and fail the build instead).

## Known limitations
- No UI for these operations yet (Stage 4). The web app still shows only the instrument check.
- RSA-4096 key generation blocks the calling thread for roughly half a second to a few seconds; a Web Worker may be needed in Stage 4.
- Only PKCS#8 / SPKI PEM is read. Legacy `BEGIN RSA PUBLIC KEY` files are rejected with a conversion hint.
- `compareDigests` is for display only and is not constant-time.

## Security considerations
- The interop script reads `public_key.pem`, messages and signatures only; it never opens `private_key.pem`.
- `interop/` and `*.pem` are git-ignored so test keys are never committed.
- OpenSSL is invoked with argument arrays, never through a shell.

## Future improvements
- Signature X-ray (decode the PKCS#1 v1.5 block with the public key) — Should Have.
- RSA-PSS option — Could Have.
