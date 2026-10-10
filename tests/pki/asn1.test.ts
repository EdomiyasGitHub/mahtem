import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Asn1Error, type Asn1Node, flatten, labelCertificate, parseDer } from '../../src/pki/asn1.ts';
import { certificateToPem, createLabHierarchy, csrToPem, type LabHierarchy } from '../../src/pki/index.ts';
import { openssl, opensslAvailable, opensslVersion, withTempDir } from '../helpers/openssl.ts';

let h: LabHierarchy;
beforeAll(async () => {
  h = await createLabHierarchy({ keySizes: { root: 2048, ministry: 2048, university: 2048 } });
}, 60_000);

const der = (c: { rawData: ArrayBuffer }) => new Uint8Array(c.rawData);
const find = (n: Asn1Node, label: string): Asn1Node | undefined => flatten(n).find((x) => x.label === label);

describe('reading a lab certificate', () => {
  it('has the RFC 5280 shape: tbsCertificate, signatureAlgorithm, signatureValue', () => {
    const root = labelCertificate(parseDer(der(h.ministry.certificate)));
    expect(root.typeName).toBe('SEQUENCE');
    expect(root.children.map((c) => c.label)).toEqual(['tbsCertificate', 'signatureAlgorithm', 'signatureValue']);
    expect(root.offset + root.headerLength + root.length).toBe(der(h.ministry.certificate).length);
  });

  it('labels the course-relevant fields and decodes them', () => {
    const root = labelCertificate(parseDer(der(h.ministry.certificate)));
    expect(find(root, 'version')?.children[0]?.value).toBe('2'); // v3 is encoded as 2
    expect(find(root, 'signature')?.children[0]?.oidName).toBe('sha256WithRSAEncryption');
    expect(flatten(find(root, 'subject') as Asn1Node).some((n) => n.value === 'Demo MoE Issuing CA')).toBe(true);
    expect(find(root, 'notBefore')?.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
    expect(find(root, 'publicExponent')?.value).toBe('65537');
    expect(find(root, 'modulus')?.value).toMatch(/\(257 bytes\)$/); // 2048-bit modulus plus a leading zero byte
  });

  it('finds each extension and decodes basicConstraints inside its OCTET STRING', () => {
    const root = labelCertificate(parseDer(der(h.ministry.certificate)));
    const bc = find(root, 'X509v3 Basic Constraints') as Asn1Node;
    expect(bc.children.map((c) => c.label)).toEqual(['extnID', 'critical', 'extnValue']);
    expect(bc.children[1]?.value).toBe('TRUE');
    const inner = bc.children[2]?.children[0]; // SEQUENCE { BOOLEAN TRUE, INTEGER 0 }
    expect(inner?.children.map((c) => c.value)).toEqual(['TRUE', '0']); // CA:TRUE, pathlen:0
  });
});

const OPENSSL_TYPE: Record<string, string> = {
  'OBJECT IDENTIFIER': 'OBJECT', PrintableString: 'PRINTABLESTRING', UTF8String: 'UTF8STRING',
  UTCTime: 'UTCTIME', GeneralizedTime: 'GENERALIZEDTIME', IA5String: 'IA5STRING',
};
const opensslType = (n: Asn1Node) =>
  n.tagClass === 'context' ? `cont [ ${n.tagNumber} ]` : (OPENSSL_TYPE[n.typeName] ?? n.typeName);

interface Line { offset: number; depth: number; hl: number; l: number; cons: boolean; type: string; value: string }
function parseAsn1parse(out: string): Line[] {
  return out.trim().split('\n').map((line) => {
    const m = /^\s*(\d+):d=(\d+)\s+hl=(\d+)\s+l=\s*(\d+)\s+(cons|prim):\s(.*)$/.exec(line);
    if (!m) throw new Error(`Unrecognised asn1parse line: ${line}`);
    const rest = m[6] as string;
    const colon = rest.indexOf(':');
    return {
      offset: Number(m[1]), depth: Number(m[2]), hl: Number(m[3]), l: Number(m[4]), cons: m[5] === 'cons',
      // OpenSSL appends "[HEX DUMP]" to OCTET STRING lines; it is a display marker, not part of the type.
      type: (colon >= 0 ? rest.slice(0, colon) : rest).replace('[HEX DUMP]', '').trim(), value: colon >= 0 ? rest.slice(colon + 1).trim() : '',
    };
  });
}

describe.skipIf(!opensslAvailable)(`agrees with \`openssl asn1parse\` (${opensslVersion}) element by element`, () => {
  const cases = () => [
    ['root certificate', certificateToPem(h.root.certificate)],
    ['ministry certificate', certificateToPem(h.ministry.certificate)],
    ['university certificate', certificateToPem(h.university.certificate)],
    ['ministry CSR', csrToPem(h.ministry.csr)],
  ] as const;

  it.each([0, 1, 2, 3])('case %i', async (i) => {
    const [name, pem] = cases()[i] as readonly [string, string];
    await withTempDir((dir) => {
      writeFileSync(join(dir, 'x.pem'), pem);
      const r = openssl(['asn1parse', '-in', 'x.pem'], { cwd: dir });
      expect(r.status, name).toBe(0);
      const lines = parseAsn1parse(r.stdout);
      const b64 = pem.replace(/-----[^-]+-----|\s/g, '');
      const ours = flatten(parseDer(new Uint8Array(Buffer.from(b64, 'base64'))), false); // OpenSSL doesn't descend into BIT/OCTET STRINGs
      expect(ours.length, `${name}: element count`).toBe(lines.length);
      ours.forEach((n, k) => {
        const o = lines[k] as Line;
        const at = `${name}, element ${k} at byte ${o.offset}`;
        expect({ offset: n.offset, depth: n.depth, hl: n.headerLength, l: n.length, cons: n.constructed, type: opensslType(n) }, at)
          .toEqual({ offset: o.offset, depth: o.depth, hl: o.hl, l: o.l, cons: o.cons, type: o.type });
        if (o.type === 'OBJECT') {
          // OpenSSL prints a name when it knows the OID, otherwise the dotted number.
          expect(/^\d+(\.\d+)+$/.test(o.value) ? n.oid : n.oidName, at).toBe(o.value);
        }
      });
    });
  });
});

describe('hostile and malformed input', () => {
  const certBytes = () => der(h.root.certificate);

  it('rejects truncated data', () => {
    expect(() => parseDer(certBytes().subarray(0, certBytes().length - 1))).toThrow(Asn1Error);
  });
  it('rejects indefinite length (not allowed in DER)', () => {
    expect(() => parseDer(new Uint8Array([0x30, 0x80, 0x00, 0x00]))).toThrow(/Indefinite length/);
  });
  it('rejects a length larger than the data', () => {
    expect(() => parseDer(new Uint8Array([0x04, 0x84, 0xff, 0xff, 0xff, 0xff]))).toThrow(/claims/);
  });
  it('rejects bytes after the structure', () => {
    expect(() => parseDer(new Uint8Array([0x05, 0x00, 0x05, 0x00]))).toThrow(/unexpected bytes/);
  });
  it('rejects empty input', () => {
    expect(() => parseDer(new Uint8Array(0))).toThrow(Asn1Error);
  });
  it('stops a nesting bomb', () => {
    const depth = 40;
    const bytes: number[] = [];
    for (let i = 0; i < depth; i++) bytes.push(0x30, 2 * (depth - i - 1));
    expect(() => parseDer(new Uint8Array(bytes))).toThrow(/deeper than 24/);
  });
  it('stops an element bomb', () => {
    const count = 5000;
    const content = new Array(count).fill([0x05, 0x00]).flat() as number[];
    const bytes = [0x30, 0x82, (content.length >> 8) & 0xff, content.length & 0xff, ...content];
    expect(() => parseDer(new Uint8Array(bytes))).toThrow(/More than 4000/);
  });
  it('decodes OIDs with large arcs and negative integers', () => {
    expect(parseDer(new Uint8Array([0x06, 0x03, 0x88, 0x37, 0x03])).oid).toBe('2.999.3');
    expect(parseDer(new Uint8Array([0x02, 0x01, 0xff])).value).toBe('-1');
  });
  it('rejects a non-minimal OID encoding', () => {
    expect(() => parseDer(new Uint8Array([0x06, 0x02, 0x80, 0x01]))).toThrow(/Non-minimal/);
  });
});
