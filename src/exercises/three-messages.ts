/**
 * The course's three-message exercise (§6), as a file a sender gives a partner.
 *
 * The sender signs messages, may modify some afterwards, and shares the public
 * key, the messages and the original signatures. The partner verifies each one.
 * The file is untrusted input: it is size-limited and validated strictly, and
 * its key must be a PUBLIC key (a private key is rejected, never imported).
 */
import { CryptoInputError, exportPublicKeyPem, fromBase64, importPublicKeyPem, toBase64, utf8Encode, verify } from '../crypto/index.ts';

export const EXERCISE_FORMAT = 'mahtem-three-messages';
export const EXERCISE_VERSION = 1;
export const MAX_EXERCISE_BYTES = 64 * 1024;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_ITEMS = 5;

export interface ExerciseItem {
  readonly message: string;
  readonly signature: Uint8Array;
}

export interface LoadedExercise {
  readonly publicKey: CryptoKey;
  readonly publicKeyPem: string;
  readonly items: readonly ExerciseItem[];
}

export class ExerciseError extends Error {
  override readonly name = 'ExerciseError';
}

export async function encodeExercise(publicKey: CryptoKey, items: readonly ExerciseItem[]): Promise<string> {
  const doc = {
    format: EXERCISE_FORMAT,
    version: EXERCISE_VERSION,
    note: 'Verify each message with the public key. Some may have been changed after signing.',
    publicKey: await exportPublicKeyPem(publicKey),
    items: items.map((i) => ({ message: i.message, signature: toBase64(i.signature) })),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export async function decodeExercise(text: string): Promise<LoadedExercise> {
  if (text.length > MAX_EXERCISE_BYTES) throw new ExerciseError('This file is too large to be a three-message exercise.');
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ExerciseError('This file is not valid JSON.');
  }
  if (typeof doc !== 'object' || doc === null) throw new ExerciseError('This file is not a three-message exercise.');
  const d = doc as Record<string, unknown>;
  if (d.format !== EXERCISE_FORMAT) throw new ExerciseError('This file is not a three-message exercise.');
  if (d.version !== EXERCISE_VERSION) throw new ExerciseError('This exercise file comes from a different version of Mahtem.');
  if (typeof d.publicKey !== 'string') throw new ExerciseError('The exercise file has no public key.');
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > MAX_ITEMS) {
    throw new ExerciseError(`The exercise must contain between 1 and ${MAX_ITEMS} messages.`);
  }

  let publicKey: CryptoKey;
  try {
    publicKey = await importPublicKeyPem(d.publicKey);
  } catch (e) {
    throw new ExerciseError(e instanceof CryptoInputError ? `Public key: ${e.message}` : 'The public key could not be read.');
  }

  const items = d.items.map((raw, i): ExerciseItem => {
    const n = i + 1;
    if (typeof raw !== 'object' || raw === null) throw new ExerciseError(`Message ${n} is malformed.`);
    const r = raw as Record<string, unknown>;
    if (typeof r.message !== 'string' || r.message.length > MAX_MESSAGE_CHARS) {
      throw new ExerciseError(`Message ${n} is missing or longer than ${MAX_MESSAGE_CHARS} characters.`);
    }
    if (typeof r.signature !== 'string') throw new ExerciseError(`Message ${n} has no signature.`);
    let signature: Uint8Array;
    try {
      signature = fromBase64(r.signature);
    } catch {
      throw new ExerciseError(`Message ${n}'s signature is not valid Base64.`);
    }
    if (signature.length === 0 || signature.length > 1024) throw new ExerciseError(`Message ${n}'s signature has an impossible length.`);
    return { message: r.message, signature };
  });

  return { publicKey, publicKeyPem: d.publicKey, items };
}

/** Verify every message against its signature: true = unchanged since signing. */
export function verifyExercise(publicKey: CryptoKey, items: readonly ExerciseItem[]): Promise<boolean[]> {
  return Promise.all(items.map((i) => verify(publicKey, i.signature, utf8Encode(i.message))));
}

/** The course's files: public_key.pem, messageN.txt, signatureN.bin (for `openssl dgst -sha256 -verify`). */
export function opensslFiles(publicKeyPem: string, items: readonly ExerciseItem[]): Array<{ name: string; content: Uint8Array | string }> {
  return [
    { name: 'public_key.pem', content: publicKeyPem },
    ...items.flatMap((item, i) => [
      { name: `message${i + 1}.txt`, content: utf8Encode(item.message) },
      { name: `signature${i + 1}.bin`, content: item.signature },
    ]),
  ];
}
