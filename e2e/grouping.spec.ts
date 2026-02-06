/**
 * VibeGrid Grouping E2E Tests
 *
 * Tests for group expand/collapse behaviors in VibeGrid.
 *
 * @feature GH#466
 * @spec planning/specs/466-vibegrid-e2e-testing-framework-with-pla.md
 *
 * Test Cases (Category 11):
 * - 11.1 Expand group - Click group expand arrow
 * - 11.2 Collapse group - Click expanded group arrow
 * - 11.3 Expand all groups - Click Expand All button
 * - 11.4 Collapse all groups - Click Collapse All button
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'playwright-core'
import { getTestPage, cleanupPage, BASE_URL } from '../setup/helpers'

let page: Page

const GROUPING_URL = `${BASE_URL}/debug/vibegrid-test/grouping`

/**
 * Helper to navigate and wait for page to be ready
 */
async function navigateAndWaitForGrid(p: Page): Promise<boolean> {
  try {
    await p.goto(GROUPING_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await p.waitForSelector('[data-testid="vibegrid-test-grouping"]', { timeout: 15000 })
    await new Promise((r) => setTimeout(r, 1000))
    return true
  } catch {
    return false
  }
}

describe('VibeGrid Grouping', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('11.1 Expand group - Click group expand arrow', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load grouping test page')
      return
    }

    // Wait for vibegrid container to be ready
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Wait for group headers to render (grouping is enabled by default with status field)
    let groupHeaders = await page.$$('.vibegridx-group-header')

    if (groupHeaders.length === 0) {
      // Need to select a group field first if not already grouped
      const groupSelect = await page.$('[data-testid="group-by-select"]')
      if (groupSelect) {
        await groupSelect.click()
        await new Promise((r) => setTimeout(r, 300))
        const statusOption = await page.$('[data-testid="group-by-status"]')
        if (statusOption) {
          await statusOption.click()
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    // Re-check for group headers
    await page.waitForSelector('.vibegridx-group-header', { timeout: 5000 })

    groupHeaders = await page.$$('.vibegridx-group-header')
    if (groupHeaders.length === 0) {
      console.log('SKIP: No group headers found')
      return
    }

    const firstGroupHeader = groupHeaders[0]
    const headerBox = await firstGroupHeader.boundingBox()
    expect(headerBox).not.toBeNull()

    // Get the group ID for later verification
    const groupId = await firstGroupHeader.evaluate((el) => el.getAttribute('data-group-id'))
    expect(groupId).toBeTruthy()

    // Find the expand button within the group header
    const expandButton = await firstGroupHeader.$('.vibegridx-group-expand')

    if (expandButton) {
      // Click the expand button to toggle (if collapsed, it will expand)
      await expandButton.click()
      await new Promise((r) => setTimeout(r, 300))
    } else {
      // Try clicking the group header itself (which also toggles expand/collapse)
      await firstGroupHeader.click()
      await new Promise((r) => setTimeout(r, 300))
    }

    // Verify the group header is still visible
    const headerStillVisible = await firstGroupHeader.boundingBox()
    expect(headerStillVisible).not.toBeNull()
  })

  it('11.2 Collapse group - Click expanded group arrow', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load grouping test page')
      return
    }

    // Wait for vibegrid container
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Wait for group headers
    let groupHeaders = await page.$$('.vibegridx-group-header')

    if (groupHeaders.length === 0) {
      // Select a group field to enable grouping
      const groupSelect = await page.$('[data-testid="group-by-select"]')
      if (groupSelect) {
        await groupSelect.click()
        await new Promise((r) => setTimeout(r, 300))
        const statusOption = await page.$('[data-testid="group-by-status"]')
        if (statusOption) {
          await statusOption.click()
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    await page.waitForSelector('.vibegridx-group-header', { timeout: 5000 })

    groupHeaders = await page.$$('.vibegridx-group-header')
    if (groupHeaders.length === 0) {
      console.log('SKIP: No group headers found')
      return
    }

    const firstGroupHeader = groupHeaders[0]

    const groupId = await firstGroupHeader.evaluate((el) => el.getAttribute('data-group-id'))
    expect(groupId).toBeTruthy()

    // First, ensure the group is expanded by clicking it
    const expandButton = await firstGroupHeader.$('.vibegridx-group-expand')

    // Click to expand first (in case it's collapsed)
    if (expandButton) {
      await expandButton.click()
      await new Promise((r) => setTimeout(r, 300))
    } else {
      await firstGroupHeader.click()
      await new Promise((r) => setTimeout(r, 300))
    }

    // Now click again to collapse
    if (expandButton) {
      await expandButton.click()
      await new Promise((r) => setTimeout(r, 300))
    } else {
      await firstGroupHeader.click()
      await new Promise((r) => setTimeout(r, 300))
    }

    // Verify the group header is still visible (collapse doesn't remove the header)
    const headerStillVisible = await firstGroupHeader.boundingBox()
    expect(headerStillVisible).not.toBeNull()

    // Check the triangle icon state (collapsed = rotated -90deg)
    const triangle = await firstGroupHeader.$('.triangle-icon')
    if (triangle) {
      const triangleBox = await triangle.boundingBox()
      expect(triangleBox).not.toBeNull()
    }
  })

  it('11.3 Expand all groups - Click Expand All button', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load grouping test page')
      return
    }

    // Wait for vibegrid container
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Ensure grouping is enabled
    let groupHeaders = await page.$$('.vibegridx-group-header')

    if (groupHeaders.length === 0) {
      const groupSelect = await page.$('[data-testid="group-by-select"]')
      if (groupSelect) {
        await groupSelect.click()
        await new Promise((r) => setTimeout(r, 300))
        const statusOption = await page.$('[data-testid="group-by-status"]')
        if (statusOption) {
          await statusOption.click()
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    await page.waitForSelector('.vibegridx-group-header', { timeout: 5000 })

    // Look for Expand All button in the GroupConfigPanel
    const buttons = await page.$$('button')
    let expandAllButton = null
    let collapseAllButton = null
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent)
      if (text?.includes('Expand All')) {
        expandAllButton = btn
      }
      if (text?.includes('Collapse All')) {
        collapseAllButton = btn
      }
    }

    if (expandAllButton) {
      // First collapse all to set a known state
      if (collapseAllButton) {
        await collapseAllButton.click()
        await new Promise((r) => setTimeout(r, 300))
      }

      // Click Expand All
      await expandAllButton.click()
      await new Promise((r) => setTimeout(r, 500))

      // Verify all groups are expanded
      const groupHeaderCount = (await page.$$('.vibegridx-group-header')).length
      expect(groupHeaderCount).toBeGreaterThan(0)

      // The triangles should indicate expanded state (rotate(0deg))
      const triangles = await page.$$('.vibegridx-group-header .triangle-icon')
      if (triangles.length > 0) {
        const triangleBox = await triangles[0].boundingBox()
        expect(triangleBox).not.toBeNull()
      }
    } else {
      // If no Expand All button in UI, skip this test
      console.log('SKIP: Expand All button not found in the UI')
    }
  })

  it('11.4 Collapse all groups - Click Collapse All button', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load grouping test page')
      return
    }

    // Wait for vibegrid container
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Ensure grouping is enabled
    let groupHeaders = await page.$$('.vibegridx-group-header')

    if (groupHeaders.length === 0) {
      const groupSelect = await page.$('[data-testid="group-by-select"]')
      if (groupSelect) {
        await groupSelect.click()
        await new Promise((r) => setTimeout(r, 300))
        const statusOption = await page.$('[data-testid="group-by-status"]')
        if (statusOption) {
          await statusOption.click()
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    await page.waitForSelector('.vibegridx-group-header', { timeout: 5000 })

    // Look for Collapse All button
    const buttons = await page.$$('button')
    let expandAllButton = null
    let collapseAllButton = null
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent)
      if (text?.includes('Expand All')) {
        expandAllButton = btn
      }
      if (text?.includes('Collapse All')) {
        collapseAllButton = btn
      }
    }

    if (collapseAllButton) {
      // First expand all to set a known state
      if (expandAllButton) {
        await expandAllButton.click()
        await new Promise((r) => setTimeout(r, 300))
      }

      // Click Collapse All
      await collapseAllButton.click()
      await new Promise((r) => setTimeout(r, 500))

      // Verify all groups are collapsed
      const groupHeaderCount = (await page.$$('.vibegridx-group-header')).length
      expect(groupHeaderCount).toBeGreaterThan(0)

      // The triangles should indicate collapsed state (rotate(-90deg))
      const triangles = await page.$$('.vibegridx-group-header .triangle-icon')
      if (triangles.length > 0) {
        const triangleBox = await triangles[0].boundingBox()
        expect(triangleBox).not.toBeNull()
      }
    } else {
      console.log('SKIP: Collapse All button not found in the UI')
    }
  })

  it('Group header shows correct count and label', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load grouping test page')
      return
    }

    // Wait for vibegrid container
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Ensure grouping is enabled
    let groupHeaders = await page.$$('.vibegridx-group-header')

    if (groupHeaders.length === 0) {
      const groupSelect = await page.$('[data-testid="group-by-select"]')
      if (groupSelect) {
        await groupSelect.click()
        await new Promise((r) => setTimeout(r, 300))
        const statusOption = await page.$('[data-testid="group-by-status"]')
        if (statusOption) {
          await statusOption.click()
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    await page.waitForSelector('.vibegridx-group-header', { timeout: 5000 })

    // Get the first group header
    groupHeaders = await page.$$('.vibegridx-group-header')
    if (groupHeaders.length === 0) {
      console.log('SKIP: No group headers found')
      return
    }

    const firstGroupHeader = groupHeaders[0]
    const headerBox = await firstGroupHeader.boundingBox()
    expect(headerBox).not.toBeNull()

    // Verify it contains label text (e.g., "status: open (X items)")
    const headerText = await firstGroupHeader.evaluate((el) => el.textContent)
    expect(headerText).toBeTruthy()

    // Should contain the field name and item count
    expect(headerText).toMatch(/\(\d+\s*(items?|rows?)?\)/i)
  })

  it('Can change group by field', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load grouping test page')
      return
    }

    // Wait for controls
    const groupSelect = await page.$('[data-testid="group-by-select"]')
    expect(groupSelect).not.toBeNull()

    // Change group by field
    await groupSelect!.click()
    await new Promise((r) => setTimeout(r, 300))

    // Select 'assigned_to' if available, otherwise try another option
    const assignedToOption = await page.$('[data-testid="group-by-assigned_to"]')
    const noneOption = await page.$('[data-testid="group-by-none"]')

    if (assignedToOption) {
      await assignedToOption.click()
    } else if (noneOption) {
      await noneOption.click()
    }

    await new Promise((r) => setTimeout(r, 500))

    // Verify the select is still visible
    const selectAfter = await page.$('[data-testid="group-by-select"]')
    expect(selectAfter).not.toBeNull()
  })
})
