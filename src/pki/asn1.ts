/**
 * A small, strict DER reader for the certificate inspector (`openssl asn1parse`).
 *
 * DER (Distinguished Encoding Rules) stores ASN.1 data as nested
 * Tag-Length-Value triples. This reader walks them and decodes common
 * primitive types for display. It performs no cryptography and is never
 * used to make a security decision: chain validation uses @peculiar/x509.
 *
 * Hostile input is expected (imported certificates), so it is bounded:
 * maximum depth, maximum node count, DER-only lengths (no indefinite form),
 * and every length is checked against the bytes actually available.
 */

export type TagClass = 'universal' | 'application' | 'context' | 'private';

export interface Asn1Node {
  /** Byte offset of the tag, from the start of the outermost structure. */
  readonly offset: number;
  /** Bytes taken by tag + length (OpenSSL's "hl"). */
  readonly headerLength: number;
  /** Bytes of content (OpenSSL's "l"). */
  readonly length: number;
  readonly depth: number;
  readonly tagClass: TagClass;
  readonly constructed: boolean;
  readonly tagNumber: number;
  /** "SEQUENCE", "INTEGER", "[0]" … */
  readonly typeName: string;
  /** Human-readable value for primitives. */
  readonly value?: string;
  readonly oid?: string;
  readonly oidName?: string;
  /** Children; for BIT/OCTET STRING these are the structure found inside it. */
  readonly children: Asn1Node[];
  /** True when the children were decoded from inside a BIT/OCTET STRING. */
  readonly encapsulates: boolean;
  /** Role in a certificate, e.g. "tbsCertificate", "subject" (set by labelCertificate). */
  label?: string;
}

export class Asn1Error extends Error {
  override readonly name = 'Asn1Error';
}

export interface ParseLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

/** OID names, matching OpenSSL's long names where OpenSSL knows them. */
export const OID_NAMES: Readonly<Record<string, string>> = {
  '1.2.840.113549.1.1.1': 'rsaEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'rsassaPss',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.9.14': 'Extension Request',
  '1.2.840.10045.2.1': 'id-ecPublicKey',
  '2.5.4.3': 'commonName',
  '2.5.4.6': 'countryName',
  '2.5.4.7': 'localityName',
  '2.5.4.8': 'stateOrProvinceName',
  '2.5.4.10': 'organizationName',
  '2.5.4.11': 'organizationalUnitName',
  '2.5.29.14': 'X509v3 Subject Key Identifier',
  '2.5.29.15': 'X509v3 Key Usage',
  '2.5.29.17': 'X509v3 Subject Alternative Name',
  '2.5.29.19': 'X509v3 Basic Constraints',
  '2.5.29.31': 'X509v3 CRL Distribution Points',
  '2.5.29.32': 'X509v3 Certificate Policies',
  '2.5.29.35': 'X509v3 Authority Key Identifier',
  '2.5.29.37': 'X509v3 Extended Key Usage',
  '1.3.6.1.5.5.7.1.1': 'Authority Information Access',
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.36': 'Document Signing (RFC 9336)',
};

const UNIVERSAL: Readonly<Record<number, string>> = {
  1: 'BOOLEAN', 2: 'INTEGER', 3: 'BIT STRING', 4: 'OCTET STRING', 5: 'NULL', 6: 'OBJECT IDENTIFIER',
  10: 'ENUMERATED', 12: 'UTF8String', 16: 'SEQUENCE', 17: 'SET', 19: 'PrintableString', 20: 'T61String',
  22: 'IA5String', 23: 'UTCTime', 24: 'GeneralizedTime', 30: 'BMPString',
};

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const preview = (b: Uint8Array, max = 20) =>
  b.length <= max ? hex(b).toUpperCase() : `${hex(b.subarray(0, max)).toUpperCase()}… (${b.length} bytes)`;

function decodeOid(b: Uint8Array): string {
  if (b.length === 0) throw new Asn1Error('Empty OBJECT IDENTIFIER.');
  const arcs: bigint[] = [];
  let acc = 0n;
  for (let i = 0; i < b.length; i++) {
    const byte = b[i] as number;
    if (acc === 0n && byte === 0x80) throw new Asn1Error('Non-minimal OBJECT IDENTIFIER encoding.');
    acc = (acc << 7n) | BigInt(byte & 0x7f);
    if (!(byte & 0x80)) {
      arcs.push(acc);
      acc = 0n;
    } else if (i === b.length - 1) {
      throw new Asn1Error('Truncated OBJECT IDENTIFIER.');
    }
  }
  const first = arcs[0] as bigint;
  const head = first < 40n ? [0n, first] : first < 80n ? [1n, first - 40n] : [2n, first - 80n];
  return [...head, ...arcs.slice(1)].join('.');
}

