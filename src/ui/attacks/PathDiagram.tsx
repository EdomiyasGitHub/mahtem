import type { DocumentVerification } from '../../verify/index.ts';
import { commonName, constraintsText } from '../common/format.ts';

/**
 * The certification path the verifier actually found, drawn top-down:
 * trust store (or where the chain broke), then each certificate, then the document.
 * Every drawn link was verified during path building; rule violations are
 * marked on the certificate that committed them.
 */
export function PathDiagram({ result }: { result: DocumentVerification }) {
  const status = result.pathStatus;
  if (!status) return null;
  const top = result.path.length - 1;
  const signatureOk = result.steps.find((s) => s.id === 'document-signature')?.status === 'pass';
  const impostor = result.steps.find((s) => s.id === 'trust-anchor')?.details.some((d) => /impostor/.test(d.text)) ?? false;
  /** Inside a certificate's own box, its name is already shown: drop it from the reason. */
  const reason = (text: string, name: string) => {
    const t = text.replace(`“${name}” `, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const roleOf = (i: number) =>
    i === 0 ? 'Signer' : i === top && (status.stop === 'anchored' || status.stop === 'untrusted-self-signed') ? 'Root' : 'Issuer';

  const terminal =
    status.stop === 'anchored' ? (
      <div className="path-end path-end--ok">In your trust store: this is where trust comes from.</div>
    ) : status.stop === 'untrusted-self-signed' ? (
      <div className="path-end path-end--bad">
        Not in your trust store. This root came with the document, so it proves nothing.
        {impostor && ' Your trust store holds a root with exactly this name but a different key: this one is an impostor.'}
      </div>
    ) : status.stop === 'too-long' ? (
      <div className="path-end path-end--bad">The chain is too long to follow.</div>
    ) : (
      <div className="path-end path-end--bad">
        {status.stop === 'issuer-not-found' ? 'Missing issuer: ' : 'Issuer did not sign this: '}
        <span className="mono">{status.missingIssuer}</span>
      </div>
    );

  return (
    <div className="path" aria-label="Certification path the verifier found">
      {terminal}
      {[...result.path].reverse().map((c, k) => {
        const i = top - k;
        const findings = status.findings.filter((f) => f.index === i);
        const linkUp = i === top ? status.stop === 'anchored' || status.stop === 'untrusted-self-signed' : true;
        return (
          <div key={c.fingerprintSha256}>
            <div className={`edge edge--instant ${linkUp && (i < top || status.stop === 'anchored') ? 'edge--verified' : 'edge--failed'} edge--short`} aria-hidden="true">
              <span className="edge__line" />
            </div>
            <div className={`node node--static${findings.length ? ' node--bad' : ''}`}>
              <span className="node__top">
                <span className="node__role">{roleOf(i)}</span>
                <span className="node__constraints">{constraintsText(c).replace(' (critical)', '')}</span>
              </span>
              <span className="node__name">{commonName(c.subject)}</span>
              {findings.length > 0 && (
                <ul className="node__findings">
                  {findings.map((f, j) => (
                    <li key={j}>{reason(f.text, commonName(c.subject))}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
      <div className={`edge edge--instant edge--document ${signatureOk ? 'edge--verified' : 'edge--failed'}`}>
        <span className="edge__line" aria-hidden="true" />
        <span className="edge__text">
          {signatureOk ? (
            <span className="edge__ok">Document signature valid under the signer’s key</span>
          ) : (
            <span className="edge__bad">Document signature does not match the signer’s key</span>
          )}
        </span>
      </div>
      <div className="node node--static node--document">
        <span className="node__name">The diploma</span>
      </div>
    </div>
  );
}
