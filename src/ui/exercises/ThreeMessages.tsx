import { useEffect, useId, useState } from 'react';
import { exportPublicKeyPem, generateRsaKeyPair, sign, utf8Encode } from '../../crypto/index.ts';
import {
  type ExerciseItem,
  type LoadedExercise,
  ExerciseError,
  MAX_EXERCISE_BYTES,
  decodeExercise,
  encodeExercise,
  opensslFiles,
  verifyExercise,
} from '../../exercises/three-messages.ts';
import { Command } from '../common/Command.tsx';
import { Disclosure } from '../common/Disclosure.tsx';
import { downloadFile } from '../common/download.ts';

const DEFAULTS = ['Meet at 9.', 'Budget: 4,000 birr.', 'Exam is on Friday.'];

interface Signed {
  readonly keys: CryptoKeyPair;
  readonly originals: readonly string[];
  readonly signatures: readonly Uint8Array[];
}

function Sender({ onHandOver }: { onHandOver: (ex: LoadedExercise) => void }) {
  const id = useId();
  const [messages, setMessages] = useState<string[]>(DEFAULTS);
  const [signed, setSigned] = useState<Signed | null>(null);
  const [busy, setBusy] = useState(false);
  const [pem, setPem] = useState<string | null>(null);

  useEffect(() => {
    if (!signed) return;
    let live = true;
    void exportPublicKeyPem(signed.keys.publicKey).then((p) => live && setPem(p));
    return () => {
      live = false;
    };
  }, [signed]);

  const items: ExerciseItem[] = signed ? messages.map((m, i) => ({ message: m, signature: signed.signatures[i] as Uint8Array })) : [];

  return (
    <div className="three">
      <p className="lesson__text">
        Write three messages and sign them. Then secretly change one or two, without signing again, and give the file to a partner.
      </p>
      <ol className="three__list">
        {messages.map((m, i) => {
          const changed = signed && signed.originals[i] !== m;
          return (
            <li key={i} className="three__item">
              <label htmlFor={`${id}-${i}`} className="field-label">
                Message {i + 1}
                {changed && <span className="three__changed"> (changed since signing)</span>}
              </label>
              <input id={`${id}-${i}`} className="three__input" value={m} maxLength={2000}
                onChange={(e) => setMessages(messages.map((x, j) => (j === i ? e.target.value : x)))} />
            </li>
          );
        })}
      </ol>
      <div className="playground__actions">
        <button type="button" className="button button--primary" disabled={busy}
          onClick={async () => {
            setBusy(true);
            const keys = await generateRsaKeyPair({ modulusLength: 2048 });
            const signatures = await Promise.all(messages.map((m) => sign(keys.privateKey, utf8Encode(m))));
            setSigned({ keys, originals: [...messages], signatures });
            setBusy(false);
          }}>
          {signed ? 'Sign again with a new key' : 'Generate a key and sign all three'}
        </button>
      </div>
      {signed && (
        <>
          <p className="pass-text" role="status">Signed with a new RSA-2048 key. Now change one or two messages above.</p>
          <div className="playground__actions">
            <button type="button" className="button button--primary"
              onClick={async () => onHandOver(await decodeExercise(await encodeExercise(signed.keys.publicKey, items)))}>
              Hand over to a partner on this computer
            </button>
            <button type="button" className="button"
              onClick={async () => downloadFile('three-messages.json', await encodeExercise(signed.keys.publicKey, items), 'application/json')}>
              Download the exercise file
            </button>
          </div>
          {pem && (
            <Disclosure title="Files for the course’s OpenSSL commands">
              <p>Download these, then verify each message as in course §6:</p>
              <div className="files__buttons">
                {opensslFiles(pem, items).map((f) => (
                  <button key={f.name} type="button" className="button" aria-label={`Download ${f.name}`}
                    onClick={() => downloadFile(f.name, f.content)}>
                    {f.name}
                  </button>
                ))}
              </div>
              <Command lines={[1, 2, 3].map((n) => `openssl dgst -sha256 -verify public_key.pem -signature signature${n}.bin message${n}.txt`)}
                note="Expected: Verified OK for unchanged messages, Verification failure for changed ones." />
            </Disclosure>
          )}
          <p className="inspector__note">The private key is never in any file. It stays in this tab, and the browser won’t reveal it.</p>
        </>
      )}
    </div>
  );
}

