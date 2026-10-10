# Security

Mahtem is an **educational** PKI laboratory. It uses real cryptography, but it is not a production certificate authority and must not be used to issue real credentials.

## Design guarantees (and how they are enforced)

| Guarantee | Enforced by |
|---|---|
| Private keys never leave the browser tab | No backend (ADR 0001); CSP `connect-src 'none'`; lint bans fetch/XHR/WebSocket/sendBeacon |
| No HTML injection from untrusted certificate or document fields | Lint bans `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`; CSP blocks inline script |
| Only the crypto layer touches Web Crypto | Lint rule: `crypto.subtle` allowed only in `src/crypto/` |
| No plain-string persistence of lab state | Lint bans `localStorage` / `sessionStorage` |
| Cannot be framed (clickjacking) | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |

| A root sent inside a bundle is never trusted | Anchors only from the verifier's trust store, matched by fingerprint (ADR 0006); sabotage-tested |
| An issuer is accepted only if its key verified the signature | Path building (ADR 0006); sabotage-tested |
| The verifier side never holds a private key | The bench-to-desk hand-off passes bytes and certificates only (ADR 0007) |
| Imported files cannot exhaust memory or hide keys | Size limits before reading; non-certificate PEM blocks rejected; tested |

Each guarantee has a test that fails if the control is removed (`tests/`).

## Known limits
- A browser tab is not a hardware security module. Script running in the page could *use* a key even when it cannot export it.
- JavaScript cannot guarantee key material is erased from memory.
- The development server (`npm run dev`) does not apply the CSP.

## Reporting a vulnerability
Please report security problems **privately**, using GitHub's
[Report a vulnerability](https://github.com/EdomiyasGitHub/mahtem/security/advisories/new) form,
not as a public issue. Include the browser, the steps to reproduce, and what an attacker could achieve.
Never send private keys; the lab never needs them.

In scope: anything that lets the app make a network request, run injected script, reveal a private key,
or show *Verified* for a bundle that should fail. Out of scope: the deliberately insecure behaviour of the
attacker module, which exists only to build the lab's failure scenarios.
