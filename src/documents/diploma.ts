/**
 * The diploma document (minimal form; Stage 4 adds the full editor and view).
 *
 * A diploma is UTF-8 JSON. The signature covers the exact bytes of the file,
 * as `openssl dgst -sha256 -sign` does (ADR 0004): there is no
 * canonicalisation, so changing a single character or a line ending changes
 * the digest and breaks the signature.
 */
import { type Bytes, utf8Decode, utf8Encode } from '../crypto/index.ts';

export interface Diploma {
  readonly diplomaId: string;
  readonly institution: string;
  readonly institutionAmharic: string;
  readonly studentName: string;
  readonly studentNameAmharic: string;
  readonly degree: string;
  readonly cgpa: string;
  readonly conferred: string;
}

/** The lab's sample diploma. Fictional person and institution. */
export const SAMPLE_DIPLOMA: Diploma = {
  diplomaId: 'AVU-2026-0427',
  institution: 'Abay Valley University',
  institutionAmharic: 'ዓባይ ሸለቆ ዩኒቨርሲቲ',
  studentName: 'Hana Tesfaye',
  studentNameAmharic: 'ሃና ተስፋዬ',
  degree: 'Bachelor of Science in Computer Science',
  cgpa: '3.12',
  conferred: '2026-07-11',
};

/** Serialise with a fixed field order, 2-space indent and a final newline. */
export function encodeDiploma(d: Diploma): Bytes {
  const ordered: Diploma = {
    diplomaId: d.diplomaId,
    institution: d.institution,
    institutionAmharic: d.institutionAmharic,
    studentName: d.studentName,
    studentNameAmharic: d.studentNameAmharic,
    degree: d.degree,
    cgpa: d.cgpa,
    conferred: d.conferred,
  };
  return utf8Encode(`${JSON.stringify(ordered, null, 2)}\n`);
}

/** Best-effort decode for display. Verification never depends on this succeeding. */
export function tryDecodeDiploma(bytes: Uint8Array): Diploma | null {
  try {
    const value: unknown = JSON.parse(utf8Decode(bytes));
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    const keys: Array<keyof Diploma> = [
      'diplomaId', 'institution', 'institutionAmharic', 'studentName',
      'studentNameAmharic', 'degree', 'cgpa', 'conferred',
    ];
    if (!keys.every((k) => typeof v[k] === 'string')) return null;
    return v as unknown as Diploma;
  } catch {
    return null;
  }
}
