# ADR 0006 — Verification design

**Status:** accepted · 2026-10-08

## Decisions

1. **Trust comes only from the verifier's trust store.** Bundle certificates are only ever intermediates. A self-signed root inside a bundle, even one carrying the real root's exact name, is reported as untrusted and, when the name collides with a trusted root, named an impostor. Trust anchors are identified by SHA-256 fingerprint, never by name.

2. **An issuer is accepted by signature, not by name.** Path building only accepts a candidate whose name matches *and* whose key verifies the signature. Name-only matching is the classic bug this rules out.

3. **A trace, not a boolean.** Verification returns seven checks, each `pass`, `fail` or `skipped`, with a one-sentence summary, a machine-readable failure code and details. Every check that can run does run, even after an earlier failure, so the document check (3) and the identity checks (4–7) are judged independently. The verdict is *verified* only if all seven pass.

4. **The attacker is a separate, labelled module** (`src/attacks/forge.ts`). The honest CA keeps refusing (ADR 0005); forged certificates for the scenarios come from code whose only purpose is to be caught.

5. **OpenSSL is the referee.** Every scenario is checked by `openssl verify` and `openssl dgst -verify`, and the two verdicts must agree with the app's. Each chain failure must also produce OpenSSL's counterpart error.

## The seven checks

| # | Check | Fails with |
|---|---|---|
| 1 | Parse the bundle | `bundle-malformed` |
| 2 | Hash the document (SHA-256 over exact bytes) | — |
| 3 | Check the signature with the key in the signer certificate | `document-signature-invalid`, `signer-key-unsupported` |
| 4 | Signer certificate: issuer found; keyUsage/EKU allow document signing | `chain-incomplete`, `certificate-signature-invalid`, `key-usage-not-allowed`, `extended-key-usage-mismatch`, `unsupported-critical-extension`, `weak-signature-algorithm` |
| 5 | Issuer certificates: CA:TRUE, keyCertSign, pathlen | `issuer-not-ca`, `key-usage-not-allowed`, `path-length-exceeded`, `chain-incomplete`, `certificate-signature-invalid`, `chain-too-long` |
| 6 | Chain ends at a root in the verifier's trust store | `untrusted-root` |
| 7 | Every certificate within its validity period | `expired`, `not-yet-valid` |

## App ↔ OpenSSL correspondence (measured with OpenSSL 3.0.13)

| Scenario | App | `openssl dgst -verify` | `openssl verify` |
|---|---|---|---|
| 1 Genuine | verified | Verified OK | OK |
| 2 One character changed | check 3 `document-signature-invalid` | Verification failure | OK |
| 3 Signature swapped | check 3 `document-signature-invalid` | Verification failure | OK |
| 4 Different institution's key | check 3 `document-signature-invalid` | Verification failure | OK |
| 5 Rogue university, impostor root | check 6 `untrusted-root` | **Verified OK** | error 19 self-signed certificate in certificate chain |
| 6 Ministry certificate missing | check 4 `chain-incomplete` | Verified OK | error 20 unable to get local issuer certificate |
| 7 Ministry exceeds pathlen:0 | check 5 `path-length-exceeded` | Verified OK | error 25 path length constraint exceeded |
| 8 University acts as a CA | check 5 `issuer-not-ca` | Verified OK | error 79 invalid CA certificate |
| 9 Signer certificate expired | check 7 `expired` | Verified OK | error 10 certificate has expired |
| 10 Verifier doesn't trust the root | check 6 `untrusted-root` | Verified OK | error 19 self-signed certificate in certificate chain |

Scenario 5 is the central lesson: a mathematically perfect signature (`openssl dgst` says *Verified OK*) on a worthless document.

## Scope (stated, not hidden)
Implemented: signature on every link; name chaining; basicConstraints; keyUsage; EKU for the signer; pathlen, including the anchor's (as OpenSSL does); unknown critical extensions rejected; SHA-1 rejected; validity of every certificate including the anchor (as OpenSSL does); chains up to 8 certificates.

Not implemented: revocation (CRL/OCSP); name constraints and certificate policies (a certificate marking either as critical is rejected as unsupported, which is the safe direction); RFC 4518 name preparation; trusted timestamps (scenario 9 explains why they matter). Trust-anchor extensions are not enforced except pathlen, per RFC 5280 §6.1, so a course-made root without keyUsage is accepted, as `openssl verify` accepts it.
