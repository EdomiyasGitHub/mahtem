import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toColonHex, fromHex } from '../../crypto/index.ts';
import {
  CRITICAL_MEANING,
  type CertificateSummary,
  type ExtensionExplanation,
  certificateToPem,
  describeCertificate,
  explainSummary,
  labelCertificate,
  parseDer,
  type X509Certificate,
} from '../../pki/index.ts';
import { Command } from '../common/Command.tsx';
import { downloadFile } from '../common/download.ts';
import { Asn1Tree } from './Asn1Tree.tsx';
import { ColonHex, isColonHex } from '../common/ColonHex.tsx';

type Tab = 'fields' | 'extensions' | 'asn1' | 'pem';
const TABS: Array<[Tab, string]> = [['fields', 'Fields'], ['extensions', 'Extensions'], ['asn1', 'ASN.1'], ['pem', 'PEM']];

function validityStatus(s: CertificateSummary): string {
  const now = Date.now();
  if (now < s.notBefore.getTime()) return 'not yet valid';
  if (now > s.notAfter.getTime()) return 'expired';
  return 'valid today';
}

function Fields({ s }: { s: CertificateSummary }) {
  const rows: Array<[string, string, boolean?]> = [
    ['Subject', s.subjectText],
    ['Issuer', s.selfIssued ? `${s.issuerText} (itself: self-signed)` : s.issuerText],
    ['Serial number', toColonHex(fromHex(s.serialNumber)), true],
    ['Valid from', `${s.notBefore.toISOString().replace('T', ' ').slice(0, 19)} UTC`],
    ['Valid until', `${s.notAfter.toISOString().replace('T', ' ').slice(0, 19)} UTC (${s.validityDays} days, ${validityStatus(s)})`],
    ['Public key', s.publicKey ? `RSA, ${s.publicKey.modulusLength} bits, exponent ${s.publicKey.publicExponent}` : s.publicKeyAlgorithm],
    ['Signature algorithm', s.signatureAlgorithm],
    ['Subject key identifier', s.subjectKeyId ?? 'absent', true],
    ['Authority key identifier', s.authorityKeyId ?? 'absent', true],
    ['SHA-256 fingerprint', s.fingerprintSha256, true],
  ];
  return (
    <dl className="facts facts--wide">
      {rows.map(([k, v, mono]) => (
        <div key={k} className="facts__row">
          <dt>{k}</dt>
          <dd className={mono && !isColonHex(v) ? 'mono' : undefined}>{isColonHex(v) ? <ColonHex value={v} /> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Extensions({ list }: { list: readonly ExtensionExplanation[] }) {
  return (
    <>
      <ul className="ext-list">
        {list.map((e) => (
          <li key={e.oid} className="ext">
            <div className="ext__head">
              <span className="ext__name">{e.name}</span>
              {e.critical && <span className="ext__critical">critical</span>}
              {e.course && <span className="provenance">{e.course}</span>}
            </div>
            <code className="ext__value">{isColonHex(e.value) ? <ColonHex value={e.value} /> : e.value}</code>
            <p className="ext__meaning">{e.meaning}</p>
          </li>
        ))}
      </ul>
      <p className="inspector__note">{CRITICAL_MEANING}</p>
    </>
  );
}

export function Inspector({ certificate, title, fileName }: { certificate: X509Certificate; title: string; fileName: string }) {
  const [tab, setTab] = useState<Tab>('fields');
  const [summary, setSummary] = useState<CertificateSummary | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const id = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pem = useMemo(() => certificateToPem(certificate), [certificate]);
  const tree = useMemo(() => labelCertificate(parseDer(new Uint8Array(certificate.rawData))), [certificate]);

  useEffect(() => {
    let live = true;
    setSummary(null);
    void describeCertificate(certificate).then((s) => live && setSummary(s));
    return () => {
      live = false;
    };
  }, [certificate]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(([t]) => t === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab((TABS[next] as [Tab, string])[0]);
    tabRefs.current[next]?.focus();
  };

  const commands: Record<Tab, string[]> = {
    fields: [`openssl x509 -in ${fileName} -noout -subject -issuer -serial -dates -fingerprint -sha256`],
    extensions: [`openssl x509 -in ${fileName} -noout -text`],
    asn1: [`openssl asn1parse -in ${fileName}`],
    pem: [`type ${fileName}`],
  };

  return (
    <aside className="inspector" aria-labelledby={`${id}-title`}>
      <p className="inspector__kicker">Inspector</p>
      <h2 id={`${id}-title`} className="inspector__title">{title}</h2>
      <div className="tabs" role="tablist" aria-label="Certificate views" onKeyDown={onKeyDown}>
        {TABS.map(([t, label], i) => (
          <button
            key={t}
            ref={(el) => { tabRefs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${id}-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t ? 0 : -1}
            className="tabs__tab"
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="inspector__panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {!summary ? (
          <p className="inspector__note">Reading the certificate…</p>
        ) : tab === 'fields' ? (
          <Fields s={summary} />
        ) : tab === 'extensions' ? (
          <Extensions list={explainSummary(summary)} />
        ) : tab === 'asn1' ? (
          <>
            <p className="inspector__note">
              The certificate’s binary structure (DER), read element by element. Same structure and offsets as{' '}
              <code>openssl asn1parse</code>, checked by the test suite.
            </p>
            <Asn1Tree root={tree} />
          </>
        ) : (
          <>
            <p className="inspector__note">The same bytes as Base64 text. This is the file OpenSSL reads.</p>
            <pre className="pem">{pem}</pre>
            <div className="files__buttons">
              <button type="button" className="button" onClick={() => downloadFile(fileName, pem, 'application/x-pem-file')}>
                Download {fileName}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  navigator.clipboard.writeText(pem).then(
                    () => setCopied('Copied to the clipboard.'),
                    () => setCopied('The browser refused clipboard access. Use Download instead.'),
                  );
                }}
              >
                Copy PEM
              </button>
            </div>
            {copied && <p className="files__msg" role="status">{copied}</p>}
          </>
        )}
        <details className="disclosure">
          <summary className="disclosure__summary">OpenSSL equivalent</summary>
          <div className="disclosure__body">
            <Command lines={commands[tab]} note={tab === 'pem' ? 'On Windows, type prints a file; on macOS or Linux, use cat.' : undefined} />
          </div>
        </details>
      </div>
    </aside>
  );
}
