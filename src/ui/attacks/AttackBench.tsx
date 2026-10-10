import { useState } from 'react';
import { useLab } from '../../state/LabProvider.tsx';
import { type AttackRun, hierarchyFromState, runScenario } from '../../state/attacks.ts';
import { buildWholeLab } from '../../state/operations.ts';
import { OPENSSL_VERDICTS, SCENARIOS, type ScenarioId } from '../../scenarios/index.ts';
import { Command } from '../common/Command.tsx';
import { Disclosure } from '../common/Disclosure.tsx';
import { Provenance } from '../common/Provenance.tsx';
import { TraceList } from '../verify/TraceList.tsx';
import { VerdictBanner } from '../verify/VerdictBanner.tsx';
import { PathDiagram } from './PathDiagram.tsx';

const CHECK_NUMBER: Record<string, number> = {
  bundle: 1, digest: 2, 'document-signature': 3, 'signer-certificate': 4, 'issuer-certificates': 5, 'trust-anchor': 6, validity: 7,
};

function outcome(run: AttackRun): string {
  return run.result.verdict === 'verified' ? 'Verified' : `Caught at check ${run.result.firstFailure?.n ?? '?'}`;
}

function expectedText(id: ScenarioId): string {
  const e = SCENARIOS.find((s) => s.id === id)?.expected;
  if (!e) return '';
  return e.verdict === 'verified' ? 'verified' : `caught at check ${CHECK_NUMBER[e.failsAt ?? ''] ?? '?'} (${e.code})`;
}

export type AttackRuns = Partial<Record<ScenarioId, AttackRun>>;

export interface AttackMemory {
  readonly runs: AttackRuns;
  readonly selected: ScenarioId | null;
}

