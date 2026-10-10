# ADR 0005 — X.509 library and certificate-authority policy

**Status:** accepted · 2026-10-08

## Library: `@peculiar/x509` 2.1.0
Web Crypto has no X.509 support, so certificates and CSRs need a library.

| Option | Verdict |
|---|---|
| `@peculiar/x509` | **Chosen.** TypeScript, MIT, maintained; builds and parses X.509/PKCS#10 and performs all signing and verification through Web Crypto, so no cryptographic primitives are reimplemented. Explicit extension classes (BasicConstraints with pathLength, KeyUsage flags, SKI/AKI) map one-to-one onto the course's `intermediate-ext.cnf`. |
| `pkijs` | Capable and from the same ecosystem, but a lower-level API: more code to write and review for the same result. |
| `node-forge` | Pure-JavaScript cryptography (its own RSA), slower, and against ADR 0003's "cryptography only from Web Crypto". |

It requires the Reflect metadata API (through `tsyringe`), so `reflect-metadata` 0.2.2 is added. Both are imported in **one file only**, `src/pki/x509.ts`, which loads the polyfill first; a lint rule forbids importing either anywhere else. The polyfill's `Function("return this")` fallback runs only when `globalThis` is missing, which no supported browser lacks. The browser check (`npm run smoke`) confirms zero CSP violations.

Bundle cost: about 220 KB minified / 55 KB gzipped for the PKI layer.

## CA policy: refuse, as real CA software does
`openssl x509 -req` signs whatever it is given and leaves all judgement to verification time. The lab's `issueCertificate` instead **refuses** to issue when:

| Refusal code | Rule |
|---|---|
| `csr-signature-invalid` | The CSR's own signature must verify (proof of possession, course §15) |
| `issuer-key-mismatch` | The signing key must match the issuer's certificate |
| `issuer-not-ca` | The issuer must have `basicConstraints CA:TRUE` |
| `issuer-cannot-sign-certificates` | If the issuer has keyUsage, it must include `keyCertSign` (RFC 5280 §4.2.1.3) |
| `path-length-exceeded` | An issuer with `pathlen:0` may not create another CA (course §16) |
| `issuer-not-currently-valid` | The issuer must be within its validity period |
| `validity-exceeds-issuer` | A certificate may not outlive its issuer |
| `invalid-validity` | Validity must be 1–7300 whole days |

The attack scenarios in Stage 3 need certificates that break these rules, so that the *verifier* can be shown catching them. Those will be produced by a separate, clearly labelled "attacker" module, not by weakening this one.

## Other decisions
- **CSR extensions are ignored**, as `openssl x509 -req` does by default. Extensions come only from the CA's profile, so a requester cannot ask to become a CA (tested).
- **Profiles:** `intermediate-ca` is exactly the course's `intermediate-ext.cnf`. `root-ca` states explicitly what the course's root got from `openssl.cnf` defaults, plus keyUsage. `document-signer` (CA:FALSE; digitalSignature, nonRepudiation; EKU documentSigning, RFC 9336) is an **extension** of the course.
- **Serial numbers:** 128-bit random, positive.
- **Name chaining:** Issuer and Subject are compared attribute by attribute (type and value, in order), not as display strings and not by raw encoding, in the spirit of RFC 5280 §7.1.
- **Lab identities** are simulated or fictional and labelled so (`OU=National Trust (simulated)`, `OU=Ministry of Education (simulated)`, fictional "Abay Valley University").

## Finding worth presenting
A root created with the course's exact command (`openssl req -x509 -new …`, no `-extfile`) on Ubuntu's OpenSSL 3.0.13 has `CA:TRUE` but **no keyUsage extension**. RFC 5280 requires keyUsage on CA certificates used to verify other certificates, yet `openssl verify` accepts the chain. The result depends on each machine's `openssl.cnf`, which is why the lab states root extensions explicitly. `npm run interop -- pki-inspect` shows what any given root contains.
