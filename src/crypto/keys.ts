/**
 * RSA key pairs (course §3, §11, §14).
 *
 *   openssl genrsa -out private_key.pem 4096                 → generateRsaKeyPair({ modulusLength: 4096 })
 *   openssl pkey -in private_key.pem -pubout -out public_key.pem → exportPublicKeyPem(publicKey)
 *
 * Security default: private keys are NON-EXTRACTABLE. The browser will sign
 * with them but refuses to reveal their bytes, even to this app's own code.
 * Export must be requested explicitly at creation time (lab use only).
 */
import {
  ALLOWED_MODULUS_LENGTHS,
  PUBLIC_EXPONENT,
  SIGNATURE_ALGORITHM,
  type ModulusLength,
} from './constants.ts';
import { pemDecode, pemEncode, toBytes, toColonHex } from './encoding.ts';
import { CryptoInputError } from './errors.ts';

export interface GenerateKeyOptions {
  readonly modulusLength: ModulusLength;
  /**
   * Allow the private key to be exported as PEM later. Default false.
   * Only for the explicit "export for OpenSSL" lab feature.
   */
  readonly extractable?: boolean;
}

export function isAllowedModulusLength(bits: number): bits is ModulusLength {
  return (ALLOWED_MODULUS_LENGTHS as readonly number[]).includes(bits);
}

export async function generateRsaKeyPair(options: GenerateKeyOptions): Promise<CryptoKeyPair> {
  const { modulusLength, extractable = false } = options;
  if (!isAllowedModulusLength(modulusLength)) {
    throw new CryptoInputError(
      `RSA-${String(modulusLength)} is not allowed. Choose ${ALLOWED_MODULUS_LENGTHS.join(', ')} bits.`,
    );
  }
  return crypto.subtle.generateKey(
    { ...SIGNATURE_ALGORITHM, modulusLength, publicExponent: PUBLIC_EXPONENT },
    extractable, // applies to the private key; public keys are always exportable
    ['sign', 'verify'],
  );
}

export interface PublicKeyInfo {
  readonly algorithm: 'RSA';
  readonly modulusLength: number;
  readonly publicExponent: number;
  /**
   * SHA-256 of the SubjectPublicKeyInfo DER, colon-separated.
   * OpenSSL equivalent:
   *   openssl pkey -pubin -in public_key.pem -outform DER | openssl dgst -sha256
   */
  readonly fingerprintSha256: string;
}

function rsaParams(key: CryptoKey): RsaHashedKeyAlgorithm {
  return key.algorithm as RsaHashedKeyAlgorithm;
}

/** Throw unless `key` is an RSASSA-PKCS1-v1_5 / SHA-256 key of the given type. */
export function assertLabKey(key: unknown, type: 'public' | 'private'): asserts key is CryptoKey {
  if (!(key instanceof CryptoKey)) {
    throw new CryptoInputError(`Expected a ${type} key.`);
  }
  if (key.type !== type) {
    throw new CryptoInputError(
      type === 'private'
        ? 'Signing needs the PRIVATE key. A public key can only verify.'
        : 'Verification uses the PUBLIC key. Never hand a private key to a verifier.',
    );
  }
  const alg = rsaParams(key);
  if (alg.name !== SIGNATURE_ALGORITHM.name || alg.hash?.name !== SIGNATURE_ALGORITHM.hash) {
    throw new CryptoInputError('Key is not an RSA PKCS#1 v1.5 / SHA-256 signing key.');
  }
}

export async function exportPublicKeyDer(publicKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  assertLabKey(publicKey, 'public');
  return toBytes(await crypto.subtle.exportKey('spki', publicKey));
}

/** PEM in the same format as `openssl pkey -pubout` ("BEGIN PUBLIC KEY"). */
export async function exportPublicKeyPem(publicKey: CryptoKey): Promise<string> {
  return pemEncode('PUBLIC KEY', await exportPublicKeyDer(publicKey));
}

/**
 * PKCS#8 PEM ("BEGIN PRIVATE KEY"), the format OpenSSL 3 writes for genrsa/genpkey.
 * Refuses non-extractable keys with an explanation instead of a cryptic error.
 */
export async function exportPrivateKeyPem(privateKey: CryptoKey): Promise<string> {
  assertLabKey(privateKey, 'private');
  if (!privateKey.extractable) {
    throw new CryptoInputError(
      'This private key was created non-extractable: the browser can sign with it but will not reveal it. ' +
        'That is the safe default. Create the key with export enabled if the lab needs it for OpenSSL.',
    );
  }
  return pemEncode('PRIVATE KEY', toBytes(await crypto.subtle.exportKey('pkcs8', privateKey)));
}

/** Import an RSA public key from PEM, e.g. one produced by `openssl pkey -pubout`. */
export async function importPublicKeyPem(pem: string): Promise<CryptoKey> {
  const der = pemDecode(pem, 'PUBLIC KEY');
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('spki', der, SIGNATURE_ALGORITHM, true, ['verify']);
  } catch {
    throw new CryptoInputError('This PEM is not a valid RSA public key.');
  }
  const bits = rsaParams(key).modulusLength;
  if (!isAllowedModulusLength(bits)) {
    throw new CryptoInputError(
      `This is an RSA-${bits} key. The lab accepts ${ALLOWED_MODULUS_LENGTHS.join(', ')}-bit keys only.`,
    );
  }
  return key;
}

export async function describePublicKey(publicKey: CryptoKey): Promise<PublicKeyInfo> {
  const der = await exportPublicKeyDer(publicKey);
  const alg = rsaParams(publicKey);
  let exponent = 0;
  for (const byte of alg.publicExponent) exponent = exponent * 256 + byte;
  const fingerprint = toBytes(await crypto.subtle.digest('SHA-256', der));
  return {
    algorithm: 'RSA',
    modulusLength: alg.modulusLength,
    publicExponent: exponent,
    fingerprintSha256: toColonHex(fingerprint),
  };
}
