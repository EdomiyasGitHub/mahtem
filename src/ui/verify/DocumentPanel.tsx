import { useId } from 'react';
import { type Diploma, tryDecodeDiploma } from '../../documents/diploma.ts';
import { Disclosure } from '../common/Disclosure.tsx';

const FIELDS: Array<[keyof Diploma, string]> = [
  ['studentName', 'Student'],
  ['studentNameAmharic', 'Student (Amharic)'],
  ['degree', 'Degree'],
  ['cgpa', 'Cumulative GPA'],
  ['conferred', 'Conferred'],
  ['diplomaId', 'Diploma ID'],
];

export function DocumentPanel(props: {
  bytes: Uint8Array;
  original: Uint8Array;
  text: string | null;
  onTextChange: (t: string) => void;
  onRestore: () => void;
}) {
  const { bytes, original, text, onTextChange, onRestore } = props;
  const id = useId();
  const d = tryDecodeDiploma(bytes);
  const o = tryDecodeDiploma(original);
  const same = bytes.length === original.length && bytes.every((b, i) => b === original[i]);
  const changed = (k: keyof Diploma) => Boolean(d && o && d[k] !== o[k]);

  return (
    <section className="document" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="section-title">Received document</h2>
      {d ? (
        <article className="diploma" aria-label="Diploma as received">
          <p className="diploma__institution">{d.institution}</p>
          <p className="diploma__institution-am" lang="am">{d.institutionAmharic}</p>
          <p className="diploma__line">This certifies that</p>
          <p className={`diploma__name${changed('studentName') ? ' diploma--changed' : ''}`}>{d.studentName}</p>
          <p className={`diploma__name-am${changed('studentNameAmharic') ? ' diploma--changed' : ''}`} lang="am">{d.studentNameAmharic}</p>
          <p className="diploma__line">has been awarded the degree of</p>
          <p className={`diploma__degree${changed('degree') ? ' diploma--changed' : ''}`}>{d.degree}</p>
          <p className="diploma__line">
            Cumulative GPA <span className={changed('cgpa') ? 'diploma--changed' : undefined}>{d.cgpa}</span>
          </p>
          <p className="diploma__meta">
            <span className={changed('diplomaId') ? 'diploma--changed' : undefined}>{d.diplomaId}</span>, conferred{' '}
            <span className={changed('conferred') ? 'diploma--changed' : undefined}>{d.conferred}</span>
          </p>
        </article>
      ) : (
        <p className="document__unreadable">These bytes are not a readable diploma. Verification judges the bytes, not how they look.</p>
      )}
      {d && o && FIELDS.some(([k]) => changed(k)) && (
        <p className="document__changes">
          Changed since it arrived: {FIELDS.filter(([k]) => changed(k)).map(([, label]) => label).join(', ')}.
        </p>
      )}
      <p className="document__bytes">
        {bytes.byteLength.toLocaleString('en')} bytes, {same ? 'exactly as received' : 'modified'}
      </p>

      <Disclosure title="Edit the received bytes" open={!same}>
        {text === null ? (
          <p>This file is not plain UTF-8 text, so it can only be verified as received, not edited here.</p>
        ) : (
          <>
            <label htmlFor={`${id}-raw`} className="field-label">
              Raw document (UTF-8 JSON). Change any character to see what the signature protects.
            </label>
            <textarea
              id={`${id}-raw`}
              className="raw"
              value={text}
              spellCheck={false}
              rows={12}
              onChange={(e) => onTextChange(e.target.value)}
            />
            <button type="button" className="button" onClick={onRestore} disabled={same}>
              Restore the original bytes
            </button>
          </>
        )}
      </Disclosure>
    </section>
  );
}
