import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 3210);
const BASE_URL = `http://localhost:${PORT}`;
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

// With a real LLM, answers take seconds and cost money: run fewer requests in parallel.
const usingRealLlm = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: usingRealLlm ? 2 : undefined,
  timeout: usingRealLlm ? 90_000 : 30_000,
  expect: { timeout: usingRealLlm ? 30_000 : 5_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'unit', testDir: './tests/unit' },
    { name: 'behavior', testDir: './tests/behavior' },
    { name: 'redteam', testDir: './tests/redteam' },
    { name: 'judge', testDir: './tests/judge' },
    { name: 'ui', testDir: './tests/ui', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'ui-mobile', testDir: './tests/ui', grep: /@mobile/, use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: 'node app/server.js',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
