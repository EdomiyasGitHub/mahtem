import { readFileSync } from 'node:fs';
import { buildLabOnBench, expect, tab, test } from './fixtures.ts';

test('issue a diploma on the bench, verify it, tamper with it, restore it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Instrument check: this browser can run the lab')).toBeVisible();
  await buildLabOnBench(page, { sign: false });

  // Input validation
  await page.getByLabel('Cumulative GPA').fill('4.5');
  await page.getByRole('button', { name: 'Sign diploma with the University’s key' }).click();
  await expect(page.getByRole('alert')).toHaveText('CGPA must look like 3.12 and be at most 4.00.');
  await page.getByLabel('Cumulative GPA').fill('3.12');
  await page.getByRole('button', { name: 'Sign diploma with the University’s key' }).click();
  await expect(page.locator('.ledger__what').first()).toContainText('Diploma signed');

  // Hand-off: all seven checks pass
  await page.getByRole('button', { name: 'Hand it to a verifier' }).click();
  await expect(page.locator('.verdict-banner__title')).toHaveText('Verified');
  await expect(page.locator('.trace__status')).toHaveText(Array(7).fill('Pass'));

  // Tamper: one character
  await page.getByText('Edit the received bytes').click();
  const raw = page.getByLabel('Raw document (UTF-8 JSON)', { exact: false });
  await raw.fill((await raw.inputValue()).replace('"cgpa": "3.12"', '"cgpa": "3.92"'));
  await expect(page.locator('.verdict-banner__title')).toHaveText('Verification failed at check 3');
  await expect(page.locator('.trace__step--fail .trace__title')).toHaveText(['Check the signature']);
  await expect(page.locator('.document__changes')).toContainText('Cumulative GPA');
  await expect(page.locator('.compare__note')).toContainText('8 of 8 blocks differ');

  // Restore, then un-trust the root
  await page.getByRole('button', { name: 'Restore the original bytes' }).click();
  await expect(page.locator('.verdict-banner__title')).toHaveText('Verified');
  await page.getByRole('checkbox', { name: /Demo National Root CA/ }).uncheck();
  await expect(page.locator('.verdict-banner__title')).toHaveText('Verification failed at check 5');
  await page.getByRole('checkbox', { name: /Demo National Root CA/ }).check();
  await expect(page.locator('.verdict-banner__title')).toHaveText('Verified');

  // Download the signature for OpenSSL
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download diploma.sig' }).click();
  const file = await (await download).path();
  expect(readFileSync(file).length).toBe(384); // RSA-3072 signature
});

test('the verifier desk explains how to begin when nothing has arrived', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Verifier desk');
  await expect(page.getByText('No diploma has arrived yet.')).toBeVisible();
});
