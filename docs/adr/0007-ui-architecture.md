# ADR 0007 — UI architecture

**Status:** accepted · 2026-10-08

## Decisions
1. **Two places, two roles.** The *lab bench* is the issuer side: it holds key pairs. The *verifier desk* is a stranger: it holds only the roots it chose to trust. The hand-off from bench to desk passes bytes and certificates only (`App.tsx`), so the desk cannot reach a private key even by mistake.
2. **Operations outside React.** Every bench button calls a plain async function in `src/state/operations.ts` that returns its result plus ledger entries. A reducer (`src/state/lab.ts`) stores results. The full issuing flow is therefore tested in Node, without a browser.
3. **The desk re-verifies on every change** (document bytes, trust store, imported bundle), debounced by 150 ms, discarding stale results.
4. **Exact bytes, honestly edited.** The desk edits the received document as text only when decoding and re-encoding reproduces the identical bytes (`editableText`). Otherwise, such as a file with a byte-order mark, it is verified read-only, so an untouched document can never appear tampered because of the editor.
5. **The ledger never claims what isn't on screen.** Entries are `real` (a cryptographic operation that ran) or `visual` (a drawing of a real result). No `visual` entries exist until Stage 5 draws the chain.
6. **No router, no UI kit.** Two views switched by state; plain CSS on the design tokens. Fewer dependencies (ADR 0003), and every element is ordinary semantic HTML: buttons, labels, lists, `<details>`.

## Accessibility
Real `<button>`, `<label>` and `<input>` elements; `aria-current` on the active tab and step; verdict announced through `role="status"`; pass/fail never by colour alone (word, icon and position); visible focus; touch targets of at least 44 px; reduced-motion respected; download buttons named in full ("Download diploma.sig").
