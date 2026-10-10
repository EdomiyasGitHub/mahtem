/**
 * Read a certificate the way `openssl x509 -noout -text` does (course §12, §18),
 * as plain data for the Inspector.
 */
import { type PublicKeyInfo, SIGNATURE_ALGORITHM, describePublicKey, sha256, toColonHex, fromHex } from '../crypto/index.ts';
import { type NameAttribute, nameAttributes, nameToText, namesMatch } from './names.ts';
import { verifyCsr } from './csr.ts';
import {
  AuthorityKeyIdentifierExtension,
  BasicConstraintsExtension,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  type Pkcs10CertificateRequest,
  type PublicKey,
  SubjectKeyIdentifierExtension,
  type X509Certificate,
} from './x509.ts';
import { OID_DOCUMENT_SIGNING } from './profiles.ts';

/** Extension names as OpenSSL prints them. */
export const EXTENSION_NAMES: Readonly<Record<string, string>> = {
  '2.5.29.19': 'X509v3 Basic Constraints',
  '2.5.29.15': 'X509v3 Key Usage',
  '2.5.29.37': 'X509v3 Extended Key Usage',
  '2.5.29.14': 'X509v3 Subject Key Identifier',
  '2.5.29.35': 'X509v3 Authority Key Identifier',
  '2.5.29.17': 'X509v3 Subject Alternative Name',
  '2.5.29.30': 'X509v3 Name Constraints',
  '2.5.29.31': 'X509v3 CRL Distribution Points',
  '2.5.29.32': 'X509v3 Certificate Policies',
  '1.3.6.1.5.5.7.1.1': 'Authority Information Access',
};

/** Key usage bits, in OpenSSL's wording and order. */
const KEY_USAGE_NAMES: ReadonlyArray<[KeyUsageFlags, string]> = [
  [KeyUsageFlags.digitalSignature, 'Digital Signature'],
  [KeyUsageFlags.nonRepudiation, 'Non Repudiation'],
  [KeyUsageFlags.keyEncipherment, 'Key Encipherment'],
  [KeyUsageFlags.dataEncipherment, 'Data Encipherment'],
  [KeyUsageFlags.keyAgreement, 'Key Agreement'],
  [KeyUsageFlags.keyCertSign, 'Certificate Sign'],
  [KeyUsageFlags.cRLSign, 'CRL Sign'],
  [KeyUsageFlags.encipherOnly, 'Encipher Only'],
  [KeyUsageFlags.decipherOnly, 'Decipher Only'],
];

const EKU_NAMES: Readonly<Record<string, string>> = {
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'E-mail Protection',
  '1.3.6.1.5.5.7.3.8': 'Time Stamping',
  [OID_DOCUMENT_SIGNING]: 'Document Signing (RFC 9336)',
};

export interface CertificateSummary {
  readonly subject: NameAttribute[];
  readonly subjectText: string;
  readonly issuer: NameAttribute[];
  readonly issuerText: string;
  /** Subject and Issuer are the same name (a root, course §10). */
  readonly selfIssued: boolean;
  readonly serialNumber: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly validityDays: number;
  readonly signatureAlgorithm: string;
  readonly publicKey: PublicKeyInfo | null;
  readonly publicKeyAlgorithm: string;
  readonly basicConstraints: { critical: boolean; ca: boolean; pathLength?: number } | null;
  readonly keyUsage: { critical: boolean; usages: string[] } | null;
  readonly extendedKeyUsage: { critical: boolean; usages: Array<{ oid: string; name: string }> } | null;
  readonly subjectKeyId: string | null;
  readonly authorityKeyId: string | null;
  readonly extensions: Array<{ oid: string; name: string; critical: boolean }>;
  /** SHA-256 over the whole certificate (openssl x509 -noout -fingerprint -sha256). */
  readonly fingerprintSha256: string;
}

function signatureAlgorithmName(alg: { name: string; hash?: { name: string } }): string {
  if (alg.name === 'RSASSA-PKCS1-v1_5') return `${(alg.hash?.name ?? '').replace('-', '').toLowerCase()}WithRSAEncryption`;
  return alg.hash ? `${alg.name} / ${alg.hash.name}` : alg.name;
}

