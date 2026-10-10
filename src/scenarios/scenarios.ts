/**
 * The lab's verification scenarios: one success and nine controlled failures.
 *
 * Each scenario builds a real bundle (document, signature, certificates) and
 * the verifier's trust store from the lab hierarchy, and states what a correct
 * verifier must conclude. Tests check that the app's verifier AND OpenSSL
 * both reach that conclusion.
 */
import { type ModulusLength, generateRsaKeyPair, sign } from '../crypto/index.ts';
import { forgeCertificate } from '../attacks/forge.ts';
import { SAMPLE_DIPLOMA, encodeDiploma, type Diploma } from '../documents/diploma.ts';
import {
  LAB_IDENTITIES,
  createCsr,
  createRootCertificate,
  issueCertificate,
  type LabHierarchy,
} from '../pki/index.ts';
import { type SignedBundle, type TrustStore, createTrustStore } from '../verify/bundle.ts';
import type { FailureCode } from '../verify/path.ts';
import type { StepId } from '../verify/document.ts';

export type ScenarioId =
  | 'valid'
  | 'tampered-document'
  | 'signature-swap'
  | 'wrong-signer-key'
  | 'rogue-root'
  | 'missing-intermediate'
  | 'path-length-violation'
  | 'end-entity-as-ca'
  | 'expired-certificate'
  | 'untrusted-root';

export interface ScenarioCase {
  readonly bundle: SignedBundle;
  readonly trustStore: TrustStore;
}

export interface Scenario {
  readonly id: ScenarioId;
  readonly n: number;
  readonly title: string;
  /** What happened, in one or two sentences. */
  readonly story: string;
  /** The principle it demonstrates. */
  readonly lesson: string;
  /** Course section it comes from, or "extension". */
  readonly provenance: string;
  readonly expected: {
    readonly verdict: 'verified' | 'failed';
    readonly failsAt?: StepId;
    readonly code?: FailureCode;
    /** Expected `openssl dgst -verify` result for the document signature. */
    readonly signatureValid: boolean;
    /** Expected `openssl verify` result for the certificate chain. */
    readonly chainValid: boolean;
  };
  readonly build: (h: LabHierarchy, options?: BuildOptions) => Promise<ScenarioCase>;
}

export interface BuildOptions {
  /** Key size for keys the scenarios create (attackers, other institutions). Default 2048. */
  readonly extraKeySize?: ModulusLength;
}

const FORGED: Diploma = { ...SAMPLE_DIPLOMA, cgpa: '3.92' };

async function signed(keys: CryptoKeyPair, d: Diploma): Promise<{ document: Uint8Array; signature: Uint8Array }> {
  const document = encodeDiploma(d);
  return { document, signature: await sign(keys.privateKey, document) };
}

