import type { DocumentVerification, StepStatus } from '../../verify/index.ts';

const WORD: Record<StepStatus, string> = { pass: 'Pass', fail: 'Fail', skipped: 'Not checked' };

export function TraceList({ result }: { result: DocumentVerification }) {
  return (
    <ol className="trace" aria-label="Verification checks">
      {result.steps.map((s) => (
        <li key={s.id} className={`trace__step trace__step--${s.status}`}>
          <span className="trace__n" aria-hidden="true">{s.n}</span>
          <div className="trace__body">
            <div className="trace__head">
              <h3 className="trace__title">{s.title}</h3>
              <span className="trace__status">{WORD[s.status]}</span>
            </div>
            <p className="trace__summary">{s.summary}</p>
            {s.details.length > 0 && (
              <details className="trace__details" open={s.status === 'fail'}>
                <summary>Details</summary>
                <ul>
                  {s.details.map((d, i) => (
                    <li key={i} className={d.ok === null ? 'detail' : d.ok ? 'detail detail--ok' : 'detail detail--bad'}>
                      <span className="visually-hidden">{d.ok === null ? '' : d.ok ? 'OK: ' : 'Problem: '}</span>
                      {d.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
