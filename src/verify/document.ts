/**
 * Verify a signed document: the seven checks shown on the verification screen.
 *
 *   1 Parse the bundle          what arrived, and is it well-formed?
 *   2 Hash the document         SHA-256 of the exact bytes received
 *   3 Check the signature       does the signer certificate's key verify it?       (course §5)
 *   4 Signer certificate        who issued it, and may it sign documents?          (course §21)
 *   5 Issuer certificates       are the CAs real CAs, within their limits?          (course §16)
 *   6 Trust anchor              does the chain end at a root the VERIFIER trusts?   (course §10, §28)
 *   7 Validity                  is every certificate within its dates?
 *
 * Every check that can run, runs, even after an earlier failure. "Tampered
 * document" then shows check 3 failing while 4–7 pass: the identity is fine,
 * the content is not. That contrast is the lesson.
 *
 * Verified only if all seven pass.
 */
import { SIGNATURE_ALGORITHM, chunkHex, sha256, toHex, verify } from '../crypto/index.ts';
import { PkiError, describeCertificate, nameToText, type CertificateSummary, type X509Certificate } from '../pki/index.ts';
import { type SignedBundle, type TrustStore, bundleFromFiles, certificateFingerprint } from './bundle.ts';
import {
  type BuiltPath,
  type FailureCode,
  type RuleResult,
  buildPath,
  cn,
  criticalExtensionsRule,
  issuerRules,
  signatureAlgorithmRule,
  signerRules,
  validityRule,
} from './path.ts';

export type StepId = 'bundle' | 'digest' | 'document-signature' | 'signer-certificate' | 'issuer-certificates' | 'trust-anchor' | 'validity';
export type StepStatus = 'pass' | 'fail' | 'skipped';

export interface StepDetail {
  readonly ok: boolean | null;
  readonly text: string;
}

export interface Step {
  readonly id: StepId;
  readonly n: number;
  readonly title: string;
  readonly status: StepStatus;
  /** One plain-language sentence for the trace. */
  readonly summary: string;
  readonly code?: FailureCode;
  readonly details: readonly StepDetail[];
}

/** One rule broken by one certificate in the path (index 0 = the signer). */
export interface PathFinding {
  readonly index: number;
  readonly code: FailureCode;
  readonly text: string;
}

/** How path building ended, and which certificate broke which rule, for drawing the path. */
export interface PathStatus {
  readonly stop: BuiltPath['stop'];
  /** When the chain broke: the issuer name that could not be found or did not sign. */
  readonly missingIssuer: string | null;
  readonly findings: readonly PathFinding[];
}

export interface DocumentVerification {
  readonly verdict: 'verified' | 'failed';
  readonly firstFailure: Step | null;
  readonly steps: readonly Step[];
  /** SHA-256 of the received document, in eight blocks. */
  readonly digestBlocks: readonly string[];
  /** The certification path found, signer first. */
  readonly path: readonly CertificateSummary[];
  /** How the path ended and per-certificate findings (null when the bundle could not be read). */
  readonly pathStatus: PathStatus | null;
  readonly checkedAt: Date;
}

export interface VerifyOptions {
  /** Verification time. Defaults to now. */
  readonly at?: Date;
}

const TITLES: Record<StepId, [number, string]> = {
  bundle: [1, 'Parse the bundle'],
  digest: [2, 'Hash the document'],
  'document-signature': [3, 'Check the signature'],
  'signer-certificate': [4, 'Signer certificate'],
  'issuer-certificates': [5, 'Issuer certificates'],
  'trust-anchor': [6, 'Trust anchor'],
  validity: [7, 'Validity'],
};

function step(id: StepId, status: StepStatus, summary: string, details: StepDetail[] = [], code?: FailureCode): Step {
  const [n, title] = TITLES[id];
  return { id, n, title, status, summary, details, ...(code ? { code } : {}) };
}

