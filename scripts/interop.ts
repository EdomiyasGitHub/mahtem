/**
 * OpenSSL interop for humans: lets you check the lab's cryptography with the
 * exact commands from the course, on your own machine.
 *
 *   npm run interop -- export              App signs → you verify with OpenSSL
 *   npm run interop -- verify              You sign with OpenSSL → app verifies
 *   npm run interop -- pki-export          App builds Root → Ministry → University → you inspect/verify with OpenSSL
 *   npm run interop -- pki-inspect a.pem … App reads certificates (e.g. your own lab's) and checks how they link
 *   npm run interop -- scenarios           Exports the 10 verification scenarios as folders of real files
 *   npm run interop -- verify-bundle <dir> Runs the app's seven verification checks on a scenario folder
 *
 * Uses the same src/crypto code as the web app (run directly by Node's
 * TypeScript support, no separate build).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CryptoInputError,
  chunkHex,
  describePublicKey,
  exportPublicKeyPem,
  generateRsaKeyPair,
  importPublicKeyPem,
  sha256,
  sign,
  toHex,
  utf8Encode,
  verify,
} from '../src/crypto/index.ts';
import { tryDecodeDiploma } from '../src/documents/diploma.ts';
import { SCENARIOS } from '../src/scenarios/index.ts';
import {
  bundleToFiles,
  trustStoreFromPem,
  trustStoreToPem,
  verifyBundleFiles,
  type DocumentVerification,
} from '../src/verify/index.ts';
import {
  PkiError,
  certificateFromPem,
  checkIssuedBy,
  createLabHierarchy,
  describeCertificate,
  hierarchyPublicFiles,
  type CertificateSummary,
  type X509Certificate,
} from '../src/pki/index.ts';

const ROOT = resolve(import.meta.dirname, '..', 'interop');
const FROM_APP = join(ROOT, 'from-app');
const FROM_OPENSSL = join(ROOT, 'from-openssl');

const DIPLOMA =
  'Abay Valley University certifies that Hana Tesfaye (ሃና ተስፋዬ) has been awarded the degree of ' +
  'Bachelor of Science in Computer Science. Cumulative GPA 3.12. ID AVU-2026-0427.\n';

const digestLine = async (bytes: Uint8Array) => chunkHex(toHex(await sha256(bytes))).join(' ');

async function exportForOpenssl(): Promise<void> {
  mkdirSync(FROM_APP, { recursive: true });

  console.log('Generating an RSA-3072 key pair in this process (private key is non-extractable)...');
  const keys = await generateRsaKeyPair({ modulusLength: 3072 });
  const info = await describePublicKey(keys.publicKey);

  const message = utf8Encode(DIPLOMA);
  const signature = await sign(keys.privateKey, message);
  const tampered = utf8Encode(DIPLOMA.replace('3.12', '3.92'));

  writeFileSync(join(FROM_APP, 'message.txt'), message);
  writeFileSync(join(FROM_APP, 'message-tampered.txt'), tampered);
  writeFileSync(join(FROM_APP, 'signature.bin'), signature);
  writeFileSync(join(FROM_APP, 'public_key.pem'), await exportPublicKeyPem(keys.publicKey));

  console.log(`
Written to ${FROM_APP}
  message.txt            the signed diploma text
  message-tampered.txt   the same text with CGPA 3.12 changed to 3.92
  signature.bin          ${signature.length}-byte RSA signature over message.txt
  public_key.pem         RSA-${info.modulusLength}, e=${info.publicExponent}

The private key was never written anywhere. It disappears when this command ends.

SHA-256 of message.txt          ${await digestLine(message)}
SHA-256 of message-tampered.txt ${await digestLine(tampered)}

Now verify with the course commands (run inside that folder):

  cd "${FROM_APP}"
  openssl dgst -sha256 -verify public_key.pem -signature signature.bin message.txt
      expected: Verified OK
  openssl dgst -sha256 -verify public_key.pem -signature signature.bin message-tampered.txt
      expected: Verification failure

Optional cross-checks:
  openssl dgst -sha256 message.txt
      expected: the same SHA-256 as printed above
  openssl pkey -pubin -in public_key.pem -noout -text
      expected: Public-Key: (3072 bit) ... Exponent: 65537 (0x10001)
`);
}

/** Pairs message.txt↔signature.bin and messageN.txt↔signatureN.bin (course §6). */
function findPairs(dir: string): Array<{ message: string; signature: string }> {
  return readdirSync(dir)
    .map((f) => /^message(\d*)\.txt$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ message: m[0], signature: `signature${m[1] ?? ''}.bin` }))
    .filter((p) => existsSync(join(dir, p.signature)))
    .sort((a, b) => a.message.localeCompare(b.message, 'en', { numeric: true }));
}

