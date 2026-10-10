import { buildLabOnBench, expect, tab, test } from './fixtures.ts';

test('the trust chain draws each link only after verifying it, and logs each once', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Trust chain');
  await expect(page.getByText('There is no chain yet.')).toBeVisible();

  await buildLabOnBench(page);
  await tab(page, 'Trust chain');
  await expect(page.locator('.edge--verified')).toHaveCount(3);
  await expect(page.locator('.edge--failed')).toHaveCount(0);
  await expect(page.getByText('Self-signature verified: it vouches only for itself.')).toBeVisible();

  // Leave and return: still three, and exactly three ledger entries
  await tab(page, 'Lab bench');
  await tab(page, 'Trust chain');
  await expect(page.locator('.edge--verified')).toHaveCount(3);
  await tab(page, 'Lab bench');
  await expect(page.locator('.ledger__item').filter({ has: page.locator('.dot--visual') })).toHaveCount(3);
});

test('the inspector shows fields, explained extensions, ASN.1 and PEM', async ({ page }) => {
  await page.goto('/');
  await buildLabOnBench(page);
  await tab(page, 'Trust chain');

  await expect(page.locator('.inspector__title')).toHaveText('Demo MoE Issuing CA');
  await expect(page.locator('.inspector .facts__row').first()).toContainText('CN=Demo MoE Issuing CA');

  await page.getByRole('tab', { name: 'Fields' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Extensions' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.ext').first()).toContainText('CA:TRUE, pathlen:0');
  await expect(page.locator('.ext').first()).toContainText('only to end entities, never to another CA');

  await page.getByRole('tab', { name: 'ASN.1' }).click();
  for (const label of ['Certificate', 'tbsCertificate', 'issuer', 'validity', 'extensions']) {
    await expect(page.locator('.asn1__label', { hasText: new RegExp(`^${label}$`) }).first()).toBeVisible();
  }

  await page.getByRole('tab', { name: 'PEM' }).click();
  await expect(page.locator('.pem')).toContainText('-----BEGIN CERTIFICATE-----');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download intermediateCA-cert.pem' }).click();
  expect((await download).suggestedFilename()).toBe('intermediateCA-cert.pem');

  await page.locator('.node--document').click();
  await expect(page.locator('.inspector__title')).toHaveText('Diploma AVU-2026-0427');
});