/** Turn rule results into a step: passes only if every rule passed. */
function fromRules(id: StepId, rules: RuleResult[], passSummary: string): Step {
  const failure = rules.find((r) => !r.ok);
  const details = rules.map((r) => ({ ok: r.ok, text: r.text }));
  return failure ? step(id, 'fail', failure.text, details, failure.code) : step(id, 'pass', passSummary, details);
}

const skipped = (id: StepId, why: string) => step(id, 'skipped', why);

function finish(steps: Step[], digestBlocks: string[], path: CertificateSummary[], at: Date, pathStatus: PathStatus | null = null): DocumentVerification {
  const firstFailure = steps.find((s) => s.status === 'fail') ?? null;
  const verdict = steps.every((s) => s.status === 'pass') ? 'verified' : 'failed';
  return { verdict, firstFailure, steps, digestBlocks, path, pathStatus, checkedAt: at };
}

/** The same rules as checks 4, 5 and 7, attributed to the certificate that broke them. */
function pathStatusOf(path: BuiltPath, at: Date): PathStatus {
  const certs = path.certificates;
  const anchored = path.stop === 'anchored';
  const findings: PathFinding[] = [];
  certs.forEach((cert, i) => {
    const isAnchor = anchored && i === certs.length - 1;
    const rules: RuleResult[] = [
      ...(isAnchor ? [] : [signatureAlgorithmRule(cert), criticalExtensionsRule(cert)]),
      ...(i === 0 ? signerRules(cert) : issuerRules(cert, i - 1, isAnchor)),
      validityRule(cert, at),
    ];
    for (const r of rules) if (!r.ok && r.code) findings.push({ index: i, code: r.code, text: r.text });
  });
  const broken = path.stop === 'issuer-not-found' || path.stop === 'issuer-signature-invalid';
  return { stop: path.stop, missingIssuer: broken ? nameToText(path.stoppedAt.issuerName) : null, findings };
}

/* ---------- steps 4–7: the certification path ---------- */

function signerStep(path: BuiltPath): Step {
  const signer = path.certificates[0] as X509Certificate;
  const link = path.links[0];
  const rules: RuleResult[] = [signatureAlgorithmRule(signer), criticalExtensionsRule(signer), ...signerRules(signer)];

  if (link) {
    rules.unshift({ ok: true, text: `Issued and signed by “${cn(link.issuer)}”` });
    return fromRules('signer-certificate', rules, `Issued by “${cn(link.issuer)}”, and permitted to sign documents.`);
  }
  if (path.stop === 'anchored') {
    return fromRules('signer-certificate', rules, 'The signer certificate is itself in your trust store.');
  }
  if (path.stop === 'untrusted-self-signed') {
    rules.unshift({ ok: true, text: 'Self-signed: it vouches for itself' });
    return fromRules('signer-certificate', rules, 'Self-signed: no one else vouches for this signer (see check 6).');
  }
  const issuerName = nameToText(signer.issuerName);
  return path.stop === 'issuer-signature-invalid'
    ? step('signer-certificate', 'fail',
        `A certificate named “${signer.issuerName.getField('CN')[0] ?? issuerName}” is available, but its key did not sign the signer’s certificate.`,
        [{ ok: false, text: `Claimed issuer: ${issuerName}` }], 'certificate-signature-invalid')
    : step('signer-certificate', 'fail',
        `The signer’s issuer, “${signer.issuerName.getField('CN')[0] ?? issuerName}”, is missing: it is neither in the bundle nor in your trust store.`,
        [{ ok: false, text: `Claimed issuer: ${issuerName}` }], 'chain-incomplete');
}

