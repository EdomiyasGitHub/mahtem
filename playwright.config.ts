/**
 * Browser tests (npm run test:e2e). They run against the PRODUCTION build
 * served by `vite preview`, so the real security headers apply.
 * Chromium always; Firefox too in CI or when E2E_ALL_BROWSERS=1.
 */
import { defineConfig, devices } from '@playwright/test';

const allBrowsers = Boolean(process.env.CI || process.env.E2E_ALL_BROWSERS);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', acceptDownloads: true },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    ...(allBrowsers ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 1000 } } }] : []),
  ],
});
