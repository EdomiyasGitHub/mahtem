/**
 * Certification path building and validation (a documented subset of RFC 5280 §6).
 *
 * Course §28: "A verifier starts with a trusted Root CA and validates the
 * signatures and constraints down the chain."
 *
 * Building: starting from the signer's certificate, repeatedly find the
 * certificate that signed the current one. Trust anchors (the verifier's own
 * trust store) are searched first; certificates supplied in the bundle are
 * only ever intermediates. A candidate is accepted as issuer only if its
 * name matches AND its key verifies the signature. A matching name alone
 * proves nothing: anyone can copy a name.
 *
 * Checks applied along the path:
 *   - every link's signature (and name chaining)
 *   - intermediates: basicConstraints CA:TRUE; keyUsage includes keyCertSign (if present)
 *   - path length constraints (pathlen), including the anchor's, as OpenSSL does
 *   - the signer: keyUsage allows signing documents; EKU, if present, allows document signing
 *   - no unrecognised critical extensions; no SHA-1 signatures
 *   - validity period of every certificate, including the anchor (as OpenSSL does)
 *
 * Not implemented (stated, not hidden): revocation (CRL/OCSP), name
 * constraints and certificate policies (a certificate marking either as
 * critical is rejected as unsupported), RFC 4518 name string preparation.
 */
import { OID_DOCUMENT_SIGNING, checkIssuedBy, nameToText, namesMatch, type IssuedByCheck, type X509Certificate } from '../pki/index.ts';
import {
  BasicConstraintsExtension,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
} from '../pki/x509.ts';
import { MAX_CHAIN_CERTIFICATES, certificateFingerprint, type TrustStore } from './bundle.ts';

export type FailureCode =
  | 'bundle-malformed'
  | 'signer-key-unsupported'
  | 'document-signature-invalid'
  | 'chain-incomplete'
  | 'certificate-signature-invalid'
  | 'issuer-not-ca'
  | 'key-usage-not-allowed'
  | 'extended-key-usage-mismatch'
  | 'path-length-exceeded'
  | 'unsupported-critical-extension'
  | 'weak-signature-algorithm'
  | 'untrusted-root'
  | 'chain-too-long'
  | 'expired'
  | 'not-yet-valid';

export interface PathLink {
  readonly child: X509Certificate;
  readonly issuer: X509Certificate;
  readonly check: IssuedByCheck;
}

export type PathStop =
  | 'anchored' // reached a certificate in the trust store
  | 'untrusted-self-signed' // reached a self-signed root that is NOT in the trust store
  | 'issuer-not-found' // no certificate with the issuer's name is available
  | 'issuer-signature-invalid' // certificates with the right name exist, but none signed this one
  | 'too-long';

export interface BuiltPath {
  /** Signer first, highest certificate last. */
  readonly certificates: readonly X509Certificate[];
  readonly links: readonly PathLink[];
  readonly stop: PathStop;
  /** The certificate whose issuer could not be found or verified. */
  readonly stoppedAt: X509Certificate;
  /** Trust-store certificates whose name matched but whose key did not sign: impostor evidence. */
  readonly impostorsOf: readonly X509Certificate[];
}

const KNOWN_EXTENSIONS = new Set([
  '2.5.29.19', // basicConstraints
  '2.5.29.15', // keyUsage
  '2.5.29.37', // extendedKeyUsage
  '2.5.29.14', // subjectKeyIdentifier
  '2.5.29.35', // authorityKeyIdentifier
]);
const ANY_EXTENDED_KEY_USAGE = '2.5.29.37.0';

async function isSelfSigned(cert: X509Certificate): Promise<boolean> {
  if (!namesMatch(cert.subjectName, cert.issuerName)) return false;
  return (await checkIssuedBy(cert, cert)).signatureValid;
}

interface IssuerSearch {
  readonly found?: PathLink;
  readonly nameMatchedButDidNotSign: X509Certificate[];
}

async function findIssuer(cert: X509Certificate, candidates: readonly X509Certificate[], exclude: ReadonlySet<X509Certificate>): Promise<IssuerSearch> {
  const failed: X509Certificate[] = [];
  for (const candidate of candidates) {
    if (exclude.has(candidate)) continue;
    if (!namesMatch(cert.issuerName, candidate.subjectName)) continue;
    const check = await checkIssuedBy(cert, candidate);
    if (check.signatureValid) return { found: { child: cert, issuer: candidate, check }, nameMatchedButDidNotSign: failed };
    failed.push(candidate);
  }
  return { nameMatchedButDidNotSign: failed };
}

export async function buildPath(leaf: X509Certificate, pool: readonly X509Certificate[], store: TrustStore): Promise<BuiltPath> {
  const anchorPrints = new Set(await Promise.all(store.anchors.map(certificateFingerprint)));
  const certificates: X509Certificate[] = [leaf];
  const links: PathLink[] = [];
  const impostors: X509Certificate[] = [];
  const done = (stop: PathStop, stoppedAt: X509Certificate): BuiltPath => ({ certificates, links, stop, stoppedAt, impostorsOf: impostors });

  let current = leaf;
  for (;;) {
    if (anchorPrints.has(await certificateFingerprint(current))) return done('anchored', current);
    if (certificates.length > MAX_CHAIN_CERTIFICATES) return done('too-long', current);

    const used = new Set(certificates);
    const fromAnchors = await findIssuer(current, store.anchors, used);
    impostors.push(...fromAnchors.nameMatchedButDidNotSign);
    if (fromAnchors.found) {
      links.push(fromAnchors.found);
      certificates.push(fromAnchors.found.issuer);
      return done('anchored', fromAnchors.found.issuer);
    }

    if (await isSelfSigned(current)) return done('untrusted-self-signed', current);

    const fromPool = await findIssuer(current, pool, used);
    if (fromPool.found) {
      links.push(fromPool.found);
      certificates.push(fromPool.found.issuer);
      current = fromPool.found.issuer;
      continue;
    }
    const anyNameMatch = fromAnchors.nameMatchedButDidNotSign.length + fromPool.nameMatchedButDidNotSign.length > 0;
    return done(anyNameMatch ? 'issuer-signature-invalid' : 'issuer-not-found', current);
  }
}

