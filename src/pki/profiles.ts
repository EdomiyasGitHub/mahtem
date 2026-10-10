/**
 * Certificate profiles: which X.509v3 extensions each kind of certificate gets.
 *
 * intermediate-ca reproduces the course's intermediate-ext.cnf (§16) exactly:
 *   basicConstraints=critical,CA:TRUE,pathlen:0
 *   keyUsage=critical,keyCertSign,cRLSign
 *   subjectKeyIdentifier=hash
 *   authorityKeyIdentifier=keyid,issuer
 *
 * root-ca: the course's root command (§11) used no extension file, so its
 * extensions came from the local openssl.cnf defaults (usually v3_ca). The lab
 * states them explicitly instead of relying on whatever a machine's config says.
 *
 * document-signer: EXTENSION. The course describes the signer certificate (§25)
 * but gives no extension file. This profile is the standard choice for an
 * end entity that signs documents.
 */
import type { PublicKey } from './x509.ts';
import {
  AuthorityKeyIdentifierExtension,
  BasicConstraintsExtension,
  ExtendedKeyUsageExtension,
  type Extension,
  KeyUsageFlags,
  KeyUsagesExtension,
  SubjectKeyIdentifierExtension,
} from './x509.ts';

export type ProfileId = 'root-ca' | 'intermediate-ca' | 'document-signer';

/** id-kp-documentSigning, RFC 9336 (2022). */
export const OID_DOCUMENT_SIGNING = '1.3.6.1.5.5.7.3.36';

export interface Profile {
  readonly id: ProfileId;
  readonly label: string;
  readonly isCa: boolean;
  /** Where this profile comes from: a course section, or "extension". */
  readonly provenance: string;
}

export const PROFILES: Readonly<Record<ProfileId, Profile>> = {
  'root-ca': { id: 'root-ca', label: 'Root CA (trust anchor)', isCa: true, provenance: 'course §10–11, extensions stated explicitly' },
  'intermediate-ca': { id: 'intermediate-ca', label: 'Intermediate CA', isCa: true, provenance: 'course §16 intermediate-ext.cnf' },
  'document-signer': { id: 'document-signer', label: 'Document signer (end entity)', isCa: false, provenance: 'extension (course §25 describes it)' },
};

type KeyLike = CryptoKey | PublicKey;

/**
 * Build the extensions for a certificate.
 * @param subjectKey the public key being certified
 * @param issuerKey  the issuer's public key (same as subjectKey for a self-signed root)
 */
export async function buildExtensions(profile: ProfileId, subjectKey: KeyLike, issuerKey: KeyLike): Promise<Extension[]> {
  const ski = await SubjectKeyIdentifierExtension.create(subjectKey);
  const aki = await AuthorityKeyIdentifierExtension.create(issuerKey);

  switch (profile) {
    case 'root-ca':
      return [
        new BasicConstraintsExtension(true, undefined, true),
        new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
        ski,
        aki,
      ];
    case 'intermediate-ca':
      return [
        new BasicConstraintsExtension(true, 0, true),
        new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
        ski,
        aki,
      ];
    case 'document-signer':
      return [
        new BasicConstraintsExtension(false, undefined, true),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature | KeyUsageFlags.nonRepudiation, true),
        new ExtendedKeyUsageExtension([OID_DOCUMENT_SIGNING], false),
        ski,
        aki,
      ];
  }
}
