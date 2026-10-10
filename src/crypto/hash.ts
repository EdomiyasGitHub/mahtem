/**
 * SHA-256 hashing (course §2, §5: "Message → SHA-256 → Message Digest").
 */
import { guardMessage } from './bytes-guard.ts';
import { SHA256_BYTES } from './constants.ts';
import { chunkHex, toBytes, toHex, type Bytes } from './encoding.ts';
import { CryptoInputError } from './errors.ts';

/** SHA-256 digest of the exact bytes given (32 bytes). */
export async function sha256(data: Uint8Array): Promise<Bytes> {
  const input = guardMessage(data);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return toBytes(digest);
}

export interface DigestBlock {
  readonly left: string;
  readonly right: string;
  readonly same: boolean;
}

export interface DigestComparison {
  /** True only when every byte matches. */
  readonly equal: boolean;
  /** Number of the 256 bits that differ (≈128 expected for unrelated inputs). */
  readonly differingBits: number;
  readonly totalBits: number;
  /** Eight 8-hex-character blocks side by side, for display. */
  readonly blocks: readonly DigestBlock[];
}

/**
 * Compare two SHA-256 digests bit by bit and block by block.
 * Used to show the avalanche effect: change one character of the input and
 * about half of the output bits flip.
 *
 * This is for display. It is not a constant-time comparison and must never be
 * used to check secrets; signature verification is done by Web Crypto.
 */
export function compareDigests(a: Uint8Array, b: Uint8Array): DigestComparison {
  if (a.length !== SHA256_BYTES || b.length !== SHA256_BYTES) {
    throw new CryptoInputError('Both values must be 32-byte SHA-256 digests.');
  }
  let differingBits = 0;
  for (let i = 0; i < SHA256_BYTES; i++) {
    let x = (a[i] ?? 0) ^ (b[i] ?? 0);
    while (x) {
      differingBits += x & 1;
      x >>= 1;
    }
  }
  const leftBlocks = chunkHex(toHex(a));
  const rightBlocks = chunkHex(toHex(b));
  const blocks = leftBlocks.map((left, i) => {
    const right = rightBlocks[i] ?? '';
    return { left, right, same: left === right };
  });
  return { equal: differingBits === 0, differingBits, totalBits: SHA256_BYTES * 8, blocks };
}
