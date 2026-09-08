import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'node:path'

// Load .env.local for local overrides
config({ path: resolve(process.cwd(), '.env.local') })

// Default to staging; override with E2E_BASE_URL for local dev
const BASE_URL = process.env.E2E_BASE_URL || 'https://dev.baseplane.ai'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  timeout: 60_000,

  // Global setup logs in once and writes storageState
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    storageState: './e2e/.auth/user.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  expect: {
    timeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