const realTrust = (h: LabHierarchy) => createTrustStore([h.root.certificate]);
const keysOf = (o?: BuildOptions) => generateRsaKeyPair({ modulusLength: o?.extraKeySize ?? 2048 });

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'valid', n: 1, title: 'Genuine diploma',
    story: 'Abay Valley University signs Hana’s diploma. Nothing is changed.',
    lesson: 'A valid signature plus a chain to a trusted root proves who issued the document and that it is unchanged.',
    provenance: 'course §21–22',
    expected: { verdict: 'verified', signatureValid: true, chainValid: true },
    build: async (h) => ({
      bundle: { ...(await signed(h.university.keys, SAMPLE_DIPLOMA)), signer: h.university.certificate, intermediates: [h.ministry.certificate] },
      trustStore: realTrust(h),
    }),
  },
  {
    id: 'tampered-document', n: 2, title: 'One character changed',
    story: 'After signing, someone edits the CGPA from 3.12 to 3.92 and keeps the original signature.',
    lesson: 'The identity checks still pass. Only the content check fails: the digest changed, so the signature no longer matches.',
    provenance: 'course §5–6',
    expected: { verdict: 'failed', failsAt: 'document-signature', code: 'document-signature-invalid', signatureValid: false, chainValid: true },
    build: async (h) => {
      const genuine = await signed(h.university.keys, SAMPLE_DIPLOMA);
      return {
        bundle: { document: encodeDiploma(FORGED), signature: genuine.signature, signer: h.university.certificate, intermediates: [h.ministry.certificate] },
        trustStore: realTrust(h),
      };
    },
  },
  {
    id: 'signature-swap', n: 3, title: 'Signature copied from another diploma',
    story: 'A genuine signature from another student’s diploma is attached to a forged one.',
    lesson: 'A signature belongs to exactly one document. It cannot be moved, even between documents from the same signer.',
    provenance: 'extension of course §5',
    expected: { verdict: 'failed', failsAt: 'document-signature', code: 'document-signature-invalid', signatureValid: false, chainValid: true },
    build: async (h) => {
      const other = await signed(h.university.keys, {
        ...SAMPLE_DIPLOMA, diplomaId: 'AVU-2026-0311', studentName: 'Dawit Alemu', studentNameAmharic: 'ዳዊት አለሙ', cgpa: '3.85',
      });
      return {
        bundle: { document: encodeDiploma(FORGED), signature: other.signature, signer: h.university.certificate, intermediates: [h.ministry.certificate] },
        trustStore: realTrust(h),
      };
    },
  },
  {
    id: 'wrong-signer-key', n: 4, title: 'Signed by a different institution',
    story: 'Entoto College (fictional), genuinely certified by the Ministry, signs the diploma with its own key but attaches Abay Valley’s certificate.',
    lesson: 'The certificate says whose public key it is. A signature made with any other private key fails against it.',
    provenance: 'course §26',
    expected: { verdict: 'failed', failsAt: 'document-signature', code: 'document-signature-invalid', signatureValid: false, chainValid: true },
    build: async (h, o) => {
      const collegeKeys = await keysOf(o);
      await issueCertificate({
        csr: await createCsr({ keys: collegeKeys, subject: { C: 'ET', O: 'Entoto College (fictional)', CN: 'Entoto College Diploma Signing' } }),
        issuer: h.ministry, profile: 'document-signer', validityDays: 365,
      });
      return {
        bundle: { ...(await signed(collegeKeys, SAMPLE_DIPLOMA)), signer: h.university.certificate, intermediates: [h.ministry.certificate] },
        trustStore: realTrust(h),
      };
    },
  },
  {
    id: 'rogue-root', n: 5, title: 'Rogue university under an impostor root',
    story: 'An attacker builds a complete look-alike hierarchy: a root with exactly the National Root’s name, a fake Ministry and a fake “Abay Valley University”, and includes all three in the bundle.',
    lesson: 'Every signature checks out mathematically, yet the document is worthless. Trust comes from the verifier’s trust store, never from names or from certificates the sender supplies.',
    provenance: 'course §21 (“How do we know this public key belongs to the college?”)',
    expected: { verdict: 'failed', failsAt: 'trust-anchor', code: 'untrusted-root', signatureValid: true, chainValid: false },
    build: async (h, o) => {
      const rootKeys = await keysOf(o);
      const fakeRoot = { keys: rootKeys, certificate: await createRootCertificate({ keys: rootKeys, subject: LAB_IDENTITIES.root }) };
      const ministryKeys = await keysOf(o);
      const fakeMinistry = {
        keys: ministryKeys,
        certificate: await issueCertificate({
          csr: await createCsr({ keys: ministryKeys, subject: LAB_IDENTITIES.ministry }), issuer: fakeRoot, profile: 'intermediate-ca', validityDays: 1825,
        }),
      };
      const uniKeys = await keysOf(o);
      const fakeUniversity = await issueCertificate({
        csr: await createCsr({ keys: uniKeys, subject: LAB_IDENTITIES.university }), issuer: fakeMinistry, profile: 'document-signer', validityDays: 730,
      });
      return {
        bundle: { ...(await signed(uniKeys, FORGED)), signer: fakeUniversity, intermediates: [fakeMinistry.certificate, fakeRoot.certificate] },
        trustStore: realTrust(h),
      };
    },
  },
  {
    id: 'missing-intermediate', n: 6, title: 'Broken chain: Ministry certificate missing',
    story: 'The diploma is genuine, but the sender leaves out the Ministry’s certificate.',
    lesson: 'Without the intermediate, nothing links the University to the root. The verifier cannot assume the gap away.',
    provenance: 'course §19, §22',
    expected: { verdict: 'failed', failsAt: 'signer-certificate', code: 'chain-incomplete', signatureValid: true, chainValid: false },
    build: async (h) => ({
      bundle: { ...(await signed(h.university.keys, SAMPLE_DIPLOMA)), signer: h.university.certificate, intermediates: [] },
      trustStore: realTrust(h),
    }),
  },
  {
    id: 'path-length-violation', n: 7, title: 'Ministry exceeds pathlen:0',
    story: 'Someone with the Ministry’s key creates a “Regional Education Bureau” sub-CA, which certifies a university. The lab’s CA software refuses this, so it is forged.',
    lesson: 'pathlen:0 means the Ministry may certify end entities only. A CA below it voids the chain, however valid each signature is.',
    provenance: 'course §16',
    expected: { verdict: 'failed', failsAt: 'issuer-certificates', code: 'path-length-exceeded', signatureValid: true, chainValid: false },
    build: async (h, o) => {
      const bureauKeys = await keysOf(o);
      const bureau = await forgeCertificate({
        subject: { C: 'ET', O: 'Mahtem Lab', OU: 'Regional Education Bureau (simulated)', CN: 'Demo Regional Bureau CA' },
        subjectPublicKey: bureauKeys.publicKey,
        issuer: { name: h.ministry.certificate.subjectName, publicKey: h.ministry.certificate.publicKey, signingKey: h.ministry.keys.privateKey },
        profile: 'intermediate-ca', validityDays: 365,
      });
      const uniKeys = await keysOf(o);
      const uni = await issueCertificate({
        csr: await createCsr({ keys: uniKeys, subject: LAB_IDENTITIES.university }),
        issuer: { certificate: bureau, keys: bureauKeys }, profile: 'document-signer', validityDays: 300,
      });
      return {
        bundle: { ...(await signed(uniKeys, SAMPLE_DIPLOMA)), signer: uni, intermediates: [bureau, h.ministry.certificate] },
        trustStore: realTrust(h),
      };
    },
  },
  {
    id: 'end-entity-as-ca', n: 8, title: 'University acts as a CA',
    story: 'The University uses its signing key to certify a “Faculty of Informatics”, which then signs the diploma.',
    lesson: 'CA:FALSE means the University may sign documents but never certificates. Its key cannot delegate trust.',
    provenance: 'course §16 (CA:TRUE / CA:FALSE), extension',
    expected: { verdict: 'failed', failsAt: 'issuer-certificates', code: 'issuer-not-ca', signatureValid: true, chainValid: false },
    build: async (h, o) => {
      const facultyKeys = await keysOf(o);
      const faculty = await forgeCertificate({
        subject: { C: 'ET', O: 'Abay Valley University', OU: 'Faculty of Informatics', CN: 'Faculty of Informatics Diploma Signing' },
        subjectPublicKey: facultyKeys.publicKey,
        issuer: { name: h.university.certificate.subjectName, publicKey: h.university.certificate.publicKey, signingKey: h.university.keys.privateKey },
        profile: 'document-signer', validityDays: 365,
      });
      return {
        bundle: { ...(await signed(facultyKeys, SAMPLE_DIPLOMA)), signer: faculty, intermediates: [h.university.certificate, h.ministry.certificate] },
        trustStore: realTrust(h),
      };
    },
  },
  {
    id: 'expired-certificate', n: 9, title: 'Signer certificate expired',
    story: 'The University’s previous certificate expired at the end of 2024, but its key is still used to sign.',
    lesson: 'An expired certificate no longer vouches for its key. Real systems add trusted timestamps to prove a signature was made while the certificate was valid.',
    provenance: 'course §12 (-dates), extension',
    expected: { verdict: 'failed', failsAt: 'validity', code: 'expired', signatureValid: true, chainValid: false },
    build: async (h, o) => {
      const oldKeys = await keysOf(o);
      const old = await issueCertificate({
        csr: await createCsr({ keys: oldKeys, subject: LAB_IDENTITIES.university }),
        issuer: h.ministry, profile: 'document-signer', validityDays: 365, notBefore: new Date('2024-01-01T00:00:00Z'),
      });
      return {
        bundle: { ...(await signed(oldKeys, SAMPLE_DIPLOMA)), signer: old, intermediates: [h.ministry.certificate] },
        trustStore: realTrust(h),
      };
    },
  },
  {
    id: 'untrusted-root', n: 10, title: 'Verifier does not trust this root',
    story: 'A genuine diploma, sent with its complete chain including the real root, checked by a verifier abroad whose trust store holds a different national root.',
    lesson: 'Trust is the verifier’s decision. Even the real root is just another certificate until the verifier chooses to install it.',
    provenance: 'course §10, §28',
    expected: { verdict: 'failed', failsAt: 'trust-anchor', code: 'untrusted-root', signatureValid: true, chainValid: false },
    build: async (h, o) => {
      const otherKeys = await keysOf(o);
      const otherRoot = await createRootCertificate({ keys: otherKeys, subject: { C: 'KE', O: 'Mahtem Lab', CN: 'Other Country Root CA (simulated)' } });
      return {
        bundle: { ...(await signed(h.university.keys, SAMPLE_DIPLOMA)), signer: h.university.certificate, intermediates: [h.ministry.certificate, h.root.certificate] },
        trustStore: createTrustStore([otherRoot]),
      };
    },
  },
];

export function scenarioById(id: ScenarioId): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  return s;
}
