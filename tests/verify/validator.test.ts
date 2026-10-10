import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { forgeCertificate } from '../../src/attacks/forge.ts';
import { SIGNATURE_ALGORITHM, generateRsaKeyPair, sign } from '../../src/crypto/index.ts';
import { SAMPLE_DIPLOMA, encodeDiploma } from '../../src/documents/diploma.ts';
import { LAB_IDENTITIES, certificateFromPem, certificateToPem, createLabHierarchy, type LabHierarchy } from '../../src/pki/index.ts';
import {
  BasicConstraintsExtension,
  ExtendedKeyUsage,
  ExtendedKeyUsageExtension,
  Extension,
  KeyUsageFlags,
  KeyUsagesExtension,
  X509CertificateGenerator,
  type X509Certificate,
} from '../../src/pki/x509.ts';
import {
  bundleFromFiles,
  bundleToFiles,
  createTrustStore,
  validateCertificate,
  verifyBundleFiles,
  verifySignedBundle,
  type SignedBundle,
} from '../../src/verify/index.ts';
import { openssl, opensslAvailable, withTempDir } from '../helpers/openssl.ts';

let h: LabHierarchy;
let genuine: SignedBundle;
const trust = () => createTrustStore([h.root.certificate]);

beforeAll(async () => {
  h = await createLabHierarchy({ keySizes: { root: 2048, ministry: 2048, university: 2048 } });
  const document = encodeDiploma(SAMPLE_DIPLOMA);
  genuine = { document, signature: await sign(h.university.keys.privateKey, document), signer: h.university.certificate, intermediates: [h.ministry.certificate] };
}, 60_000);

/** A signer certificate with custom extensions, issued by the real Ministry. */
async function signerWith(extensions: Extension[]): Promise<{ cert: X509Certificate; keys: CryptoKeyPair }> {
  const keys = await generateRsaKeyPair({ modulusLength: 2048 });
  const cert = await X509CertificateGenerator.create({
    serialNumber: '0abc',
    subject: 'CN=Custom Signer',
    issuer: h.ministry.certificate.subjectName,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 86_400_000),
    publicKey: keys.publicKey,
    signingKey: h.ministry.keys.privateKey,
    signingAlgorithm: SIGNATURE_ALGORITHM,
    extensions,
  });
  return { cert, keys };
}

async function signedBy(signer: { cert: X509Certificate; keys: CryptoKeyPair }): Promise<SignedBundle> {
  const document = encodeDiploma(SAMPLE_DIPLOMA);
  return { document, signature: await sign(signer.keys.privateKey, document), signer: signer.cert, intermediates: [h.ministry.certificate] };
}

describe('hostile or malformed bundles', () => {
  it('a garbage certificate fails check 1; nothing else is attempted', async () => {
    const r = await verifyBundleFiles({ document: genuine.document, signature: genuine.signature, signerPem: 'not a certificate' }, trust());
    expect(r.verdict).toBe('failed');
    expect(r.steps[0]).toMatchObject({ n: 1, status: 'fail', code: 'bundle-malformed' });
    expect(r.steps.slice(1).every((s) => s.status === 'skipped')).toBe(true);
  });

  it('a private key smuggled into chain.pem is rejected, not skipped', async () => {
    const chainPem = certificateToPem(h.ministry.certificate) + '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n';
    const r = await verifyBundleFiles(
      { document: genuine.document, signature: genuine.signature, signerPem: certificateToPem(genuine.signer), chainPem },
      trust(),
    );
    expect(r.steps[0]?.code).toBe('bundle-malformed');
    expect(r.steps[0]?.summary).toMatch(/PRIVATE KEY/);
  });

  it('an empty or absurdly long signature is rejected at check 1', async () => {
    const base = { document: genuine.document, signerPem: certificateToPem(genuine.signer) };
    expect((await verifyBundleFiles({ ...base, signature: new Uint8Array(0) }, trust())).steps[0]?.code).toBe('bundle-malformed');
    expect((await verifyBundleFiles({ ...base, signature: new Uint8Array(5000) }, trust())).steps[0]?.code).toBe('bundle-malformed');
  });

  it('duplicate, irrelevant and self-referencing certificates in the bundle do not confuse path building', async () => {
    const decoy = await createLabHierarchy({ keySizes: { root: 2048, ministry: 2048, university: 2048 } });
    const noisy: SignedBundle = {
      ...genuine,
      intermediates: [decoy.root.certificate, h.university.certificate, h.ministry.certificate, decoy.ministry.certificate, h.ministry.certificate],
    };
    const r = await verifySignedBundle(noisy, trust());
    expect(r.verdict).toBe('verified');
    expect(r.path).toHaveLength(3);
  }, 30_000);

  it('files round-trip: export then re-import gives the same verdict', async () => {
    const f = bundleToFiles(genuine);
    const back = bundleFromFiles({ document: f['diploma.json'], signature: f['diploma.sig'], signerPem: f['signer-cert.pem'], chainPem: f['chain.pem'] });
    expect((await verifySignedBundle(back, trust())).verdict).toBe('verified');
  });
});

