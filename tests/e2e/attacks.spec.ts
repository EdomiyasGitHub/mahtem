import { expect, open, tab, test } from './fixtures.ts';

const EXPECTED = [
  'Verified', 'Caught at check 3', 'Caught at check 3', 'Caught at check 3', 'Caught at check 6',
  'Caught at check 4', 'Caught at check 5', 'Caught at check 5', 'Caught at check 7', 'Caught at check 6',
];

test('every attack is caught where expected, and the path shows why', async ({ page }) => {
  await open(page);
  await tab(page, 'Attack bench');
  await page.getByRole('button', { name: 'Set up the whole lab' }).click();
  await page.getByRole('button', { name: 'Run all ten' }).click();
  await expect(page.locator('.attacks__tally')).toHaveText('10 of 10 runs matched the expected verdict');

  const rows = page.locator('.scenario');
  for (let i = 0; i < 10; i++) {
    await expect(rows.nth(i).locator('.scenario__result span').first()).toHaveText(EXPECTED[i] as string);
    await expect(rows.nth(i).locator('.scenario__match')).toHaveText('as expected');
  }

  const openCase = (n: number) => rows.nth(n - 1).locator('.scenario__result').click();

  await openCase(5); // rogue root
  await expect(page.locator('.path-end')).toContainText('this one is an impostor');
  await expect(page.locator('.path .node--bad')).toHaveCount(0);

  await openCase(8); // University acts as a CA: two certificates at fault
  await expect(page.locator('.path .node--bad .node__name')).toHaveText(['Demo MoE Issuing CA', 'Abay Valley University Diploma Signing']);

  await openCase(6); // missing intermediate
  await expect(page.locator('.path-end')).toContainText('Missing issuer');

  await openCase(2); // tampering: chain intact, document link broken
  await expect(page.locator('.path-end')).toContainText('In your trust store');
  await expect(page.locator('.path .edge--document.edge--failed')).toHaveCount(1);

  // Hand an attack to the desk, come back, results still there
  await openCase(5);
  await page.getByRole('button', { name: 'Open on the verifier desk' }).click();
  await expect(page.locator('.verdict-banner__title')).toHaveText('Verification failed at check 6');
  await expect(page.locator('.verify__source')).toContainText('Scenario 5');
  await tab(page, 'Attack bench');
  await expect(page.locator('.attacks__tally')).toHaveText('10 of 10 runs matched the expected verdict');

  // Reset clears everything
  await page.getByRole('button', { name: 'Reset lab' }).click();
  await tab(page, 'Attack bench');
  await expect(page.getByRole('button', { name: 'Set up the whole lab' })).toBeVisible();
});
