import { useId, useState } from 'react';
import {
  type CaseEvidence,
  CHECK_NAMES,
  type FailingCheck,
  type SpotAnswer,
  type SpotCase,
  answerText,
  correctAnswer,
  createRound,
  judge,
  runSignatureCheck,
} from '../../exercises/spot.ts';
import { useLab } from '../../state/LabProvider.tsx';
import { hierarchyFromState } from '../../state/attacks.ts';
import { buildWholeLab } from '../../state/operations.ts';
import { PathDiagram } from '../attacks/PathDiagram.tsx';
import { Disclosure } from '../common/Disclosure.tsx';
import { commonName, constraintsText, day, shortFingerprint } from '../common/format.ts';

interface CaseState {
  readonly answer: SpotAnswer | null;
  readonly submitted: boolean;
  readonly signature: boolean | null;
}

const emptyCase: CaseState = { answer: null, submitted: false, signature: null };

function Evidence({ e }: { e: CaseEvidence }) {
  const today = day(new Date());
  return (
    <div className="evidence">
      <section className="evidence__block" aria-label="The diploma">
        <h3 className="evidence__title">The diploma</h3>
        {e.diploma ? (
          <p className="evidence__text">
            {e.diploma.studentName}, {e.diploma.degree} ({e.diploma.diplomaId}). The grade is hidden: a verifier can’t know what it
            should be, which is exactly why diplomas are signed.
          </p>
        ) : (
          <p className="evidence__text">Not a readable diploma.</p>
        )}
      </section>
      <section className="evidence__block" aria-label="Certificates that came with it">
        <h3 className="evidence__title">Certificates that came with it</h3>
        <ol className="evidence__certs">
          {e.certificates.map(({ role, summary: c }) => (
            <li key={c.fingerprintSha256} className="evidence__cert">
              <span className="evidence__role">{role === 'signer' ? 'Signer’s certificate' : 'Supplied with the diploma'}</span>
              <span className="evidence__name">{commonName(c.subject)}</span>
              <span>Issued by {c.selfIssued ? 'itself (self-signed)' : commonName(c.issuer)}</span>
              <span className="mono">{constraintsText(c).replace(' (critical)', '')}</span>
              <span>Valid {day(c.notBefore)} to {day(c.notAfter)}</span>
              <span className="mono evidence__fp">{shortFingerprint(c.fingerprintSha256)}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="evidence__block" aria-label="Your trust store">
        <h3 className="evidence__title">Your trust store</h3>
        <ul className="evidence__certs">
          {e.trustStore.map((c) => (
            <li key={c.fingerprintSha256} className="evidence__cert">
              <span className="evidence__name">{commonName(c.subject)}</span>
              <span className="mono evidence__fp">{shortFingerprint(c.fingerprintSha256)}</span>
            </li>
          ))}
        </ul>
        <p className="evidence__today">Today is {today}.</p>
      </section>
    </div>
  );
}

export function SpotTheFake() {
  const { state, run: runTask } = useLab();
  const hierarchy = hierarchyFromState(state);
  const id = useId();
  const [round, setRound] = useState<SpotCase[] | null>(null);
  const [index, setIndex] = useState(0);
  const [cases, setCases] = useState<CaseState[]>([]);
  const [busy, setBusy] = useState(false);
  const [showScore, setShowScore] = useState(false);

  async function start() {
    if (!hierarchy) return;
    setBusy(true);
    const r = await createRound(hierarchy);
    setRound(r);
    setCases(r.map(() => emptyCase));
    setIndex(0);
    setShowScore(false);
    setBusy(false);
  }

  if (!hierarchy) {
    return (
      <div className="attacks__setup">
        <p>The cases are built from the lab’s own Root, Ministry and University, so the lab must exist first.</p>
        <div className="playground__actions">
          <button type="button" className="button button--primary" disabled={state.busy !== null}
            onClick={() => runTask('whole-lab', async () => { const s = await buildWholeLab(); return { type: 'lab-built', ...s.result, entries: s.entries }; })}>
            Set up the whole lab
          </button>
        </div>
        {state.busy === 'whole-lab' && <p className="busy" role="status">Generating three key pairs and issuing three certificates…</p>}
      </div>
    );
  }

  if (!round) {
    return (
      <div className="spot-intro">
        <p>
          You are the verifier. Each case is a diploma with the certificates it came with. Some are genuine; most are not. Decide which,
          and name the check that catches each fake. Most fakes can be spotted by reading the certificates carefully. For the rest, you have
          one tool: check 3, the signature.
        </p>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Building six cases…' : 'Start a round of six cases'}
        </button>
      </div>
    );
  }

  const done = cases.every((c) => c.submitted);
  const score = round.filter((c, i) => cases[i]?.answer && cases[i]?.submitted && judge(c.run, cases[i]?.answer as SpotAnswer)).length;

  if (done && showScore) {
    return (
      <div className="spot-summary">
        <div role="status">
          <h2 className="attack-result__title">You got {score} of {round.length} right</h2>
        </div>
        <ol className="spot-summary__list">
          {round.map((c, i) => {
            const right = judge(c.run, cases[i]?.answer as SpotAnswer);
            return (
              <li key={c.n}>
                <span className={right ? 'pass-text' : 'fail-text'}>{right ? 'Right' : 'Wrong'}</span>{' '}
                Case {c.n}: {c.run.scenario.title}. {answerText(correctAnswer(c.run))}.
              </li>
            );
          })}
        </ol>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Building six cases…' : 'New round'}
        </button>
      </div>
    );
  }

  const current = round[index] as SpotCase;
  const cs = cases[index] ?? emptyCase;
  const update = (patch: Partial<CaseState>) => setCases((all) => all.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const choices: Array<[string, SpotAnswer]> = [
    ['Genuine', { verdict: 'genuine' }],
    ...([3, 4, 5, 6, 7] as FailingCheck[]).map((n): [string, SpotAnswer] => [`Fake, caught by ${CHECK_NAMES[n]}`, { verdict: 'fake', check: n }]),
  ];
  const isChosen = (a: SpotAnswer) => JSON.stringify(cs.answer) === JSON.stringify(a);
  const right = cs.submitted && cs.answer ? judge(current.run, cs.answer) : null;

  return (
    <div className="spot">
      <div className="spot__progress" role="status">
        Case {current.n} of {round.length}, {cases.filter((c) => c.submitted).length} answered
      </div>
      <Evidence e={current.evidence} />

      <section className="evidence__block" aria-label="Your tool">
        <h3 className="evidence__title">Your tool</h3>
        <div className="playground__actions">
          <button type="button" className="button" disabled={cs.signature !== null}
            onClick={async () => update({ signature: await runSignatureCheck(current.run) })}>
            Run check 3: verify the signature
          </button>
        </div>
        {cs.signature !== null && (
          <p className={cs.signature ? 'pass-text' : 'fail-text'} role="status">
            {cs.signature ? 'The signature is valid for these bytes, under the key in the signer’s certificate.' : 'The signature does not match these bytes and this key.'}
          </p>
        )}
      </section>

      <fieldset className="quiz__q" disabled={cs.submitted}>
        <legend className="quiz__prompt">Your verdict</legend>
        {choices.map(([label, a]) => (
          <label key={label} className="quiz__option">
            <input type="radio" name={`${id}-${current.n}`} checked={isChosen(a)} onChange={() => update({ answer: a })} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <Disclosure title="What to look for">
        <ul>
          <li>Is every certificate’s issuer present, either supplied or in your trust store?</li>
          <li>Does a certificate with CA:FALSE sign another certificate?</li>
          <li>Does a CA with pathlen:0 have another CA beneath it?</li>
          <li>Is every certificate valid today?</li>
          <li>Does the chain end at a root whose fingerprint is in your trust store? Same name is not enough.</li>
          <li>If the certificates all look right, run check 3.</li>
        </ul>
      </Disclosure>

      {!cs.submitted ? (
        <button type="button" className="button button--primary" disabled={!cs.answer} onClick={() => update({ submitted: true })}>
          Submit answer
        </button>
      ) : (
        <div className="spot__feedback">
          <p className={right ? 'quiz__why quiz__why--right' : 'quiz__why quiz__why--wrong'} role="status">
            <strong>{right ? 'Right.' : 'Not quite.'}</strong> This was “{current.run.scenario.title}”. Correct answer: {answerText(correctAnswer(current.run))}.
          </p>
          <p className="lesson__text">{current.run.scenario.lesson}</p>
          <PathDiagram result={current.run.result} />
        </div>
      )}

      <div className="lesson__pager">
        <button type="button" className="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous case</button>
        {index < round.length - 1 ? (
          <button type="button" className="button button--primary" onClick={() => setIndex(index + 1)}>Next case</button>
        ) : done ? (
          <button type="button" className="button button--primary" onClick={() => setShowScore(true)}>See your score</button>
        ) : (
          <span className="spot__hint">Answer every case to see your score.</span>
        )}
      </div>
    </div>
  );
}
