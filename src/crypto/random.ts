import type { Bytes } from './encoding.ts';
import { CryptoInputError } from './errors.ts';

/** Cryptographically secure random bytes (Web Crypto CSPRNG). */
export function randomBytes(length: number): Bytes {
  if (!Number.isInteger(length) || length < 1 || length > 65536) {
    throw new CryptoInputError('randomBytes: length must be an integer from 1 to 65536.');
  }
  return crypto.getRandomValues(new Uint8Array(length));
}
