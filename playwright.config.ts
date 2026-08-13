import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: 1,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'wall-display',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } }
    },
    {
      name: 'narrow-fallback',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 900 } }
    }
  ],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4173/api/dashboard',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
