import { getBrowser, goto, fill, saveAuthState, type Browser } from '@baseplane/browser-testing'
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import type { ElementHandle } from 'playwright-core'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

/**
 * Helper to find a button by its exact text content
 */
async function findButtonByText(page: any, text: string): Promise<ElementHandle | null> {
  const buttons = await page.$$('button')
  for (const button of buttons) {
    const buttonText = await button.evaluate((el: HTMLElement) => el.textContent?.trim())
    if (buttonText === text) {
      return button
    }
  }
  return null
}

/**
 * Global setup - Connect to Chrome and ensure authenticated
 * Saves auth state to per-worktree auth file
 *
 * This runs ONCE before all tests.
 */
export default async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.DEV_PORT || '4000'}`
  const email = process.env.E2E_TEST_EMAIL || 'admin@widecorp.com'
  const password = process.env.E2E_TEST_PASSWORD || 'WideCorp2026!Adm1n'

  // Per-worktree auth state file
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  const authStatePath = `./e2e/.auth/auth-state-${branch}.json`

  // Check if valid auth state already exists (skip navigation to avoid server instability)
  const fs = await import('node:fs/promises')
  try {
    const authData = await fs.readFile(authStatePath, 'utf-8')
    const auth = JSON.parse(authData)
    const sessionCookie = auth.cookies?.find(
      (c: { name: string; expires: number }) => c.name === 'better-auth.session_token' && c.expires * 1000 > Date.now(),
    )
    if (sessionCookie) {
      // biome-ignore lint/suspicious/noConsole: E2E setup logging
      console.log('Valid auth state exists, skipping login')
      return async () => {}
    }
  } catch {
    // No valid auth state, proceed with login
  }

  let browser: Browser
  try {
    browser = await getBrowser()
  } catch {
    throw new Error('Chrome not running. Start with: ./scripts/dev/setup.sh')
  }

  const page = await browser.newPage()

  try {
    // Navigate to app
    await goto(page, baseURL)

    // Check if already authenticated
    const url = page.url()

    if (url.includes('sign-in')) {
      // Fill credentials
      await fill(page, 'input[name="email"]', email)
      await fill(page, 'input[name="password"]', password)

      // Click sign in button (exact match to avoid Passkey button)
      const signInButton = await findButtonByText(page, 'Sign in')
      if (!signInButton) {
        throw new Error('Sign in button not found')
      }
      await signInButton.click()

      // Wait for redirect away from sign-in
      await page.waitForFunction(() => !window.location.pathname.includes('sign-in'), {
        timeout: 15000,
      })
    }

    // Save auth state for tests to use
    await saveAuthState(page, authStatePath)
  } finally {
    await page.close()
    // Don't close browser - tests will use it
  }

  return async () => {
    // Teardown function (called after all tests)
    // Don't close browser - it's managed externally
  }
}
