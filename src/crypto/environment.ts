/**
 * Lab environment self-check.
 *
 * Web Crypto's SubtleCrypto (key generation, SHA-256, RSA signatures) only
 * exists in a "secure context": a page served over HTTPS or from localhost.
 * Before any cryptographic stage runs, the lab checks — and shows — that the
 * browser can actually do the work. Nothing here is simulated: each check
 * inspects the real runtime.
 */

export type CheckId = 'secure-context' | 'web-crypto' | 'random-source';

export interface EnvironmentCheck {
  readonly id: CheckId;
  readonly label: string;
  readonly passed: boolean;
  /** Shown when the check fails: what is wrong and how to fix it. */
  readonly remedy: string;
}

/** The subset of the global object the checks read. Injectable for tests. */
export interface EnvironmentLike {
  readonly isSecureContext?: boolean;
  readonly crypto?: {
    readonly subtle?: unknown;
    readonly getRandomValues?: unknown;
  };
}

export function checkEnvironment(env: EnvironmentLike = globalThis as EnvironmentLike): EnvironmentCheck[] {
  const secure = env.isSecureContext === true;
  const subtle = typeof env.crypto?.subtle === 'object' && env.crypto.subtle !== null;
  const random = typeof env.crypto?.getRandomValues === 'function';

  return [
    {
      id: 'secure-context',
      label: 'Page is a secure context',
      passed: secure,
      remedy: 'Open the lab over https:// or from http://localhost. Browsers disable Web Crypto on other origins.',
    },
    {
      id: 'web-crypto',
      label: 'Web Crypto is available for keys, hashing and signatures',
      passed: subtle,
      remedy: 'Use a current version of Chrome, Edge, Firefox or Safari, served from a secure context.',
    },
    {
      id: 'random-source',
      label: 'Cryptographically secure random numbers are available',
      passed: random,
      remedy: 'This browser does not expose crypto.getRandomValues; key generation would be unsafe here.',
    },
  ];
}

export function environmentReady(checks: readonly EnvironmentCheck[]): boolean {
  return checks.every((c) => c.passed);
}