function issuersStep(path: BuiltPath): Step {
  const certs = path.certificates;
  const topIsAnchor = path.stop === 'anchored';
  if (certs.length < 2) return skipped('issuer-certificates', 'No issuer was found, so there are no issuer certificates to check.');

  const rules: RuleResult[] = [];
  for (let i = 1; i < certs.length; i++) {
    const cert = certs[i] as X509Certificate;
    const isAnchor = topIsAnchor && i === certs.length - 1;
    if (!isAnchor) rules.push(signatureAlgorithmRule(cert), criticalExtensionsRule(cert));
    rules.push(...issuerRules(cert, i - 1, isAnchor));
    const link = path.links[i];
    if (link) rules.push({ ok: true, text: `“${cn(cert)}” issued and signed by “${cn(link.issuer)}”` });
  }

  // The path broke above the signer: an intermediate's own issuer is missing or did not sign it.
  if (path.stop === 'issuer-not-found' || path.stop === 'issuer-signature-invalid') {
    const top = path.stoppedAt;
    rules.push({
      ok: false,
      code: path.stop === 'issuer-not-found' ? 'chain-incomplete' : 'certificate-signature-invalid',
      text: path.stop === 'issuer-not-found'
        ? `The issuer of “${cn(top)}” (${nameToText(top.issuerName)}) is missing from the bundle and your trust store.`
        : `“${cn(top)}” names an issuer that is available, but whose key did not sign it.`,
    });
  }
  if (path.stop === 'too-long') rules.push({ ok: false, code: 'chain-too-long', text: 'The chain is longer than this verifier accepts.' });

  const endsAtUntrustedRoot = path.stop === 'untrusted-self-signed';
  const count = certs.length - 1 - (topIsAnchor || endsAtUntrustedRoot ? 1 : 0);
  const base = count === 0
    ? 'No intermediate CAs: the signer was certified directly by the root.'
    : count === 1
      ? '1 intermediate CA, a real CA acting within its limits.'
      : `${count} intermediate CAs, each a real CA acting within its limits.`;
  return fromRules('issuer-certificates', rules,
    endsAtUntrustedRoot ? `${base} The chain then ends at a self-signed root supplied in the bundle (see check 6).` : base);
}

async function anchorStep(path: BuiltPath, store: TrustStore): Promise<Step> {
  const top = path.certificates[path.certificates.length - 1] as X509Certificate;
  if (path.stop === 'anchored') {
    return step('trust-anchor', 'pass', `The chain ends at “${cn(top)}”, which is in your trust store.`, [
      { ok: true, text: `Matched by SHA-256 fingerprint ${await certificateFingerprint(top)}` },
    ]);
  }
  if (path.stop === 'untrusted-self-signed') {
    const details: StepDetail[] = [{ ok: false, text: `Chain ends at “${cn(top)}”, fingerprint ${await certificateFingerprint(top)}` }];
    const sameName = store.anchors.filter((a) => nameToText(a.subjectName) === nameToText(top.subjectName));
    if (sameName.length || path.impostorsOf.length) {
      details.push({
        ok: false,
        text: 'Your trust store holds a different certificate with exactly this name. Same name, different key: this root is an impostor.',
      });
    }
    return step('trust-anchor', 'fail',
      `The chain ends at a root you do not trust: “${cn(top)}”. A root included in the bundle is never trusted just because it was sent.`,
      details, 'untrusted-root');
  }
  if (path.stop === 'too-long') return step('trust-anchor', 'fail', 'The chain is too long to reach a root.', [], 'chain-too-long');
  return skipped('trust-anchor', 'The chain is broken before any root is reached.');
}

function validityStep(path: BuiltPath, at: Date): Step {
  return fromRules('validity', path.certificates.map((c) => validityRule(c, at)),
    `Every certificate in the chain is valid on ${at.toISOString().slice(0, 10)}.`);
}

/* ---------- public API ---------- */

