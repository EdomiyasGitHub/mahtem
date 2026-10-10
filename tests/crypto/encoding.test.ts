import { describe, expect, it } from 'vitest';
import {
  CryptoInputError,
  chunkHex,
  fromBase64,
  fromHex,
  pemDecode,
  pemEncode,
  toBase64,
  toColonHex,
  toHex,
  utf8Decode,
  utf8Encode,
} from '../../src/crypto/index.ts';

describe('hex', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 255]);
    expect(toHex(bytes)).toBe('00010f107f80ff');
    expect(fromHex('00010f107f80ff')).toEqual(bytes);
  });
  it('accepts colon/space separated input', () => {
    expect(toHex(fromHex('AB:cd ef'))).toBe('abcdef');
  });
  it('rejects malformed hex', () => {
    expect(() => fromHex('abc')).toThrow(CryptoInputError);
    expect(() => fromHex('zz')).toThrow(CryptoInputError);
  });
  it('chunks a digest into eight 8-character blocks', () => {
    expect(chunkHex('a'.repeat(64))).toHaveLength(8);
  });
  it('formats fingerprints like OpenSSL', () => {
    expect(toColonHex(new Uint8Array([0xab, 0x01]))).toBe('AB:01');
  });
});

describe('UTF-8', () => {
  it('encodes Amharic as multi-byte UTF-8 and decodes it back', () => {
    const name = 'ሃና ተስፋዬ';
    const bytes = utf8Encode(name);
    expect(bytes.length).toBeGreaterThan(name.length); // Ethiopic letters are 3 bytes each
    expect(utf8Decode(bytes)).toBe(name);
  });
  it('rejects invalid UTF-8 instead of guessing', () => {
    expect(() => utf8Decode(new Uint8Array([0xff, 0xfe]))).toThrow(CryptoInputError);
  });
});

describe('Base64', () => {
  it('round-trips all byte values', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
  });
  it('matches Node’s encoder', () => {
    const data = utf8Encode('Mahtem ማኅተም');
    expect(toBase64(data)).toBe(Buffer.from(data).toString('base64'));
  });
  it('rejects invalid Base64', () => {
    expect(() => fromBase64('abc$')).toThrow(CryptoInputError);
  });
});

describe('PEM', () => {
  const der = Uint8Array.from({ length: 200 }, (_, i) => i);

  it('writes 64-character lines between BEGIN/END markers', () => {
    const pem = pemEncode('PUBLIC KEY', der);
    const lines = pem.trim().split('\n');
    expect(lines[0]).toBe('-----BEGIN PUBLIC KEY-----');
    expect(lines.at(-1)).toBe('-----END PUBLIC KEY-----');
    expect(lines.slice(1, -1).every((l) => l.length <= 64)).toBe(true);
  });
  it('round-trips', () => {
    expect(pemDecode(pemEncode('CERTIFICATE', der), 'CERTIFICATE')).toEqual(der);
  });
  it('accepts Windows CRLF line endings', () => {
    const crlf = pemEncode('PUBLIC KEY', der).replace(/\n/g, '\r\n');
    expect(pemDecode(crlf, 'PUBLIC KEY')).toEqual(der);
  });
  it('rejects the wrong label', () => {
    expect(() => pemDecode(pemEncode('PRIVATE KEY', der), 'PUBLIC KEY')).toThrow(/Expected a "PUBLIC KEY"/);
  });
  it('explains the legacy PKCS#1 format', () => {
    const legacy = '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----';
    expect(() => pemDecode(legacy, 'PRIVATE KEY')).toThrow(/openssl pkey/);
  });
  it('rejects multiple blocks and missing blocks', () => {
    const two = pemEncode('PUBLIC KEY', der) + pemEncode('PUBLIC KEY', der);
    expect(() => pemDecode(two, 'PUBLIC KEY')).toThrow(/found 2/);
    expect(() => pemDecode('hello', 'PUBLIC KEY')).toThrow(/No PEM block/);
  });
  it('rejects encrypted PEM headers', () => {
    const enc = '-----BEGIN PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nAAAA\n-----END PRIVATE KEY-----';
    expect(() => pemDecode(enc, 'PRIVATE KEY')).toThrow(/Encrypted/);
  });
});
