/**
 * Certificate authority operations.
 *
 *   openssl req -x509 -new -sha256 -key rootCA-key.pem -out rootCA-cert.pem -days 3650   (course §11)
 *     → createRootCertificate(...)
 *   openssl x509 -req -sha256 -in intermediateCA.csr -CA rootCA-cert.pem -CAkey rootCA-key.pem
 *       -CAcreateserial -out intermediateCA-cert.pem -days 1825 -extfile intermediate-ext.cnf   (course §17)
 *     → issueCertificate({ csr, issuer: root, profile: 'intermediate-ca', validityDays: 1825 })
 *
 * Like `openssl x509 -req`, issuance copies only the subject name and public key
 * from the CSR. Extensions come from the CA's profile, never from the request,
 * so a requester cannot ask to be made a CA.
 *
 * Unlike `openssl x509 -req`, this CA also enforces policy and refuses to
 * issue when the issuer is not entitled to (see IssuancePolicyError codes).
 * OpenSSL leaves those checks to verification time.
 */
import { SIGNATURE_ALGORITHM, exportPublicKeyDer, randomBytes, toHex } from '../crypto/index.ts';
import { IssuancePolicyError } from './errors.ts';
import { type DistinguishedName, toJsonName } from './names.ts';
import { PROFILES, type ProfileId, buildExtensions } from './profiles.ts';
import { verifyCsr } from './csr.ts';
import {
  BasicConstraintsExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  type Pkcs10CertificateRequest,
  type X509Certificate,
  X509CertificateGenerator,
} from './x509.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VALIDITY_DAYS = 3650 * 2;

/** A CA as the lab holds it: its certificate plus its key pair. */
export interface CertificateAuthority {
  readonly certificate: X509Certificate;
  readonly keys: CryptoKeyPair;
}

/** X.509 times have one-second precision. */
function nowToTheSecond(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

/**
 * 128-bit random serial number (positive, fixed length), like -CAcreateserial.
 * Random serials stop anyone predicting the next certificate's serial.
 */
export function randomSerialNumber(): string {
  const bytes = randomBytes(16);
  bytes[0] = ((bytes[0] ?? 0) & 0x7f) | 0x40; // positive, no leading zero byte
  return toHex(bytes);
}

function validityWindow(validityDays: number, notBefore: Date): { notBefore: Date; notAfter: Date } {
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > MAX_VALIDITY_DAYS) {
    throw new IssuancePolicyError('invalid-validity', `Validity must be a whole number of days from 1 to ${MAX_VALIDITY_DAYS}.`);
  }
  return { notBefore, notAfter: new Date(notBefore.getTime() + validityDays * DAY_MS) };
}

export interface CreateRootParams {
  readonly keys: CryptoKeyPair;
  readonly subject: DistinguishedName;
  readonly validityDays?: number;
  readonly notBefore?: Date;
}

/** Self-signed root certificate: Subject = Issuer, signed with its own private key. */
export async function createRootCertificate(params: CreateRootParams): Promise<X509Certificate> {
  const { keys, subject, validityDays = 3650, notBefore = nowToTheSecond() } = params;
  return X509CertificateGenerator.createSelfSigned({
    serialNumber: randomSerialNumber(),
    name: toJsonName(subject),
    ...validityWindow(validityDays, notBefore),
    keys,
    signingAlgorithm: SIGNATURE_ALGORITHM,
    extensions: await buildExtensions('root-ca', keys.publicKey, keys.publicKey),
  });
}

export interface IssueParams {
  readonly csr: Pkcs10CertificateRequest;
  readonly issuer: CertificateAuthority;
  readonly profile: Exclude<ProfileId, 'root-ca'>;
  readonly validityDays: number;
  readonly notBefore?: Date;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Issue a certificate for a CSR, signed with the issuer's private key. */
export async function issueCertificate(params: IssueParams): Promise<X509Certificate> {
  const { csr, issuer, profile, validityDays, notBefore = nowToTheSecond() } = params;
  const issuerCert = issuer.certificate;

  // 1. Proof of possession.
  if (!(await verifyCsr(csr))) {
    throw new IssuancePolicyError(
      'csr-signature-invalid',
      'The request’s own signature does not verify, so there is no proof the requester holds the private key.',
    );
  }

  // 2. The private key we are about to sign with must belong to the issuer certificate.
  const issuerKeyDer = await exportPublicKeyDer(issuer.keys.publicKey);
  if (!sameBytes(issuerKeyDer, new Uint8Array(issuerCert.publicKey.rawData))) {
    throw new IssuancePolicyError('issuer-key-mismatch', 'The signing key does not match the issuer’s certificate.');
  }

  // 3. The issuer must be a CA.
  const bc = issuerCert.getExtension(BasicConstraintsExtension);
  if (!bc?.ca) {
    throw new IssuancePolicyError(
      'issuer-not-ca',
      `"${issuerCert.subjectName.getField('CN')[0] ?? 'This certificate'}" is not a CA (basicConstraints CA:FALSE or absent), so it may not issue certificates.`,
    );
  }

  // 4. If keyUsage is present it must allow certificate signing (RFC 5280 §4.2.1.3).
  const ku = issuerCert.getExtension(KeyUsagesExtension);
  if (ku && !(ku.usages & KeyUsageFlags.keyCertSign)) {
    throw new IssuancePolicyError('issuer-cannot-sign-certificates', 'The issuer’s keyUsage does not include keyCertSign.');
  }

  // 5. Path length: a CA with pathlen:0 may issue end-entity certificates only.
  if (PROFILES[profile].isCa && bc.pathLength !== undefined && bc.pathLength < 1) {
    throw new IssuancePolicyError(
      'path-length-exceeded',
      `The issuer has pathlen:${bc.pathLength}, so it may not create another CA beneath it (course §16).`,
    );
  }

  // 6. The issuer must be valid now, and cannot vouch beyond its own expiry.
  const now = Date.now();
  if (now < issuerCert.notBefore.getTime() || now > issuerCert.notAfter.getTime()) {
    throw new IssuancePolicyError('issuer-not-currently-valid', 'The issuer’s certificate is expired or not yet valid.');
  }
  const window = validityWindow(validityDays, notBefore);
  if (window.notAfter.getTime() > issuerCert.notAfter.getTime()) {
    throw new IssuancePolicyError(
      'validity-exceeds-issuer',
      `The requested certificate would outlive its issuer (issuer expires ${issuerCert.notAfter.toISOString().slice(0, 10)}).`,
    );
  }

  return X509CertificateGenerator.create({
    serialNumber: randomSerialNumber(),
    subject: csr.subjectName,
    issuer: issuerCert.subjectName,
    ...window,
    publicKey: csr.publicKey,
    signingKey: issuer.keys.privateKey,
    signingAlgorithm: SIGNATURE_ALGORITHM,
    extensions: await buildExtensions(profile, csr.publicKey, issuerCert.publicKey),
  });
}