export function AttackBench(props: {
  onOpenBench: () => void;
  onOpenDesk: (run: AttackRun) => void;
  /** Kept by the app so results survive switching tabs; cleared when the lab is reset. */
  memory: AttackMemory;
  onMemory: (update: (m: AttackMemory) => AttackMemory) => void;
}) {
  const { onOpenBench, onOpenDesk, memory, onMemory } = props;
  const { state, run: runTask } = useLab();
  const hierarchy = hierarchyFromState(state);
  const { runs, selected } = memory;
  const setRuns = (f: (prev: AttackRuns) => AttackRuns) => onMemory((m) => ({ ...m, runs: f(m.runs) }));
  const setSelected = (id: ScenarioId | null) => onMemory((m) => ({ ...m, selected: id }));
  const [running, setRunning] = useState<ScenarioId | 'all' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function execute(ids: ScenarioId[]) {
    if (!hierarchy) return;
    setError(null);
    setRunning(ids.length > 1 ? 'all' : (ids[0] as ScenarioId));
    try {
      for (const id of ids) {
        const r = await runScenario(hierarchy, id);
        setRuns((prev) => ({ ...prev, [id]: r }));
        if (ids.length === 1) setSelected(id);
      }
      if (ids.length > 1) onMemory((m) => ({ ...m, selected: m.selected ?? ids[0] ?? null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The scenario could not be built.');
    } finally {
      setRunning(null);
    }
  }

  const current = selected ? runs[selected] : undefined;
  const ranCount = Object.keys(runs).length;
  const matched = Object.values(runs).filter((r) => r?.matchesExpectation).length;

  return (
    <div className="attacks">
      <section className="intro" aria-labelledby="attacks-title">
        <h1 id="attacks-title" className="intro__title">Try to fool the verifier</h1>
        <p className="intro__lede">
          Each scenario builds a real attack against the lab’s own Root, Ministry and University, then verifies it exactly as the
          verifier desk would. One is genuine; nine should be caught.
        </p>
      </section>

      {!hierarchy ? (
        <div className="attacks__setup">
          <p>The attacks need the lab’s Root, Ministry and University to exist first.</p>
          <div className="files__buttons">
            <button type="button" className="button button--primary" disabled={state.busy !== null}
              onClick={() => runTask('whole-lab', async () => { const s = await buildWholeLab(); return { type: 'lab-built', ...s.result, entries: s.entries }; })}>
              Set up the whole lab
            </button>
            <button type="button" className="button" onClick={onOpenBench}>Build it step by step on the lab bench</button>
          </div>
          {state.busy === 'whole-lab' && <p className="busy" role="status">Generating three key pairs and issuing three certificates…</p>}
          {state.error?.task === 'whole-lab' && <p className="form-error" role="alert">{state.error.message}</p>}
        </div>
      ) : (
        <div className="attacks__grid">
          <div className="attacks__list">
            <div className="attacks__toolbar">
              <button type="button" className="button" disabled={running !== null} onClick={() => execute(SCENARIOS.map((s) => s.id))}>
                Run all ten
              </button>
              {ranCount > 0 && (
                <span className="attacks__tally" role="status">
                  {matched} of {ranCount} run{ranCount === 1 ? '' : 's'} matched the expected verdict
                </span>
              )}
            </div>
            <ol className="scenarios">
              {SCENARIOS.map((s) => {
                const r = runs[s.id];
                return (
                  <li key={s.id} className={`scenario${selected === s.id ? ' scenario--selected' : ''}`}>
                    <span className="scenario__n" aria-hidden="true">{s.n}</span>
                    <div className="scenario__main">
                      <div className="scenario__head">
                        <h2 className="scenario__title">{s.title}</h2>
                        <Provenance source={s.provenance} />
                      </div>
                      <p className="scenario__story">{s.story}</p>
                      <div className="scenario__actions">
                        <button type="button" className="button" disabled={running !== null} onClick={() => execute([s.id])}>
                          {running === s.id ? 'Running…' : r ? 'Run again' : 'Run'}
                        </button>
                        {r && (
                          <button type="button" className="scenario__result" onClick={() => setSelected(s.id)} aria-pressed={selected === s.id}>
                            <span className={r.result.verdict === 'verified' ? 'pass-text' : 'fail-text'}>{outcome(r)}</span>
                            <span className="scenario__match">{r.matchesExpectation ? 'as expected' : 'UNEXPECTED'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>

          <section className="attack-result" aria-live="polite" aria-label="Scenario result">
            {!current ? (
              <p className="attack-result__empty">Run a scenario to see how the verifier handles it.</p>
            ) : (
              <>
                <p className="inspector__kicker">Scenario {current.scenario.n}</p>
                <h2 className="attack-result__title">{current.scenario.title}</h2>
                <p className="attack-result__story">{current.scenario.story}</p>
                <VerdictBanner result={current.result} pending={false} />
                <p className={current.matchesExpectation ? 'attack-result__expect' : 'attack-result__expect attack-result__expect--bad'}>
                  Expected: {expectedText(current.scenario.id)}. {current.matchesExpectation ? 'The app agrees.' : 'The app disagrees: this is a bug.'}
                </p>
                <p className="attack-result__lesson"><strong>Lesson.</strong> {current.scenario.lesson}</p>

                <h3 className="section-title">The path the verifier found</h3>
                <PathDiagram result={current.result} />

                <h3 className="section-title">What OpenSSL says about the same files</h3>
                <dl className="facts">
                  <div className="facts__row"><dt>openssl dgst -verify</dt><dd>{OPENSSL_VERDICTS[current.scenario.id].dgst}</dd></div>
                  <div className="facts__row">
                    <dt>openssl verify</dt>
                    <dd>{(() => {
                      const v = OPENSSL_VERDICTS[current.scenario.id].verify;
                      return v.ok ? 'OK' : `error ${v.codes.join(' or ')}: ${v.meaning}`;
                    })()}</dd>
                  </div>
                </dl>
                <p className="inspector__note">
                  Your browser cannot run OpenSSL. These results are checked against the real OpenSSL program by the automated
                  tests. To see them yourself, open this scenario on the verifier desk and download its files.
                </p>

                <Disclosure title="All seven checks">
                  <TraceList result={current.result} />
                </Disclosure>
                <Disclosure title="OpenSSL commands">
                  <Command lines={[
                    'openssl x509 -in signer-cert.pem -pubkey -noout -out signer-pub.pem',
                    'openssl dgst -sha256 -verify signer-pub.pem -signature diploma.sig diploma.json',
                    `openssl verify -no-CApath -no-CAstore -CAfile trust-store.pem ${current.built.bundle.intermediates.length ? '-untrusted chain.pem ' : ''}signer-cert.pem`,
                  ]} note="Run these on the files downloaded from the verifier desk." />
                </Disclosure>
                <button type="button" className="button button--primary" onClick={() => onOpenDesk(current)}>
                  Open on the verifier desk
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
