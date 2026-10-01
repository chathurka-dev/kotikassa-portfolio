import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  globalSetup: './global-setup.ts',
  outputDir: './test-results',
  reporter: [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    timezoneId: 'Europe/Helsinki',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:e2e --workspace=@kotikassa/web',
    cwd: '../..',
    url: baseURL,
    reuseExistingServer: false,
    // A cold Next.js compile can exceed two minutes after the local database reset.
    timeout: 300_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop-chromium',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
    {
      name: 'mobile-chromium',
      dependencies: ['setup'],
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Pixel 7'], storageState: '.auth/user.json' },
    },
  ],
})