/* ---------- per-certificate rules ---------- */

export interface RuleResult {
  readonly ok: boolean;
  readonly code?: FailureCode;
  readonly text: string;
}

const pass = (text: string): RuleResult => ({ ok: true, text });
const fail = (code: FailureCode, text: string): RuleResult => ({ ok: false, code, text });
export const cn = (cert: X509Certificate) => cert.subjectName.getField('CN')[0] ?? nameToText(cert.subjectName);

export function criticalExtensionsRule(cert: X509Certificate): RuleResult {
  const unknown = cert.extensions.filter((e) => e.critical && !KNOWN_EXTENSIONS.has(e.type)).map((e) => e.type);
  return unknown.length
    ? fail('unsupported-critical-extension', `“${cn(cert)}” has a critical extension this verifier does not understand (${unknown.join(', ')}); it must be rejected.`)
    : pass('No unrecognised critical extensions');
}

export function signatureAlgorithmRule(cert: X509Certificate): RuleResult {
  const hash = (cert.signatureAlgorithm as { hash?: { name?: string } }).hash?.name ?? '';
  return /^(SHA-1|MD5)$/i.test(hash)
    ? fail('weak-signature-algorithm', `“${cn(cert)}” is signed with ${hash}, which is no longer collision-resistant.`)
    : pass(`Signed with ${hash || 'an accepted algorithm'}`);
}

/** Rules for a certificate that signed another certificate. `casBelow` = CA certificates between it and the signer. */
export function issuerRules(cert: X509Certificate, casBelow: number, isAnchor: boolean): RuleResult[] {
  const results: RuleResult[] = [];
  const bc = cert.getExtension(BasicConstraintsExtension);
  if (!isAnchor) {
    results.push(
      bc?.ca
        ? pass(`“${cn(cert)}” is a CA (basicConstraints CA:TRUE)`)
        : fail('issuer-not-ca', `“${cn(cert)}” signed a certificate but is not a CA (CA:${bc ? 'FALSE' : 'absent'}). Only CAs may certify others.`),
    );
    const ku = cert.getExtension(KeyUsagesExtension);
    if (ku) {
      results.push(
        ku.usages & KeyUsageFlags.keyCertSign
          ? pass(`“${cn(cert)}” may sign certificates (keyCertSign)`)
          : fail('key-usage-not-allowed', `“${cn(cert)}” has keyUsage without keyCertSign, so it may not sign certificates.`),
      );
    }
  }
  if (bc?.pathLength !== undefined) {
    results.push(
      casBelow <= bc.pathLength
        ? pass(`pathlen:${bc.pathLength} respected (${casBelow} intermediate${casBelow === 1 ? '' : 's'} below)`)
        : fail(
            'path-length-exceeded',
            `“${cn(cert)}” has pathlen:${bc.pathLength}, but ${casBelow} intermediate certificate${casBelow === 1 ? '' : 's'} sit${casBelow === 1 ? 's' : ''} below it. It was only allowed to certify end entities.`,
          ),
    );
  }
  return results;
}

/** Rules for the certificate that signed the document. */
export function signerRules(cert: X509Certificate): RuleResult[] {
  const results: RuleResult[] = [];
  const ku = cert.getExtension(KeyUsagesExtension);
  if (ku) {
    results.push(
      ku.usages & (KeyUsageFlags.digitalSignature | KeyUsageFlags.nonRepudiation)
        ? pass('keyUsage allows signing documents')
        : fail('key-usage-not-allowed', `“${cn(cert)}” has keyUsage that does not allow signing documents (needs digitalSignature or nonRepudiation).`),
    );
  }
  const eku = cert.getExtension(ExtendedKeyUsageExtension);
  if (eku) {
    const usages = eku.usages.map(String);
    results.push(
      usages.includes(OID_DOCUMENT_SIGNING) || usages.includes(ANY_EXTENDED_KEY_USAGE)
        ? pass('extendedKeyUsage includes document signing')
        : fail('extended-key-usage-mismatch', `“${cn(cert)}” is restricted to other purposes by extendedKeyUsage and may not sign documents.`),
    );
  }
  return results;
}

export function validityRule(cert: X509Certificate, at: Date): RuleResult {
  const t = at.getTime();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  if (t < cert.notBefore.getTime()) return fail('not-yet-valid', `“${cn(cert)}” is not valid until ${day(cert.notBefore)}.`);
  if (t > cert.notAfter.getTime()) return fail('expired', `“${cn(cert)}” expired on ${day(cert.notAfter)}.`);
  return pass(`“${cn(cert)}” valid until ${day(cert.notAfter)}`);
}
