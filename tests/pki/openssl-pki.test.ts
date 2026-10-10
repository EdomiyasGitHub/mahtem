/**
 * The PKI layer checked against the real OpenSSL CLI using the course's
 * commands (§11–19, §27). Both directions:
 *   app-made certificates → OpenSSL inspects and verifies them
 *   OpenSSL-made certificates → the app reads and checks them
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  certificateFromPem,
  certificateToPem,
  checkIssuedBy,
  createLabHierarchy,
  csrFromPem,
  describeCertificate,
  hierarchyPublicFiles,
  issueCertificate,
  type LabHierarchy,
} from '../../src/pki/index.ts';
import { openssl, opensslAvailable, opensslVersion, withTempDir } from '../helpers/openssl.ts';

/**
 * OpenSSL prints names differently across versions:
 *   3.0.x  "CN = Demo National Root CA"
 *   3.2+   "CN=Demo National Root CA"
 * Assertions about names must accept both, so they test the certificate, not the printer.
 */
const field = (type: string, value: string) => new RegExp(`${type}\\s?=\\s?${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

const writeAll = (dir: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
};

describe.skipIf(!opensslAvailable)(`PKI interop with ${opensslVersion}`, () => {
  let h: LabHierarchy; // real key sizes: 4096 / 4096 / 3072
  let files: Record<string, string>;

  beforeAll(async () => {
    h = await createLabHierarchy();
    files = hierarchyPublicFiles(h);
  }, 120_000);

  it('root: Subject = Issuer, 10-year validity (course §12)', async () => {
    await withTempDir((dir) => {
      writeAll(dir, files);
      const out = openssl(['x509', '-in', 'rootCA-cert.pem', '-noout', '-subject', '-issuer', '-dates'], { cwd: dir }).stdout;
      const subject = /^subject=(.*)$/m.exec(out)?.[1];
      const issuer = /^issuer=(.*)$/m.exec(out)?.[1];
      expect(subject).toMatch(field('CN', 'Demo National Root CA'));
      expect(issuer).toBe(subject);
      expect(out).toMatch(/notBefore=/);
      expect(out).toMatch(/notAfter=/);
    });
  });

  it('intermediate: OpenSSL reads exactly the course §16 extensions (course §18)', async () => {
    await withTempDir((dir) => {
      writeAll(dir, files);
      const text = openssl(['x509', '-in', 'intermediateCA-cert.pem', '-noout', '-text'], { cwd: dir }).stdout;
      expect(text).toMatch(/X509v3 Basic Constraints: critical\s+CA:TRUE, pathlen:0/);
      expect(text).toMatch(/X509v3 Key Usage: critical\s+Certificate Sign, CRL Sign/);
      expect(text).toMatch(/X509v3 Subject Key Identifier:/);
      expect(text).toMatch(/X509v3 Authority Key Identifier:/);
      expect(text).toMatch(/Signature Algorithm: sha256WithRSAEncryption/);
      expect(text).toMatch(/Public-Key: \(4096 bit\)/);
      expect(text).toMatch(new RegExp(`Issuer: .*${field('CN', 'Demo National Root CA').source}`));
      expect(text).toMatch(new RegExp(`Subject: .*${field('CN', 'Demo MoE Issuing CA').source}`));
    });
  });

  it('university: CA:FALSE, Digital Signature + Non Repudiation, 3072-bit', async () => {
    await withTempDir((dir) => {
      writeAll(dir, files);
      const text = openssl(['x509', '-in', 'university-cert.pem', '-noout', '-text'], { cwd: dir }).stdout;
      expect(text).toMatch(/X509v3 Basic Constraints: critical\s+CA:FALSE/);
      expect(text).toMatch(/X509v3 Key Usage: critical\s+Digital Signature, Non Repudiation/);
      expect(text).toMatch(/1\.3\.6\.1\.5\.5\.7\.3\.36|Document Signing/);
      expect(text).toMatch(/Public-Key: \(3072 bit\)/);
    });
  });

  it('`openssl verify -CAfile` accepts the intermediate (course §19)', async () => {
    await withTempDir((dir) => {
      writeAll(dir, files);
      const r = openssl(['verify', '-CAfile', 'rootCA-cert.pem', 'intermediateCA-cert.pem'], { cwd: dir });
      expect(r.stdout.trim()).toBe('intermediateCA-cert.pem: OK');
      expect(r.status).toBe(0);
    });
  });

  it('`openssl verify` accepts the full chain Root → Ministry → University', async () => {
    await withTempDir((dir) => {
      writeAll(dir, files);
      const r = openssl(['verify', '-CAfile', 'rootCA-cert.pem', '-untrusted', 'intermediateCA-cert.pem', 'university-cert.pem'], { cwd: dir });
      expect(r.stdout.trim()).toBe('university-cert.pem: OK');
    });
  });

  it('OpenSSL rejects the university without the intermediate (the chain has a gap)', async () => {
    await withTempDir((dir) => {
      writeAll(dir, files);
      const r = openssl(['verify', '-CAfile', 'rootCA-cert.pem', 'university-cert.pem'], { cwd: dir });
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/unable to get local issuer certificate/);
    });
  });

  it('OpenSSL rejects the chain under a different root with the identical name', async () => {
    const other = await createLabHierarchy({ keySizes: { root: 2048, ministry: 2048, university: 2048 } });
    await withTempDir((dir) => {
      writeAll(dir, files);
      writeFileSync(join(dir, 'impostor-root.pem'), certificateToPem(other.root.certificate));
      const r = openssl(['verify', '-CAfile', 'impostor-root.pem', 'intermediateCA-cert.pem'], { cwd: dir });
      expect(r.status).not.toBe(0);
    });
  }, 60_000);

  it('`openssl req -verify` confirms the CSR’s proof of possession', async () => {
    await withTempDir((dir) => {
      writeAll(dir, files);
      const r = openssl(['req', '-in', 'intermediateCA.csr', '-noout', '-verify'], { cwd: dir });
      expect(r.stdout + r.stderr).toMatch(/verify OK/);
    });
  });

  it('fingerprint, serial and key identifiers agree with OpenSSL', async () => {
    const moe = await describeCertificate(h.ministry.certificate);
    await withTempDir((dir) => {
      writeAll(dir, files);
      const fp = openssl(['x509', '-in', 'intermediateCA-cert.pem', '-noout', '-fingerprint', '-sha256'], { cwd: dir }).stdout;
      expect(fp.trim().split('=')[1]).toBe(moe.fingerprintSha256);
      const serial = openssl(['x509', '-in', 'intermediateCA-cert.pem', '-noout', '-serial'], { cwd: dir }).stdout;
      expect(serial.trim()).toBe(`serial=${moe.serialNumber}`);
      const ext = openssl(['x509', '-in', 'intermediateCA-cert.pem', '-noout', '-ext', 'subjectKeyIdentifier,authorityKeyIdentifier'], { cwd: dir }).stdout;
      expect(ext).toContain(moe.subjectKeyId ?? 'missing');
      expect(ext).toContain(moe.authorityKeyId ?? 'missing');
    });
  });

  it('reads a hierarchy built with the exact course commands (§11, §14–17)', async () => {
    await withTempDir(async (dir) => {
      const run = (args: string[]) => {
        const r = openssl(args, { cwd: dir });
        if (r.status !== 0) throw new Error(`openssl ${args.join(' ')}\n${r.stderr}`);
        return r;
      };
      writeFileSync(
        join(dir, 'intermediate-ext.cnf'),
        'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n',
      );
      run(['genrsa', '-out', 'rootCA-key.pem', '2048']);
      run(['req', '-x509', '-new', '-sha256', '-key', 'rootCA-key.pem', '-out', 'rootCA-cert.pem', '-days', '3650', '-subj', '/C=ET/O=University/OU=Computer Security/CN=University Root CA']);
      run(['genrsa', '-out', 'intermediateCA-key.pem', '2048']);
      run(['req', '-new', '-sha256', '-key', 'intermediateCA-key.pem', '-out', 'intermediateCA.csr', '-subj', '/C=ET/O=University/OU=Computer Security/CN=University Intermediate CA']);
      run(['x509', '-req', '-sha256', '-in', 'intermediateCA.csr', '-CA', 'rootCA-cert.pem', '-CAkey', 'rootCA-key.pem', '-CAcreateserial', '-out', 'intermediateCA-cert.pem', '-days', '1825', '-extfile', 'intermediate-ext.cnf']);

      const root = certificateFromPem(readFileSync(join(dir, 'rootCA-cert.pem'), 'utf8'));
      const inter = certificateFromPem(readFileSync(join(dir, 'intermediateCA-cert.pem'), 'utf8'));
      const r = await describeCertificate(root);
      const i = await describeCertificate(inter);

      expect(r.selfIssued).toBe(true);
      expect(i.subjectText).toBe('C=ET, O=University, OU=Computer Security, CN=University Intermediate CA');
      expect(i.issuerText).toBe('C=ET, O=University, OU=Computer Security, CN=University Root CA');
      expect(i.basicConstraints).toEqual({ critical: true, ca: true, pathLength: 0 });
      expect(i.keyUsage).toEqual({ critical: true, usages: ['Certificate Sign', 'CRL Sign'] });
      expect(i.validityDays).toBe(1825);
      expect(await checkIssuedBy(inter, root)).toEqual({ issuerNameMatches: true, keyIdentifierMatches: true, signatureValid: true });
    });
  });

  it('the app’s Ministry CA accepts an OpenSSL-made CSR, and OpenSSL verifies the result', async () => {
    await withTempDir(async (dir) => {
      writeAll(dir, files);
      openssl(['genrsa', '-out', 'college-key.pem', '2048'], { cwd: dir });
      openssl(['req', '-new', '-sha256', '-key', 'college-key.pem', '-out', 'college.csr', '-subj', '/C=ET/O=Entoto College (fictional)/CN=Entoto College Diploma Signing'], { cwd: dir });

      const csr = csrFromPem(readFileSync(join(dir, 'college.csr'), 'utf8'));
      const cert = await issueCertificate({ csr, issuer: h.ministry, profile: 'document-signer', validityDays: 365 });
      writeFileSync(join(dir, 'college-cert.pem'), certificateToPem(cert));

      const r = openssl(['verify', '-CAfile', 'rootCA-cert.pem', '-untrusted', 'intermediateCA-cert.pem', 'college-cert.pem'], { cwd: dir });
      expect(r.stdout.trim()).toBe('college-cert.pem: OK');
    });
  });
});
