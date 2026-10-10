import { beforeAll, describe, expect, it } from 'vitest';
import { generateRsaKeyPair, SIGNATURE_ALGORITHM } from '../../src/crypto/index.ts';
import {
  IssuancePolicyError,
  LAB_IDENTITIES,
  OID_DOCUMENT_SIGNING,
  PkiError,
  certificateFromPem,
  certificateToPem,
  checkIssuedBy,
  createCsr,
  createLabHierarchy,
  createRootCertificate,
  csrFromPem,
  csrToPem,
  describeCertificate,
  describeCsr,
  hierarchyPublicFiles,
  issueCertificate,
  verifyCsr,
  type LabHierarchy,
} from '../../src/pki/index.ts';
import {
  BasicConstraintsExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  Pkcs10CertificateRequest,
  Pkcs10CertificateRequestGenerator,
  X509CertificateGenerator,
} from '../../src/pki/x509.ts';

const FAST = { root: 2048, ministry: 2048, university: 2048 } as const;
let h: LabHierarchy;

beforeAll(async () => {
  h = await createLabHierarchy({ keySizes: FAST });
}, 60_000);

async function refusalCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'issued';
  } catch (e) {
    if (e instanceof IssuancePolicyError) return e.code;
    throw e;
  }
}

describe('lab hierarchy structure', () => {
  it('root is self-issued: Subject = Issuer (course §10)', async () => {
    const root = await describeCertificate(h.root.certificate);
    expect(root.selfIssued).toBe(true);
    expect(root.subjectText).toBe('C=ET, O=Mahtem Lab, OU=National Trust (simulated), CN=Demo National Root CA');
    expect(root.issuerText).toBe(root.subjectText);
  });

  it('ministry is issued by the root; university by the ministry', async () => {
    const root = await describeCertificate(h.root.certificate);
    const moe = await describeCertificate(h.ministry.certificate);
    const uni = await describeCertificate(h.university.certificate);
    expect(moe.issuerText).toBe(root.subjectText);
    expect(uni.issuerText).toBe(moe.subjectText);
    expect(moe.selfIssued).toBe(false);
  });

  it('every link verifies: name, key identifier and signature', async () => {
    for (const [child, parent] of [
      [h.root.certificate, h.root.certificate],
      [h.ministry.certificate, h.root.certificate],
      [h.university.certificate, h.ministry.certificate],
    ] as const) {
      expect(await checkIssuedBy(child, parent)).toEqual({ issuerNameMatches: true, keyIdentifierMatches: true, signatureValid: true });
    }
  });

  it('a skipped link fails: the root did not sign the university certificate', async () => {
    const link = await checkIssuedBy(h.university.certificate, h.root.certificate);
    expect(link.signatureValid).toBe(false);
    expect(link.issuerNameMatches).toBe(false);
    expect(link.keyIdentifierMatches).toBe(false);
  });

  it('a different root with the same name cannot impersonate the real one', async () => {
    const impostorKeys = await generateRsaKeyPair({ modulusLength: 2048 });
    const impostor = await createRootCertificate({ keys: impostorKeys, subject: LAB_IDENTITIES.root });
    const link = await checkIssuedBy(h.ministry.certificate, impostor);
    expect(link.issuerNameMatches).toBe(true); // names can be copied by anyone...
    expect(link.signatureValid).toBe(false); // ...signatures cannot
    expect(link.keyIdentifierMatches).toBe(false);
  });
});

