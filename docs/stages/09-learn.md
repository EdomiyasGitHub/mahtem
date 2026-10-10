# Stage 9 — Learn tab and projector mode (classroom edition, part C1)

**Status:** done
**Date:** 2026-10-10

## What we built
**Learn tab** (first in the navigation; the lab bench stays the opening screen):
- **Six guided lessons**, each tied to course sections: hashing; signing and verifying; certificates; CSRs and certificate authorities; chain validation and the trust store; attacks. Lesson text is plain data (`src/learn/lessons.ts`); backticks become `<code>` through a formatter that never parses HTML.
- **Two playgrounds running real cryptography** through `src/crypto`:
  - *Hash*: live SHA-256 of any text, compared with a kept reference: bits and blocks that flipped.
  - *Sign*: generate an RSA-2048 key pair (non-extractable), sign, then edit the message or verify with somebody else's public key.
- **Tasks in the lab** for lessons 3–6, with a button that opens the right screen. Lessons 3–5 detect completion from the lab's own state (root created, Ministry certified, diploma signed); lesson 6 has an "I've done this" button.
- **Quizzes:** 2–3 questions per lesson, each option with its own explanation of why it is right or wrong.
- **Progress:** "Started" / "Done" per lesson and an overall count. Kept in memory with the open lesson, so leaving to try something in the lab and returning keeps your place.
- **Glossary** of 24 terms.

**Projector mode:** a header toggle that scales the whole interface by 125%; every size is rem-based, so one setting does it.

**Header layout:** one row from 1024 px with every tab visible (the caption and custody note give way first); between phone width and 1024 px the tabs take their own row; on phones they scroll sideways.

**Dependabot:** `@types/node` major updates are ignored, keeping Node's type definitions in step with the Node version we run (22).

## Security
- The formatter is tested against HTML and script injection, including inside code spans.
- Playgrounds use the crypto layer only; their keys are non-extractable and live in memory.
- No new dependencies; no storage (progress is in memory, like the lab).

## Testing results
| Suite | Tests | Result |
|---|---|---|
| Lesson content (numbering, course ties, exactly one correct answer per question, explanations, balanced backticks, alphabetical glossary), safe formatting, progress logic | 9 | pass |
| Earlier unit and integration tests | 215 | pass |
| Browser: hash playground and avalanche, signing playground (edit and wrong key), lesson task detection and keeping your place, glossary and projector mode | 4 | pass |
| Earlier browser tests | 11 | pass |
| **Total** | **224 unit + 15 browser** | **pass** |

Header measured at 390, 600, 768, 900, 1024 and 1440 px: no page overflow; all tabs visible from 600 px.
