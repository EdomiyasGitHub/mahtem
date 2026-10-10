/**
 * Interoperability with the real OpenSSL CLI, using the course's own commands.
 * This is the evidence that the lab's signatures are genuine RSA/SHA-256
 * signatures and not a simulation.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describePublicKey,
  exportPrivateKeyPem,
  exportPublicKeyPem,
  generateRsaKeyPair,
  importPublicKeyPem,
  sign,
  toColonHex,
  utf8Encode,
  verify,
} from '../../src/crypto/index.ts';
import { openssl, opensslAvailable, opensslVersion, withTempDir } from '../helpers/openssl.ts';

const diploma = 'Abay Valley University certifies that Hana Tesfaye (ሃና ተስፋዬ) was awarded a BSc in Computer Science. CGPA 3.12\n';

describe.skipIf(!opensslAvailable)(`OpenSSL interop (${opensslVersion})`, () => {
  it('app signs → `openssl dgst -sha256 -verify` says "Verified OK"', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 3072 });
    const sig = await sign(keys.privateKey, utf8Encode(diploma));
    const pub = await exportPublicKeyPem(keys.publicKey);

    await withTempDir(async (dir) => {
      writeFileSync(join(dir, 'message.txt'), diploma, 'utf8');
      writeFileSync(join(dir, 'signature.bin'), sig);
      writeFileSync(join(dir, 'public_key.pem'), pub);
      const r = openssl(['dgst', '-sha256', '-verify', 'public_key.pem', '-signature', 'signature.bin', 'message.txt'], { cwd: dir });
      expect(r.stdout.trim()).toBe('Verified OK');
      expect(r.status).toBe(0);
    });
  }, 60_000);

  it('app signs, message modified afterwards → OpenSSL says "Verification failure"', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 2048 });
    const sig = await sign(keys.privateKey, utf8Encode(diploma));
    const pub = await exportPublicKeyPem(keys.publicKey);

    await withTempDir(async (dir) => {
      writeFileSync(join(dir, 'message.txt'), diploma.replace('3.12', '3.92'), 'utf8');
      writeFileSync(join(dir, 'signature.bin'), sig);
      writeFileSync(join(dir, 'public_key.pem'), pub);
      const r = openssl(['dgst', '-sha256', '-verify', 'public_key.pem', '-signature', 'signature.bin', 'message.txt'], { cwd: dir });
      expect(r.stdout.trim()).toBe('Verification failure');
      expect(r.status).toBe(1);
    });
  });

  it('OpenSSL signs (course §3–4 commands) → app verifies, and detects tampering', async () => {
    await withTempDir(async (dir) => {
      expect(openssl(['genrsa', '-out', 'private_key.pem', '2048'], { cwd: dir }).status).toBe(0);
      expect(openssl(['pkey', '-in', 'private_key.pem', '-pubout', '-out', 'public_key.pem'], { cwd: dir }).status).toBe(0);
      writeFileSync(join(dir, 'message.txt'), diploma, 'utf8');
      expect(
        openssl(['dgst', '-sha256', '-sign', 'private_key.pem', '-out', 'signature.bin', 'message.txt'], { cwd: dir }).status,
      ).toBe(0);

      const publicKey = await importPublicKeyPem(readFileSync(join(dir, 'public_key.pem'), 'utf8'));
      const sig = new Uint8Array(readFileSync(join(dir, 'signature.bin')));
      expect(await verify(publicKey, sig, utf8Encode(diploma))).toBe(true);
      expect(await verify(publicKey, sig, utf8Encode(diploma.replace('3.12', '3.92')))).toBe(false);
    });
  });

  it('reproduces the three-message class exercise (course §6)', async () => {
    await withTempDir(async (dir) => {
      openssl(['genrsa', '-out', 'private_key.pem', '2048'], { cwd: dir });
      openssl(['pkey', '-in', 'private_key.pem', '-pubout', '-out', 'public_key.pem'], { cwd: dir });
      const originals = ['Meet at 9.', 'Budget: 4,000 birr.', 'Exam is on Friday.'];
      originals.forEach((text, i) => {
        writeFileSync(join(dir, `message${i + 1}.txt`), text);
        openssl(['dgst', '-sha256', '-sign', 'private_key.pem', '-out', `signature${i + 1}.bin`, `message${i + 1}.txt`], { cwd: dir });
      });
      // Sender modifies messages 1 and 3 after signing, without re-signing.
      writeFileSync(join(dir, 'message1.txt'), 'Meet at 10.');
      writeFileSync(join(dir, 'message3.txt'), 'Exam is on Monday.');

      // Partner receives public_key.pem + the three pairs and checks each one.
      const publicKey = await importPublicKeyPem(readFileSync(join(dir, 'public_key.pem'), 'utf8'));
      const verdicts: boolean[] = [];
      for (let i = 1; i <= 3; i++) {
        const msg = new Uint8Array(readFileSync(join(dir, `message${i}.txt`)));
        const sig = new Uint8Array(readFileSync(join(dir, `signature${i}.bin`)));
        verdicts.push(await verify(publicKey, sig, msg));
      }
      expect(verdicts).toEqual([false, true, false]); // 1 modified, 2 intact, 3 modified
    });
  });

  it('produces byte-identical signatures to OpenSSL for the same key and message', async () => {
    // PKCS#1 v1.5 is deterministic, so two correct implementations must agree exactly.
    const keys = await generateRsaKeyPair({ modulusLength: 2048, extractable: true });
    const ours = await sign(keys.privateKey, utf8Encode(diploma));
    await withTempDir(async (dir) => {
      writeFileSync(join(dir, 'private_key.pem'), await exportPrivateKeyPem(keys.privateKey));
      writeFileSync(join(dir, 'message.txt'), diploma, 'utf8');
      openssl(['dgst', '-sha256', '-sign', 'private_key.pem', '-out', 'signature.bin', 'message.txt'], { cwd: dir });
      const theirs = new Uint8Array(readFileSync(join(dir, 'signature.bin')));
      expect(Buffer.from(ours).equals(Buffer.from(theirs))).toBe(true);
    });
  });

  it('reports the same key size, exponent and fingerprint as OpenSSL', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 3072 });
    const info = await describePublicKey(keys.publicKey);
    await withTempDir(async (dir) => {
      writeFileSync(join(dir, 'public_key.pem'), await exportPublicKeyPem(keys.publicKey));
      const text = openssl(['pkey', '-pubin', '-in', 'public_key.pem', '-noout', '-text'], { cwd: dir }).stdout;
      expect(text).toMatch(/Public-Key: \(3072 bit\)/);
      expect(text).toMatch(/Exponent: 65537 \(0x10001\)/);

      const der = openssl(['pkey', '-pubin', '-in', 'public_key.pem', '-outform', 'DER'], { cwd: dir });
      expect(der.status).toBe(0);
      expect(toColonHex(createHash('sha256').update(der.stdoutBytes).digest())).toBe(info.fingerprintSha256);
    });
  });

  it('refuses a 1024-bit key generated by OpenSSL', async () => {
    await withTempDir(async (dir) => {
      openssl(['genrsa', '-out', 'weak.pem', '1024'], { cwd: dir });
      openssl(['pkey', '-in', 'weak.pem', '-pubout', '-out', 'weak_pub.pem'], { cwd: dir });
      await expect(importPublicKeyPem(readFileSync(join(dir, 'weak_pub.pem'), 'utf8'))).rejects.toThrow(/RSA-1024/);
    });
  });
});
