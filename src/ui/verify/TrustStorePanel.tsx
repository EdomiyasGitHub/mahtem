import { useEffect, useState } from 'react';
import { certificateFingerprint } from '../../verify/index.ts';
import { shortFingerprint } from '../common/format.ts';
import type { Anchor } from './types.ts';

export function TrustStorePanel({ anchors, onToggle }: { anchors: readonly Anchor[]; onToggle: (index: number) => void }) {
  const [prints, setPrints] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.all(anchors.map((a) => certificateFingerprint(a.certificate))).then((p) => live && setPrints(p));
    return () => {
      live = false;
    };
  }, [anchors]);

  return (
    <section className="truststore" aria-labelledby="truststore-title">
      <h2 id="truststore-title" className="section-title">Your trust store</h2>
      <p className="truststore__intro">
        The roots this verifier has chosen to trust. Nothing the sender includes is ever added here.
      </p>
      {anchors.length === 0 ? (
        <p className="truststore__empty">Empty. Load a trust-store.pem file to add roots.</p>
      ) : (
        <ul className="truststore__list">
          {anchors.map((a, i) => (
            <li key={i} className="truststore__item">
              <label className="check">
                <input type="checkbox" checked={a.trusted} onChange={() => onToggle(i)} />
                <span>
                  <span className="truststore__name">{a.certificate.subjectName.getField('CN')[0] ?? a.certificate.subject}</span>
                  <span className="truststore__fp mono">{prints[i] ? shortFingerprint(prints[i]) : '…'}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