async function verifyFromOpenssl(): Promise<number> {
  if (!existsSync(join(FROM_OPENSSL, 'public_key.pem'))) {
    mkdirSync(FROM_OPENSSL, { recursive: true });
    console.log(`
Put OpenSSL-made files in ${FROM_OPENSSL}, then run this again.
Using the course commands, inside that folder:

  cd "${FROM_OPENSSL}"
  openssl genrsa -out private_key.pem 2048
  openssl pkey -in private_key.pem -pubout -out public_key.pem
  (create message.txt with any text, or message1.txt, message2.txt, message3.txt)
  openssl dgst -sha256 -sign private_key.pem -out signature.bin message.txt
  (or signature1.bin for message1.txt, and so on)

Then edit one message WITHOUT re-signing it, and run:  npm run interop -- verify
The app only reads public_key.pem, messages and signatures. It never reads private_key.pem.
`);
    return 0;
  }

  const publicKey = await importPublicKeyPem(readFileSync(join(FROM_OPENSSL, 'public_key.pem'), 'utf8'));
  const info = await describePublicKey(publicKey);
  console.log(`Public key: RSA-${info.modulusLength}, e=${info.publicExponent}`);
  console.log(`Fingerprint (SHA-256 of key): ${info.fingerprintSha256}\n`);

  const pairs = findPairs(FROM_OPENSSL);
  if (pairs.length === 0) {
    console.log('No message/signature pairs found (expected message.txt + signature.bin, or messageN.txt + signatureN.bin).');
    return 1;
  }

  let failures = 0;
  for (const pair of pairs) {
    const message = new Uint8Array(readFileSync(join(FROM_OPENSSL, pair.message)));
    const signature = new Uint8Array(readFileSync(join(FROM_OPENSSL, pair.signature)));
    const ok = await verify(publicKey, signature, message);
    if (!ok) failures++;
    console.log(`${pair.message.padEnd(14)} + ${pair.signature.padEnd(15)} → ${ok ? 'Verified OK' : 'Verification failure  (modified, or signed with another key)'}`);
    console.log(`  SHA-256 ${await digestLine(message)}`);
  }
  console.log(`\n${pairs.length - failures} of ${pairs.length} verified.`);
  return 0; // verdicts are results, not errors (see verifyBundleFolder)
}

const PKI_FROM_APP = join(ROOT, 'pki-from-app');

