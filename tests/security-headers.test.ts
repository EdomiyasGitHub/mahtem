import { describe, expect, it } from 'vitest';
import { buildCsp, cspDirectives, renderHeadersFile, securityHeaders } from '../security/headers';

const csp = buildCsp();
const directive = (name: string) => cspDirectives.find(([n]) => n === name)?.[1];

describe('Content-Security-Policy', () => {
  it('denies by default', () => {
    expect(directive('default-src')).toBe("'none'");
  });

  it('forbids all network connections so keys cannot be exfiltrated by script', () => {
    expect(directive('connect-src')).toBe("'none'");
  });

  it('allows no inline script, no eval and no inline styles', () => {
    expect(csp).not.toMatch(/unsafe-inline/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/unsafe-hashes/);
    expect(directive('script-src')).toBe("'self'");
    expect(directive('style-src')).toBe("'self'");
  });

  it('allows no third-party origins at all', () => {
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toMatch(/\*/);
  });

  it('blocks framing, plugins, base-tag hijacking and form posts', () => {
    expect(directive('frame-ancestors')).toBe("'none'");
    expect(directive('object-src')).toBe("'none'");
    expect(directive('base-uri')).toBe("'none'");
    expect(directive('form-action')).toBe("'none'");
  });

  it('declares each directive once', () => {
    const names = cspDirectives.map(([n]) => n);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('security headers', () => {
  it('includes the baseline hardening headers', () => {
    expect(securityHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(securityHeaders['Referrer-Policy']).toBe('no-referrer');
    expect(securityHeaders['X-Frame-Options']).toBe('DENY');
    expect(securityHeaders['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  it('renders a _headers file covering every path with every header', () => {
    const file = renderHeadersFile();
    const lines = file.trim().split('\n');
    expect(lines[0]).toBe('/*');
    for (const [name, value] of Object.entries(securityHeaders)) {
      expect(lines).toContain(`  ${name}: ${value}`);
    }
  });
});
