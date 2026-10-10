import { utf8Decode, utf8Encode } from '../../crypto/index.ts';

/**
 * The document as editable text, but only if decoding and re-encoding gives
 * back exactly the same bytes. A byte-order mark or invalid UTF-8 would
 * otherwise be silently changed by the editor, and an untouched document
 * would appear tampered. Such files are verified as received, read-only.
 */
export function editableText(bytes: Uint8Array): string | null {
  try {
    const text = utf8Decode(bytes);
    const back = utf8Encode(text);
    return back.length === bytes.length && back.every((b, i) => b === bytes[i]) ? text : null;
  } catch {
    return null;
  }
}
