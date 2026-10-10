/**
 * Certificate Signing Requests (course §15).
 *
 *   openssl req -new -sha256 -key intermediateCA-key.pem -out intermediateCA.csr -subj "/C=ET/..."
 *     → createCsr({ keys, subject })
 *
 * A CSR carries the subject's name and public key, and is signed with the
 * subject's own private key. That signature proves the requester holds the
 * private key ("proof of possession"). A CSR is not a certificate.
 */
import { SIGNATURE_ALGORITHM } from '../crypto/index.ts';
import { type DistinguishedName, toJsonName } from './names.ts';
import { type Pkcs10CertificateRequest, Pkcs10CertificateRequestGenerator } from './x509.ts';

export async function createCsr(params: { keys: CryptoKeyPair; subject: DistinguishedName }): Promise<Pkcs10CertificateRequest> {
  return Pkcs10CertificateRequestGenerator.create({
    name: toJsonName(params.subject),
    keys: params.keys,
    signingAlgorithm: SIGNATURE_ALGORITHM,
  });
}

/** Proof of possession: does the CSR's own signature verify with the key inside it? */
export async function verifyCsr(csr: Pkcs10CertificateRequest): Promise<boolean> {
  try {
    return await csr.verify();
  } catch {
    return false;
  }
}
