import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoInputError, MAX_MESSAGE_BYTES, compareDigests, sha256, toHex, utf8Encode } from '../../src/crypto/index.ts';

// Published test vectors (FIPS 180-2 Appendix B / NIST CAVP).
const vectors: Array<[string, string]> = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  ],
];

describe('sha256', () => {
  it.each(vectors)('matches the published vector for %j', async (input, expected) => {
    expect(toHex(await sha256(utf8Encode(input)))).toBe(expected);
  });

  it('agrees with Node’s OpenSSL-backed implementation on Amharic text', async () => {
    const text = 'ዓባይ ሸለቆ ዩኒቨርሲቲ — CGPA 3.12';
    const ours = toHex(await sha256(utf8Encode(text)));
    const reference = createHash('sha256').update(text, 'utf8').digest('hex');
    expect(ours).toBe(reference);
  });

  it('always produces 32 bytes, whatever the input size', async () => {
    expect((await sha256(new Uint8Array(0))).length).toBe(32);
    expect((await sha256(new Uint8Array(500_000))).length).toBe(32);
  });

  it('refuses input above the 1 MiB limit', async () => {
    await expect(sha256(new Uint8Array(MAX_MESSAGE_BYTES + 1))).rejects.toThrow(CryptoInputError);
  });

  it('accepts exactly 1 MiB', async () => {
    await expect(sha256(new Uint8Array(MAX_MESSAGE_BYTES))).resolves.toHaveLength(32);
  });
});

describe('compareDigests (avalanche effect)', () => {
  it('reports identical digests as equal', async () => {
    const d = await sha256(utf8Encode('CGPA 3.12'));
    const c = compareDigests(d, d);
    expect(c.equal).toBe(true);
    expect(c.differingBits).toBe(0);
    expect(c.blocks.every((b) => b.same)).toBe(true);
  });

  it('shows that changing one character flips about half the bits', async () => {
    const a = await sha256(utf8Encode('CGPA 3.12'));
    const b = await sha256(utf8Encode('CGPA 3.92'));
    const c = compareDigests(a, b);
    expect(c.equal).toBe(false);
    // Expected ≈128 of 256; this pair is fixed, so the range is deterministic.
    expect(c.differingBits).toBeGreaterThan(90);
    expect(c.differingBits).toBeLessThan(166);
    expect(c.blocks).toHaveLength(8);
  });

  it('counts bits exactly', () => {
    const a = new Uint8Array(32);
    const b = new Uint8Array(32);
    b[0] = 0b1011_0000;
    b[31] = 0b0000_0001;
    expect(compareDigests(a, b).differingBits).toBe(4);
  });

  it('rejects values that are not 32-byte digests', () => {
    expect(() => compareDigests(new Uint8Array(31), new Uint8Array(32))).toThrow(CryptoInputError);
  });
});
