/** Public surface of the verification layer. */
export {
  type BundleFiles,
  type SignedBundle,
  type TrustStore,
  MAX_CHAIN_CERTIFICATES,
  bundleFromFiles,
  bundleToFiles,
  certificateFingerprint,
  createTrustStore,
  trustStoreFromPem,
  trustStoreToPem,
} from './bundle.ts';
export { type BuiltPath, type FailureCode, type PathStop, buildPath } from './path.ts';
export {
  type CertificateValidation,
  type DocumentVerification,
  type PathFinding,
  type PathStatus,
  type Step,
  type StepDetail,
  type StepId,
  type StepStatus,
  type VerifyOptions,
  validateCertificate,
  verifyBundleFiles,
  verifySignedBundle,
} from './document.ts';
