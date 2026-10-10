import { beforeAll, describe, expect, it } from 'vitest';
import { SCENARIOS } from '../../src/scenarios/index.ts';
import { type AttackRun, hierarchyFromState, runScenario } from '../../src/state/attacks.ts';
import { initialLabState, labReducer, type LabState } from '../../src/state/lab.ts';
import { buildWholeLab } from '../../src/state/operations.ts';

const FAST = { root: 2048, ministry: 2048, university: 2048 } as const;
let lab: LabState;
const runs = new Map<string, AttackRun>();

beforeAll(async () => {
  const built = await buildWholeLab(FAST);
  lab = labReducer(initialLabState, { type: 'lab-built', ...built.result, entries: built.entries });
  const h = hierarchyFromState(lab);
  if (!h) throw new Error('lab not built');
  for (const s of SCENARIOS) runs.set(s.id, await runScenario(h, s.id));
}, 120_000);

describe('the whole-lab shortcut', () => {
  it('produces the same hierarchy the bench builds, ready for the diploma step', () => {
    expect(lab.root?.summary.selfIssued).toBe(true);
    expect(lab.ministry?.summary?.basicConstraints).toEqual({ critical: true, ca: true, pathLength: 0 });
    expect(lab.university?.summary?.basicConstraints?.ca).toBe(false);
    expect(lab.signed).toBeNull();
    expect(lab.ledger.filter((e) => e.title === 'Certificate issued')).toHaveLength(2);
  });

  it('needs Root, Ministry and University before scenarios can run', () => {
    expect(hierarchyFromState(initialLabState)).toBeNull();
    expect(hierarchyFromState({ ...lab, university: null })).toBeNull();
  });
});

describe('running every scenario against the lab’s own hierarchy', () => {
  it.each(SCENARIOS.map((s) => [s.n, s.id] as const))('%i · %s matches its expected verdict', (_n, id) => {
    expect(runs.get(id)?.matchesExpectation).toBe(true);
  });
});

describe('path findings say which certificate broke which rule', () => {
  const status = (id: string) => runs.get(id)?.result.pathStatus;
  const cnAt = (id: string, i: number) => runs.get(id)?.result.path[i]?.subject.find((a) => a.type === 'CN')?.value;

  it('genuine: anchored, no findings', () => {
    expect(status('valid')).toMatchObject({ stop: 'anchored', missingIssuer: null, findings: [] });
  });
  it('pathlen violation: the Ministry (index 2) is at fault', () => {
    const f = status('path-length-violation')?.findings ?? [];
    expect(f.map((x) => [x.index, x.code])).toEqual([[2, 'path-length-exceeded']]);
    expect(cnAt('path-length-violation', 2)).toBe('Demo MoE Issuing CA');
  });
  it('university as CA: two rules broken, by two certificates', () => {
    // 1. The University (index 1) is CA:FALSE without keyCertSign, yet it certified the faculty.
    // 2. Because it sits in an issuing position, the Ministry (index 2) now has a CA-like certificate
    //    below it, which its pathlen:0 forbids (RFC 5280 counts every intermediate in the path).
    const f = status('end-entity-as-ca')?.findings ?? [];
    expect(f.map((x) => [x.index, x.code])).toEqual([
      [1, 'issuer-not-ca'],
      [1, 'key-usage-not-allowed'],
      [2, 'path-length-exceeded'],
    ]);
    expect(cnAt('end-entity-as-ca', 1)).toBe('Abay Valley University Diploma Signing');
    expect(runs.get('end-entity-as-ca')?.result.firstFailure?.code).toBe('issuer-not-ca'); // the verdict still leads with the first
  });
  it('expired: the signer (index 0) is at fault', () => {
    expect(status('expired-certificate')?.findings.map((x) => [x.index, x.code])).toEqual([[0, 'expired']]);
  });
  it('missing intermediate: the chain breaks at the signer, naming the missing issuer', () => {
    expect(status('missing-intermediate')).toMatchObject({ stop: 'issuer-not-found' });
    expect(status('missing-intermediate')?.missingIssuer).toMatch(/CN=Demo MoE Issuing CA/);
  });
  it('rogue root: ends at an untrusted self-signed root, with no rule broken on the way', () => {
    expect(status('rogue-root')).toMatchObject({ stop: 'untrusted-self-signed', findings: [] });
    expect(runs.get('rogue-root')?.result.path).toHaveLength(3);
  });
  it('content attacks leave the path intact', () => {
    for (const id of ['tampered-document', 'signature-swap', 'wrong-signer-key']) {
      expect(status(id)).toMatchObject({ stop: 'anchored', findings: [] });
    }
  });
});
