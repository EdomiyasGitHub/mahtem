/**
 * Digital signatures (course §2, §4, §5).
 *
 *   openssl dgst -sha256 -sign private_key.pem -out signature.bin message.txt
 *       → sign(privateKey, messageBytes)
 *   openssl dgst -sha256 -verify public_key.pem -signature signature.bin message.txt
 *       → verify(publicKey, signature, messageBytes)
 *
 * Scheme: RSASSA-PKCS1-v1_5 with SHA-256 (RFC 8017 §8.2), OpenSSL's default for RSA keys,
 * so signatures made here verify with the course commands and vice versa.
 *
 * What happens inside (not "encrypting with the private key"):
 *   1. SHA-256 hashes the message → 32-byte digest
 *   2. The digest is wrapped in a DigestInfo structure that names SHA-256,
 *      then padded to the key length: 00 01 FF…FF 00 ‖ DigestInfo
 *   3. The RSA private-key operation turns that block into the signature.
 * Verification reverses step 3 with the public key and checks the result
 * matches the padded digest of the message received.
 */
import { guardMessage } from './bytes-guard.ts';
import { toBytes, type Bytes } from './encoding.ts';
import { assertLabKey } from './keys.ts';
import { SIGNATURE_ALGORITHM } from './constants.ts';

/** Signature bytes, identical in format to OpenSSL's signature.bin. */
export async function sign(privateKey: CryptoKey, message: Uint8Array): Promise<Bytes> {
  assertLabKey(privateKey, 'private');
  const data = guardMessage(message);
  return toBytes(await crypto.subtle.sign(SIGNATURE_ALGORITHM, privateKey, data));
}

/**
 * True if `signature` is a valid signature of exactly these message bytes
 * under `publicKey`. False for a modified message, a different key, or a
 * malformed signature.
 */
export async function verify(publicKey: CryptoKey, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  assertLabKey(publicKey, 'public');
  const data = guardMessage(message);
  const sig = guardMessage(signature, 'Signature');
  const expectedLength = (publicKey.algorithm as RsaHashedKeyAlgorithm).modulusLength / 8;
  // A PKCS#1 v1.5 signature is always exactly as long as the modulus.
  if (sig.byteLength !== expectedLength) return false;
  return crypto.subtle.verify(SIGNATURE_ALGORITHM, publicKey, sig, data);
}
