import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { utf8Encode } from '../../src/crypto/index.ts';
import { SAMPLE_DIPLOMA, encodeDiploma } from '../../src/documents/diploma.ts';
import { certificateToPem, createLabHierarchy, type LabHierarchy } from '../../src/pki/index.ts';
import { scenarioById } from '../../src/scenarios/index.ts';
import { bundleToFiles, trustStoreToPem, verifySignedBundle, createTrustStore } from '../../src/verify/index.ts';
import { validateDiploma } from '../../src/ui/bench/DiplomaForm.tsx';
import { importBundle } from '../../src/ui/verify/bundle-import.ts';
import { editableText } from '../../src/ui/verify/editable.ts';

const file = (name: string, content: Uint8Array | string) => new File([typeof content === 'string' ? content : new Uint8Array(content)], name);

describe('editableText', () => {
  it('returns text for ordinary UTF-8, including Amharic', () => {
    expect(editableText(encodeDiploma(SAMPLE_DIPLOMA))).toContain('ሃና ተስፋዬ');
  });
  it('refuses a file with a byte-order mark (editing would silently change its bytes)', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8Encode('{"a":1}')]);
    expect(editableText(withBom)).toBeNull();
  });
  it('refuses invalid UTF-8', () => {
    expect(editableText(new Uint8Array([0xff, 0x00]))).toBeNull();
  });
  it('round-trips: unchanged text gives the identical bytes, so an untouched diploma still verifies', () => {
    const bytes = encodeDiploma(SAMPLE_DIPLOMA);
    expect(utf8Encode(editableText(bytes) ?? '')).toEqual(bytes);
  });
});

describe('validateDiploma', () => {
  it('accepts the sample', () => expect(validateDiploma(SAMPLE_DIPLOMA)).toBeNull());
  it.each([
    ['cgpa', '4.50', /at most 4.00/],
    ['cgpa', '3.1', /look like 3.12/],
    ['studentName', '   ', /student/],
    ['conferred', 'yesterday', /date/],
  ] as const)('rejects %s = %j', (k, v, msg) => {
    expect(validateDiploma({ ...SAMPLE_DIPLOMA, [k]: v })).toMatch(msg);
  });
});

describe('importBundle', () => {
  let h: LabHierarchy;
  let files: ReturnType<typeof bundleToFiles>;
  let trustPem: string;

  beforeAll(async () => {
    h = await createLabHierarchy({ keySizes: { root: 2048, ministry: 2048, university: 2048 } });
    const c = await scenarioById('valid').build(h);
    files = bundleToFiles(c.bundle);
    trustPem = trustStoreToPem(c.trustStore);
  }, 60_000);

  const all = () => [
    file('diploma.json', files['diploma.json']),
    file('diploma.sig', files['diploma.sig']),
    file('signer-cert.pem', files['signer-cert.pem']),
    file('chain.pem', files['chain.pem'] ?? ''),
    file('trust-store.pem', trustPem),
  ];

  it('loads a complete bundle, and the result verifies', async () => {
    const r = await importBundle(all());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anchors).toHaveLength(1);
    const v = await verifySignedBundle(
      { document: r.received.original, signature: r.received.signature, signer: r.received.signer, intermediates: r.received.intermediates },
      createTrustStore(r.anchors ?? []),
    );
    expect(v.verdict).toBe('verified');
  });

  it('matches file names case-insensitively and reports unrelated files as ignored', async () => {
    const r = await importBundle([...all().map((f) => new File([f], f.name.toUpperCase())), file('notes.txt', 'hi')]);
    expect(r.ok && r.ignored).toEqual(['notes.txt']);
  });

  it('keeps the current trust store when no trust-store.pem is selected', async () => {
    const r = await importBundle(all().slice(0, 4));
    expect(r.ok && r.anchors).toBeNull();
  });

  it('names the missing files', async () => {
    const r = await importBundle([file('diploma.json', files['diploma.json'])]);
    expect(!r.ok && r.error).toMatch(/Missing diploma\.sig, signer-cert\.pem/);
  });

  it('refuses oversized files before reading them', async () => {
    const r = await importBundle([...all().filter((f) => f.name !== 'diploma.sig'), file('diploma.sig', new Uint8Array(2000))]);
    expect(!r.ok && r.error).toMatch(/diploma\.sig .* over the 1,024-byte limit/);
  });

  it('turns a garbage certificate into a message, not a crash', async () => {
    const r = await importBundle([...all().filter((f) => f.name !== 'signer-cert.pem'), file('signer-cert.pem', 'garbage')]);
    expect(r.ok).toBe(false);
  });

  it('rejects a private key smuggled into chain.pem', async () => {
    const bad = certificateToPem(h.ministry.certificate) + '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n';
    const r = await importBundle([...all().filter((f) => f.name !== 'chain.pem'), file('chain.pem', bad)]);
    expect(!r.ok && r.error).toMatch(/PRIVATE KEY/);
  });

  it('reads a real exported scenario folder when one exists', async () => {
    const dir = join('interop', 'scenarios', '05-rogue-root');
    let names: string[];
    try {
      names = ['diploma.json', 'diploma.sig', 'signer-cert.pem', 'chain.pem', 'trust-store.pem'];
      readFileSync(join(dir, names[0] as string));
    } catch {
      return; // folder not exported in this environment
    }
    const r = await importBundle(names.map((n) => file(n, new Uint8Array(readFileSync(join(dir, n))))));
    expect(r.ok).toBe(true);
  });
});
