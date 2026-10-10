import { describe, expect, it } from 'vitest';
import { checkEnvironment, environmentReady } from '../src/crypto/environment';

describe('checkEnvironment', () => {
  it('passes every check in the real Node runtime used for tests', () => {
    // Node 20+ exposes the same Web Crypto API as browsers.
    const checks = checkEnvironment({ isSecureContext: true, crypto: globalThis.crypto });
    expect(checks.map((c) => c.passed)).toEqual([true, true, true]);
    expect(environmentReady(checks)).toBe(true);
  });

  it('fails the secure-context check on a plain-http page', () => {
    const checks = checkEnvironment({ isSecureContext: false, crypto: globalThis.crypto });
    const secure = checks.find((c) => c.id === 'secure-context');
    expect(secure?.passed).toBe(false);
    expect(secure?.remedy).toMatch(/localhost/);
    expect(environmentReady(checks)).toBe(false);
  });

  it('fails when SubtleCrypto is missing (as browsers do outside secure contexts)', () => {
    const checks = checkEnvironment({ isSecureContext: true, crypto: { getRandomValues: () => undefined } });
    expect(checks.find((c) => c.id === 'web-crypto')?.passed).toBe(false);
    expect(checks.find((c) => c.id === 'random-source')?.passed).toBe(true);
  });

  it('fails everything when crypto is absent entirely', () => {
    const checks = checkEnvironment({});
    expect(checks.every((c) => !c.passed)).toBe(true);
  });

  it('treats a non-boolean isSecureContext as insecure', () => {
    const checks = checkEnvironment({ isSecureContext: 'yes' as unknown as boolean, crypto: globalThis.crypto });
    expect(checks.find((c) => c.id === 'secure-context')?.passed).toBe(false);
  });
});