async function pkiExport(): Promise<void> {
  mkdirSync(PKI_FROM_APP, { recursive: true });
  console.log('Building the lab hierarchy: RSA-4096 root, RSA-4096 ministry, RSA-3072 university (a few seconds)...');
  const h = await createLabHierarchy();
  for (const [name, text] of Object.entries(hierarchyPublicFiles(h))) writeFileSync(join(PKI_FROM_APP, name), text);

  console.log(`
Written to ${PKI_FROM_APP}
  rootCA-cert.pem           Demo National Root CA (self-signed, 10 years)
  intermediateCA.csr        the Ministry's request
  intermediateCA-cert.pem   Demo MoE Issuing CA, signed by the root (5 years, pathlen:0)
  university.csr            the University's request
  university-cert.pem       Abay Valley University, signed by the ministry (2 years)

No private keys were written. They disappear when this command ends.

Check them with the course commands (inside that folder):

  cd "${PKI_FROM_APP}"

  openssl x509 -in rootCA-cert.pem -noout -subject -issuer -dates
      expected: subject and issuer identical (a self-signed root, course §12)
  openssl x509 -in intermediateCA-cert.pem -noout -subject -issuer -dates
      expected: issuer = the root's subject
  openssl x509 -in intermediateCA-cert.pem -noout -text
      expected: X509v3 Basic Constraints: critical  CA:TRUE, pathlen:0
                X509v3 Key Usage: critical          Certificate Sign, CRL Sign
  openssl verify -CAfile rootCA-cert.pem intermediateCA-cert.pem
      expected: intermediateCA-cert.pem: OK   (course §19)
  openssl verify -CAfile rootCA-cert.pem -untrusted intermediateCA-cert.pem university-cert.pem
      expected: university-cert.pem: OK       (the full chain)
  openssl verify -CAfile rootCA-cert.pem university-cert.pem
      expected: an error ("unable to get local issuer certificate"): without the ministry the chain has a gap
  openssl req -in intermediateCA.csr -noout -verify
      expected: ... verify OK                 (proof of possession, course §15)
`);
}

function printSummary(file: string, c: CertificateSummary): void {
  const lines: Array<[string, string]> = [
    ['Subject', c.subjectText],
    ['Issuer', c.selfIssued ? `${c.issuerText}   (same as subject: self-issued)` : c.issuerText],
    ['Serial', c.serialNumber],
    ['Valid', `${c.notBefore.toISOString().slice(0, 10)} → ${c.notAfter.toISOString().slice(0, 10)}  (${c.validityDays} days)`],
    ['Key', c.publicKey ? `RSA-${c.publicKey.modulusLength}, e=${c.publicKey.publicExponent}` : c.publicKeyAlgorithm],
    ['Signature', c.signatureAlgorithm],
  ];
  if (c.basicConstraints) {
    const bc = c.basicConstraints;
    lines.push(['Basic constr.', `${bc.critical ? 'critical, ' : ''}CA:${bc.ca ? 'TRUE' : 'FALSE'}${bc.pathLength !== undefined ? `, pathlen:${bc.pathLength}` : ''}`]);
  } else {
    lines.push(['Basic constr.', '(absent)']);
  }
  lines.push(['Key usage', c.keyUsage ? `${c.keyUsage.critical ? 'critical, ' : ''}${c.keyUsage.usages.join(', ')}` : '(absent)']);
  if (c.extendedKeyUsage) lines.push(['Ext. key usage', c.extendedKeyUsage.usages.map((u) => u.name).join(', ')]);
  lines.push(['Subject key ID', c.subjectKeyId ?? '(absent)']);
  lines.push(['Auth. key ID', c.authorityKeyId ?? '(absent)']);
  lines.push(['SHA-256 fp', c.fingerprintSha256]);

  console.log(`\n${file}`);
  for (const [k, v] of lines) console.log(`  ${k.padEnd(15)} ${v}`);
}

async function pkiInspect(files: string[]): Promise<number> {
  if (files.length === 0) {
    console.log(`Usage: npm run interop -- pki-inspect <certificate.pem> [more.pem ...]

Example with your own lab files (Windows paths work):
  npm run interop -- pki-inspect rootCA\\certs\\rootCA-cert.pem intermediateCA\\certs\\intermediateCA-cert.pem

Only certificates are read. Never pass a private key file.`);
    return 2;
  }
  const certs: Array<{ file: string; cert: X509Certificate; summary: CertificateSummary }> = [];
  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`File not found: ${file}\n(Check the path; on Windows, run this from the folder that contains it, or give the full path in quotes.)`);
      return 1;
    }
    const text = readFileSync(file, 'utf8');
    if (/PRIVATE KEY-----/.test(text)) {
      console.error(`Refusing to read ${file}: it contains a PRIVATE KEY. Only pass certificate files.`);
      return 1;
    }
    const cert = certificateFromPem(text);
    const summary = await describeCertificate(cert);
    certs.push({ file, cert, summary });
    printSummary(file, summary);
  }

  console.log('\nLinks (child ← issuer):');
  let links = 0;
  for (const child of certs) {
    for (const parent of certs) {
      if (child === parent && !child.summary.selfIssued) continue;
      if (child.summary.issuerText !== parent.summary.subjectText) continue;
      const r = await checkIssuedBy(child.cert, parent.cert);
      const mark = (ok: boolean | null) => (ok === null ? 'n/a' : ok ? 'OK' : 'FAIL');
      console.log(
        `  ${child.file} ← ${parent.file}${child === parent ? ' (self-signed)' : ''}\n` +
          `     issuer name ${mark(r.issuerNameMatches)} · key identifier ${mark(r.keyIdentifierMatches)} · signature ${mark(r.signatureValid)}`,
      );
      links++;
    }
  }
  if (links === 0) console.log('  none found among these files (no certificate names another as its issuer)');
  return 0;
}

