import { defineConfig, devices } from '@playwright/test';

/**
 * Fast, backend-independent browser gate for pull requests.
 *
 * The full Playwright suite still targets the Docker stack. This configuration
 * deliberately covers only routes that can be made deterministic with public
 * data or network interception, so every PR gets a reliable browser check.
 */
export default defineConfig({
  testDir: './tests/e2e/smoke',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
