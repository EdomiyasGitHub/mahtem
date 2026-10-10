# ADR 0004 — Signature scheme and key custody

**Status:** accepted · 2026-10-08

## Decision
1. **Scheme: RSASSA-PKCS1-v1_5 with SHA-256.** This is what `openssl dgst -sha256 -sign` produces for RSA keys, so the lab's signatures interoperate with the course commands in both directions. PKCS#1 v1.5 *signatures* are not broken (the well-known attacks are against v1.5 *encryption*) and remain widely deployed, including in X.509 (`sha256WithRSAEncryption`). For new production designs RSA-PSS or ECDSA/Ed25519 are preferred; a PSS option is listed under Could Have.
2. **Key sizes:** 2048, 3072 or 4096 bits only. 1024-bit keys are refused on generation and on import. Exponent 65537.
3. **Private keys are non-extractable by default.** Web Crypto will sign with them but will not reveal their bytes, even to the lab's own code. A key must be created with `extractable: true` for the explicit "export for OpenSSL" lab feature. The interop export command does not need it: OpenSSL verification uses only the public key.
4. **The lab never imports private keys.** It reads public keys, messages and signatures only. Pasting a real private key into a web page is precisely the habit this project should not teach.
5. **Signatures are over exact bytes**, as with `openssl dgst`. No canonicalisation; a one-byte change, including a line ending, is a different message.

## Evidence
`tests/crypto/openssl-interop.test.ts` runs the real OpenSSL CLI:
- app-made signatures → `Verified OK`; tampered → `Verification failure`
- OpenSSL-made signatures (course §3–4 commands) → app verifies; tampered → rejected
- the course §6 three-message exercise
- **byte-identical signatures** from app and OpenSSL for the same key and message
- identical key size, exponent and SHA-256 key fingerprint
Sabotage check: switching the lab's hash to SHA-384 makes 4 of these tests fail.

## Limits
Non-extractable does not mean unusable by an attacker: script running in the page could still ask the browser to sign with the key. That threat is handled by the CSP and lint guardrails (ADR 0002), not by extractability.
