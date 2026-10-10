# Stage 5 — Trust chain and certificate inspector

**Status:** done
**Date:** 2026-10-09

## What we built
**Trust chain screen** (new "Trust chain" tab), drawn from the lab bench state:
- the verifier's trust store, then Root → Ministry → University → the signed diploma;
- **each edge is verified before it is drawn** (`src/state/chain.ts`): certificate edges with `checkIssuedBy` (signature and name chaining), the diploma edge by verifying the signature with the key taken from the University's *certificate*, as a verifier would. The root's self-signature is checked and stated on the root;
- an edge waits as a dashed "Checking the signature…" line, then draws solid in about 0.7 s when verified (instant if already drawn on an earlier visit; respects reduced motion), or red if it fails;
- missing parties show as "Not created yet" with a way back to the bench; with no root, an empty state invites you to create one.

**Ledger:** each verified edge adds one `visual` entry ("Trust edge drawn"), exactly once (`drawnEdges` in the reducer). The ledger's legend now shows the "drawing of a real result" line, because such entries finally exist.

**Certificate inspector** (select any certificate):
- **Fields:** subject, issuer, serial, validity and status, key, signature algorithm, key identifiers, SHA-256 fingerprint;
- **Extensions:** each with critical marker, value, course reference, and a plain-language meaning derived from its real value (`src/pki/explain.ts`);
- **ASN.1:** the DER structure tree, labelled in RFC 5280 terms (ADR 0008);
- **PEM:** the text, download, and copy;
- an OpenSSL-equivalent command for each tab.
Selecting the diploma shows its digest, signature size and signer instead.

## Why we built it
Course §21–22 and §28: trust is a chain. Seeing each link appear only when its signature verifies makes "who vouches for whom" concrete, and the inspector lets an instructor check any claim against the real certificate.

## Security principles
- **Honest visualization:** no edge is drawn, and no `visual` entry logged, without a successful verification.
- **Verifier's perspective:** the diploma edge uses the key from the certificate, not the lab's key pair.
- **Hostile input:** the DER reader is bounded and display-only (ADR 0008).

## Files
Created: `src/pki/asn1.ts`, `src/pki/explain.ts`, `src/state/chain.ts`, `src/ui/chain/{ChainView.tsx,chain.css}`, `src/ui/inspect/{Inspector,Asn1Tree}.tsx`, `src/ui/common/ColonHex.tsx`, `tests/pki/asn1.test.ts`, `tests/state/chain.test.ts`, ADR 0008, this file.
Modified: `src/state/{lab.ts,operations.ts,LabProvider.tsx}`, `src/pki/index.ts`, `src/ui/shell/Header.tsx`, `src/App.tsx`, `src/ui/common/Command.tsx`.
No new dependencies.

## Testing results
| Suite | Tests | Result |
|---|---|---|
| ASN.1 reader: certificate shape, labels, extensions; **element-by-element agreement with `openssl asn1parse`** on 3 certificates and a CSR; 9 hostile inputs | 16 | pass |
| Chain edges (complete, partial, tampered diploma, same-name foreign root), once-only logging, reset, extension explanations | 8 | pass |
| Earlier stages | 172 | pass |
| **Total** | **196** | **pass** |

Sabotage check: a subtle depth bug in the reader → all 4 OpenSSL comparisons fail.

**End-to-end in Chromium 141 under the production CSP:** empty state; partial chain (1 edge, University missing); full chain (3 edges verified, 0 failed, root self-signature verified); inspector Fields, Extensions (arrow-key tab navigation), ASN.1 (81 elements), PEM download (2,057 bytes); University and diploma inspectors; **exactly 3 visual ledger entries after leaving and revisiting**; 0 CSP violations; 0 console errors; no overflow at 390 px.

**Visual review fixes:** capitalised edge text; clearer document-edge wording; colon-hex values wrap only between bytes.

## Known limitations
- The chain shows the lab's own hierarchy; showing the certification path found by the verifier desk (including attack scenarios) is Stage 6.
- The ASN.1 tree previews long values (first 20 bytes); the PEM tab gives the full bytes.
