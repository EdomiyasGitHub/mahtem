/**
 * Distinguished names (the "Subject" and "Issuer" of a certificate).
 *
 * Course §15 used: -subj "/C=ET/O=University/OU=Computer Security/CN=University Intermediate CA"
 * The lab's identities follow the same pattern. They are simulations: none of
 * them is, or claims to be, a real authority.
 */
import type { JsonName, Name } from './x509.ts';

export interface DistinguishedName {
  readonly C?: string;
  readonly O?: string;
  readonly OU?: string;
  readonly CN: string;
}

/** Attribute order written into the certificate, the same order OpenSSL uses. */
const ORDER = ['C', 'O', 'OU', 'CN'] as const;

export function toJsonName(dn: DistinguishedName): JsonName {
  return ORDER.filter((k) => dn[k] !== undefined).map((k) => ({ [k]: [dn[k] as string] }));
}

export interface NameAttribute {
  readonly type: string;
  readonly value: string;
}

/** Flatten a parsed Name into ordered (type, value) pairs. */
export function nameAttributes(name: Name): NameAttribute[] {
  return name.toJSON().flatMap((rdn) =>
    Object.entries(rdn).flatMap(([type, values]) => values.map((value) => ({ type, value: String(value) }))),
  );
}

/** "C=ET, O=Mahtem Lab, CN=…", in certificate order (as `openssl x509 -subject` prints it). */
export function nameToText(name: Name): string {
  return nameAttributes(name)
    .map((a) => `${a.type}=${a.value}`)
    .join(', ');
}

/**
 * Do two names match for chaining (child's Issuer == parent's Subject)?
 * Compares attribute types and values in order, ignoring how each string was
 * encoded (PrintableString vs UTF8String), in the spirit of RFC 5280 §7.1.
 */
export function namesMatch(a: Name, b: Name): boolean {
  const x = nameAttributes(a);
  const y = nameAttributes(b);
  return x.length === y.length && x.every((attr, i) => attr.type === y[i]?.type && attr.value === y[i]?.value);
}

/** The lab's three parties. Fictional or simulated; labelled as such. */
export const LAB_IDENTITIES = {
  root: { C: 'ET', O: 'Mahtem Lab', OU: 'National Trust (simulated)', CN: 'Demo National Root CA' },
  ministry: { C: 'ET', O: 'Mahtem Lab', OU: 'Ministry of Education (simulated)', CN: 'Demo MoE Issuing CA' },
  university: { C: 'ET', O: 'Abay Valley University', OU: 'Office of the Registrar', CN: 'Abay Valley University Diploma Signing' },
} as const satisfies Record<string, DistinguishedName>;