describe('extensions match the course', () => {
  it('intermediate: CA:TRUE pathlen:0 critical; keyCertSign + cRLSign critical (course §16)', async () => {
    const moe = await describeCertificate(h.ministry.certificate);
    expect(moe.basicConstraints).toEqual({ critical: true, ca: true, pathLength: 0 });
    expect(moe.keyUsage).toEqual({ critical: true, usages: ['Certificate Sign', 'CRL Sign'] });
    expect(moe.subjectKeyId).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
    expect(moe.authorityKeyId).toBe((await describeCertificate(h.root.certificate)).subjectKeyId);
    expect(moe.validityDays).toBe(1825);
    expect(moe.signatureAlgorithm).toBe('sha256WithRSAEncryption');
  });

  it('root: CA:TRUE without a path length limit; 10-year validity', async () => {
    const root = await describeCertificate(h.root.certificate);
    expect(root.basicConstraints).toEqual({ critical: true, ca: true });
    expect(root.keyUsage?.usages).toEqual(['Certificate Sign', 'CRL Sign']);
    expect(root.validityDays).toBe(3650);
  });

  it('university: an end entity that signs documents and cannot act as a CA', async () => {
    const uni = await describeCertificate(h.university.certificate);
    expect(uni.basicConstraints).toEqual({ critical: true, ca: false });
    expect(uni.keyUsage).toEqual({ critical: true, usages: ['Digital Signature', 'Non Repudiation'] });
    expect(uni.extendedKeyUsage?.usages).toEqual([{ oid: OID_DOCUMENT_SIGNING, name: 'Document Signing (RFC 9336)' }]);
    expect(uni.validityDays).toBe(730);
  });

  it('serial numbers are random, positive, 128-bit and unique', async () => {
    const serials = await Promise.all(
      [h.root, h.ministry, h.university].map(async (p) => (await describeCertificate(p.certificate)).serialNumber),
    );
    for (const s of serials) expect(s).toMatch(/^[4-7][0-9A-F]{31}$/);
    expect(new Set(serials).size).toBe(3);
  });
});

describe('CSR (course §15)', () => {
  it('carries the subject and key, and proves possession of the private key', async () => {
    const csr = await describeCsr(h.ministry.csr);
    expect(csr.subjectText).toContain('CN=Demo MoE Issuing CA');
    expect(csr.signatureValid).toBe(true);
  });

  it('a CSR whose signature was altered fails proof of possession', async () => {
    const der = new Uint8Array(h.ministry.csr.rawData);
    der[der.length - 5] = (der[der.length - 5] ?? 0) ^ 0xff;
    expect(await verifyCsr(new Pkcs10CertificateRequest(der))).toBe(false);
  });
});

