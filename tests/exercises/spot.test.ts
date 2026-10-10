import { beforeAll, describe, expect, it } from 'vitest';
import { type SpotCase, correctAnswer, createRound, judge, runSignatureCheck } from '../../src/exercises/spot.ts';
import { hierarchyFromState } from '../../src/state/attacks.ts';
import { initialLabState, labReducer } from '../../src/state/lab.ts';
import { buildWholeLab } from '../../src/state/operations.ts';
import type { LabHierarchy } from '../../src/pki/index.ts';

let h: LabHierarchy;
let round: SpotCase[];

/** A small deterministic random source, so the test is repeatable. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

beforeAll(async () => {
  const b = await buildWholeLab({ root: 2048, ministry: 2048, university: 2048 });
  h = hierarchyFromState(labReducer(initialLabState, { type: 'lab-built', ...b.result, entries: b.entries }))!;
  round = await createRound(h, { random: seeded(42) });
}, 60_000);

describe('a round', () => {
  it('has six distinct cases, numbered in order, always including the genuine diploma', () => {
    expect(round.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6]);
    const ids = round.map((c) => c.run.scenario.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toContain('valid');
  });

  it('differs between rounds', async () => {
    const other = await createRound(h, { random: seeded(7) });
    expect(other.map((c) => c.run.scenario.id)).not.toEqual(round.map((c) => c.run.scenario.id));
  }, 30_000);

  it('gives students the verifier’s evidence: signer first, supplied certificates, own trust store', () => {
    for (const c of round) {
      expect(c.evidence.certificates[0]?.role).toBe('signer');
      expect(c.evidence.certificates.length).toBe(1 + c.run.built.bundle.intermediates.length);
      expect(c.evidence.trustStore.length).toBe(c.run.built.trustStore.anchors.length);
    }
  });
});

describe('scoring', () => {
  it('accepts exactly the right answer for every case', () => {
    for (const c of round) {
      const right = correctAnswer(c.run);
      expect(judge(c.run, right)).toBe(true);
      const wrongs = [{ verdict: 'genuine' as const }, ...([3, 4, 5, 6, 7] as const).map((check) => ({ verdict: 'fake' as const, check }))]
        .filter((a) => JSON.stringify(a) !== JSON.stringify(right));
      for (const w of wrongs) expect(judge(c.run, w), `${c.run.scenario.id}: ${JSON.stringify(w)}`).toBe(false);
    }
  });

  it('marks only the genuine diploma as genuine', () => {
    expect(round.filter((c) => correctAnswer(c.run).verdict === 'genuine').map((c) => c.run.scenario.id)).toEqual(['valid']);
  });
});

describe('the check 3 tool', () => {
  it('recomputes the signature check and agrees with the verifier', async () => {
    for (const c of round) {
      const step3 = c.run.result.steps.find((s) => s.n === 3)?.status === 'pass';
      expect(await runSignatureCheck(c.run), c.run.scenario.id).toBe(step3);
    }
  });
});
