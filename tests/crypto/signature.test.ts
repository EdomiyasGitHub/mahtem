import { beforeAll, describe, expect, it } from 'vitest';
import {
  CryptoInputError,
  describePublicKey,
  exportPrivateKeyPem,
  exportPublicKeyPem,
  generateRsaKeyPair,
  importPublicKeyPem,
  sign,
  utf8Encode,
  verify,
} from '../../src/crypto/index.ts';

const message = utf8Encode('This certifies that Hana Tesfaye has been awarded a BSc. CGPA 3.12');
let alice: CryptoKeyPair;
let bob: CryptoKeyPair;

beforeAll(async () => {
  alice = await generateRsaKeyPair({ modulusLength: 2048 });
  bob = await generateRsaKeyPair({ modulusLength: 2048 });
});

describe('key generation', () => {
  it('creates RSA keys with e = 65537 and the requested size', async () => {
    const info = await describePublicKey(alice.publicKey);
    expect(info).toMatchObject({ algorithm: 'RSA', modulusLength: 2048, publicExponent: 65537 });
    expect(info.fingerprintSha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('makes private keys non-extractable by default', async () => {
    expect(alice.privateKey.extractable).toBe(false);
    await expect(exportPrivateKeyPem(alice.privateKey)).rejects.toThrow(/non-extractable/);
  });

  it('can export a private key only when that was requested at creation', async () => {
    const kp = await generateRsaKeyPair({ modulusLength: 2048, extractable: true });
    expect(await exportPrivateKeyPem(kp.privateKey)).toMatch(/^-----BEGIN PRIVATE KEY-----/);
  });

  it('refuses weak or unsupported sizes', async () => {
    // @ts-expect-error 1024 is deliberately not an allowed ModulusLength
    await expect(generateRsaKeyPair({ modulusLength: 1024 })).rejects.toThrow(CryptoInputError);
  });

  it('generates 4096-bit keys (Root and Ministry CA size)', async () => {
    const kp = await generateRsaKeyPair({ modulusLength: 4096 });
    expect((await describePublicKey(kp.publicKey)).modulusLength).toBe(4096);
  }, 60_000);

  it('gives two key pairs different fingerprints', async () => {
    const a = await describePublicKey(alice.publicKey);
    const b = await describePublicKey(bob.publicKey);
    expect(a.fingerprintSha256).not.toBe(b.fingerprintSha256);
  });
});

describe('sign and verify', () => {
  it('verifies a genuine signature', async () => {
    const sig = await sign(alice.privateKey, message);
    expect(await verify(alice.publicKey, sig, message)).toBe(true);
  });

  it('produces a signature exactly as long as the key (256 bytes for RSA-2048)', async () => {
    expect((await sign(alice.privateKey, message)).length).toBe(256);
  });

  it('is deterministic: PKCS#1 v1.5 gives the same signature for the same message and key', async () => {
    const s1 = await sign(alice.privateKey, message);
    const s2 = await sign(alice.privateKey, message);
    expect(s1).toEqual(s2);
  });

  it('fails when one character of the message changes (course §5)', async () => {
    const sig = await sign(alice.privateKey, message);
    const tampered = utf8Encode('This certifies that Hana Tesfaye has been awarded a BSc. CGPA 3.92');
    expect(await verify(alice.publicKey, sig, tampered)).toBe(false);
  });

  it('fails when a single bit of the message flips', async () => {
    const sig = await sign(alice.privateKey, message);
    const flipped = message.slice();
    flipped[0] = (flipped[0] ?? 0) ^ 0x01;
    expect(await verify(alice.publicKey, sig, flipped)).toBe(false);
  });

  it('fails when a single bit of the signature flips', async () => {
    const sig = await sign(alice.privateKey, message);
    sig[100] = (sig[100] ?? 0) ^ 0x01;
    expect(await verify(alice.publicKey, sig, message)).toBe(false);
  });

  it('fails with the wrong public key', async () => {
    const sig = await sign(alice.privateKey, message);
    expect(await verify(bob.publicKey, sig, message)).toBe(false);
  });

  it('fails when a valid signature is moved to a different message', async () => {
    const other = utf8Encode('A different diploma');
    const sigForOther = await sign(alice.privateKey, other);
    expect(await verify(alice.publicKey, sigForOther, message)).toBe(false);
  });

  it('returns false (not an error) for truncated or empty signatures', async () => {
    const sig = await sign(alice.privateKey, message);
    expect(await verify(alice.publicKey, sig.slice(0, 255), message)).toBe(false);
    expect(await verify(alice.publicKey, new Uint8Array(0), message)).toBe(false);
  });

  it('refuses to sign with a public key', async () => {
    await expect(sign(alice.publicKey, message)).rejects.toThrow(/PRIVATE key/);
  });

  it('refuses to verify with a private key', async () => {
    const sig = await sign(alice.privateKey, message);
    await expect(verify(alice.privateKey, sig, message)).rejects.toThrow(/PUBLIC key/);
  });

  it('refuses keys made for a different algorithm', async () => {
    const pss = await crypto.subtle.generateKey(
      { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    await expect(sign(pss.privateKey, message)).rejects.toThrow(/PKCS#1 v1.5/);
  });
});

describe('public key PEM', () => {
  it('round-trips and still verifies after import', async () => {
    const pem = await exportPublicKeyPem(alice.publicKey);
    expect(pem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
    const imported = await importPublicKeyPem(pem);
    const sig = await sign(alice.privateKey, message);
    expect(await verify(imported, sig, message)).toBe(true);
    expect((await describePublicKey(imported)).fingerprintSha256).toBe(
      (await describePublicKey(alice.publicKey)).fingerprintSha256,
    );
  });

  it('rejects garbage that is shaped like PEM', async () => {
    const fake = '-----BEGIN PUBLIC KEY-----\nAAAAAAAA\n-----END PUBLIC KEY-----\n';
    await expect(importPublicKeyPem(fake)).rejects.toThrow(/not a valid RSA public key/);
  });
});
