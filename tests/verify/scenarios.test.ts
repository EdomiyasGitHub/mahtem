import { beforeAll, describe, expect, it } from 'vitest';
import { createLabHierarchy, type LabHierarchy } from '../../src/pki/index.ts';
import { SCENARIOS } from '../../src/scenarios/index.ts';
import { verifySignedBundle, type DocumentVerification } from '../../src/verify/index.ts';

const FAST = { root: 2048, ministry: 2048, university: 2048 } as const;
let h: LabHierarchy;
const results = new Map<string, DocumentVerification>();

beforeAll(async () => {
  h = await createLabHierarchy({ keySizes: FAST });
  for (const s of SCENARIOS) {
    const c = await s.build(h);
    results.set(s.id, await verifySignedBundle(c.bundle, c.trustStore));
  }
}, 120_000);

const statusOf = (r: DocumentVerification, id: string) => r.steps.find((s) => s.id === id)?.status;
const CHAIN_STEPS = ['signer-certificate', 'issuer-certificates', 'trust-anchor', 'validity'];

describe('every scenario reaches its expected verdict', () => {
  it.each(SCENARIOS.map((s) => [s.n, s.id, s] as const))('%i · %s', (_n, id, s) => {
    const r = results.get(id) as DocumentVerification;
    expect(r.verdict).toBe(s.expected.verdict);
    expect(r.firstFailure?.id).toBe(s.expected.failsAt);
    expect(r.firstFailure?.code).toBe(s.expected.code);

    // The document signature (check 3) and the chain (checks 4–7) are judged independently.
    expect(statusOf(r, 'document-signature')).toBe(s.expected.signatureValid ? 'pass' : 'fail');
    const chainOk = CHAIN_STEPS.every((id2) => statusOf(r, id2) === 'pass');
    expect(chainOk).toBe(s.expected.chainValid);
  });
});

describe('trace shape', () => {
  it('always has the seven checks, numbered 1–7, in order', () => {
    for (const r of results.values()) {
      expect(r.steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(r.digestBlocks).toHaveLength(8);
    }
  });

  it('a genuine diploma passes all seven checks along Root → Ministry → University', () => {
    const r = results.get('valid') as DocumentVerification;
    expect(r.steps.every((s) => s.status === 'pass')).toBe(true);
    expect(r.path.map((c) => c.subjectText.split('CN=')[1])).toEqual([
      'Abay Valley University Diploma Signing',
      'Demo MoE Issuing CA',
      'Demo National Root CA',
    ]);
  });

  it('tampering fails ONLY the content check: identity checks 4–7 still pass', () => {
    const r = results.get('tampered-document') as DocumentVerification;
    expect(r.steps.filter((s) => s.status === 'fail').map((s) => s.n)).toEqual([3]);
  });

  it('the rogue chain: every signature valid, yet rejected at the trust anchor, and named an impostor', () => {
    const r = results.get('rogue-root') as DocumentVerification;
    expect(r.steps.filter((s) => s.status === 'fail').map((s) => s.n)).toEqual([6]);
    const anchor = r.steps.find((s) => s.id === 'trust-anchor');
    expect(anchor?.details.map((d) => d.text).join(' ')).toMatch(/impostor/);
  });

  it('an unfamiliar-but-real root is untrusted, without being called an impostor', () => {
    const r = results.get('untrusted-root') as DocumentVerification;
    const anchor = r.steps.find((s) => s.id === 'trust-anchor');
    expect(anchor?.status).toBe('fail');
    expect(anchor?.details.map((d) => d.text).join(' ')).not.toMatch(/impostor/);
  });

  it('a pathlen violation is attributed to the Ministry', () => {
    const r = results.get('path-length-violation') as DocumentVerification;
    expect(r.firstFailure?.summary).toMatch(/Demo MoE Issuing CA.*pathlen:0/);
  });

  it('the University acting as a CA is attributed to the University', () => {
    const r = results.get('end-entity-as-ca') as DocumentVerification;
    expect(r.firstFailure?.summary).toMatch(/Abay Valley University Diploma Signing.*not a CA/);
  });
});
