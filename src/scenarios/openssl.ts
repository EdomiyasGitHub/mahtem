/**
 * What OpenSSL says for each scenario's files, as measured by the test suite
 * (tests/verify/openssl-agreement.test.ts asserts every row with the real CLI).
 * The browser cannot run OpenSSL; the UI shows this table, labelled as such.
 */
import type { ScenarioId } from './scenarios.ts';

export interface OpensslVerdict {
  /** `openssl dgst -sha256 -verify …` output. */
  readonly dgst: 'Verified OK' | 'Verification failure';
  /** `openssl verify …` result: OK, or the X509_V_ERR numbers accepted for this scenario. */
  readonly verify: { readonly ok: true } | { readonly ok: false; readonly codes: readonly number[]; readonly meaning: string };
}

const OK = { ok: true } as const;

export const OPENSSL_VERDICTS: Readonly<Record<ScenarioId, OpensslVerdict>> = {
  valid: { dgst: 'Verified OK', verify: OK },
  'tampered-document': { dgst: 'Verification failure', verify: OK },
  'signature-swap': { dgst: 'Verification failure', verify: OK },
  'wrong-signer-key': { dgst: 'Verification failure', verify: OK },
  'rogue-root': { dgst: 'Verified OK', verify: { ok: false, codes: [19], meaning: 'self-signed certificate in certificate chain' } },
  'missing-intermediate': { dgst: 'Verified OK', verify: { ok: false, codes: [20], meaning: 'unable to get local issuer certificate' } },
  'path-length-violation': { dgst: 'Verified OK', verify: { ok: false, codes: [25], meaning: 'path length constraint exceeded' } },
  'end-entity-as-ca': { dgst: 'Verified OK', verify: { ok: false, codes: [24, 79], meaning: 'invalid CA certificate' } },
  'expired-certificate': { dgst: 'Verified OK', verify: { ok: false, codes: [10], meaning: 'certificate has expired' } },
  'untrusted-root': { dgst: 'Verified OK', verify: { ok: false, codes: [19], meaning: 'self-signed certificate in certificate chain' } },
};
