import type { X509Certificate } from '../../pki/index.ts';

/** What arrived at the verifier desk. Untrusted: the verifier never receives private keys. */
export interface ReceivedBundle {
  readonly original: Uint8Array;
  readonly signature: Uint8Array;
  readonly signer: X509Certificate;
  readonly intermediates: readonly X509Certificate[];
  /** Where it came from, for the heading. */
  readonly label: string;
  /** Lab only: the digest the University actually signed (the verifier never sees this in real life). */
  readonly signedDigest?: Uint8Array;
}

/** One root in the verifier's own trust store. */
export interface Anchor {
  readonly certificate: X509Certificate;
  readonly trusted: boolean;
}
