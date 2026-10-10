/**
 * Raised when input to the crypto layer is invalid: wrong key type, unsupported
 * size, malformed PEM, oversized message. The message is written for the person
 * using the lab and is safe to display (it never contains key material).
 */
export class CryptoInputError extends Error {
  override readonly name = 'CryptoInputError';
}
