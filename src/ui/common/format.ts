import type { CertificateSummary, NameAttribute } from '../../pki/index.ts';

export const commonName = (attrs: readonly NameAttribute[]) => attrs.find((a) => a.type === 'CN')?.value ?? '(no common name)';

export const day = (d: Date) => d.toISOString().slice(0, 10);

/** First and last bytes of a colon-hex fingerprint: enough to compare by eye. */
export function shortFingerprint(fp: string): string {
  const parts = fp.split(':');
  return parts.length <= 8 ? fp : `${parts.slice(0, 4).join(':')} … ${parts.slice(-4).join(':')}`;
}

export function constraintsText(c: CertificateSummary): string {
  const bc = c.basicConstraints;
  if (!bc) return 'none (basicConstraints absent)';
  return `CA:${bc.ca ? 'TRUE' : 'FALSE'}${bc.pathLength !== undefined ? `, pathlen:${bc.pathLength}` : ''}${bc.critical ? ' (critical)' : ''}`;
}
