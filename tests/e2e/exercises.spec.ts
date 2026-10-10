import { readFileSync } from 'node:fs';
import { expect, tab, test } from './fixtures.ts';

test('Spot the fake: a full round, scored from the verifier’s real results', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Exercises');
  await page.getByRole('button', { name: 'Set up the whole lab' }).click();
  await page.getByRole('button', { name: 'Start a round of six cases' }).click();
  await expect(page.locator('.spot__progress')).toHaveText('Case 1 of 6, 0 answered');

  // The tool runs a real check 3
  await page.getByRole('button', { name: 'Run check 3: verify the signature' }).click();
  await expect(page.getByText(/The signature (is valid|does not match)/)).toBeVisible();

  // Answer "Genuine" every time: exactly one case is genuine, so the score must be 1 of 6
  for (let i = 1; i <= 6; i++) {
    await expect(page.locator('.spot__progress')).toContainText(`Case ${i} of 6`);
    await page.locator('.spot .quiz__option', { hasText: /^Genuine$/ }).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.locator('.spot__feedback .quiz__why')).toContainText('Correct answer:');
    if (i < 6) await page.getByRole('button', { name: 'Next case' }).click();
  }
  await page.getByRole('button', { name: 'See your score' }).click();
  await expect(page.getByRole('heading', { name: 'You got 1 of 6 right' })).toBeVisible();
  await expect(page.locator('.spot-summary__list li')).toHaveCount(6);
});

test('Spot the fake: progress survives switching tabs', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Exercises');
  await page.getByRole('button', { name: 'Set up the whole lab' }).click();
  await page.getByRole('button', { name: 'Start a round of six cases' }).click();
  await page.locator('.spot .quiz__option', { hasText: /^Genuine$/ }).click();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await tab(page, 'Lab bench');
  await tab(page, 'Exercises');
  await expect(page.locator('.spot__progress')).toHaveText('Case 1 of 6, 1 answered');
});

test('Three messages: sign, secretly change two, the partner finds them, also from a downloaded file', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Exercises');
  await page.getByRole('button', { name: 'Three messages (course §6)' }).click();
  await page.getByRole('button', { name: 'Generate a key and sign all three' }).click();
  await expect(page.getByText('Signed with a new RSA-2048 key.')).toBeVisible();

  await page.getByLabel('Message 2', { exact: true }).fill('Budget: 40,000 birr.');
  await page.getByLabel('Message 3', { exact: true }).fill('Exam is on Monday.');
  await expect(page.locator('.three__changed')).toHaveCount(2);

  // The exercise file, for a partner on another computer
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download the exercise file' }).click();
  const file = await (await dl).path();
  expect(readFileSync(file, 'utf8')).not.toContain('PRIVATE');

  // Hand over on this computer; the partner suspects only message 2
  await page.getByRole('button', { name: 'Hand over to a partner on this computer' }).click();
  await page.locator('.three__item--read').nth(1).getByText('I think this was changed').click();
  await page.getByRole('button', { name: 'Verify every message' }).click();
  const verdicts = page.locator('.three__item--read .pass-text, .three__item--read .fail-text');
  await expect(verdicts).toHaveText([
    'Verified OK: unchanged',
    'Verification failure: changed after signing',
    'Verification failure: changed after signing',
  ]);
  await expect(page.locator('.three .playground__result')).toHaveText('You spotted 1 of 2 changed messages.');

  // Loading the downloaded file gives the same verdicts
  await page.getByLabel('Exercise file (three-messages.json)').setInputFiles(file);
  await page.getByRole('button', { name: 'Verify every message' }).click();
  await expect(verdicts).toHaveText([
    'Verified OK: unchanged',
    'Verification failure: changed after signing',
    'Verification failure: changed after signing',
  ]);
});

test('Three messages: a broken or hostile file is refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'Exercises');
  await page.getByRole('button', { name: 'Three messages (course §6)' }).click();
  await page.getByRole('button', { name: 'I’m the partner' }).click();
  await page.getByLabel('Exercise file (three-messages.json)').setInputFiles({ name: 'three-messages.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(page.getByRole('alert')).toHaveText('This file is not a three-message exercise.');
});
