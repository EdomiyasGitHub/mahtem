import { useEffect, useMemo, useState } from 'react';
import { chunkHex, sha256, toHex, utf8Encode } from '../../crypto/index.ts';
import { editableText } from './editable.ts';
import { createTrustStore, verifySignedBundle, type DocumentVerification } from '../../verify/index.ts';
import { Command } from '../common/Command.tsx';
import { Disclosure } from '../common/Disclosure.tsx';
import { HexBlocks } from '../common/HexBlocks.tsx';
import { BundleFiles } from './BundleFiles.tsx';
import { DocumentPanel } from './DocumentPanel.tsx';
import { TraceList } from './TraceList.tsx';
import { TrustStorePanel } from './TrustStorePanel.tsx';
import { VerdictBanner } from './VerdictBanner.tsx';
import type { Anchor, ReceivedBundle } from './types.ts';

export function VerifyView({ initial }: { initial: { received: ReceivedBundle; anchors: Anchor[] } | null }) {
  const [received, setReceived] = useState<ReceivedBundle | null>(initial?.received ?? null);
  const [anchors, setAnchors] = useState<Anchor[]>(initial?.anchors ?? []);
  const [text, setText] = useState<string | null>(initial ? editableText(initial.received.original) : null);
  const [result, setResult] = useState<DocumentVerification | null>(null);
  const [pending, setPending] = useState(false);
  const [baseline, setBaseline] = useState<string[] | null>(null);

  const bytes = useMemo(() => (received ? (text !== null ? utf8Encode(text) : received.original) : null), [received, text]);

  // The digest to compare against: what the University signed (lab), or the file as loaded.
  useEffect(() => {
    if (!received) return;
    let live = true;
    const source = received.signedDigest ? Promise.resolve(received.signedDigest) : sha256(received.original);
    void source.then((d) => live && setBaseline(chunkHex(toHex(d))));
    return () => {
      live = false;
    };
  }, [received]);

  // Re-verify whenever the bytes, the bundle or the trust store change.
  useEffect(() => {
    if (!received || !bytes) return;
    let live = true;
    setPending(true);
    const t = setTimeout(() => {
      const store = createTrustStore(anchors.filter((a) => a.trusted).map((a) => a.certificate));
      void verifySignedBundle({ document: bytes, signature: received.signature, signer: received.signer, intermediates: received.intermediates }, store).then((r) => {
        if (live) {
          setResult(r);
          setPending(false);
        }
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [received, bytes, anchors]);

  return (
    <div className="verify">
      <section className="intro" aria-labelledby="verify-title">
        <h1 id="verify-title" className="intro__title">Verifier desk</h1>
        <p className="intro__lede">
          You are a stranger receiving a diploma. You hold no keys, only the roots you chose to trust. Seven checks decide
          whether the document is genuine, and every one is re-run when anything changes.
        </p>
      </section>

      {!received || !bytes ? (
        <div className="verify__empty">
          <p>No diploma has arrived yet. Sign one on the lab bench, or load a bundle from files.</p>
          <BundleFiles received={null} bytes={null} anchors={anchors} onImported={(r) => {
            setReceived(r.received);
            setText(editableText(r.received.original));
            if (r.anchors) setAnchors(r.anchors.map((c) => ({ certificate: c, trusted: true })));
          }} />
        </div>
      ) : (
        <div className="verify__grid">
          <div className="verify__left">
            <p className="verify__source">{received.label}</p>
            <DocumentPanel bytes={bytes} original={received.original} text={text}
              onTextChange={setText} onRestore={() => setText(editableText(received.original))} />
            <TrustStorePanel anchors={anchors}
              onToggle={(i) => setAnchors(anchors.map((a, j) => (j === i ? { ...a, trusted: !a.trusted } : a)))} />
          </div>
          <div className="verify__right">
            <VerdictBanner result={result} pending={pending} />
            {result && <TraceList result={result} />}
            {result && baseline && (
              <section className="compare" aria-labelledby="compare-title">
                <h2 id="compare-title" className="section-title">Check 3, up close</h2>
                <div className="compare__rows">
                  <span className="compare__label">SHA-256 of the bytes you hold now</span>
                  <HexBlocks blocks={result.digestBlocks} compareTo={baseline} label="Digest of the bytes held now" />
                  <span className="compare__label">
                    {received.signedDigest ? 'SHA-256 the University signed (known to the lab, not to a real verifier)' : 'SHA-256 of the file as loaded'}
                  </span>
                  <HexBlocks blocks={baseline} label="Reference digest" />
                </div>
                <p className="compare__note">
                  {result.digestBlocks.join('') === baseline.join('')
                    ? 'Identical digests: these are the bytes that were signed.'
                    : `${result.digestBlocks.filter((b, i) => b !== baseline[i]).length} of 8 blocks differ. A tiny edit changes the whole digest, so the signature cannot match.`}
                </p>
                <Disclosure title="OpenSSL equivalent">
                  <Command lines={[
                    'openssl x509 -in signer-cert.pem -pubkey -noout -out signer-pub.pem',
                    'openssl dgst -sha256 -verify signer-pub.pem -signature diploma.sig diploma.json',
                    'openssl verify -no-CApath -no-CAstore -CAfile trust-store.pem -untrusted chain.pem signer-cert.pem',
                  ]} note="Download the bundle files below and run these to get OpenSSL’s independent verdict." />
                </Disclosure>
              </section>
            )}
            <BundleFiles received={received} bytes={bytes} anchors={anchors} onImported={(r) => {
              setResult(null);
              setReceived(r.received);
              setText(editableText(r.received.original));
              if (r.anchors) setAnchors(r.anchors.map((c) => ({ certificate: c, trusted: true })));
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
