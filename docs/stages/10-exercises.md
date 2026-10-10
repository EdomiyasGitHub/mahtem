# Stage 10 — Exercises tab and shuffled quizzes (classroom edition, part C2)

**Status:** done
**Date:** 2026-10-10

## What we built
**Quiz options are shuffled** each time a question is shown (Fisher–Yates), and keep that order while the student answers. Previously the correct answer was first in 11 of 13 questions.

**Exercises tab**, with two exercises. It stays mounted while you use other tabs, so work survives switching; "Reset lab" clears it.

### Spot the fake
- A round is six unlabelled cases: the genuine diploma plus five random attacks, in random order, built live from the lab's own hierarchy (`src/exercises/spot.ts`).
- Each case shows what a real verifier has: the diploma, every certificate supplied with it (issuer, constraints, dates, fingerprint) and the student's own trust store, plus today's date.
- **The grade is hidden.** Forged cases used "CGPA 3.92" and the genuine one "3.12", a tell students could learn without understanding. A verifier can't know what a grade should be, which is why signatures exist; the screen says so.
- Identity attacks can be deduced from the certificates. For content attacks, the student has one tool, **Run check 3**, which recomputes the signature verification for real.
- The answer is *genuine*, or *fake, caught by check N*. Feedback shows the scenario, its lesson and the verifier's path diagram; a final step shows the score and every case.

### Three messages (course §6)
- **Sender:** sign three messages with a fresh RSA-2048 key (non-extractable), change some without re-signing ("changed since signing" is shown to the sender only), then hand over on the same computer or download `three-messages.json`, plus the course's files (`public_key.pem`, `messageN.txt`, `signatureN.bin`) with the matching `openssl dgst -verify` commands.
- **Partner:** load the file, tick the messages they suspect, verify all, and see how many changes they spotted and any false alarms.
- **The file is untrusted input** (`src/exercises/three-messages.ts`): 64 KiB limit, strict format and version, 1–5 messages of at most 2,000 characters, Base64 signatures of plausible length, and a key that must be a PUBLIC key. A private key is rejected, never imported.

## Testing results
| Suite | Tests | Result |
|---|---|---|
| Shuffle: permutation, fairness over 3,000 shuffles, deterministic with injected randomness | 3 | pass |
| Exercise file: round trip, finding changed messages, no private key inside, 8 malformed or hostile files; **the course's OpenSSL command on the downloaded files finds the same changed messages** | 11 | pass |
| Spot the fake: six distinct cases including the genuine one, rounds differ, evidence shape, every possible answer scored correctly, check 3 recomputed and matching the verifier | 6 | pass |
| Earlier unit and integration tests | 224 | pass |
| Browser: full round scored 1 of 6 when answering "Genuine" to all; progress survives switching tabs; three messages via hand-over and via downloaded file; hostile file refused | 4 | pass |
| Earlier browser tests | 15 | pass |
| **Total** | **244 unit + 19 browser** | **pass** |

Test-quality check: one test was missing an `await` and could not fail. Fixed, and proven by raising the message limit, which then fails it.

Accessibility fix found by the browser tests: a heading had `role="status"`, which replaced its heading role. It is now wrapped in a status region.

Header: all six tabs visible from 768 px; one row from 1152 px; phones scroll the tab bar.
