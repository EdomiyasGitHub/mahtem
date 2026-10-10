/**
 * Fixed cryptographic parameters for the lab.
 *
 * These mirror the course practical:
 *   openssl dgst -sha256 -sign ...   → RSASSA-PKCS1-v1_5 with SHA-256
 *   openssl genrsa ... 4096          → RSA modulus sizes, public exponent 65537
 */

/** Web Crypto algorithm used for every signature in the lab. */
export const SIGNATURE_ALGORITHM = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
} as const;

/** Display name matching OpenSSL's output for certificates signed this way. */
export const SIGNATURE_ALGORITHM_OPENSSL_NAME = 'sha256WithRSAEncryption';

/**
 * Allowed RSA modulus sizes in bits.
 * 2048: OpenSSL's default for `genpkey -algorithm RSA` (course §3)
 * 3072: the University signer (≈128-bit security, NIST SP 800-57)
 * 4096: the Root and Ministry CAs (course §11, §14)
 * Anything smaller (e.g. 1024) is refused as too weak.
 */
export const ALLOWED_MODULUS_LENGTHS = [2048, 3072, 4096] as const;
export type ModulusLength = (typeof ALLOWED_MODULUS_LENGTHS)[number];

/** e = 65537, the standard RSA public exponent (OpenSSL's default). */
export const PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]);

/**
 * Largest message the lab will hash or sign, in bytes (1 MiB).
 * Diplomas are a few hundred bytes; this only prevents a huge file from
 * freezing the tab.
 */
export const MAX_MESSAGE_BYTES = 1024 * 1024;

/** SHA-256 digest length in bytes. */
export const SHA256_BYTES = 32;