describe('time', () => {
  it('before the certificates existed: not yet valid (check 7)', async () => {
    const r = await verifySignedBundle(genuine, trust(), { at: new Date('2020-01-01T00:00:00Z') });
    expect(r.firstFailure).toMatchObject({ n: 7, code: 'not-yet-valid' });
  });

  it('after the University certificate expires: expired (check 7)', async () => {
    const r = await verifySignedBundle(genuine, trust(), { at: new Date(Date.now() + 3 * 365 * 86_400_000) });
    expect(r.firstFailure).toMatchObject({ n: 7, code: 'expired' });
    expect(r.firstFailure?.summary).toMatch(/Abay Valley University/);
  });
});

describe('signer restrictions (check 4)', () => {
  it('rejects an unknown critical extension', async () => {
    const s = await forgeCertificate({
      subject: { CN: 'Signer With Mystery Extension' },
      subjectPublicKey: (await generateRsaKeyPair({ modulusLength: 2048 })).publicKey,
      issuer: { name: h.ministry.certificate.subjectName, publicKey: h.ministry.certificate.publicKey, signingKey: h.ministry.keys.privateKey },
      profile: 'document-signer',
      extraExtensions: [new Extension('1.3.6.1.4.1.99999.1', true, new Uint8Array([0x05, 0x00]))],
    });
    const r = await verifySignedBundle({ ...genuine, signer: s }, trust());
    expect(r.steps.find((x) => x.n === 4)).toMatchObject({ status: 'fail', code: 'unsupported-critical-extension' });
  });

  it('rejects a signer whose keyUsage does not allow signatures', async () => {
    const s = await signerWith([new BasicConstraintsExtension(false, undefined, true), new KeyUsagesExtension(KeyUsageFlags.keyEncipherment, true)]);
    const r = await verifySignedBundle(await signedBy(s), trust());
    expect(r.firstFailure).toMatchObject({ n: 4, code: 'key-usage-not-allowed' });
  });

  it('rejects a signer restricted to another purpose by extendedKeyUsage (e.g. a web server certificate)', async () => {
    const s = await signerWith([
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
    ]);
    const r = await verifySignedBundle(await signedBy(s), trust());
    expect(r.firstFailure).toMatchObject({ n: 4, code: 'extended-key-usage-mismatch' });
  });
});