function Partner({ exercise, onLoad }: { exercise: LoadedExercise | null; onLoad: (ex: LoadedExercise) => void }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [guesses, setGuesses] = useState<boolean[]>([]);
  const [results, setResults] = useState<boolean[] | null>(null);

  useEffect(() => {
    setGuesses(exercise ? exercise.items.map(() => false) : []);
    setResults(null);
  }, [exercise]);

  const modified = results ? results.map((ok) => !ok) : [];
  const caught = results ? modified.filter((m, i) => m && guesses[i]).length : 0;
  const falseAlarms = results ? modified.filter((m, i) => !m && guesses[i]).length : 0;

  return (
    <div className="three">
      <p className="lesson__text">
        Load your partner’s file. Before verifying, tick the messages you think were changed. Then let the signatures decide.
      </p>
      <label htmlFor={`${id}-file`} className="field-label">Exercise file (three-messages.json)</label>
      <input id={`${id}-file`} type="file" accept=".json,application/json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setError(null);
          if (f.size > MAX_EXERCISE_BYTES) return setError('This file is too large to be a three-message exercise.');
          try {
            onLoad(await decodeExercise(await f.text()));
          } catch (err) {
            setError(err instanceof ExerciseError ? err.message : 'This file could not be read.');
          }
        }} />
      {error && <p className="form-error" role="alert">{error}</p>}

      {exercise && (
        <>
          <ol className="three__list">
            {exercise.items.map((item, i) => (
              <li key={i} className="three__item three__item--read">
                <span className="field-label">Message {i + 1}</span>
                <span className="three__msg">“{item.message}”</span>
                <label className="check">
                  <input type="checkbox" checked={guesses[i] ?? false} disabled={results !== null}
                    onChange={() => setGuesses(guesses.map((g, j) => (j === i ? !g : g)))} />
                  <span>I think this was changed</span>
                </label>
                {results && (
                  <span className={results[i] ? 'pass-text' : 'fail-text'}>
                    {results[i] ? 'Verified OK: unchanged' : 'Verification failure: changed after signing'}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {!results ? (
            <button type="button" className="button button--primary" onClick={async () => setResults(await verifyExercise(exercise.publicKey, exercise.items))}>
              Verify every message
            </button>
          ) : (
            <p className="playground__result" role="status">
              {modified.filter(Boolean).length === 0
                ? 'No message was changed.'
                : `You spotted ${caught} of ${modified.filter(Boolean).length} changed message${modified.filter(Boolean).length === 1 ? '' : 's'}.`}
              {falseAlarms > 0 ? ` ${falseAlarms} unchanged message${falseAlarms === 1 ? ' was' : 's were'} wrongly suspected.` : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function ThreeMessages() {
  const [role, setRole] = useState<'sender' | 'partner'>('sender');
  const [exercise, setExercise] = useState<LoadedExercise | null>(null);
  return (
    <div className="three-wrap">
      <div className="segmented" role="group" aria-label="Your role">
        <button type="button" className="segmented__btn" aria-pressed={role === 'sender'} onClick={() => setRole('sender')}>I’m the sender</button>
        <button type="button" className="segmented__btn" aria-pressed={role === 'partner'} onClick={() => setRole('partner')}>I’m the partner</button>
      </div>
      <div hidden={role !== 'sender'}>
        <Sender onHandOver={(ex) => { setExercise(ex); setRole('partner'); }} />
      </div>
      <div hidden={role !== 'partner'}>
        <Partner exercise={exercise} onLoad={setExercise} />
      </div>
    </div>
  );
}
