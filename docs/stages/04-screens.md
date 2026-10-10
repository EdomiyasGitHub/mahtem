# Stage 4 — Lab bench and verifier desk

**Status:** done
**Date:** 2026-10-08

## What we built
**Lab bench** (issuer side), in course order. Each step is a real operation with its result read back from the real key, CSR or certificate, a "What happened?" explanation, and the matching OpenSSL command:
1. Create the trust anchor: Root CA, RSA-4096, self-signed (course §10–12)
2. Delegate to the Ministry: key and CSR, then the Root signs (course §13–19)
3. Certify the University: key and CSR, then the Ministry signs (extension, course §25)
4. Sign the diploma: validated form, SHA-256, RSA signature (course §4, §21)

plus an **operation ledger** of every real operation with its duration.

**Verifier desk** (a stranger):
- the received diploma, rendered, with changed fields highlighted;
- the seven-check trace from Stage 3, re-run on every change;
- **edit the received bytes** in place, and restore them;
- **the trust store**: trust or un-trust each root;
- **check 3 up close**: the digest of the bytes held vs the digest that was signed;
- **load bundle files**, including the Stage 3 scenario folders, and **download** the current bundle for OpenSSL.

## Why we built it
This is where the cryptography becomes something an instructor can watch and poke at, without losing the property that every value shown was computed.

## Security principles in the UI
- **Separation of roles:** the verifier desk receives certificates and bytes only (ADR 0007).
- **Untrusted input:** imported files are size-checked before reading, parsed defensively, and every certificate-derived string is rendered as text (lint-enforced).
- **No network:** downloads use local `blob:` links; the CSP still forbids every connection.
- **Honest visualization:** nothing is labelled as drawn unless it is on screen.

## Files created / modified
Created: `src/state/{operations.ts,lab.ts,LabProvider.tsx}`; `src/ui/common/{Disclosure,Command,Provenance,HexBlocks,CertificateFacts}.tsx`, `format.ts`, `download.ts`, `common.css`; `src/ui/bench/{BenchView,StageRow,DiplomaForm,Ledger}.tsx`, `bench.css`; `src/ui/verify/{VerifyView,VerdictBanner,TraceList,DocumentPanel,TrustStorePanel,BundleFiles}.tsx`, `bundle-import.ts`, `editable.ts`, `types.ts`, `verify.css`; `tests/state/lab.test.ts`; `tests/ui/verify-logic.test.ts`; `docs/adr/0007-…`; this file.
Modified: `src/App.tsx`, `src/ui/shell/{Header.tsx,shell.css}`, `eslint.config.js` (non-null assertions allowed in tests only).

## Dependencies
None added.

## Testing instructions and results
| Suite | Tests | Result |
|---|---|---|
| Issuing flow in Node: every stage, hand-off to the verifier, ledger, reset | 3 | pass |
| UI logic: bundle import (complete, case, partial, missing, oversized, garbage, smuggled key, real scenario folder), diploma validation, editable-text safety | 17 | pass |
| Earlier stages | 152 | pass |
| **Total** | **172** | **pass** |

**End-to-end in Chromium 141 under the production CSP** (`npm run build && npm run preview`, driven with Playwright in the build environment):
| Step | Result |
|---|---|
| Full issuing flow with real RSA-4096/4096/3072 keys | 2.8–5.7 s |
| CGPA 4.5 | rejected: "CGPA must look like 3.12 and be at most 4.00." |
| Hand-off | **Verified**, 7/7 pass |
| Raw edit 3.12 → 3.92 | fails check 3 only; "Cumulative GPA" highlighted; 8 of 8 digest blocks differ |
| Restore | Verified |
| Un-trust the root | fails check 5: the Ministry's issuer is no longer available (OpenSSL's error 20) |
| Download diploma.sig | 384 bytes |
| Import Stage 3 folder 05-rogue-root | fails check 6, impostor named |
| Import diploma.json alone | "Missing diploma.sig, signer-cert.pem. …" |
| CSP violations / console errors | **0 / 0** |
| 390 px phone width | no horizontal overflow |

## Known limitations
- The chain diagram and full certificate inspector are Stage 5; the guided attack bench is Stage 6.
- The end-to-end run is not yet in CI (Playwright browsers can't be downloaded in the build environment); it is listed for Stage 7.
- "Un-trust the root" fails at check 5 rather than 6, because the lab bundle (like most real ones) doesn't carry the root. This is correct and matches OpenSSL, but is worth explaining when demonstrating.

## Future improvements
Chain diagram with trust edges (and the ledger's first `visual` entries); certificate inspector with ASN.1 view; scenario bench; Signature X-ray.
