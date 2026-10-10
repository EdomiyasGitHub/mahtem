/**
 * Proves the ESLint security guardrails actually fire. If someone weakens
 * eslint.config.js, these tests fail.
 */
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

describe('security guardrails in application code', () => {
  const ui = 'src/ui/Example.tsx';

  it('rejects dangerouslySetInnerHTML', async () => {
    const ids = await ruleIds('export const X = (p: { s: string }) => <div dangerouslySetInnerHTML={{ __html: p.s }} />;', ui);
    expect(ids).toContain('no-restricted-syntax');
  });

  it('rejects innerHTML assignment', async () => {
    const ids = await ruleIds('export function f(el: HTMLElement, s: string) { el.innerHTML = s; }', ui);
    expect(ids).toContain('no-restricted-syntax');
  });

  it('rejects network calls', async () => {
    const ids = await ruleIds('export function f() { return fetch("https://example.com"); }', ui);
    expect(ids).toContain('no-restricted-globals');
  });

  it('rejects navigator.sendBeacon', async () => {
    const ids = await ruleIds('export function f() { navigator.sendBeacon("/x", "k"); }', ui);
    expect(ids).toContain('no-restricted-properties');
  });

  it('rejects localStorage', async () => {
    const ids = await ruleIds('export function f(k: string) { localStorage.setItem("key", k); }', ui);
    expect(ids).toContain('no-restricted-globals');
  });

  it('rejects crypto.subtle outside src/crypto', async () => {
    const ids = await ruleIds('export const s = globalThis.crypto.subtle;', ui);
    expect(ids).toContain('no-restricted-syntax');
  });
});

describe('crypto layer', () => {
  it('may use crypto.subtle', async () => {
    const ids = await ruleIds('export const s = globalThis.crypto.subtle;\n', 'src/crypto/example.ts');
    expect(ids).not.toContain('no-restricted-syntax');
  });

  it('still may not make network calls', async () => {
    const ids = await ruleIds('export function f() { return fetch("https://example.com"); }\n', 'src/crypto/example.ts');
    expect(ids).toContain('no-restricted-globals');
  });
});
