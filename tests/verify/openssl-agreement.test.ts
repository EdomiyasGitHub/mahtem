/**
 * Every scenario judged twice: by the app's verifier and by the OpenSSL CLI.
 *
 *   document:  openssl dgst -sha256 -verify signer-pub.pem -signature diploma.sig diploma.json
 *   chain:     openssl verify -no-CApath -no-CAstore -CAfile trust-store.pem [-untrusted chain.pem] signer-cert.pem
 *
 * Both verdicts must agree, and OpenSSL's error must be the counterpart of
 * the app's failure code. (-no-CApath/-no-CAstore keep the operating
 * system's own trusted roots out of the comparison.)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLabHierarchy, type LabHierarchy } from '../../src/pki/index.ts';
import { OPENSSL_VERDICTS, SCENARIOS, type ScenarioCase, type ScenarioId } from '../../src/scenarios/index.ts';
import { bundleToFiles, trustStoreToPem, verifySignedBundle, type DocumentVerification } from '../../src/verify/index.ts';
import { openssl, opensslAvailable, opensslVersion, withTempDir } from '../helpers/openssl.ts';

describe.skipIf(!opensslAvailable)(`app and ${opensslVersion} agree on every scenario`, () => {
  let h: LabHierarchy;
  const cases = new Map<ScenarioId, { c: ScenarioCase; app: DocumentVerification }>();

  beforeAll(async () => {
    h = await createLabHierarchy({ keySizes: { root: 2048, ministry: 2048, university: 2048 } });
    for (const s of SCENARIOS) {
      const c = await s.build(h);
      cases.set(s.id, { c, app: await verifySignedBundle(c.bundle, c.trustStore) });
    }
  }, 120_000);

  it.each(SCENARIOS.map((s) => [s.n, s.id, s] as const))('%i · %s', async (_n, id, s) => {
    const { c, app } = cases.get(id) as { c: ScenarioCase; app: DocumentVerification };
    await withTempDir((dir) => {
      const files = bundleToFiles(c.bundle);
      for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
      writeFileSync(join(dir, 'trust-store.pem'), trustStoreToPem(c.trustStore));
      expect(openssl(['x509', '-in', 'signer-cert.pem', '-pubkey', '-noout', '-out', 'signer-pub.pem'], { cwd: dir }).status).toBe(0);

      const dgst = openssl(['dgst', '-sha256', '-verify', 'signer-pub.pem', '-signature', 'diploma.sig', 'diploma.json'], { cwd: dir });
      const opensslSignatureOk = dgst.stdout.trim() === 'Verified OK';

      const chainArgs = ['verify', '-no-CApath', '-no-CAstore', '-CAfile', 'trust-store.pem'];
      if (files['chain.pem']) chainArgs.push('-untrusted', 'chain.pem');
      const chain = openssl([...chainArgs, 'signer-cert.pem'], { cwd: dir });
      const opensslChainOk = chain.status === 0 && /signer-cert\.pem: OK/.test(chain.stdout);

      const appSignatureOk = app.steps.find((x) => x.id === 'document-signature')?.status === 'pass';
      const appChainOk = ['signer-certificate', 'issuer-certificates', 'trust-anchor', 'validity'].every(
        (step) => app.steps.find((x) => x.id === step)?.status === 'pass',
      );

      // 1. Both match the scenario's expectation, so they agree with each other.
      expect({ app: appSignatureOk, openssl: opensslSignatureOk }).toEqual({ app: s.expected.signatureValid, openssl: s.expected.signatureValid });
      expect({ app: appChainOk, openssl: opensslChainOk }).toEqual({ app: s.expected.chainValid, openssl: s.expected.chainValid });

      // 2. OpenSSL says exactly what the shared table (shown in the UI) claims it says.
      const table = OPENSSL_VERDICTS[id];
      expect(dgst.stdout.trim()).toBe(table.dgst);
      expect(opensslChainOk).toBe(table.verify.ok);
      if (!table.verify.ok) {
        const codes = table.verify.codes;
        const reported = [...(chain.stdout + chain.stderr).matchAll(/error (\d+) at/g)].map((m) => Number(m[1]));
        expect(reported.some((code) => codes.includes(code)), `OpenSSL said: ${chain.stdout}${chain.stderr}`).toBe(true);
      }
    });
  });
});