const SCENARIO_ROOT = join(ROOT, 'scenarios');

function scenarioCommands(hasChain: boolean): string {
  return [
    'openssl x509 -in signer-cert.pem -pubkey -noout -out signer-pub.pem',
    'openssl dgst -sha256 -verify signer-pub.pem -signature diploma.sig diploma.json',
    `openssl verify -no-CApath -no-CAstore -CAfile trust-store.pem ${hasChain ? '-untrusted chain.pem ' : ''}signer-cert.pem`,
  ].join('\n  ');
}

async function exportScenarios(): Promise<void> {
  console.log('Building the lab hierarchy and 10 scenarios (RSA-4096/4096/3072; extra parties RSA-2048)...');
  const h = await createLabHierarchy();
  mkdirSync(SCENARIO_ROOT, { recursive: true });
  const table: string[] = [];
  for (const s of SCENARIOS) {
    const c = await s.build(h);
    const folder = join(SCENARIO_ROOT, `${String(s.n).padStart(2, '0')}-${s.id}`);
    mkdirSync(folder, { recursive: true });
    const files = bundleToFiles(c.bundle);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content);
    writeFileSync(join(folder, 'trust-store.pem'), trustStoreToPem(c.trustStore));
    const exp = s.expected;
    writeFileSync(join(folder, 'SCENARIO.txt'), [
      `Scenario ${s.n}: ${s.title}`,
      '',
      `What happened: ${s.story}`,
      `Lesson: ${s.lesson}`,
      `Source: ${s.provenance}`,
      '',
      'Files: diploma.json + diploma.sig + signer-cert.pem' + (files['chain.pem'] ? ' + chain.pem' : '') + '  (sent by the issuer: untrusted)',
      '       trust-store.pem                                (the verifier’s own trusted roots)',
      '',
      'Expected:',
      `  app:              ${exp.verdict === 'verified' ? 'VERIFIED' : `FAILED at check ${['bundle','digest','document-signature','signer-certificate','issuer-certificates','trust-anchor','validity'].indexOf(exp.failsAt ?? '') + 1} (${exp.code})`}`,
      `  openssl dgst:     ${exp.signatureValid ? 'Verified OK' : 'Verification failure'}`,
      `  openssl verify:   ${exp.chainValid ? 'signer-cert.pem: OK' : 'an error'}`,
      '',
      'OpenSSL commands (run inside this folder):',
      `  ${scenarioCommands(Boolean(files['chain.pem']))}`,
      '',
      'App verification (run from the project folder):',
      `  npm run interop -- verify-bundle "${folder}"`,
      '',
    ].join('\n'));
    table.push(`  ${String(s.n).padStart(2)}  ${s.title.padEnd(46)} ${(exp.verdict === 'verified' ? 'VERIFIED' : `fails check ${['bundle','digest','document-signature','signer-certificate','issuer-certificates','trust-anchor','validity'].indexOf(exp.failsAt ?? '') + 1}`).padEnd(15)} dgst: ${(exp.signatureValid ? 'Verified OK' : 'failure').padEnd(12)} verify: ${exp.chainValid ? 'OK' : 'error'}`);
  }
  console.log(`
Written to ${SCENARIO_ROOT}
Each folder holds the bundle, the verifier's trust store and SCENARIO.txt (story, expected results, commands).
No private keys were written.

Expected results:
${table.join('\n')}

In any folder, OpenSSL:
  ${scenarioCommands(true)}
  (scenario 06 has no chain.pem: leave out "-untrusted chain.pem")

The app's seven checks for a folder:
  npm run interop -- verify-bundle "${join(SCENARIO_ROOT, '02-tampered-document')}"

Try it: open 01-valid\\diploma.json in Notepad, change one character, save, and run verify-bundle on it again.
`);
}

