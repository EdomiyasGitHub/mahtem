/**
 * What a verifier receives, and what they already trust.
 *
 *   Bundle (from the sender — untrusted):  document, detached signature,
 *                                          signer certificate, intermediate certificates
 *   Trust store (the verifier's own):      trust anchors (root certificates)
 *
 * Nothing in a bundle is ever treated as trusted. In particular a root
 * certificate included in a bundle is only an ordinary, untrusted certificate.
 */
import { MAX_MESSAGE_BYTES, pemDecodeAll, sha256, toColonHex } from '../crypto/index.ts';
import { PkiError, certificateFromPem, certificateToPem, type X509Certificate } from '../pki/index.ts';
import { X509Certificate as X509 } from '../pki/x509.ts';

export const MAX_CHAIN_CERTIFICATES = 8;

export interface SignedBundle {
  readonly document: Uint8Array;
  readonly signature: Uint8Array;
  readonly signer: X509Certificate;
  readonly intermediates: readonly X509Certificate[];
}

export interface TrustStore {
  readonly anchors: readonly X509Certificate[];
}

export function createTrustStore(anchors: readonly X509Certificate[]): TrustStore {
  return { anchors: [...anchors] };
}

/** SHA-256 over the certificate's DER: how anchors are identified (not by name). */
export async function certificateFingerprint(cert: X509Certificate): Promise<string> {
  return toColonHex(await sha256(new Uint8Array(cert.rawData)));
}

/** Files of a bundle, named as in the exported scenario folders. */
export interface BundleFiles {
  readonly 'diploma.json': Uint8Array;
  readonly 'diploma.sig': Uint8Array;
  readonly 'signer-cert.pem': string;
  /** Omitted when there are no intermediates (OpenSSL rejects empty certificate files). */
  readonly 'chain.pem'?: string;
}

export function bundleToFiles(b: SignedBundle): BundleFiles {
  return {
    'diploma.json': b.document,
    'diploma.sig': b.signature,
    'signer-cert.pem': certificateToPem(b.signer),
    ...(b.intermediates.length ? { 'chain.pem': b.intermediates.map(certificateToPem).join('') } : {}),
  };
}

/** Parse untrusted bundle files. Throws PkiError with a displayable reason. */
export function bundleFromFiles(files: {
  document: Uint8Array;
  signature: Uint8Array;
  signerPem: string;
  chainPem?: string | undefined;
}): SignedBundle {
  if (files.document.byteLength > MAX_MESSAGE_BYTES) {
    throw new PkiError('The document is larger than 1 MiB.');
  }
  if (files.signature.byteLength === 0 || files.signature.byteLength > 1024) {
    throw new PkiError('The signature file is empty or implausibly large for an RSA signature.');
  }
  const signer = certificateFromPem(files.signerPem);
  let intermediates: X509Certificate[] = [];
  if (files.chainPem && files.chainPem.trim()) {
    try {
      intermediates = pemDecodeAll(files.chainPem, 'CERTIFICATE', MAX_CHAIN_CERTIFICATES).map((der) => new X509(der));
    } catch (e) {
      throw new PkiError(e instanceof Error ? `chain.pem: ${e.message}` : 'chain.pem could not be read.');
    }
  }
  return { document: files.document, signature: files.signature, signer, intermediates };
}

export function trustStoreFromPem(pem: string): TrustStore {
  return createTrustStore(pemDecodeAll(pem, 'CERTIFICATE', MAX_CHAIN_CERTIFICATES).map((der) => new X509(der)));
}

export function trustStoreToPem(store: TrustStore): string {
  return store.anchors.map(certificateToPem).join('');
}
