import type { CertificateSummary } from '../../pki/index.ts';
import { commonName, constraintsText, day, shortFingerprint } from './format.ts';

/** The facts a certificate states, read from the real certificate. */
export function CertificateFacts({ summary }: { summary: CertificateSummary }) {
  const rows: Array<[string, string, boolean?]> = [
    ['Subject', commonName(summary.subject)],
    ['Issuer', summary.selfIssued ? 'itself (self-signed)' : commonName(summary.issuer)],
    ['Key', summary.publicKey ? `RSA-${summary.publicKey.modulusLength}, e = ${summary.publicKey.publicExponent}` : summary.publicKeyAlgorithm],
    ['Valid', `${day(summary.notBefore)} to ${day(summary.notAfter)} (${summary.validityDays} days)`],
    ['Constraints', constraintsText(summary)],
    ['Key usage', summary.keyUsage ? summary.keyUsage.usages.join(', ') : 'not restricted'],
    ['Fingerprint', shortFingerprint(summary.fingerprintSha256), true],
  ];
  return (
    <dl className="facts">
      {rows.map(([k, v, mono]) => (
        <div key={k} className="facts__row">
          <dt>{k}</dt>
          <dd className={mono ? 'mono' : undefined} title={k === 'Fingerprint' ? summary.fingerprintSha256 : undefined}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
