/**
 * The lab's issuing operations, one per button on the lab bench.
 *
 * Each runs real cryptography and returns its result plus ledger entries
 * (what ran, on which engine, how long it took). No React here, so the whole
 * flow is testable in Node.
 */
import { type ModulusLength, chunkHex, describePublicKey, generateRsaKeyPair, sha256, sign, toHex } from '../crypto/index.ts';
import { type Diploma, encodeDiploma } from '../documents/diploma.ts';
import {
  type CertificateSummary,
  type CsrSummary,
  LAB_IDENTITIES,
  LAB_VALIDITY_DAYS,
  createCsr,
  createRootCertificate,
  describeCertificate,
  describeCsr,
  issueCertificate,
  type Pkcs10CertificateRequest,
  type X509Certificate,
} from '../pki/index.ts';

export type LedgerKind = 'real' | 'visual';

export interface LedgerEntry {
  readonly id: number;
  readonly at: Date;
  readonly title: string;
  readonly detail: string;
  readonly kind: LedgerKind;
  readonly ms?: number;
}

export interface RootParty {
  readonly keys: CryptoKeyPair;
  readonly certificate: X509Certificate;
  readonly summary: CertificateSummary;
}

export interface SubordinateParty {
  readonly keys: CryptoKeyPair;
  readonly csr: Pkcs10CertificateRequest;
  readonly csrSummary: CsrSummary;
  readonly certificate?: X509Certificate;
  readonly summary?: CertificateSummary;
}

export interface SignedDiploma {
  readonly diploma: Diploma;
  readonly document: Uint8Array;
  readonly signature: Uint8Array;
  readonly digest: Uint8Array;
  readonly digestBlocks: readonly string[];
}

export interface KeySizes {
  readonly root: ModulusLength;
  readonly ministry: ModulusLength;
  readonly university: ModulusLength;
}

export const LAB_KEY_SIZES: KeySizes = { root: 4096, ministry: 4096, university: 3072 };

let nextId = 1;
type Entry = Omit<LedgerEntry, 'id' | 'at'>;
const entry = (e: Entry): LedgerEntry => ({ ...e, id: nextId++, at: new Date() });

/** Create a ledger entry (shared with the chain view). */
export const makeEntry = entry;

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = performance.now();
  const value = await fn();
  return [value, Math.round(performance.now() - t0)];
}

export interface Step<T> {
  readonly result: T;
  readonly entries: readonly LedgerEntry[];
}

/** Course §11: openssl genrsa 4096 + openssl req -x509 -new -sha256 -days 3650 */
export async function createRoot(sizes: KeySizes = LAB_KEY_SIZES): Promise<Step<RootParty>> {
  const [keys, keyMs] = await timed(() => generateRsaKeyPair({ modulusLength: sizes.root }));
  const [certificate, certMs] = await timed(() =>
    createRootCertificate({ keys, subject: LAB_IDENTITIES.root, validityDays: LAB_VALIDITY_DAYS.root }),
  );
  const summary = await describeCertificate(certificate);
  return {
    result: { keys, certificate, summary },
    entries: [
      entry({ kind: 'real', title: `RSA-${sizes.root} key pair generated`, detail: 'Root CA; private key is non-extractable', ms: keyMs }),
      entry({ kind: 'real', title: 'Self-signed root certificate created', detail: 'Signed with its own private key (sha256WithRSAEncryption)', ms: certMs }),
    ],
  };
}

async function request(subject: (typeof LAB_IDENTITIES)['ministry' | 'university'], bits: ModulusLength, who: string): Promise<Step<SubordinateParty>> {
  const [keys, keyMs] = await timed(() => generateRsaKeyPair({ modulusLength: bits }));
  const [csr, csrMs] = await timed(() => createCsr({ keys, subject }));
  const csrSummary = await describeCsr(csr);
  return {
    result: { keys, csr, csrSummary },
    entries: [
      entry({ kind: 'real', title: `RSA-${bits} key pair generated`, detail: `${who}; its own key, never shared`, ms: keyMs }),
      entry({ kind: 'real', title: 'Certificate signing request created', detail: `${who}; signed with its own key (proof of possession)`, ms: csrMs }),
    ],
  };
}

