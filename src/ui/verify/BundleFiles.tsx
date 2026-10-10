import { useId, useState } from 'react';
import { bundleToFiles, trustStoreToPem, createTrustStore } from '../../verify/index.ts';
import { downloadFile } from '../common/download.ts';
import { type ImportResult, importBundle } from './bundle-import.ts';
import type { Anchor, ReceivedBundle } from './types.ts';

export function BundleFiles(props: {
  received: ReceivedBundle | null;
  bytes: Uint8Array | null;
  anchors: readonly Anchor[];
  onImported: (r: Extract<ImportResult, { ok: true }>) => void;
}) {
  const { received, bytes, anchors, onImported } = props;
  const id = useId();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const files = received && bytes
    ? bundleToFiles({ document: bytes, signature: received.signature, signer: received.signer, intermediates: received.intermediates })
    : null;
  const trusted = anchors.filter((a) => a.trusted).map((a) => a.certificate);

  return (
    <section className="files" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="section-title">Bundle files</h2>

      <div className="files__import">
        <label htmlFor={`${id}-in`} className="field-label">
          Load a bundle: select diploma.json, diploma.sig, signer-cert.pem and, if present, chain.pem and trust-store.pem.
          The scenario folders from <code>npm run interop -- scenarios</code> work as they are.
        </label>
        <input
          id={`${id}-in`}
          type="file"
          multiple
          accept=".json,.sig,.pem"
          onChange={async (e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (!list.length) return;
            const r = await importBundle(list);
            if (r.ok) {
              onImported(r);
              setMessage({
                ok: true,
                text: `Loaded.${r.anchors ? ` Trust store replaced with ${r.anchors.length} root${r.anchors.length === 1 ? '' : 's'} from trust-store.pem.` : ' Trust store unchanged (no trust-store.pem selected).'}${r.ignored.length ? ` Ignored: ${r.ignored.join(', ')}.` : ''}`,
              });
            } else {
              setMessage({ ok: false, text: r.error });
            }
          }}
        />
        {message && (
          <p className={message.ok ? 'files__msg' : 'form-error'} role={message.ok ? 'status' : 'alert'}>
            {message.text}
          </p>
        )}
      </div>

      {files && (
        <div className="files__export">
          <p className="field-label">Download what you are verifying, to check it with OpenSSL:</p>
          <div className="files__buttons">
            <button type="button" className="button" aria-label="Download diploma.json" onClick={() => downloadFile('diploma.json', files['diploma.json'], 'application/json')}>diploma.json</button>
            <button type="button" className="button" aria-label="Download diploma.sig" onClick={() => downloadFile('diploma.sig', files['diploma.sig'])}>diploma.sig</button>
            <button type="button" className="button" aria-label="Download signer-cert.pem" onClick={() => downloadFile('signer-cert.pem', files['signer-cert.pem'], 'application/x-pem-file')}>signer-cert.pem</button>
            {files['chain.pem'] && (
              <button type="button" className="button" aria-label="Download chain.pem" onClick={() => downloadFile('chain.pem', files['chain.pem'] ?? '', 'application/x-pem-file')}>chain.pem</button>
            )}
            {trusted.length > 0 && (
              <button type="button" className="button" aria-label="Download trust-store.pem" onClick={() => downloadFile('trust-store.pem', trustStoreToPem(createTrustStore(trusted)), 'application/x-pem-file')}>trust-store.pem</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