describe('CA issuance policy: refusals', () => {
  it('refuses a CSR whose proof of possession fails', async () => {
    const der = new Uint8Array(h.university.csr.rawData);
    der[der.length - 5] = (der[der.length - 5] ?? 0) ^ 0xff;
    const bad = new Pkcs10CertificateRequest(der);
    expect(await refusalCode(issueCertificate({ csr: bad, issuer: h.ministry, profile: 'document-signer', validityDays: 30 }))).toBe(
      'csr-signature-invalid',
    );
  });

  it('refuses when an end entity (the university) tries to issue', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 2048 });
    const csr = await createCsr({ keys, subject: { CN: 'Department of Physics' } });
    expect(await refusalCode(issueCertificate({ csr, issuer: h.university, profile: 'document-signer', validityDays: 30 }))).toBe(
      'issuer-not-ca',
    );
  });

  it('refuses a sub-CA under the pathlen:0 ministry (course §16)', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 2048 });
    const csr = await createCsr({ keys, subject: { CN: 'Regional Education Bureau CA' } });
    expect(await refusalCode(issueCertificate({ csr, issuer: h.ministry, profile: 'intermediate-ca', validityDays: 30 }))).toBe(
      'path-length-exceeded',
    );
  });

  it('refuses to sign with a key that is not the issuer’s', async () => {
    const csr = await createCsr({ keys: await generateRsaKeyPair({ modulusLength: 2048 }), subject: { CN: 'X' } });
    const mixedUp = { certificate: h.ministry.certificate, keys: h.root.keys };
    expect(await refusalCode(issueCertificate({ csr, issuer: mixedUp, profile: 'document-signer', validityDays: 30 }))).toBe(
      'issuer-key-mismatch',
    );
  });

  it('refuses a certificate that would outlive its issuer', async () => {
    const csr = await createCsr({ keys: await generateRsaKeyPair({ modulusLength: 2048 }), subject: { CN: 'X' } });
    expect(await refusalCode(issueCertificate({ csr, issuer: h.ministry, profile: 'document-signer', validityDays: 4000 }))).toBe(
      'validity-exceeds-issuer',
    );
  });

  it('refuses nonsensical validity', async () => {
    const csr = await createCsr({ keys: await generateRsaKeyPair({ modulusLength: 2048 }), subject: { CN: 'X' } });
    expect(await refusalCode(issueCertificate({ csr, issuer: h.ministry, profile: 'document-signer', validityDays: 0 }))).toBe(
      'invalid-validity',
    );
  });

  it('refuses to issue from an expired CA', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 2048 });
    const old = await createRootCertificate({ keys, subject: { CN: 'Old Root' }, validityDays: 1, notBefore: new Date('2020-01-01T00:00:00Z') });
    const csr = await createCsr({ keys: await generateRsaKeyPair({ modulusLength: 2048 }), subject: { CN: 'X' } });
    expect(await refusalCode(issueCertificate({ csr, issuer: { certificate: old, keys }, profile: 'intermediate-ca', validityDays: 1 }))).toBe(
      'issuer-not-currently-valid',
    );
  });

  it('refuses when the issuer’s keyUsage lacks keyCertSign', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 2048 });
    const cert = await X509CertificateGenerator.createSelfSigned({
      serialNumber: '01',
      name: 'CN=Mislabelled CA',
      notBefore: new Date(Date.now() - 1000),
      notAfter: new Date(Date.now() + 86_400_000),
      keys,
      signingAlgorithm: SIGNATURE_ALGORITHM,
      extensions: [new BasicConstraintsExtension(true, undefined, true), new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true)],
    });
    const csr = await createCsr({ keys: await generateRsaKeyPair({ modulusLength: 2048 }), subject: { CN: 'X' } });
    expect(await refusalCode(issueCertificate({ csr, issuer: { certificate: cert, keys }, profile: 'document-signer', validityDays: 1 }))).toBe(
      'issuer-cannot-sign-certificates',
    );
  });

  it('ignores extensions requested in the CSR: a requester cannot ask to become a CA', async () => {
    const keys = await generateRsaKeyPair({ modulusLength: 2048 });
    const greedy = await Pkcs10CertificateRequestGenerator.create({
      name: 'CN=Greedy University',
      keys,
      signingAlgorithm: SIGNATURE_ALGORITHM,
      extensions: [new BasicConstraintsExtension(true, undefined, true)],
    });
    const cert = await issueCertificate({ csr: greedy, issuer: h.ministry, profile: 'document-signer', validityDays: 30 });
    expect((await describeCertificate(cert)).basicConstraints).toEqual({ critical: true, ca: false });
  });
});

describe('PEM', () => {
  it('certificates and CSRs round-trip unchanged', async () => {
    const back = certificateFromPem(certificateToPem(h.ministry.certificate));
    expect((await describeCertificate(back)).fingerprintSha256).toBe((await describeCertificate(h.ministry.certificate)).fingerprintSha256);
    expect(new Uint8Array(csrFromPem(csrToPem(h.ministry.csr)).rawData)).toEqual(new Uint8Array(h.ministry.csr.rawData));
  });

  it('public files never include private keys', () => {
    const files = hierarchyPublicFiles(h);
    expect(Object.keys(files).sort()).toEqual(
      ['intermediateCA-cert.pem', 'intermediateCA.csr', 'rootCA-cert.pem', 'university-cert.pem', 'university.csr'].sort(),
    );
    expect(Object.values(files).join('')).not.toMatch(/PRIVATE KEY/);
  });

  it('rejects a CERTIFICATE block whose contents are not a certificate', () => {
    expect(() => certificateFromPem('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')).toThrow(PkiError);
  });

  it('rejects oversized input before parsing', () => {
    expect(() => certificateFromPem('A'.repeat(70_000))).toThrow(/64 KiB/);
  });

  it('rejects a CSR passed where a certificate is expected', () => {
    expect(() => certificateFromPem(csrToPem(h.ministry.csr))).toThrow(/Expected a "CERTIFICATE"/);
  });
});
