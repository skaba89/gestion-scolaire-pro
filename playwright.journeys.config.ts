import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours métier de bout en bout contre une VRAIE stack : PostgreSQL avec
 * RLS (API sous un rôle NOBYPASSRLS), Redis, API, worker ARQ.
 *
 * Prérequis (voir docs/E2E_JOURNEYS.md) : stack démarrée, comptes créés par
 * scripts/ci/seed_e2e.py, structure Université La Source chargée par
 * scripts/seed_universite_la_source.py, et E2E_CREDENTIALS_FILE pointant
 * sur le JSON des comptes. Le frontend est lancé par webServer ci-dessous.
 *
 * Les parcours partagent les mêmes données : exécution en série.
 */
const API_ORIGIN = process.env.E2E_API_ORIGIN ?? 'http://localhost:8000';

export default defineConfig({
  testDir: './tests/e2e/journeys',
  globalSetup: './tests/e2e/journeys/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-journeys' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: 'npm run dev -- --port 3000 --strictPort',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_API_URL: API_ORIGIN },
  },
});
