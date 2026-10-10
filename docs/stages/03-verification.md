# Stage 3 — Chain validation and attack scenarios

**Status:** done
**Date:** 2026-10-08

## What we built
| Module | Purpose |
|---|---|
| `src/verify/bundle.ts` | `SignedBundle` (untrusted: document, signature, signer, intermediates) and `TrustStore` (the verifier's roots); file import/export |
| `src/verify/path.ts` | Path building and per-certificate rules (ADR 0006) |
| `src/verify/document.ts` | `verifySignedBundle` / `verifyBundleFiles`: the seven-check trace; `validateCertificate` (like `openssl verify`) |
| `src/attacks/forge.ts` | Labelled attacker tooling: signs certificates with no policy |
| `src/scenarios/scenarios.ts` | 10 scenarios, each with story, lesson, course provenance and expected verdicts |
| `src/documents/diploma.ts` | Minimal diploma format (UTF-8 JSON; exact bytes are signed) |
| `src/crypto/encoding.ts` | `pemDecodeAll` for multi-certificate files |
| `scripts/interop.ts` | `scenarios` (export as folders of real files) and `verify-bundle` (print the trace) |

## Why we built it
This is the security core of the project: the verifier is what turns a signature into trust, and the scenarios are what make the lesson visible. Course §28: "A verifier starts with a trusted Root CA and validates the signatures and constraints down the chain."

## Security principles
- **Trust is a verifier decision** (course §10, §28): anchors come only from the trust store.
- **Integrity ≠ authenticity** (course §26): check 3 (content) and checks 4–7 (identity) are judged separately.
- **Delegation has limits** (course §16): pathlen and CA:FALSE are enforced on the whole path.
- **Fail closed:** unknown critical extensions, SHA-1, overlong chains and malformed bundles are rejected.
- **Assume an active attacker:** the attacker module produces correctly encoded, correctly signed certificates that lie about trust.

## Testing instructions and results
| Suite | Tests | Result |
|---|---|---|
| Scenarios: verdict, failing check, code, independence of checks 3 and 4–7 | 17 | pass |
| App ↔ OpenSSL agreement on all 10 scenarios, including OpenSSL's error number | 10 | pass |
| Validator edge cases (malformed and hostile bundles, time, signer restrictions, forged links, chain length, course-made and SHA-1 certificates) | 13 | pass |
| Earlier stages | 112 | pass |
| **Total** | **152** | **pass** |

**Sabotage checks** (each is a classic real-world verifier bug):
| Injected bug | Tests failing |
|---|---|
| Trust a self-signed root found in the bundle | 6 |
| Ignore pathlen | 3 |
| Accept an issuer by name without checking its signature | 4 |

**Manual walkthrough:** `npm run interop -- scenarios` then `verify-bundle` on each folder; hand-editing `01-valid/diploma.json` (CGPA 3.12 → 3.13) turns the verdict into a check 3 failure, and `openssl dgst -verify` independently prints `Verification failure`.

## Known limitations
See ADR 0006 "Scope": no revocation, name constraints, policies or timestamps.
Attacker and "other institution" keys in scenarios are RSA-2048 to keep scenario generation fast; the real hierarchy keeps 4096/4096/3072.

## Security considerations
- `bundleFromFiles` caps document size (1 MiB), signature size (1–1024 bytes), PEM size (64 KiB) and chain length (8), and rejects any non-certificate block in `chain.pem`, so a private key can't hide among certificates.
- Messages include certificate names (attacker-controlled text). The CLI prints them as plain text, and the UI (Stage 4) renders them as text nodes only, enforced by lint.

## Future improvements
Revocation via CRL (the course mentions `cRLSign` and `crl/` folders); RFC 3161 timestamps; RSA-PSS.
