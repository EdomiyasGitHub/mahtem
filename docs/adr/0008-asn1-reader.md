# ADR 0008 — A small DER reader for the inspector

**Status:** accepted · 2026-10-09

## Context
The inspector's ASN.1 tab shows a certificate's binary structure, as `openssl asn1parse` does. `@peculiar/x509` parses certificates but does not expose a generic element tree with offsets.

## Decision
A ~250-line DER reader in `src/pki/asn1.ts`:
- **Display only.** It never makes a security decision; validation uses `@peculiar/x509` and Web Crypto.
- **Bounded for hostile input:** maximum depth 24, maximum 4,000 elements, no indefinite lengths, every length checked against the bytes available, trailing bytes rejected, minimal OID encoding required.
- **Looks inside BIT/OCTET STRINGs** (the public key, each extension value) only when the contents parse completely as DER; otherwise shows them as hex.
- **Labels certificate parts** in RFC 5280 terms (tbsCertificate, issuer, validity, subjectPublicKeyInfo, each extension by name).

## Evidence
`tests/pki/asn1.test.ts` parses the lab's root, ministry and university certificates and the ministry CSR, then requires every element to match `openssl asn1parse` exactly: offset, depth, header length, content length, constructed flag, type, and every OID name. Sabotage check: a subtle depth bug makes all 4 comparisons fail.

## Alternatives rejected
`asn1js` (as used by pkijs) would add a dependency for a display feature; the reader here is small enough to review in full and is tested against OpenSSL.
