import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportPublicKeyPem, generateRsaKeyPair, sign, toBase64, utf8Encode } from '../../src/crypto/index.ts';
import { ExerciseError, decodeExercise, encodeExercise, opensslFiles, verifyExercise, type ExerciseItem } from '../../src/exercises/three-messages.ts';
import { openssl, opensslAvailable, withTempDir } from '../helpers/openssl.ts';

let keys: CryptoKeyPair;
let signed: ExerciseItem[];
const originals = ['Meet at 9.', 'Budget: 4,000 birr.', 'Exam is on Friday.'];

beforeAll(async () => {
  keys = await generateRsaKeyPair({ modulusLength: 2048 });
  signed = await Promise.all(originals.map(async (m) => ({ message: m, signature: await sign(keys.privateKey, utf8Encode(m)) })));
});

/** The sender modifies messages 1 and 3 after signing, as in course §6. */
const sent = () => signed.map((s, i) => (i === 0 ? { ...s, message: 'Meet at 10.' } : i === 2 ? { ...s, message: 'Exam is on Monday.' } : s));

describe('the exercise file', () => {
  it('round-trips, and the partner finds exactly the modified messages', async () => {
    const loaded = await decodeExercise(await encodeExercise(keys.publicKey, sent()));
    expect(loaded.items.map((i) => i.message)).toEqual(['Meet at 10.', 'Budget: 4,000 birr.', 'Exam is on Monday.']);
    expect(await verifyExercise(loaded.publicKey, loaded.items)).toEqual([false, true, false]);
  });

  it('never contains the private key', async () => {
    const text = await encodeExercise(keys.publicKey, sent());
    expect(text).toMatch(/BEGIN PUBLIC KEY/);
    expect(text).not.toMatch(/PRIVATE/);
  });
});

describe('rejecting bad files', () => {
  const good = async () => JSON.parse(await encodeExercise(keys.publicKey, signed)) as Record<string, unknown>;
  const reject = async (text: string, msg: RegExp) => {
    await expect(decodeExercise(text)).rejects.toThrow(ExerciseError);
    await expect(decodeExercise(text)).rejects.toThrow(msg);
  };

  it('not JSON', () => reject('hello', /not valid JSON/));
  it('a different kind of file', async () => reject(JSON.stringify({ ...(await good()), format: 'other' }), /not a three-message exercise/));
  it('a different version', async () => reject(JSON.stringify({ ...(await good()), version: 2 }), /different version/));
  it('too many messages', async () => {
    const g = await good();
    await reject(JSON.stringify({ ...g, items: Array(6).fill((g.items as unknown[])[0]) }), /between 1 and 5/);
  });
  it('an over-long message', async () => {
    const g = await good();
    await reject(JSON.stringify({ ...g, items: [{ message: 'x'.repeat(2001), signature: toBase64(new Uint8Array(256)) }] }), /longer than 2000/);
  });
  it('a signature that is not Base64', async () => {
    const g = await good();
    await reject(JSON.stringify({ ...g, items: [{ message: 'hi', signature: '!!!' }] }), /not valid Base64/);
  });
  it('a private key where the public key should be', async () => {
    const extractable = await generateRsaKeyPair({ modulusLength: 2048, extractable: true });
    const { exportPrivateKeyPem } = await import('../../src/crypto/index.ts');
    await reject(JSON.stringify({ ...(await good()), publicKey: await exportPrivateKeyPem(extractable.privateKey) }), /Public key: Expected a "PUBLIC KEY"/);
  });
  it('an oversized file', () => reject('x'.repeat(70_000), /too large/));
});

describe.skipIf(!opensslAvailable)('the downloaded files work with the course’s OpenSSL commands (§6)', () => {
  it('openssl dgst -verify finds the same modified messages', async () => {
    const files = opensslFiles(await exportPublicKeyPem(keys.publicKey), sent());
    await withTempDir((dir) => {
      for (const f of files) writeFileSync(join(dir, f.name), f.content);
      const results = [1, 2, 3].map(
        (n) => openssl(['dgst', '-sha256', '-verify', 'public_key.pem', '-signature', `signature${n}.bin`, `message${n}.txt`], { cwd: dir }).stdout.trim(),
      );
      expect(results).toEqual(['Verification failure', 'Verified OK', 'Verification failure']);
    });
  });
});
