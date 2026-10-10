/**
 * The trust chain as drawn on the "Trust chain" screen.
 *
 * Each edge is a real signature, checked here before it may be drawn:
 *   Root → Ministry        the Ministry's certificate verifies with the Root's public key
 *   Ministry → University  the University's certificate verifies with the Ministry's public key
 *   University → diploma   the diploma's signature verifies with the key in the University's certificate
 * The root's own self-signature is checked too (it is drawn as a property of the root, not an edge).
 */
import { SIGNATURE_ALGORITHM, verify } from '../crypto/index.ts';
import { checkIssuedBy, type X509Certificate } from '../pki/index.ts';
import type { LabState } from './lab.ts';
import { type LedgerEntry, makeEntry } from './operations.ts';

export type EdgeKey = 'root-self' | 'root-ministry' | 'ministry-university' | 'university-diploma';
export type EdgeState = 'absent' | 'checking' | 'verified' | 'failed';

export interface EdgeResult {
  readonly key: EdgeKey;
  readonly verified: boolean;
  /** For certificate edges: name chaining and key identifiers, besides the signature. */
  readonly nameMatches?: boolean;
  readonly keyIdMatches?: boolean | null;
}

export const EDGE_TEXT: Record<Exclude<EdgeKey, 'root-self'>, { from: string; to: string; signer: string }> = {
  'root-ministry': { from: 'Root CA', to: 'Ministry', signer: 'Root' },
  'ministry-university': { from: 'Ministry', to: 'University', signer: 'Ministry' },
  'university-diploma': { from: 'University', to: 'diploma', signer: 'University' },
};

async function certEdge(key: EdgeKey, child: X509Certificate, parent: X509Certificate): Promise<EdgeResult> {
  const c = await checkIssuedBy(child, parent);
  return { key, verified: c.signatureValid && c.issuerNameMatches, nameMatches: c.issuerNameMatches, keyIdMatches: c.keyIdentifierMatches };
}

/** Check every edge whose two ends exist. Only checked edges are returned. */
export async function checkChainEdges(s: LabState): Promise<EdgeResult[]> {
  const out: Promise<EdgeResult>[] = [];
  const root = s.root?.certificate;
  const ministry = s.ministry?.certificate;
  const university = s.university?.certificate;
  if (root) out.push(certEdge('root-self', root, root));
  if (root && ministry) out.push(certEdge('root-ministry', ministry, root));
  if (ministry && university) out.push(certEdge('ministry-university', university, ministry));
  if (university && s.signed) {
    const signed = s.signed;
    out.push(
      (async (): Promise<EdgeResult> => {
        // Verifier's view: the key comes from the University's CERTIFICATE, not from the lab's key pair.
        const key = await university.publicKey.export(SIGNATURE_ALGORITHM, ['verify']);
        return { key: 'university-diploma', verified: await verify(key, signed.signature, signed.document) };
      })(),
    );
  }
  return Promise.all(out);
}

/** The ledger entry for an edge that has just been drawn. */
export function edgeDrawnEntry(key: Exclude<EdgeKey, 'root-self'>): LedgerEntry {
  const t = EDGE_TEXT[key];
  return makeEntry({
    kind: 'visual',
    title: 'Trust edge drawn',
    detail: `${t.from} → ${t.to}, after its signature verified with the ${t.signer}’s public key`,
  });
}