const mark = (status: string) => (status === 'pass' ? '[PASS]' : status === 'fail' ? '[FAIL]' : '[ -- ]');

function printVerification(r: DocumentVerification, documentBytes: Uint8Array | null): void {
  const d = documentBytes ? tryDecodeDiploma(documentBytes) : null;
  if (d) console.log(`Document: diploma ${d.diplomaId}, ${d.studentName}, ${d.degree}, CGPA ${d.cgpa}`);
  console.log(
    r.verdict === 'verified'
      ? '\nVERDICT: VERIFIED'
      : `\nVERDICT: VERIFICATION FAILED at check ${r.firstFailure?.n} (${r.firstFailure?.title})`,
  );
  console.log(`Checked at ${r.checkedAt.toISOString()}\n`);
  for (const st of r.steps) {
    console.log(`${mark(st.status)} ${st.n}. ${st.title}${st.code ? `  [${st.code}]` : ''}`);
    console.log(`       ${st.summary}`);
    for (const det of st.details) console.log(`         ${det.ok === null ? '·' : det.ok ? '+' : 'x'} ${det.text}`);
  }
  if (r.path.length) {
    console.log('\nCertification path found (signer first):');
    r.path.forEach((c, i) => console.log(`  ${'  '.repeat(i)}${i ? '└ issued by ' : ''}${c.subjectText}`));
  }
}

async function verifyBundleFolder(dir: string | undefined): Promise<number> {
  if (!dir) {
    console.log('Usage: npm run interop -- verify-bundle <scenario folder>');
    return 2;
  }
  const need = ['diploma.json', 'diploma.sig', 'signer-cert.pem', 'trust-store.pem'];
  const missing = need.filter((f) => !existsSync(join(dir, f)));
  if (missing.length) {
    console.error(`Missing in ${dir}: ${missing.join(', ')}`);
    return 1;
  }
  const document = new Uint8Array(readFileSync(join(dir, 'diploma.json')));
  const chainPath = join(dir, 'chain.pem');
  const r = await verifyBundleFiles(
    {
      document,
      signature: new Uint8Array(readFileSync(join(dir, 'diploma.sig'))),
      signerPem: readFileSync(join(dir, 'signer-cert.pem'), 'utf8'),
      chainPem: existsSync(chainPath) ? readFileSync(chainPath, 'utf8') : undefined,
    },
    trustStoreFromPem(readFileSync(join(dir, 'trust-store.pem'), 'utf8')),
  );
  printVerification(r, document);
  // A completed verification is a successful run, whatever the verdict.
  // (A non-zero exit would make npm print alarming "command failed" errors on expected FAILED verdicts.)
  return 0;
}

const command = process.argv[2];
try {
  if (command === 'export') {
    await exportForOpenssl();
  } else if (command === 'verify') {
    process.exitCode = await verifyFromOpenssl();
  } else if (command === 'pki-export') {
    await pkiExport();
  } else if (command === 'pki-inspect') {
    process.exitCode = await pkiInspect(process.argv.slice(3));
  } else if (command === 'scenarios') {
    await exportScenarios();
  } else if (command === 'verify-bundle') {
    process.exitCode = await verifyBundleFolder(process.argv[3]);
  } else {
    console.log('Usage:\n  npm run interop -- export\n  npm run interop -- verify\n  npm run interop -- pki-export\n  npm run interop -- pki-inspect <cert.pem> [...]\n  npm run interop -- scenarios\n  npm run interop -- verify-bundle <folder>');
    process.exitCode = 2;
  }
} catch (err) {
  if (err instanceof CryptoInputError || err instanceof PkiError) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
