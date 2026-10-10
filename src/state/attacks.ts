/**
 * Running a scenario from the attack bench, against the lab's own hierarchy.
 */
import type { LabHierarchy } from '../pki/index.ts';
import { type ScenarioCase, type ScenarioId, type Scenario, scenarioById } from '../scenarios/index.ts';
import { type DocumentVerification, verifySignedBundle } from '../verify/index.ts';
import type { LabState } from './lab.ts';

/** The lab's parties as the scenarios need them, or null until Root, Ministry and University all exist. */
export function hierarchyFromState(s: LabState): LabHierarchy | null {
  const { root, ministry, university } = s;
  if (!root || !ministry?.certificate || !university?.certificate) return null;
  return {
    root: { keys: root.keys, certificate: root.certificate },
    ministry: { keys: ministry.keys, csr: ministry.csr, certificate: ministry.certificate },
    university: { keys: university.keys, csr: university.csr, certificate: university.certificate },
  };
}

export interface AttackRun {
  readonly scenario: Scenario;
  readonly built: ScenarioCase;
  readonly result: DocumentVerification;
  /** The app's verdict, failing check and code all match the scenario's expectation. */
  readonly matchesExpectation: boolean;
  readonly ms: number;
}

export async function runScenario(h: LabHierarchy, id: ScenarioId): Promise<AttackRun> {
  const scenario = scenarioById(id);
  const t0 = performance.now();
  const built = await scenario.build(h);
  const result = await verifySignedBundle(built.bundle, built.trustStore);
  const exp = scenario.expected;
  const matchesExpectation =
    result.verdict === exp.verdict && result.firstFailure?.id === exp.failsAt && result.firstFailure?.code === exp.code;
  return { scenario, built, result, matchesExpectation, ms: Math.round(performance.now() - t0) };
}