async function rsaInfo(key: PublicKey): Promise<PublicKeyInfo | null> {
  try {
    return await describePublicKey(await key.export(SIGNATURE_ALGORITHM, ['verify']));
  } catch {
    return null; // not an RSA key the lab can use (e.g. ECDSA); still displayable
  }
}

const keyIdText = (hex: string | undefined) => (hex ? toColonHex(fromHex(hex)) : null);

export async function describeCertificate(cert: X509Certificate): Promise<CertificateSummary> {
  const bc = cert.getExtension(BasicConstraintsExtension);
  const ku = cert.getExtension(KeyUsagesExtension);
  const eku = cert.getExtension(ExtendedKeyUsageExtension);
  const ski = cert.getExtension(SubjectKeyIdentifierExtension);
  const aki = cert.getExtension(AuthorityKeyIdentifierExtension);

  return {
    subject: nameAttributes(cert.subjectName),
    subjectText: nameToText(cert.subjectName),
    issuer: nameAttributes(cert.issuerName),
    issuerText: nameToText(cert.issuerName),
    selfIssued: namesMatch(cert.subjectName, cert.issuerName),
    serialNumber: cert.serialNumber.toUpperCase(),
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    validityDays: Math.round((cert.notAfter.getTime() - cert.notBefore.getTime()) / 86_400_000),
    signatureAlgorithm: signatureAlgorithmName(cert.signatureAlgorithm as { name: string; hash?: { name: string } }),
    publicKey: await rsaInfo(cert.publicKey),
    publicKeyAlgorithm: cert.publicKey.algorithm.name,
    basicConstraints: bc
      ? { critical: bc.critical, ca: bc.ca, ...(bc.pathLength !== undefined ? { pathLength: bc.pathLength } : {}) }
      : null,
    keyUsage: ku
      ? { critical: ku.critical, usages: KEY_USAGE_NAMES.filter(([flag]) => ku.usages & flag).map(([, n]) => n) }
      : null,
    extendedKeyUsage: eku
      ? { critical: eku.critical, usages: eku.usages.map((oid) => ({ oid: String(oid), name: EKU_NAMES[String(oid)] ?? String(oid) })) }
      : null,
    subjectKeyId: keyIdText(ski?.keyId),
    authorityKeyId: keyIdText(aki?.keyId),
    extensions: cert.extensions.map((e) => ({ oid: e.type, name: EXTENSION_NAMES[e.type] ?? e.type, critical: e.critical })),
    fingerprintSha256: toColonHex(await sha256(new Uint8Array(cert.rawData))),
  };
}

export interface IssuedByCheck {
  /** child.Issuer equals parent.Subject. */
  readonly issuerNameMatches: boolean;
  /** child.AKI equals parent.SKI; null when either is absent. */
  readonly keyIdentifierMatches: boolean | null;
  /** The parent's public key verifies the child's signature. */
  readonly signatureValid: boolean;
}

/**
 * One link of a chain: was `child` signed by the holder of `parent`'s key?
 * Stage 3's validator adds constraints, validity and trust on top of this.
 */
export async function checkIssuedBy(child: X509Certificate, parent: X509Certificate): Promise<IssuedByCheck> {
  const aki = child.getExtension(AuthorityKeyIdentifierExtension)?.keyId;
  const ski = parent.getExtension(SubjectKeyIdentifierExtension)?.keyId;
  let signatureValid: boolean;
  try {
    signatureValid = await child.verify({ publicKey: parent.publicKey, signatureOnly: true });
  } catch {
    signatureValid = false;
  }
  return {
    issuerNameMatches: namesMatch(child.issuerName, parent.subjectName),
    keyIdentifierMatches: aki && ski ? aki.toLowerCase() === ski.toLowerCase() : null,
    signatureValid,
  };
}

export interface CsrSummary {
  readonly subject: NameAttribute[];
  readonly subjectText: string;
  readonly publicKey: PublicKeyInfo | null;
  /** Proof of possession (openssl req -verify). */
  readonly signatureValid: boolean;
}

export async function describeCsr(csr: Pkcs10CertificateRequest): Promise<CsrSummary> {
  return {
    subject: nameAttributes(csr.subjectName),
    subjectText: nameToText(csr.subjectName),
    publicKey: await rsaInfo(csr.publicKey),
    signatureValid: await verifyCsr(csr),
  };
}