export async function verifySignedBundle(bundle: SignedBundle, store: TrustStore, options: VerifyOptions = {}): Promise<DocumentVerification> {
  const at = options.at ?? new Date();
  const signer = bundle.signer;

  const steps: Step[] = [
    step('bundle', 'pass', 'Document, signature and certificates are well-formed.', [
      { ok: null, text: `Document: ${bundle.document.byteLength.toLocaleString('en')} bytes` },
      { ok: null, text: `Signature: ${bundle.signature.byteLength} bytes` },
      { ok: null, text: `Signer: ${nameToText(signer.subjectName)}` },
      { ok: null, text: `Intermediate certificates supplied: ${bundle.intermediates.length}` },
    ]),
  ];

  const digest = await sha256(bundle.document);
  const digestBlocks = chunkHex(toHex(digest));
  steps.push(step('digest', 'pass', 'SHA-256 computed over the exact bytes received.', [{ ok: null, text: digestBlocks.join(' ') }]));

  // 3. The document signature, using the key inside the signer's certificate.
  let signerKey: CryptoKey | null;
  try {
    signerKey = await signer.publicKey.export(SIGNATURE_ALGORITHM, ['verify']);
  } catch {
    signerKey = null;
  }
  if (!signerKey) {
    steps.push(step('document-signature', 'fail', 'The signer certificate does not contain an RSA key this lab can use.', [], 'signer-key-unsupported'));
  } else if (await verify(signerKey, bundle.signature, bundle.document)) {
    steps.push(step('document-signature', 'pass', `The signature is valid for these exact bytes, under the key in the certificate of “${cn(signer)}”.`));
  } else {
    steps.push(step('document-signature', 'fail',
      'The signature does not match. Either the document changed after signing, or it was signed with a different key than the one in this certificate.',
      [], 'document-signature-invalid'));
  }

  // 4–7. The certification path.
  const path = await buildPath(signer, bundle.intermediates, store);
  steps.push(signerStep(path), issuersStep(path), await anchorStep(path, store), validityStep(path, at));

  const summaries = await Promise.all(path.certificates.map(describeCertificate));
  return finish(steps, digestBlocks, summaries, at, pathStatusOf(path, at));
}

/** Verify from raw files: a malformed bundle fails at check 1 instead of throwing. */
export async function verifyBundleFiles(
  files: Parameters<typeof bundleFromFiles>[0],
  store: TrustStore,
  options: VerifyOptions = {},
): Promise<DocumentVerification> {
  let bundle: SignedBundle;
  try {
    bundle = bundleFromFiles(files);
  } catch (e) {
    const reason = e instanceof PkiError ? e.message : 'The bundle could not be read.';
    const at = options.at ?? new Date();
    return finish(
      [
        step('bundle', 'fail', reason, [], 'bundle-malformed'),
        ...(['digest', 'document-signature', 'signer-certificate', 'issuer-certificates', 'trust-anchor', 'validity'] as const).map((id) =>
          skipped(id, 'Not checked: the bundle could not be read.'),
        ),
      ],
      [],
      [],
      at,
    );
  }
  return verifySignedBundle(bundle, store, options);
}

export interface CertificateValidation {
  readonly valid: boolean;
  readonly code: FailureCode | null;
  readonly reason: string;
  readonly path: readonly CertificateSummary[];
}

/**
 * Validate a certificate's chain on its own, without a document, like
 * `openssl verify -CAfile root.pem [-untrusted chain.pem] cert.pem` (course §19).
 * No signer-purpose checks: the certificate may be a CA.
 */
export async function validateCertificate(
  cert: X509Certificate,
  intermediates: readonly X509Certificate[],
  store: TrustStore,
  options: VerifyOptions = {},
): Promise<CertificateValidation> {
  const at = options.at ?? new Date();
  const path = await buildPath(cert, intermediates, store);
  const leafRules: RuleResult[] = [signatureAlgorithmRule(cert), criticalExtensionsRule(cert)];
  const leafStep = path.links[0] || path.stop === 'anchored'
    ? fromRules('signer-certificate', leafRules, 'ok')
    : signerStep(path);
  const steps = [leafStep, issuersStep(path), await anchorStep(path, store), validityStep(path, at)];
  const failure = steps.find((s) => s.status === 'fail') ?? steps.find((s) => s.status === 'skipped');
  return {
    valid: !failure,
    code: failure?.code ?? (failure ? 'chain-incomplete' : null),
    reason: failure?.summary ?? 'The certificate chains to a trusted root and every check passed.',
    path: await Promise.all(path.certificates.map(describeCertificate)),
  };
}
