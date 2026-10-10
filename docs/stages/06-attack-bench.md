# Stage 6 — Attack bench

**Status:** done
**Date:** 2026-10-09

## What we built
**Attack bench** (new tab). The ten Stage 3 scenarios become a guided part of the app, built live against the lab's own Root, Ministry and University:
- **Set up the whole lab:** one click runs the bench's first three stages, with the same operations in the same order (`buildWholeLab`), so a demonstration can start immediately. The step-by-step bench is unchanged.
- **Run one, or Run all ten.** Each row then shows its outcome ("Caught at check 6") and whether it matched the expected verdict; a tally reports, for example, "10 of 10 runs matched the expected verdict".
- **The result panel** shows the story, verdict, expected-versus-actual line and lesson, then:
  - **the path the verifier found**, drawn top-down: where trust came from (or where the chain broke), each certificate, and the document. Certificates that broke a rule are outlined in red with their reasons; a broken chain names the missing issuer; an impostor root is called out as one;
  - **what OpenSSL says** about the same files, from a table that the test suite checks against the real OpenSSL CLI. It is labelled as such, because a browser cannot run OpenSSL;
  - the seven checks, the OpenSSL commands, and **Open on the verifier desk**, which loads the attack's exact files and trust store there for further experiments and downloads.
- Results survive switching tabs and are cleared by "Reset lab".

**Verifier extension:** `DocumentVerification.pathStatus` reports how path building ended (anchored, untrusted root, missing issuer, signature mismatch, too long), the missing issuer's name, and **per-certificate findings**, computed with the same rule functions as checks 4, 5 and 7.

**Single source of truth:** `src/scenarios/openssl.ts` holds what OpenSSL says for each scenario. The UI displays it, and the agreement test asserts every row with the real CLI, so the screen cannot claim something OpenSSL doesn't say.

## Finding worth presenting
The "University acts as a CA" attack breaks **two** rules, and the bench shows both: the University is CA:FALSE without keyCertSign, **and** the Ministry's pathlen:0 is exceeded, because RFC 5280 counts every intermediate certificate below it, including a University forced into an issuing role. The first-failing check (5, `issuer-not-ca`) is unchanged.

## Security principles
- **Assume an active attacker:** every scenario is a correctly encoded, correctly signed forgery; only trust distinguishes it.
- **Honest claims:** OpenSSL results are shown from a test-verified table, never presented as computed in the browser.
- **Attribution:** findings name the certificate that broke each rule, from the verifier's own logic, not from parsing messages.

## Files
Created: `src/state/attacks.ts`, `src/scenarios/openssl.ts`, `src/ui/attacks/{AttackBench,PathDiagram}.tsx`, `attacks.css`, `tests/state/attacks.test.ts`, this file.
Modified: `src/verify/{document,path,index}.ts` (pathStatus; precise pathlen wording), `src/state/{lab,operations}.ts` (whole-lab), `src/scenarios/index.ts`, `src/ui/bench/BenchView.tsx`, `src/ui/shell/Header.tsx`, `src/App.tsx`, `tests/verify/openssl-agreement.test.ts` (now asserts the shared table, including the exact `openssl dgst` output).
No new dependencies.

## Testing results
| Suite | Tests | Result |
|---|---|---|
| Whole-lab shortcut; runner prerequisites; all 10 scenarios against the lab's own hierarchy; per-certificate findings (genuine, pathlen, University as CA, expired, missing intermediate, rogue root, content attacks) | 19 | pass |
| Earlier stages (agreement test now checks the shared OpenSSL table) | 196 | pass |
| **Total** | **215** | **pass** |

**End-to-end in Chromium 141 under the production CSP:** setup panel; whole lab in 2.4 s; Run all ten in 1.1 s, **10 of 10 matched**, every row's outcome as expected; rogue root (untrusted end, impostor named, 3 certificates, document link valid); University as CA (University and Ministry both marked); missing intermediate (missing issuer named); tampering (chain anchored, document link red); Open on the verifier desk (check 6, scenario label); results kept after returning; reset clears them; 0 CSP violations; 0 console errors; no overflow at 390 px.

## Known limitations
- Attacker and other-institution keys are RSA-2048 so that all ten scenarios build in about a second.
- The Signature X-ray is deferred to Stage 7 or later.
