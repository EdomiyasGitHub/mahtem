import { useMemo } from 'react';
import { checkEnvironment, environmentReady } from '../../crypto/environment';

export function EnvironmentPanel() {
  const checks = useMemo(() => checkEnvironment(), []);
  const ready = environmentReady(checks);

  return (
    <section className="panel" aria-labelledby="env-title">
      <div className="panel__head">
        <h2 id="env-title" className="panel__title">
          Instrument check
        </h2>
        <p className={ready ? 'verdict verdict--pass' : 'verdict verdict--fail'} role="status">
          {ready ? 'Ready for real cryptography' : 'This browser cannot run the lab'}
        </p>
      </div>
      <ul className="checks">
        {checks.map((check) => (
          <li key={check.id} className="checks__row">
            <span className={check.passed ? 'mark mark--pass' : 'mark mark--fail'} aria-hidden="true">
              {check.passed ? '✓' : '✕'}
            </span>
            <span className="checks__label">
              {check.label}
              <span className="visually-hidden">{check.passed ? ': passed' : ': failed'}</span>
            </span>
            {!check.passed && <span className="checks__remedy">{check.remedy}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
