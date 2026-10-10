import { expect, tab, test } from './fixtures.ts';

test('lesson 1: the hash playground computes real SHA-256 and shows the avalanche effect', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Learn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hashing: a fingerprint for data');

  await page.getByRole('button', { name: 'Keep this as the reference' }).click();
  await expect(page.locator('.playground__result')).toContainText('Identical to the reference');
  const box = page.getByLabel(/Text to hash/);
  await box.fill('Hana Tesfaye, CGPA 3.92');
  await expect(page.locator('.playground__result')).toContainText('of 256 bits differ');
  const bits = Number((await page.locator('.playground__result').innerText()).match(/^(\d+) of 256/)?.[1]);
  expect(bits).toBeGreaterThan(80);
  expect(bits).toBeLessThan(176);

  // Quiz feedback, wrong then right
  const q = page.locator('.quiz__q').first();
  await q.getByText('The document’s digest is longer').click();
  await expect(q.locator('.quiz__why')).toContainText('Not quite.');
  await q.getByText('Both are 32 bytes').click();
  await expect(q.locator('.quiz__why')).toContainText('Right.');
});

test('lesson 2: real signing; editing the message or switching keys breaks verification', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Learn');
  await page.getByRole('button', { name: /Signing and verifying/ }).click();
  await page.getByRole('button', { name: 'Generate an RSA-2048 key pair' }).click();
  await page.getByRole('button', { name: 'Sign this message with the private key' }).click();
  await expect(page.locator('.playground__result')).toContainText('Signature valid');
  await expect(page.locator('.playground__note').last()).toContainText('256 bytes');

  const msg = page.getByLabel('Message', { exact: true });
  await msg.fill((await msg.inputValue()).replace('3.12', '3.92'));
  await expect(page.locator('.playground__result')).toContainText('the message changed after it was signed');
  await msg.fill((await msg.inputValue()).replace('3.92', '3.12'));
  await expect(page.locator('.playground__result')).toContainText('Signature valid');

  await page.getByText('Verify with somebody else’s public key instead').click();
  await expect(page.locator('.playground__result')).toContainText('this public key does not match');
});

test('a lesson task links into the lab, is detected when done, and keeps your place', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Learn');
  await page.getByRole('button', { name: /Certificates: whose key is this/ }).click();
  await page.getByRole('button', { name: 'Open the lab bench' }).click();
  await page.getByRole('button', { name: 'Create the root CA' }).click();
  await expect(page.getByText('itself (self-signed)')).toBeVisible();

  await tab(page, 'Learn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Certificates: whose key is this?');
  await expect(page.getByText('Done in the lab.')).toBeVisible();
  for (const q of await page.locator('.quiz__q').all()) {
    await q.locator('.quiz__option', { has: page.locator('input') }).filter({ hasText: /identity and a public key|The root itself/ }).click();
  }
  await expect(page.locator('.learn__item[aria-current="page"] .learn__state')).toHaveText('Done');
  await expect(page.locator('.learn__progress')).toHaveText('1 of 6 lessons complete');
});

test('glossary and projector mode', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Learn');
  await page.getByRole('button', { name: 'Glossary' }).click();
  await expect(page.locator('.glossary dt', { hasText: /^pathlen$/ })).toBeVisible();

  const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  expect(await size()).toBe('16px');
  const toggle = page.getByRole('button', { name: 'Projector' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  expect(await size()).toBe('20px');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  expect(await size()).toBe('16px');
});
