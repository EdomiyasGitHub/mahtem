/**
 * Byte encodings used across the lab: UTF-8 text, hexadecimal, Base64 and PEM.
 * No cryptography happens here, only conversions between representations.
 */
import { CryptoInputError } from './errors.ts';

/** Raw bytes backed by a plain ArrayBuffer (what Web Crypto accepts). */
export type Bytes = Uint8Array<ArrayBuffer>;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8Encode(text: string): Bytes {
  return utf8Encoder.encode(text) as Bytes;
}

/** Decode UTF-8, rejecting invalid byte sequences rather than guessing. */
export function utf8Decode(bytes: Uint8Array): string {
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new CryptoInputError('These bytes are not valid UTF-8 text.');
  }
}

/** Copy any byte view into a fresh, independent Bytes value. */
export function toBytes(data: ArrayBuffer | Uint8Array): Bytes {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Bytes {
  const clean = hex.replace(/[\s:]/g, '');
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new CryptoInputError('Not a valid hexadecimal string.');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Split hex into fixed-size groups for display, e.g. a SHA-256 digest into
 * eight 8-character blocks, so two digests can be compared block by block.
 */
export function chunkHex(hex: string, size = 8): string[] {
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += size) groups.push(hex.slice(i, i + size));
  return groups;
}

/** Colon-separated uppercase hex, the style OpenSSL uses for fingerprints. */
export function toColonHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000; // stay well under argument-count limits
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Bytes {
  const clean = b64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
    throw new CryptoInputError('Not valid Base64.');
  }
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** PEM labels the lab reads and writes. Same headers OpenSSL produces. */
export type PemLabel = 'PUBLIC KEY' | 'PRIVATE KEY' | 'CERTIFICATE' | 'CERTIFICATE REQUEST';

/**
 * Wrap DER bytes as PEM: Base64 in 64-character lines between
 * -----BEGIN label----- / -----END label----- (RFC 7468).
 */
export function pemEncode(label: PemLabel, der: Uint8Array): string {
  const b64 = toBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

/**
 * Extract DER bytes from PEM text with exactly one block of the expected label.
 * Accepts Windows (CRLF) line endings, as written by OpenSSL on Windows.
 */
export function pemDecode(pem: string, expected: PemLabel): Bytes {
  const text = pem.replace(/\r\n?/g, '\n').trim();
  const blocks = [...text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----\n([\s\S]*?)\n?-----END ([A-Z0-9 ]+)-----/g)];

  if (blocks.length === 0) {
    throw new CryptoInputError(`No PEM block found. Expected "-----BEGIN ${expected}-----".`);
  }
  if (blocks.length > 1) {
    throw new CryptoInputError(`Expected one PEM block but found ${blocks.length}.`);
  }
  const [, begin, body, end] = blocks[0] as RegExpMatchArray;
  if (begin !== end) {
    throw new CryptoInputError(`Mismatched PEM markers: BEGIN ${begin} / END ${end}.`);
  }
  if (begin !== expected) {
    const hint =
      begin === 'RSA PRIVATE KEY' || begin === 'RSA PUBLIC KEY'
        ? ' This is the older PKCS#1 format; convert it with `openssl pkey` first.'
        : '';
    throw new CryptoInputError(`Expected a "${expected}" PEM block but found "${begin}".${hint}`);
  }
  if (/^[A-Za-z-]+:/m.test(body ?? '')) {
    throw new CryptoInputError('Encrypted or annotated PEM files are not supported.');
  }
  return fromBase64(body ?? '');
}

/**
 * Extract every PEM block with the expected label, e.g. a chain file holding
 * several certificates. Blocks with other labels cause an error, so a private
 * key hidden among certificates is never silently skipped.
 */
export function pemDecodeAll(pem: string, expected: PemLabel, maxBlocks = 16): Bytes[] {
  const text = pem.replace(/\r\n?/g, '\n');
  const blocks = [...text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----\n([\s\S]*?)\n?-----END ([A-Z0-9 ]+)-----/g)];
  if (blocks.length === 0) {
    throw new CryptoInputError(`No PEM block found. Expected "-----BEGIN ${expected}-----".`);
  }
  if (blocks.length > maxBlocks) {
    throw new CryptoInputError(`Too many PEM blocks (${blocks.length}); at most ${maxBlocks} are accepted.`);
  }
  return blocks.map((m) => {
    const [, begin, body, end] = m as RegExpMatchArray;
    if (begin !== end) throw new CryptoInputError(`Mismatched PEM markers: BEGIN ${begin} / END ${end}.`);
    if (begin !== expected) throw new CryptoInputError(`Expected only "${expected}" blocks but found "${begin}".`);
    return fromBase64(body ?? '');
  });
}
