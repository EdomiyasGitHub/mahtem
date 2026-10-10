/**
 * Every browser test runs with a guard: any Content-Security-Policy violation,
 * console error or warning, or uncaught page error fails the test.
 */
import { expect, test as base, type Page } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('dialog', (d) => void d.accept());
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await use(page);
    const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(csp, 'Content-Security-Policy violations').toEqual([]);
    expect(problems, 'console errors and warnings').toEqual([]);
  },
});

export { expect };

export const tab = (page: Page, name: 'Learn' | 'Lab bench' | 'Trust chain' | 'Attack bench' | 'Verifier desk') =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();

/** Click through the lab bench with the real key sizes (4096/4096/3072). */
export async function buildLabOnBench(page: Page, { sign = true } = {}): Promise<void> {
  await tab(page, 'Lab bench');
  for (const name of [
    'Create the root CA',
    'Generate the Ministry’s key and CSR',
    'Root signs the Ministry’s certificate',
    'Generate the University’s key and CSR',
    'Ministry signs the University’s certificate',
  ]) {
    await page.getByRole('button', { name }).click();
  }
  await expect(page.getByText('CA:FALSE (critical)')).toBeVisible();
  if (sign) {
    await page.getByRole('button', { name: 'Sign diploma with the University’s key' }).click();
    await expect(page.getByRole('button', { name: 'Hand it to a verifier' })).toBeVisible();
  }
}