/** Course §14–15: openssl genrsa + openssl req -new -sha256 -subj ... */
export const requestMinistry = (sizes: KeySizes = LAB_KEY_SIZES) => request(LAB_IDENTITIES.ministry, sizes.ministry, 'Ministry of Education CA');

/** Course §25 (extension): the University's own key and CSR */
export const requestUniversity = (sizes: KeySizes = LAB_KEY_SIZES) => request(LAB_IDENTITIES.university, sizes.university, 'Abay Valley University');

async function certify(
  subject: SubordinateParty,
  issuer: { keys: CryptoKeyPair; certificate: X509Certificate },
  profile: 'intermediate-ca' | 'document-signer',
  validityDays: number,
  issuerName: string,
  subjectName: string,
): Promise<Step<SubordinateParty>> {
  const [certificate, ms] = await timed(() => issueCertificate({ csr: subject.csr, issuer, profile, validityDays }));
  const summary = await describeCertificate(certificate);
  return {
    result: { ...subject, certificate, summary },
    entries: [
      entry({ kind: 'real', title: 'Proof of possession checked', detail: `${subjectName}’s CSR signature verified` }),
      entry({ kind: 'real', title: 'Certificate issued', detail: `${issuerName} signed ${subjectName}’s certificate with its private key`, ms }),
      // Stage 5 adds 'visual' entries when the chain diagram actually draws each trust edge.
    ],
  };
}

/** Course §17: openssl x509 -req -CA rootCA-cert.pem -CAkey rootCA-key.pem -days 1825 -extfile intermediate-ext.cnf */
export const certifyMinistry = (ministry: SubordinateParty, root: RootParty) =>
  certify(ministry, root, 'intermediate-ca', LAB_VALIDITY_DAYS.ministry, 'Root CA', 'Ministry');

/** Extension of course §25: the Ministry certifies the University (CA:FALSE) */
export function certifyUniversity(university: SubordinateParty, ministry: SubordinateParty): Promise<Step<SubordinateParty>> {
  if (!ministry.certificate) throw new Error('The Ministry has no certificate yet.');
  return certify(university, { keys: ministry.keys, certificate: ministry.certificate }, 'document-signer', LAB_VALIDITY_DAYS.university, 'Ministry', 'University');
}

/** Course §4, §21: openssl dgst -sha256 -sign university-key.pem -out diploma.sig diploma.json */
export async function signDiploma(university: SubordinateParty, diploma: Diploma): Promise<Step<SignedDiploma>> {
  const document = encodeDiploma(diploma);
  const digest = await sha256(document);
  const [signature, ms] = await timed(() => sign(university.keys.privateKey, document));
  const key = await describePublicKey(university.keys.publicKey);
  return {
    result: { diploma, document, signature, digest, digestBlocks: chunkHex(toHex(digest)) },
    entries: [
      entry({ kind: 'real', title: 'Diploma hashed', detail: `SHA-256 over ${document.byteLength} bytes` }),
      entry({ kind: 'real', title: 'Diploma signed', detail: `University private key (RSA-${key.modulusLength}); ${signature.byteLength}-byte signature`, ms }),
    ],
  };
}

/** Shortcut for demonstrations: the bench's first three stages in one go, same operations, same order. */
export async function buildWholeLab(sizes: KeySizes = LAB_KEY_SIZES): Promise<Step<{ root: RootParty; ministry: SubordinateParty; university: SubordinateParty }>> {
  const r = await createRoot(sizes);
  const mReq = await requestMinistry(sizes);
  const m = await certifyMinistry(mReq.result, r.result);
  const uReq = await requestUniversity(sizes);
  const u = await certifyUniversity(uReq.result, m.result);
  return {
    result: { root: r.result, ministry: m.result, university: u.result },
    entries: [...r.entries, ...mReq.entries, ...m.entries, ...uReq.entries, ...u.entries],
  };
}
