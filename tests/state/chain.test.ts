import { beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_DIPLOMA } from '../../src/documents/diploma.ts';
import { createLabHierarchy, explainExtensions } from '../../src/pki/index.ts';
import { checkChainEdges, edgeDrawnEntry } from '../../src/state/chain.ts';
import { initialLabState, labReducer, type LabState } from '../../src/state/lab.ts';
import { certifyMinistry, certifyUniversity, createRoot, requestMinistry, requestUniversity, signDiploma } from '../../src/state/operations.ts';

const FAST = { root: 2048, ministry: 2048, university: 2048 } as const;
let full: LabState;

beforeAll(async () => {
  const root = (await createRoot(FAST)).result;
  const ministry = (await certifyMinistry((await requestMinistry(FAST)).result, root)).result;
  const university = (await certifyUniversity((await requestUniversity(FAST)).result, ministry)).result;
  const signed = (await signDiploma(university, SAMPLE_DIPLOMA)).result;
  full = { ...initialLabState, root, ministry, university, signed };
}, 60_000);

describe('chain edges', () => {
  it('checks nothing before anything exists', async () => {
    expect(await checkChainEdges(initialLabState)).toEqual([]);
  });

  it('verifies every edge of a complete lab: names, key identifiers and signatures', async () => {
    const edges = await checkChainEdges(full);
    expect(edges.map((e) => [e.key, e.verified])).toEqual([
      ['root-self', true], ['root-ministry', true], ['ministry-university', true], ['university-diploma', true],
    ]);
    expect(edges.filter((e) => e.key !== 'university-diploma').every((e) => e.nameMatches && e.keyIdMatches)).toBe(true);
  });

  it('only checks edges whose two ends exist', async () => {
    const partial = { ...full, university: null, signed: null };
    expect((await checkChainEdges(partial)).map((e) => e.key)).toEqual(['root-self', 'root-ministry']);
  });

  it('refuses to draw a diploma edge when the diploma bytes no longer match', async () => {
    const doc = full.signed!.document.slice();
    doc[10] = (doc[10] ?? 0) ^ 1;
    const edges = await checkChainEdges({ ...full, signed: { ...full.signed!, document: doc } });
    expect(edges.find((e) => e.key === 'university-diploma')?.verified).toBe(false);
  });

  it('refuses to draw Root → Ministry when the Ministry was certified by a different root', async () => {
    const other = await createLabHierarchy({ keySizes: FAST });
    const edges = await checkChainEdges({ ...full, ministry: { ...full.ministry!, certificate: other.ministry.certificate } });
    const e = edges.find((x) => x.key === 'root-ministry');
    expect(e?.verified).toBe(false);
    expect(e?.nameMatches).toBe(true); // same name on purpose: names prove nothing
  }, 30_000);
});

describe('edge logging', () => {
  it('logs each drawn edge once, as a visual entry, newest first', () => {
    let s = initialLabState;
    s = labReducer(s, { type: 'edge-drawn', key: 'root-ministry', entry: edgeDrawnEntry('root-ministry') });
    s = labReducer(s, { type: 'edge-drawn', key: 'root-ministry', entry: edgeDrawnEntry('root-ministry') });
    s = labReducer(s, { type: 'edge-drawn', key: 'ministry-university', entry: edgeDrawnEntry('ministry-university') });
    expect(s.drawnEdges).toEqual(['root-ministry', 'ministry-university']);
    expect(s.ledger.map((e) => [e.kind, e.detail])).toEqual([
      ['visual', 'Ministry → University, after its signature verified with the Ministry’s public key'],
      ['visual', 'Root CA → Ministry, after its signature verified with the Root’s public key'],
    ]);
  });

  it('forgets drawn edges on reset', () => {
    const s = labReducer({ ...initialLabState, drawnEdges: ['root-ministry'] }, { type: 'reset' });
    expect(s.drawnEdges).toEqual([]);
  });
});

describe('extension explanations', () => {
  it('explains each certificate in its own terms', async () => {
    const meaning = async (c: Parameters<typeof explainExtensions>[0], name: string) =>
      (await explainExtensions(c)).find((e) => e.name === name);
    const bc = 'X509v3 Basic Constraints';
    expect((await meaning(full.root!.certificate, bc))?.meaning).toMatch(/no limit/);
    expect(await meaning(full.ministry!.certificate!, bc)).toMatchObject({ value: 'CA:TRUE, pathlen:0', critical: true });
    expect((await meaning(full.ministry!.certificate!, bc))?.meaning).toMatch(/only to end entities/);
    expect((await meaning(full.university!.certificate!, bc))?.meaning).toMatch(/may never issue/);
    expect((await meaning(full.university!.certificate!, 'X509v3 Key Usage'))?.meaning)
      .toBe('This key may only sign data such as documents and make signatures meant as evidence of commitment. Any other use must be refused.');
    expect((await meaning(full.root!.certificate, 'X509v3 Authority Key Identifier'))?.meaning).toMatch(/root signs itself/);
    expect((await meaning(full.ministry!.certificate!, 'X509v3 Authority Key Identifier'))?.meaning).toMatch(/issuer’s Subject Key Identifier/);
  });
});
