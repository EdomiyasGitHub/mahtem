/**
 * The lab's complete trust hierarchy, built in the course's order:
 *
 *   Demo National Root CA        RSA-4096, self-signed, 10 years      (course §10–11)
 *        │ signs
 *        ▼
 *   Demo MoE Issuing CA          RSA-4096, CSR → Root, pathlen:0, 5 y (course §13–17)
 *        │ signs
 *        ▼
 *   Abay Valley University       RSA-3072, CSR → Ministry, 2 years    (course §25, extension)
 *        │ signs (Stage 4)
 *        ▼
 *   Diploma
 */
import { type ModulusLength, generateRsaKeyPair } from '../crypto/index.ts';
import { type CertificateAuthority, createRootCertificate, issueCertificate } from './ca.ts';
import { createCsr } from './csr.ts';
import { LAB_IDENTITIES } from './names.ts';
import { certificateToPem, csrToPem } from './pem.ts';
import type { Pkcs10CertificateRequest, X509Certificate } from './x509.ts';

export interface LabParty extends CertificateAuthority {
  readonly csr?: Pkcs10CertificateRequest;
}

export interface LabHierarchy {
  readonly root: LabParty;
  readonly ministry: LabParty & { readonly csr: Pkcs10CertificateRequest };
  readonly university: LabParty & { readonly csr: Pkcs10CertificateRequest };
}

export const LAB_VALIDITY_DAYS = { root: 3650, ministry: 1825, university: 730 } as const;

export interface HierarchyOptions {
  /** Defaults: 4096 / 4096 / 3072. Tests may use 2048 for speed. */
  readonly keySizes?: { root: ModulusLength; ministry: ModulusLength; university: ModulusLength };
}

export async function createLabHierarchy(options: HierarchyOptions = {}): Promise<LabHierarchy> {
  const sizes = options.keySizes ?? { root: 4096, ministry: 4096, university: 3072 };

  const rootKeys = await generateRsaKeyPair({ modulusLength: sizes.root });
  const rootCert = await createRootCertificate({ keys: rootKeys, subject: LAB_IDENTITIES.root, validityDays: LAB_VALIDITY_DAYS.root });
  const root = { keys: rootKeys, certificate: rootCert };

  const ministryKeys = await generateRsaKeyPair({ modulusLength: sizes.ministry });
  const ministryCsr = await createCsr({ keys: ministryKeys, subject: LAB_IDENTITIES.ministry });
  const ministryCert = await issueCertificate({
    csr: ministryCsr,
    issuer: root,
    profile: 'intermediate-ca',
    validityDays: LAB_VALIDITY_DAYS.ministry,
  });
  const ministry = { keys: ministryKeys, csr: ministryCsr, certificate: ministryCert };

  const universityKeys = await generateRsaKeyPair({ modulusLength: sizes.university });
  const universityCsr = await createCsr({ keys: universityKeys, subject: LAB_IDENTITIES.university });
  const universityCert = await issueCertificate({
    csr: universityCsr,
    issuer: ministry,
    profile: 'document-signer',
    validityDays: LAB_VALIDITY_DAYS.university,
  });

  return { root, ministry, university: { keys: universityKeys, csr: universityCsr, certificate: universityCert } };
}

/** Public files of the hierarchy, named as in the course (§11, §15, §17). Never includes private keys. */
export function hierarchyPublicFiles(h: LabHierarchy): Record<string, string> {
  const pem = (c: X509Certificate) => certificateToPem(c);
  return {
    'rootCA-cert.pem': pem(h.root.certificate),
    'intermediateCA.csr': csrToPem(h.ministry.csr),
    'intermediateCA-cert.pem': pem(h.ministry.certificate),
    'university.csr': csrToPem(h.university.csr),
    'university-cert.pem': pem(h.university.certificate),
  };
}
