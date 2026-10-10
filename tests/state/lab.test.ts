import { describe, expect, it } from 'vitest';
import { SAMPLE_DIPLOMA } from '../../src/documents/diploma.ts';
import { currentStage, initialLabState, labReducer, type LabState } from '../../src/state/lab.ts';
import {
  certifyMinistry,
  certifyUniversity,
  createRoot,
  requestMinistry,
  requestUniversity,
  signDiploma,
  type KeySizes,
} from '../../src/state/operations.ts';
import { createTrustStore, verifySignedBundle } from '../../src/verify/index.ts';

const FAST: KeySizes = { root: 2048, ministry: 2048, university: 2048 };

describe('the lab bench flow, step by step (course order)', () => {
  it('walks through every stage and produces a diploma the verifier accepts', async () => {
    let s: LabState = initialLabState;
    expect(currentStage(s)).toBe('root');

    const root = await createRoot(FAST);
    s = labReducer(s, { type: 'root-created', root: root.result, entries: root.entries });
    expect(currentStage(s)).toBe('ministry-request');
    expect(s.root?.summary.selfIssued).toBe(true);

    const mReq = await requestMinistry(FAST);
    s = labReducer(s, { type: 'ministry-updated', ministry: mReq.result, entries: mReq.entries });
    expect(currentStage(s)).toBe('ministry-certify');
    expect(s.ministry?.csrSummary.signatureValid).toBe(true);

    const mCert = await certifyMinistry(s.ministry!, s.root!);
    s = labReducer(s, { type: 'ministry-updated', ministry: mCert.result, entries: mCert.entries });
    expect(s.ministry?.summary?.basicConstraints).toEqual({ critical: true, ca: true, pathLength: 0 });

    const uReq = await requestUniversity(FAST);
    s = labReducer(s, { type: 'university-updated', university: uReq.result, entries: uReq.entries });
    const uCert = await certifyUniversity(s.university!, s.ministry!);
    s = labReducer(s, { type: 'university-updated', university: uCert.result, entries: uCert.entries });
    expect(s.university?.summary?.basicConstraints?.ca).toBe(false);

    const signed = await signDiploma(s.university!, SAMPLE_DIPLOMA);
    s = labReducer(s, { type: 'diploma-signed', signed: signed.result, entries: signed.entries });
    expect(currentStage(s)).toBe('done');
    expect(s.signed?.digestBlocks).toHaveLength(8);

    // Hand-off: a stranger who trusts only the root accepts it.
    const r = await verifySignedBundle(
      { document: s.signed!.document, signature: s.signed!.signature, signer: s.university!.certificate!, intermediates: [s.ministry!.certificate!] },
      createTrustStore([s.root!.certificate]),
    );
    expect(r.verdict).toBe('verified');

    // Ledger: newest first; real operations carry timings.
    expect(s.ledger[0]?.title).toBe('Diploma signed');
    expect(s.ledger.filter((e) => e.kind === 'real' && e.title.startsWith('RSA-')).length).toBe(3);
    // No 'visual' entries until something is actually drawn (Stage 5 chain diagram).
    expect(s.ledger.some((e) => e.kind === 'visual')).toBe(false);

    expect(labReducer(s, { type: 'reset' })).toEqual(initialLabState);
  }, 60_000);

  it('records failures without losing earlier progress', () => {
    const s = labReducer({ ...initialLabState, busy: 'root' }, { type: 'failed', task: 'root', message: 'boom' });
    expect(s).toMatchObject({ busy: null, error: { task: 'root', message: 'boom' } });
  });

  it('caps the ledger at 200 entries', () => {
    let s: LabState = initialLabState;
    const many = Array.from({ length: 250 }, (_, i) => ({ id: i, at: new Date(), title: `e${i}`, detail: '', kind: 'real' as const }));
    s = labReducer(s, { type: 'diploma-signed', signed: null as never, entries: many });
    expect(s.ledger).toHaveLength(200);
  });
});
