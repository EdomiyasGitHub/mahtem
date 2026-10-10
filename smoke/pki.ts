/**
 * Browser check for the PKI layer (`npm run smoke`, then open the printed URL).
 * Runs real key generation, CSRs and certificate issuance under the production
 * CSP, and reports each check. Renders with textContent only.
 */
import { checkIssuedBy, createLabHierarchy, describeCertificate } from '../src/pki/index.ts';

const status = document.getElementById('status') as HTMLElement;
const list = document.getElementById('results') as HTMLElement;
const violations: string[] = [];
document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));

function report(label: string, pass: boolean): void {
  const li = document.createElement('li');
  li.className = pass ? 'pass' : 'fail';
  li.textContent = `${pass ? '✓' : '✕'} ${label}`;
  list.append(li);
}

const t0 = performance.now();
try {
  const h = await createLabHierarchy();
  const seconds = ((performance.now() - t0) / 1000).toFixed(1);
  const root = await describeCertificate(h.root.certificate);
  const moe = await describeCertificate(h.ministry.certificate);
  const uni = await describeCertificate(h.university.certificate);
  const l1 = await checkIssuedBy(h.ministry.certificate, h.root.certificate);
  const l2 = await checkIssuedBy(h.university.certificate, h.ministry.certificate);
  const skip = await checkIssuedBy(h.university.certificate, h.root.certificate);

  report(`Hierarchy generated in ${seconds} s`, true);
  report('Root is self-issued (Subject = Issuer)', root.selfIssued);
  report('Ministry: CA:TRUE, pathlen:0', moe.basicConstraints?.ca === true && moe.basicConstraints.pathLength === 0);
  report('University: CA:FALSE', uni.basicConstraints?.ca === false);
  report('Root → Ministry link verifies', l1.signatureValid && l1.issuerNameMatches && l1.keyIdentifierMatches === true);
  report('Ministry → University link verifies', l2.signatureValid && l2.issuerNameMatches && l2.keyIdentifierMatches === true);
  report('Skipping the Ministry fails (Root did not sign the University)', !skip.signatureValid);
  report(`No Content-Security-Policy violations${violations.length ? ': ' + violations.join('; ') : ''}`, violations.length === 0);

  const allPass = list.querySelectorAll('.fail').length === 0;
  status.textContent = allPass ? 'All checks passed.' : 'Some checks failed.';
  status.className = allPass ? 'pass' : 'fail';
} catch (e) {
  status.textContent = `Error: ${String(e)}`;
  status.className = 'fail';
}
