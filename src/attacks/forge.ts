/**
 * ATTACKER TOOLING: exists only to build the lab's failure scenarios.
 *
 * Signs a certificate for any name, with any key, under any issuer, applying
 * no policy at all. The lab's honest CA (src/pki/ca.ts) refuses every
 * certificate this module is used for. That is the point: a real attacker
 * does not ask permission, so the VERIFIER must catch these.
 *
 * Every certificate produced here is a real, correctly encoded X.509
 * certificate with a genuine RSA signature. Only the trust it claims is false.
 */
import { SIGNATURE_ALGORITHM } from '../crypto/index.ts';
import { type DistinguishedName, type ProfileId, randomSerialNumber } from '../pki/index.ts';
import { buildExtensions } from '../pki/profiles.ts';
import { toJsonName } from '../pki/names.ts';
import { type Extension, Name, type PublicKey, type X509Certificate, X509CertificateGenerator } from '../pki/x509.ts';

export interface ForgeParams {
  readonly subject: DistinguishedName;
  readonly subjectPublicKey: CryptoKey;
  readonly issuer: {
    /** The name to write as Issuer: the real issuer's, or any name at all. */
    readonly name: Name | DistinguishedName;
    readonly publicKey: CryptoKey | PublicKey;
    /** The key that actually signs: stolen, misused, or the attacker's own. */
    readonly signingKey: CryptoKey;
  };
  readonly profile: ProfileId;
  readonly extraExtensions?: readonly Extension[];
  readonly notBefore?: Date;
  readonly validityDays?: number;
}

export async function forgeCertificate(p: ForgeParams): Promise<X509Certificate> {
  const notBefore = p.notBefore ?? new Date(Math.floor(Date.now() / 1000) * 1000);
  const notAfter = new Date(notBefore.getTime() + (p.validityDays ?? 365) * 86_400_000);
  return X509CertificateGenerator.create({
    serialNumber: randomSerialNumber(),
    subject: toJsonName(p.subject),
    issuer: p.issuer.name instanceof Name ? p.issuer.name : toJsonName(p.issuer.name),
    notBefore,
    notAfter,
    publicKey: p.subjectPublicKey,
    signingKey: p.issuer.signingKey,
    signingAlgorithm: SIGNATURE_ALGORITHM,
    extensions: [...(await buildExtensions(p.profile, p.subjectPublicKey, p.issuer.publicKey)), ...(p.extraExtensions ?? [])],
  });
}
