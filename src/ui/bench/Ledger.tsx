import type { LedgerEntry } from '../../state/operations.ts';

export function Ledger({ entries }: { entries: readonly LedgerEntry[] }) {
  return (
    <aside className="ledger" aria-labelledby="ledger-title">
      <h2 id="ledger-title" className="ledger__title">
        Operation ledger
      </h2>
      <ul className="ledger__legend">
        <li><span className="dot dot--real" aria-hidden="true" /> Real cryptographic operation</li>
        {entries.some((e) => e.kind === 'visual') && (
          <li><span className="dot dot--visual" aria-hidden="true" /> Drawing of a real result</li>
        )}
      </ul>
      {entries.length === 0 ? (
        <p className="ledger__empty">Nothing yet. Operations appear here as you run them, newest first.</p>
      ) : (
        <ol className="ledger__list">
          {entries.map((e) => (
            <li key={e.id} className="ledger__item">
              <span className={`dot dot--${e.kind}`} aria-hidden="true" />
              <div>
                <div className="ledger__what">
                  {e.title}
                  <span className="visually-hidden">{e.kind === 'real' ? ' (real operation)' : ' (visualization)'}</span>
                </div>
                <div className="ledger__detail">
                  {e.detail}
                  {e.ms !== undefined && <span className="ledger__ms">{e.ms} ms</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
