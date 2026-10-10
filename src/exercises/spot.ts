/**
 * "Spot the fake": a round of unlabelled cases drawn from the ten scenarios.
 *
 * Students see what a real verifier has: the document, the certificates that
 * came with it, and their own trust store. Identity attacks can be deduced
 * from the certificates; content attacks need the one tool offered, check 3,
 * which is recomputed for real when used.
 */
import { SIGNATURE_ALGORITHM, verify } from '../crypto/index.ts';
import { type Diploma, tryDecodeDiploma } from '../documents/diploma.ts';
import { shuffle } from '../learn/shuffle.ts';
import { type CertificateSummary, type LabHierarchy, describeCertificate } from '../pki/index.ts';
import { SCENARIOS, type ScenarioId } from '../scenarios/index.ts';
import { type AttackRun, runScenario } from '../state/attacks.ts';

export interface CaseEvidence {
  readonly diploma: Diploma | null;
  /** The signer's certificate first, then the certificates supplied with it, in the order sent. */
  readonly certificates: ReadonlyArray<{ readonly role: 'signer' | 'supplied'; readonly summary: CertificateSummary }>;
  readonly trustStore: readonly CertificateSummary[];
}

export interface SpotCase {
  readonly n: number;
  readonly run: AttackRun;
  readonly evidence: CaseEvidence;
}

export type FailingCheck = 3 | 4 | 5 | 6 | 7;
export type SpotAnswer = { readonly verdict: 'genuine' } | { readonly verdict: 'fake'; readonly check: FailingCheck };

export const CHECK_NAMES: Readonly<Record<FailingCheck, string>> = {
  3: 'check 3: the signature',
  4: 'check 4: the signer certificate',
  5: 'check 5: the issuer certificates',
  6: 'check 6: the trust anchor',
  7: 'check 7: the validity dates',
};

async function evidenceOf(run: AttackRun): Promise<CaseEvidence> {
  const { bundle, trustStore } = run.built;
  return {
    diploma: tryDecodeDiploma(bundle.document),
    certificates: [
      { role: 'signer', summary: await describeCertificate(bundle.signer) },
      ...(await Promise.all(bundle.intermediates.map(async (c) => ({ role: 'supplied' as const, summary: await describeCertificate(c) })))),
    ],
    trustStore: await Promise.all(trustStore.anchors.map(describeCertificate)),
  };
}

/** A round of `size` cases: always the genuine diploma, plus random attacks, in random order. */
export async function createRound(h: LabHierarchy, options: { size?: number; random?: () => number } = {}): Promise<SpotCase[]> {
  const size = Math.min(Math.max(options.size ?? 6, 2), SCENARIOS.length);
  const random = options.random ?? Math.random;
  const attacks = shuffle(SCENARIOS.map((s) => s.id).filter((id) => id !== 'valid'), random).slice(0, size - 1);
  const ids: ScenarioId[] = shuffle(['valid', ...attacks], random);
  const cases: SpotCase[] = [];
  for (const [i, id] of ids.entries()) {
    const run = await runScenario(h, id);
    cases.push({ n: i + 1, run, evidence: await evidenceOf(run) });
  }
  return cases;
}

/** The correct answer for a case, from the verifier's real result. */
export function correctAnswer(run: AttackRun): SpotAnswer {
  const f = run.result.firstFailure;
  return run.result.verdict === 'verified' || !f ? { verdict: 'genuine' } : { verdict: 'fake', check: f.n as FailingCheck };
}

export function answerText(a: SpotAnswer): string {
  return a.verdict === 'genuine' ? 'Genuine' : `Fake, caught by ${CHECK_NAMES[a.check]}`;
}

export function judge(run: AttackRun, answer: SpotAnswer): boolean {
  const right = correctAnswer(run);
  return right.verdict === answer.verdict && (right.verdict === 'genuine' || (answer.verdict === 'fake' && right.check === answer.check));
}

/** The one tool students get: check 3, computed for real from the case's files. */
export async function runSignatureCheck(run: AttackRun): Promise<boolean> {
  const { bundle } = run.built;
  try {
    const key = await bundle.signer.publicKey.export(SIGNATURE_ALGORITHM, ['verify']);
    return await verify(key, bundle.signature, bundle.document);
  } catch {
    return false;
  }
}
