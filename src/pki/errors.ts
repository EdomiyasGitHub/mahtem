/** Invalid PKI input: malformed certificate, CSR or PEM. Safe to display. */
export class PkiError extends Error {
  override readonly name: string = 'PkiError';
}

/**
 * A certificate authority refused to issue, as real CA software would.
 * `code` lets the interface explain the refusal precisely.
 */
export type IssuanceRefusal =
  | 'csr-signature-invalid'
  | 'issuer-key-mismatch'
  | 'issuer-not-ca'
  | 'issuer-cannot-sign-certificates'
  | 'path-length-exceeded'
  | 'issuer-not-currently-valid'
  | 'validity-exceeds-issuer'
  | 'invalid-validity';

export class IssuancePolicyError extends PkiError {
  override readonly name: string = 'IssuancePolicyError';
  readonly code: IssuanceRefusal;

  constructor(code: IssuanceRefusal, message: string) {
    super(message);
    this.code = code;
  }
}
