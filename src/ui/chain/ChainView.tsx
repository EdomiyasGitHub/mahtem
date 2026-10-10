import { useEffect, useState } from 'react';
import { useLab } from '../../state/LabProvider.tsx';
import { type EdgeKey, type EdgeResult, EDGE_TEXT, checkChainEdges } from '../../state/chain.ts';
import type { CertificateSummary, X509Certificate } from '../../pki/index.ts';
import { HexBlocks } from '../common/HexBlocks.tsx';
import { Command } from '../common/Command.tsx';
import { commonName, constraintsText } from '../common/format.ts';
import { Inspector } from '../inspect/Inspector.tsx';

type NodeId = 'root' | 'ministry' | 'university' | 'diploma';
type DrawnKey = Exclude<EdgeKey, 'root-self'>;

const years = (s: CertificateSummary) => `${Math.round(s.validityDays / 365)} years`;

function CertNode(props: {
  role: string;
  summary: CertificateSummary;
  selected: boolean;
  onSelect: () => void;
  extra?: string;
}) {
  const { role, summary, selected, onSelect, extra } = props;
  return (
    <button type="button" className={`node${selected ? ' node--selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <span className="node__top">
        <span className="node__role">{role}</span>
        <span className="node__constraints">{constraintsText(summary).replace(' (critical)', '')}</span>
      </span>
      <span className="node__name">{commonName(summary.subject)}</span>
      <span className="node__facts">
        <span><span className="node__k">Issuer</span> {summary.selfIssued ? 'itself' : commonName(summary.issuer)}</span>
        <span><span className="node__k">Key</span> RSA-{summary.publicKey?.modulusLength ?? '?'}</span>
        <span><span className="node__k">Valid</span> {years(summary)}</span>
      </span>
      {extra && <span className="node__extra">{extra}</span>}
    </button>
  );
}

function Edge({ edge, state, animate, document = false }: { edge: DrawnKey; state: 'checking' | 'verified' | 'failed'; animate: boolean; document?: boolean }) {
  const t = EDGE_TEXT[edge];
  return (
    <div className={`edge edge--${state}${document ? ' edge--document' : ''}${animate ? '' : ' edge--instant'}`} role="status">
      <span className="edge__line" aria-hidden="true" />
      <span className="edge__text">
        {state === 'checking' && <span className="edge__pending">Checking the signature…</span>}
        {state === 'failed' && <span className="edge__bad">The signature does not verify. No trust flows here.</span>}
        {state === 'verified' && (
          <>
            <span>{document ? 'Signs the document (not a certificate) with its private key' : `Signed with the ${t.signer}’s private key`}</span>
            <span className="edge__ok">
              {document ? 'Verified with the key in the University’s certificate' : `Verified with the ${t.signer}’s public key`}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

function Missing({ what, onBuild }: { what: string; onBuild: () => void }) {
  return (
    <div className="node node--missing">
      <span className="node__name">{what}</span>
      <span className="node__extra">Not created yet.</span>
      <button type="button" className="button" onClick={onBuild}>Continue on the lab bench</button>
    </div>
  );
}

export function ChainView({ onOpenBench }: { onOpenBench: () => void }) {
  const { state, drawEdge } = useLab();
  const { root, ministry, university, signed } = state;
  const [results, setResults] = useState<Partial<Record<EdgeKey, EdgeResult>>>({});
  // Edges drawn on an earlier visit appear instantly; only new ones animate.
  const [seenAtMount] = useState(() => new Set(state.drawnEdges));
  const [selected, setSelected] = useState<NodeId>(ministry?.certificate ? 'ministry' : 'root');

  useEffect(() => {
    let live = true;
    setResults({});
    void checkChainEdges({ ...state, root, ministry, university, signed }).then((rs) => {
      if (!live) return;
      setResults(Object.fromEntries(rs.map((r) => [r.key, r])));
      for (const r of rs) if (r.verified && r.key !== 'root-self') drawEdge(r.key);
    });
    return () => {
      live = false;
    };
    // Re-check only when a party or the diploma changes, not on every ledger update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, ministry, university, signed, drawEdge]);

  const edgeState = (k: EdgeKey) => {
    const r = results[k];
    return !r ? 'checking' : r.verified ? 'verified' : 'failed';
  };

  if (!root) {
    return (
      <div className="chain-empty">
        <h1 className="intro__title">Who vouches for whom</h1>
        <p className="intro__lede">There is no chain yet. It starts with the root CA, the authority every verifier chooses to trust.</p>
        <button type="button" className="button button--primary" onClick={onOpenBench}>Create the root CA on the lab bench</button>
      </div>
    );
  }

  const inspected: { cert: X509Certificate; title: string; file: string } | null =
    selected === 'root' ? { cert: root.certificate, title: commonName(root.summary.subject), file: 'rootCA-cert.pem' }
      : selected === 'ministry' && ministry?.certificate && ministry.summary ? { cert: ministry.certificate, title: commonName(ministry.summary.subject), file: 'intermediateCA-cert.pem' }
        : selected === 'university' && university?.certificate && university.summary ? { cert: university.certificate, title: commonName(university.summary.subject), file: 'university-cert.pem' }
          : null;

  const rootSelf = results['root-self'];

  return (
    <div className="chain-layout">
      <section className="chain" aria-labelledby="chain-title">
        <h1 id="chain-title" className="intro__title">Who vouches for whom</h1>
        <p className="intro__lede">
          Each link is a real signature. A link is drawn only after the app has verified it. Select a certificate to inspect it.
        </p>

        <div className="truststore-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span>
            <strong>Verifier’s trust store.</strong> The root is trusted because verifiers choose to install it, not because it says so.
          </span>
        </div>
        <div className="edge edge--anchor" aria-hidden="true"><span className="edge__line" /></div>

        <CertNode role="Root CA, the trust anchor" summary={root.summary} selected={selected === 'root'} onSelect={() => setSelected('root')}
          extra={!rootSelf ? 'Checking its self-signature…' : rootSelf.verified ? 'Self-signature verified: it vouches only for itself.' : 'Self-signature does not verify.'} />

        {ministry?.certificate && ministry.summary ? (
          <>
            <Edge edge="root-ministry" state={edgeState('root-ministry')} animate={!seenAtMount.has('root-ministry')} />
            <CertNode role="Intermediate CA" summary={ministry.summary} selected={selected === 'ministry'} onSelect={() => setSelected('ministry')} />
          </>
        ) : (
          <Missing what="Ministry of Education CA" onBuild={onOpenBench} />
        )}

        {ministry?.certificate && (university?.certificate && university.summary ? (
          <>
            <Edge edge="ministry-university" state={edgeState('ministry-university')} animate={!seenAtMount.has('ministry-university')} />
            <CertNode role="End entity, the signer" summary={university.summary} selected={selected === 'university'} onSelect={() => setSelected('university')} />
          </>
        ) : (
          <Missing what="Abay Valley University" onBuild={onOpenBench} />
        ))}

        {university?.certificate && (signed ? (
          <>
            <Edge edge="university-diploma" state={edgeState('university-diploma')} animate={!seenAtMount.has('university-diploma')} document />
            <button type="button" className={`node node--document${selected === 'diploma' ? ' node--selected' : ''}`} aria-pressed={selected === 'diploma'} onClick={() => setSelected('diploma')}>
              <span className="node__top"><span className="node__role">Signed document</span></span>
              <span className="node__name">Diploma {signed.diploma.diplomaId}, {signed.diploma.studentName}</span>
              <span className="node__facts"><span>{signed.document.byteLength} bytes, signature {signed.signature.byteLength} bytes</span></span>
            </button>
          </>
        ) : (
          <Missing what="The signed diploma" onBuild={onOpenBench} />
        ))}
      </section>

      {inspected ? (
        <Inspector key={selected} certificate={inspected.cert} title={inspected.title} fileName={inspected.file} />
      ) : selected === 'diploma' && signed ? (
        <aside className="inspector" aria-labelledby="doc-insp">
          <p className="inspector__kicker">Inspector</p>
          <h2 id="doc-insp" className="inspector__title">Diploma {signed.diploma.diplomaId}</h2>
          <p className="inspector__note">
            A document is not a certificate: it vouches for nothing. It carries a detached signature that only the University’s private key could make.
          </p>
          <dl className="facts facts--wide">
            <div className="facts__row"><dt>Document</dt><dd>{signed.document.byteLength} bytes of UTF-8 JSON</dd></div>
            <div className="facts__row"><dt>SHA-256</dt><dd><HexBlocks blocks={signed.digestBlocks} label="Digest of the diploma" /></dd></div>
            <div className="facts__row"><dt>Signature</dt><dd>{signed.signature.byteLength} bytes, RSASSA-PKCS1-v1_5 with SHA-256</dd></div>
            <div className="facts__row"><dt>Signed by</dt><dd>{university?.summary ? commonName(university.summary.subject) : ''}</dd></div>
          </dl>
          <details className="disclosure">
            <summary className="disclosure__summary">OpenSSL equivalent</summary>
            <div className="disclosure__body">
              <Command lines={['openssl x509 -in university-cert.pem -pubkey -noout -out university-pub.pem', 'openssl dgst -sha256 -verify university-pub.pem -signature diploma.sig diploma.json']} />
            </div>
          </details>
        </aside>
      ) : null}
    </div>
  );
}