function decodeTime(text: string, generalized: boolean): string {
  const m = generalized
    ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text)
    : /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text);
  if (!m) return text;
  const year = generalized ? m[1] : Number(m[1]) >= 50 ? `19${m[1]}` : `20${m[1]}`;
  return `${year}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]} UTC`;
}

function decodePrimitive(tag: number, b: Uint8Array): Pick<Asn1Node, 'value' | 'oid' | 'oidName'> {
  const latin = () => String.fromCharCode(...b);
  switch (tag) {
    case 1:
      return { value: b[0] ? 'TRUE' : 'FALSE' };
    case 2:
    case 10: {
      if (b.length === 0) throw new Asn1Error('Empty INTEGER.');
      if (b.length <= 8) {
        let v = 0n;
        for (const x of b) v = (v << 8n) | BigInt(x);
        if ((b[0] as number) & 0x80) v -= 1n << BigInt(8 * b.length);
        return { value: v.toString() };
      }
      return { value: `0x${preview(b)}` };
    }
    case 5:
      return { value: '' };
    case 6: {
      const oid = decodeOid(b);
      const name = OID_NAMES[oid];
      return name ? { oid, oidName: name, value: name } : { oid, value: oid };
    }
    case 12:
      return { value: new TextDecoder('utf-8').decode(b) };
    case 19:
    case 20:
    case 22:
      return { value: latin() };
    case 23:
      return { value: decodeTime(latin(), false) };
    case 24:
      return { value: decodeTime(latin(), true) };
    case 30: {
      let s = '';
      for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(((b[i] as number) << 8) | (b[i + 1] as number));
      return { value: s };
    }
    default:
      return { value: preview(b) };
  }
}

interface Ctx {
  readonly bytes: Uint8Array;
  readonly base: number;
  nodes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
}

function readNode(ctx: Ctx, pos: number, end: number, depth: number): [Asn1Node, number] {
  if (depth > ctx.maxDepth) throw new Asn1Error(`Nesting deeper than ${ctx.maxDepth} levels.`);
  if (++ctx.nodes > ctx.maxNodes) throw new Asn1Error(`More than ${ctx.maxNodes} elements.`);
  const b = ctx.bytes;
  const start = pos;
  if (pos >= end) throw new Asn1Error(`Unexpected end of data at byte ${ctx.base + pos}.`);

  const first = b[pos++] as number;
  const tagClass = (['universal', 'application', 'context', 'private'] as const)[first >> 6] as TagClass;
  const constructed = Boolean(first & 0x20);
  let tagNumber = first & 0x1f;
  if (tagNumber === 0x1f) {
    tagNumber = 0;
    let byte: number;
    let count = 0;
    do {
      if (pos >= end || ++count > 4) throw new Asn1Error('Malformed or oversized tag number.');
      byte = b[pos++] as number;
      tagNumber = tagNumber * 128 + (byte & 0x7f);
    } while (byte & 0x80);
  }

  if (pos >= end) throw new Asn1Error(`Missing length at byte ${ctx.base + pos}.`);
  let length = b[pos++] as number;
  if (length === 0x80) throw new Asn1Error('Indefinite length is not allowed in DER.');
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n > 4) throw new Asn1Error('Length field too large.');
    if (pos + n > end) throw new Asn1Error('Truncated length field.');
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + (b[pos++] as number);
  }
  const headerLength = pos - start;
  const contentEnd = pos + length;
  if (contentEnd > end) {
    throw new Asn1Error(`Element at byte ${ctx.base + start} claims ${length} bytes but only ${end - pos} remain.`);
  }

  const typeName = tagClass === 'universal' ? (UNIVERSAL[tagNumber] ?? `UNIVERSAL ${tagNumber}`) : tagClass === 'context' ? `[${tagNumber}]` : `${tagClass.toUpperCase()} ${tagNumber}`;
  const content = b.subarray(pos, contentEnd);
  const base = { offset: ctx.base + start, headerLength, length, depth, tagClass, constructed, tagNumber, typeName };

  if (constructed) {
    const children: Asn1Node[] = [];
    let p = pos;
    while (p < contentEnd) {
      const [child, next] = readNode(ctx, p, contentEnd, depth + 1);
      children.push(child);
      p = next;
    }
    return [{ ...base, children, encapsulates: false }, contentEnd];
  }

  const decoded = tagClass === 'universal' ? decodePrimitive(tagNumber, content) : { value: preview(content) };
  // BIT STRING / OCTET STRING may wrap a whole DER structure (a public key, an extension value).
  if (tagClass === 'universal' && (tagNumber === 3 || tagNumber === 4)) {
    const inner = tagNumber === 3 ? content.subarray(1) : content;
    const innerBase = ctx.base + pos + (tagNumber === 3 ? 1 : 0);
    const plausible = tagNumber === 3 ? content[0] === 0 && inner[0] === 0x30 : inner.length > 0;
    if (plausible) {
      const nested = tryParseAll(ctx, inner, innerBase, depth + 1);
      if (nested) return [{ ...base, ...decoded, children: nested, encapsulates: true }, contentEnd];
    }
  }
  return [{ ...base, ...decoded, children: [], encapsulates: false }, contentEnd];
}