describe('forged links', () => {
  it('an intermediate claiming the real root as issuer, but signed by another key, breaks the chain', async () => {
    const attacker = await generateRsaKeyPair({ modulusLength: 2048 });
    const fakeMinistryKeys = await generateRsaKeyPair({ modulusLength: 2048 });
    const fakeMinistry = await forgeCertificate({
      subject: LAB_IDENTITIES.ministry,
      subjectPublicKey: fakeMinistryKeys.publicKey,
      issuer: { name: h.root.certificate.subjectName, publicKey: attacker.publicKey, signingKey: attacker.privateKey },
      profile: 'intermediate-ca',
    });
    const uniKeys = await generateRsaKeyPair({ modulusLength: 2048 });
    const fakeUni = await forgeCertificate({
      subject: LAB_IDENTITIES.university,
      subjectPublicKey: uniKeys.publicKey,
      issuer: { name: fakeMinistry.subjectName, publicKey: fakeMinistry.publicKey, signingKey: fakeMinistryKeys.privateKey },
      profile: 'document-signer',
    });
    const document = encodeDiploma(SAMPLE_DIPLOMA);
    const r = await verifySignedBundle(
      { document, signature: await sign(uniKeys.privateKey, document), signer: fakeUni, intermediates: [fakeMinistry] },
      trust(),
    );
    expect(r.firstFailure).toMatchObject({ n: 5, code: 'certificate-signature-invalid' });
    expect(r.steps.find((x) => x.n === 3)?.status).toBe('pass');
  }, 30_000);

  it('rejects a chain longer than 8 certificates', async () => {
    let issuer = { name: h.root.certificate.subjectName, publicKey: h.root.certificate.publicKey as CryptoKey | X509Certificate['publicKey'], signingKey: h.root.keys.privateKey };
    const chain: X509Certificate[] = [];
    let last: { cert: X509Certificate; keys: CryptoKeyPair } | null = null;
    for (let i = 0; i < 9; i++) {
      const keys = await generateRsaKeyPair({ modulusLength: 2048 });
      const cert = await forgeCertificate({ subject: { CN: `Level ${i} CA` }, subjectPublicKey: keys.publicKey, issuer, profile: 'root-ca' });
      chain.push(cert);
      last = { cert, keys };
      issuer = { name: cert.subjectName, publicKey: cert.publicKey, signingKey: keys.privateKey };
    }
    const leafKeys = await generateRsaKeyPair({ modulusLength: 2048 });
    const leaf = await forgeCertificate({ subject: { CN: 'Deep Signer' }, subjectPublicKey: leafKeys.publicKey, issuer, profile: 'document-signer' });
    expect(last).not.toBeNull();
    const document = encodeDiploma(SAMPLE_DIPLOMA);
    const r = await verifySignedBundle({ document, signature: await sign(leafKeys.privateKey, document), signer: leaf, intermediates: chain.reverse() }, trust());
    expect(r.verdict).toBe('failed');
    expect(r.steps.some((x) => x.code === 'chain-too-long')).toBe(true);
  }, 60_000);
});

describe.skipIf(!opensslAvailable)('certificates made with the course commands', () => {
  it('validates a course-built intermediate against its root, as `openssl verify -CAfile` does (§19)', async () => {
    await withTempDir(async (dir) => {
      const run = (args: string[]) => expect(openssl(args, { cwd: dir }).status).toBe(0);
      writeFileSync(join(dir, 'intermediate-ext.cnf'), 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
      run(['genrsa', '-out', 'rootCA-key.pem', '2048']);
      run(['req', '-x509', '-new', '-sha256', '-key', 'rootCA-key.pem', '-out', 'rootCA-cert.pem', '-days', '3650', '-subj', '/C=ET/O=University/CN=University Root CA']);
      run(['genrsa', '-out', 'int-key.pem', '2048']);
      run(['req', '-new', '-sha256', '-key', 'int-key.pem', '-out', 'int.csr', '-subj', '/C=ET/O=University/CN=University Intermediate CA']);
      run(['x509', '-req', '-sha256', '-in', 'int.csr', '-CA', 'rootCA-cert.pem', '-CAkey', 'rootCA-key.pem', '-CAcreateserial', '-out', 'int-cert.pem', '-days', '1825', '-extfile', 'intermediate-ext.cnf']);
      // and a SHA-1 signed sibling, to check the weak-algorithm rule
      run(['x509', '-req', '-sha1', '-in', 'int.csr', '-CA', 'rootCA-cert.pem', '-CAkey', 'rootCA-key.pem', '-CAcreateserial', '-out', 'int-sha1.pem', '-days', '1825', '-extfile', 'intermediate-ext.cnf']);

      const root = certificateFromPem(readFileSync(join(dir, 'rootCA-cert.pem'), 'utf8'));
      const inter = certificateFromPem(readFileSync(join(dir, 'int-cert.pem'), 'utf8'));
      const sha1 = certificateFromPem(readFileSync(join(dir, 'int-sha1.pem'), 'utf8'));

      const ok = await validateCertificate(inter, [], createTrustStore([root]));
      expect(ok).toMatchObject({ valid: true, code: null });
      expect(openssl(['verify', '-no-CApath', '-no-CAstore', '-CAfile', 'rootCA-cert.pem', 'int-cert.pem'], { cwd: dir }).stdout.trim()).toBe('int-cert.pem: OK');

      expect((await validateCertificate(inter, [], createTrustStore([]))).valid).toBe(false);
      expect((await validateCertificate(sha1, [], createTrustStore([root]))).code).toBe('weak-signature-algorithm');
    });
  });
});
