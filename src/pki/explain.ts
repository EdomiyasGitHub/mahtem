/**
 * Plain-language explanations of certificate extensions, for the inspector.
 * Each explanation is derived from the real extension values.
 */
import { type CertificateSummary, describeCertificate } from './inspect.ts';
import type { X509Certificate } from './x509.ts';

export interface ExtensionExplanation {
  readonly oid: string;
  readonly name: string;
  readonly critical: boolean;
  /** The value as OpenSSL would print it. */
  readonly value: string;
  /** What it means, in plain words. */
  readonly meaning: string;
  readonly course?: string;
}

const KU_PHRASES: Readonly<Record<string, string>> = {
  'Certificate Sign': 'sign certificates',
  'CRL Sign': 'sign certificate revocation lists',
  'Digital Signature': 'sign data such as documents',
  'Non Repudiation': 'make signatures meant as evidence of commitment',
  'Key Encipherment': 'encrypt other keys',
  'Data Encipherment': 'encrypt data directly',
  'Key Agreement': 'agree on shared keys',
};

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function explainSummary(s: CertificateSummary): ExtensionExplanation[] {
  return s.extensions.map((e): ExtensionExplanation => {
    const base = { oid: e.oid, name: e.name, critical: e.critical };
    switch (e.oid) {
      case '2.5.29.19': {
        const bc = s.basicConstraints;
        if (!bc) break;
        const value = `CA:${bc.ca ? 'TRUE' : 'FALSE'}${bc.pathLength !== undefined ? `, pathlen:${bc.pathLength}` : ''}`;
        const meaning = !bc.ca
          ? 'Not a certificate authority: this key may never issue certificates, however it is used.'
          : bc.pathLength === 0
            ? 'A certificate authority that may issue certificates only to end entities, never to another CA.'
            : bc.pathLength !== undefined
              ? `A certificate authority that may have at most ${bc.pathLength} more CA level${bc.pathLength === 1 ? '' : 's'} beneath it.`
              : 'A certificate authority with no limit on how many CA levels may sit beneath it.';
        return { ...base, value, meaning, course: 'course §16' };
      }
      case '2.5.29.15': {
        const usages = s.keyUsage?.usages ?? [];
        return {
          ...base,
          value: usages.join(', '),
          meaning: `This key may only ${list(usages.map((u) => KU_PHRASES[u] ?? u.toLowerCase()))}. Any other use must be refused.`,
          course: 'course §16',
        };
      }
      case '2.5.29.37': {
        const names = s.extendedKeyUsage?.usages.map((u) => u.name) ?? [];
        return { ...base, value: names.join(', '), meaning: `Further restricts the key to: ${list(names)}.` };
      }
      case '2.5.29.14':
        return {
          ...base,
          value: s.subjectKeyId ?? '',
          meaning: 'A fingerprint of this certificate’s own public key. Certificates signed by this key point back to it.',
          course: 'course §16',
        };
      case '2.5.29.35':
        return {
          ...base,
          value: s.authorityKeyId ?? '',
          meaning: s.selfIssued && s.authorityKeyId === s.subjectKeyId
            ? 'Identifies the key that signed this certificate. It equals this certificate’s own key identifier, because a root signs itself.'
            : 'Identifies the key that signed this certificate. It must equal the issuer’s Subject Key Identifier.',
          course: 'course §16',
        };
    }
    return {
      ...base,
      value: '(not decoded)',
      meaning: e.critical
        ? 'This verifier does not understand this extension. Because it is marked critical, the certificate must be rejected.'
        : 'This verifier does not understand this extension. It is not critical, so it may be ignored.',
    };
  });
}

export async function explainExtensions(cert: X509Certificate): Promise<ExtensionExplanation[]> {
  return explainSummary(await describeCertificate(cert));
}

/** What "critical" means, shown once in the inspector. */
export const CRITICAL_MEANING =
  'Critical: software that does not understand this extension must reject the whole certificate rather than ignore it.';
