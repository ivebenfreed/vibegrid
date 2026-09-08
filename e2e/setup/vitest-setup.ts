/**
 * Vitest setup file for E2E tests
 *
 * Registers custom expect matchers for Puppeteer ElementHandle
 *
 * @see https://github.com/testing-library/jest-dom for available matchers
 */

import { expect, afterAll } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { ElementHandle } from 'playwright-core'
import { pruneContexts } from '@baseplane/browser-testing'

// Safety net: close any leaked browser contexts after all tests in this process
afterAll(async () => {
  await pruneContexts()
})

/**
 * Custom matchers for Puppeteer ElementHandle
 */
interface CustomMatchers<R = unknown> {
  // ElementHandle matchers
  toBeVisible(): Promise<R>
  toHaveText(text: string): Promise<R>
  toContainText(text: string): Promise<R>
  toHaveClass(className: string): Promise<R>
  toBeEnabled(): Promise<R>
  toHaveAttribute(name: string, value?: string): Promise<R>
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

/**
 * Type guard to check if value is an ElementHandle
 */
function isElementHandle(value: unknown): value is ElementHandle {
  return (
    value !== null &&
    typeof value === 'object' &&
    'evaluate' in value &&
    typeof (value as ElementHandle).evaluate === 'function'
  )
}

/**
 * Register custom matchers
 */
expect.extend({
  /**
   * Check if element is visible (ElementHandle)
   */
  async toBeVisible(received: unknown) {
    if (!isElementHandle(received)) {
      throw new Error('toBeVisible() can only be used with ElementHandle')
    }

    const visible = await received.evaluate((el) => {
      if (!el) return false
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    })
    return {
      pass: visible,
      message: () => (visible ? 'Expected element not to be visible' : 'Expected element to be visible'),
    }
  },

  /**
   * Check if element has exact text content (ElementHandle)
   */
  async toHaveText(received: unknown, expected: string) {
    if (!isElementHandle(received)) {
      throw new Error('toHaveText() can only be used with ElementHandle')
    }

    const text = await received.evaluate((el) => el.textContent)
    const matches = text === expected
    return {
      pass: matches,
      message: () =>
        matches ? `Expected text not to be "${expected}"` : `Expected text to be "${expected}", but got "${text}"`,
    }
  },

  /**
   * Check if element contains text (ElementHandle)
   */
  async toContainText(received: unknown, expected: string) {
    if (!isElementHandle(received)) {
      throw new Error('toContainText() can only be used with ElementHandle')
    }

    const text = await received.evaluate((el) => el.textContent)
    const contains = text?.includes(expected) || false
    return {
      pass: contains,
      message: () =>
        contains
          ? `Expected text not to contain "${expected}"`
          : `Expected text to contain "${expected}", but got "${text}"`,
    }
  },

  /**
   * Check if element has a specific CSS class (ElementHandle)
   */
  async toHaveClass(received: unknown, className: string) {
    if (!isElementHandle(received)) {
      throw new Error('toHaveClass() can only be used with ElementHandle')
    }

    const classes = await received.evaluate((el) => el.className)
    const hasClass = typeof classes === 'string' && classes.split(/\s+/).includes(className)
    return {
      pass: hasClass,
      message: () =>
        hasClass
          ? `Expected element not to have class "${className}", but it has classes "${classes}"`
          : `Expected element to have class "${className}", but it has classes "${classes}"`,
    }
  },

  /**
   * Check if element is enabled (not disabled) (ElementHandle)
   */
  async toBeEnabled(received: unknown) {
    if (!isElementHandle(received)) {
      throw new Error('toBeEnabled() can only be used with ElementHandle')
    }

    const disabled = await received.evaluate((el) => {
      if (
        el instanceof HTMLButtonElement ||
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        return el.disabled
      }
      return el.hasAttribute('disabled')
    })
    return {
      pass: !disabled,
      message: () =>
        !disabled
          ? 'Expected element to be disabled, but it is enabled'
          : 'Expected element to be enabled, but it is disabled',
    }
  },

  /**
   * Check if element has a specific attribute (optionally with value) (ElementHandle)
   */
  async toHaveAttribute(received: unknown, name: string, value?: string) {
    if (!isElementHandle(received)) {
      throw new Error('toHaveAttribute() can only be used with ElementHandle')
    }

    const attrValue = await received.evaluate((el, attr) => el.getAttribute(attr), name)
    const hasAttr = attrValue !== null
    const correctValue = value === undefined || attrValue === value

    return {
      pass: hasAttr && correctValue,
      message: () => {
        if (!hasAttr) {
          return `Expected element to have attribute "${name}", but it does not`
        }
        if (!correctValue) {
          return `Expected element to have attribute "${name}" with value "${value}", but got "${attrValue}"`
        }
        return value !== undefined
          ? `Expected element not to have attribute "${name}" with value "${value}"`
          : `Expected element not to have attribute "${name}"`
      },
    }
  },
})