/** Parse bytes as a complete run of DER elements, or return null (no partial results). */
function tryParseAll(parent: Ctx, bytes: Uint8Array, base: number, depth: number): Asn1Node[] | null {
  const ctx: Ctx = { bytes, base, nodes: parent.nodes, maxDepth: parent.maxDepth, maxNodes: parent.maxNodes };
  try {
    const out: Asn1Node[] = [];
    let p = 0;
    while (p < bytes.length) {
      const [node, next] = readNode(ctx, p, bytes.length, depth);
      out.push(node);
      p = next;
    }
    parent.nodes = ctx.nodes;
    return out;
  } catch {
    return null;
  }
}

/** Parse one complete DER element. Throws Asn1Error on anything malformed. */
export function parseDer(bytes: Uint8Array, limits: ParseLimits = {}): Asn1Node {
  const ctx: Ctx = { bytes, base: 0, nodes: 0, maxDepth: limits.maxDepth ?? 24, maxNodes: limits.maxNodes ?? 4000 };
  const [root, end] = readNode(ctx, 0, bytes.length, 0);
  if (end !== bytes.length) throw new Asn1Error(`${bytes.length - end} unexpected bytes after the end of the structure.`);
  return root;
}

/** Every node in document order; optionally skipping structure found inside BIT/OCTET STRINGs. */
export function flatten(node: Asn1Node, includeEncapsulated = true): Asn1Node[] {
  const out: Asn1Node[] = [node];
  if (node.encapsulates && !includeEncapsulated) return out;
  for (const c of node.children) out.push(...flatten(c, includeEncapsulated));
  return out;
}

const TBS_FIELDS = ['serialNumber', 'signature', 'issuer', 'validity', 'subject', 'subjectPublicKeyInfo'];

/**
 * Name the parts of an X.509 certificate (RFC 5280 §4.1) so the tree reads
 * in course terms: tbsCertificate, issuer, validity, extensions…
 */
export function labelCertificate(root: Asn1Node): Asn1Node {
  const [tbs, sigAlg, sigVal] = root.children;
  root.label = 'Certificate';
  if (sigAlg) sigAlg.label = 'signatureAlgorithm';
  if (sigVal) sigVal.label = 'signatureValue';
  if (!tbs) return root;
  tbs.label = 'tbsCertificate';
  const kids = [...tbs.children];
  if (kids[0]?.tagClass === 'context' && kids[0].tagNumber === 0) (kids.shift() as Asn1Node).label = 'version';
  TBS_FIELDS.forEach((name, i) => {
    const n = kids[i];
    if (n) n.label = name;
  });
  const validity = kids[3];
  if (validity) {
    if (validity.children[0]) validity.children[0].label = 'notBefore';
    if (validity.children[1]) validity.children[1].label = 'notAfter';
  }
  const spki = kids[5];
  if (spki) {
    if (spki.children[0]) spki.children[0].label = 'algorithm';
    const key = spki.children[1];
    if (key) {
      key.label = 'subjectPublicKey';
      const rsa = key.children[0];
      if (rsa?.children[0]) rsa.children[0].label = 'modulus';
      if (rsa?.children[1]) rsa.children[1].label = 'publicExponent';
    }
  }
  const ext = kids.find((n) => n.tagClass === 'context' && n.tagNumber === 3);
  if (ext) {
    ext.label = 'extensions';
    for (const e of ext.children[0]?.children ?? []) {
      const id = e.children[0];
      e.label = id?.oidName ?? id?.oid ?? 'extension';
      if (id) id.label = 'extnID';
      const last = e.children[e.children.length - 1];
      if (e.children.length === 3 && e.children[1]) e.children[1].label = 'critical';
      if (last && last !== id) last.label = 'extnValue';
    }
  }
  return root;
}
