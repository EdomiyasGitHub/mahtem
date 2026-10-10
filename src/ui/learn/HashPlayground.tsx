import { useEffect, useId, useState } from 'react';
import { chunkHex, compareDigests, sha256, toHex, utf8Encode } from '../../crypto/index.ts';
import { HexBlocks } from '../common/HexBlocks.tsx';

const MAX = 2000;

/** Real SHA-256 on whatever the student types, compared against a kept reference. */
export function HashPlayground({ onPracticed }: { onPracticed: () => void }) {
  const id = useId();
  const [text, setText] = useState('Hana Tesfaye, CGPA 3.12');
  const [digest, setDigest] = useState<Uint8Array | null>(null);
  const [reference, setReference] = useState<{ text: string; digest: Uint8Array } | null>(null);

  useEffect(() => {
    let live = true;
    void sha256(utf8Encode(text)).then((d) => live && setDigest(d));
    return () => {
      live = false;
    };
  }, [text]);

  const blocks = digest ? chunkHex(toHex(digest)) : [];
  const refBlocks = reference ? chunkHex(toHex(reference.digest)) : undefined;
  const comparison = digest && reference ? compareDigests(digest, reference.digest) : null;

  useEffect(() => {
    if (comparison && !comparison.equal) onPracticed();
  }, [comparison, onPracticed]);

  return (
    <div className="playground">
      <label htmlFor={`${id}-t`} className="field-label">Text to hash ({text.length} characters)</label>
      <textarea id={`${id}-t`} className="raw" rows={3} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="playground__row">
        <span className="playground__label">SHA-256</span>
        {digest && <HexBlocks blocks={blocks} {...(refBlocks ? { compareTo: refBlocks } : {})} label="SHA-256 of the text" />}
      </div>
      {reference && refBlocks && (
        <div className="playground__row">
          <span className="playground__label">Reference</span>
          <HexBlocks blocks={refBlocks} label="SHA-256 of the reference text" />
        </div>
      )}
      <div className="playground__actions">
        <button type="button" className="button" disabled={!digest} onClick={() => digest && setReference({ text, digest })}>
          Keep this as the reference
        </button>
      </div>
      <p className="playground__result" role="status">
        {!comparison
          ? 'Keep a reference, then change one character.'
          : comparison.equal
            ? 'Identical to the reference: same input, same digest, every time.'
            : `${comparison.differingBits} of ${comparison.totalBits} bits differ (${Math.round((100 * comparison.differingBits) / comparison.totalBits)}%), and ${comparison.blocks.filter((b) => !b.same).length} of 8 blocks changed.`}
      </p>
    </div>
  );
}
