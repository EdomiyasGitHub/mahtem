/** Certificates and CSRs to and from PEM, with input size limits. */
import { pemDecode, pemEncode } from '../crypto/index.ts';
import { PkiError } from './errors.ts';
import { Pkcs10CertificateRequest, X509Certificate } from './x509.ts';

/** Largest certificate or CSR PEM accepted (64 KiB; real ones are 1–3 KiB). */
export const MAX_PEM_BYTES = 64 * 1024;

function guardSize(pem: string): void {
  if (pem.length > MAX_PEM_BYTES) {
    throw new PkiError(`This file is ${pem.length.toLocaleString('en')} characters; certificates larger than 64 KiB are refused.`);
  }
}

export function certificateToPem(cert: X509Certificate): string {
  return pemEncode('CERTIFICATE', new Uint8Array(cert.rawData));
}

export function certificateFromPem(pem: string): X509Certificate {
  guardSize(pem);
  const der = pemDecode(pem, 'CERTIFICATE');
  try {
    return new X509Certificate(der);
  } catch {
    throw new PkiError('This file has a CERTIFICATE header but its contents are not a valid X.509 certificate.');
  }
}

export function csrToPem(csr: Pkcs10CertificateRequest): string {
  return pemEncode('CERTIFICATE REQUEST', new Uint8Array(csr.rawData));
}

export function csrFromPem(pem: string): Pkcs10CertificateRequest {
  guardSize(pem);
  const der = pemDecode(pem, 'CERTIFICATE REQUEST');
  try {
    return new Pkcs10CertificateRequest(der);
  } catch {
    throw new PkiError('This file has a CERTIFICATE REQUEST header but is not a valid PKCS#10 request.');
  }
}
