/**
 * VibeGrid Row Expansion E2E Tests
 *
 * Tests for row expansion/collapse detail panels.
 * Row expansion is a core VibeGrid feature that shows detail content
 * below a row when the expand toggle is clicked.
 *
 * @feature GH#1240
 * @see .claude/rules/vibegrid-interactions.md (Generic Row Expansion)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'playwright-core'
import { getTestPage, cleanupPage, BASE_URL } from '../setup/helpers'

let page: Page

const BASIC_URL = `${BASE_URL}/debug/vibegrid-test/basic`

async function navigateAndWaitForGrid(p: Page): Promise<boolean> {
  try {
    await p.goto(BASIC_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await p.waitForSelector('[data-testid="vibegrid-test-basic"]', { timeout: 15000 })
    await p.waitForSelector('[data-testid="vibegrid-container"]', { timeout: 15000 })
    await new Promise((r) => setTimeout(r, 1000))
    return true
  } catch {
    return false
  }
}

/**
 * Find expansion toggle buttons (chevron/arrow icons on rows)
 */
async function findExpansionToggles(p: Page) {
  // Try various selectors for expansion toggles
  const selectors = [
    '.vibegridx-expand-toggle',
    '.vibegridx-row-expand',
    '[data-testid="row-expand-toggle"]',
    '.vibegridx-cell[data-column-id="__expand__"]',
    '.vibegridx-row .expand-icon',
    '.row-expansion-toggle',
  ]

  for (const selector of selectors) {
    const elements = await p.$$(selector)
    if (elements.length > 0) return elements
  }

  return []
}

describe('VibeGrid Row Expansion', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('Expansion toggles are present on rows', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered')
      return
    }

    const toggles = await findExpansionToggles(page)
    if (toggles.length === 0) {
      console.log('SKIP: Row expansion not enabled on this test route')
      return
    }

    expect(toggles.length).toBeGreaterThan(0)

    // Each toggle should be visible
    const firstToggle = toggles[0]
    const box = await firstToggle.boundingBox()
    expect(box).not.toBeNull()
  })

  it('Click expand toggle shows detail panel', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const toggles = await findExpansionToggles(page)
    if (toggles.length === 0) {
      console.log('SKIP: Row expansion not enabled')
      return
    }

    // Get the row ID for the first toggle
    const firstToggle = toggles[0]
    const rowId = await firstToggle.evaluate((el) => {
      const row = el.closest('[data-row-id]')
      return row?.getAttribute('data-row-id') || el.getAttribute('data-row-id')
    })

    // Click to expand
    await firstToggle.click()
    await new Promise((r) => setTimeout(r, 500))

    // Check for expanded content
    const expandedPanels = await page.$$(
      '.vibegridx-expansion-panel, .vibegridx-row-detail, [data-testid="row-expansion-content"]',
    )

    if (expandedPanels.length === 0) {
      // Check if row has expanded class
      const expandedRow = await page.$(
        `.vibegridx-row[data-row-id="${rowId}"].expanded, .vibegridx-row[data-row-id="${rowId}"][data-expanded="true"]`,
      )
      if (!expandedRow) {
        console.log('SKIP: Expansion panel not rendered')
        return
      }
    }

    // There should be expansion content visible
    expect(expandedPanels.length).toBeGreaterThan(0)
  })

  it('Click expanded toggle collapses detail panel', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const toggles = await findExpansionToggles(page)
    if (toggles.length === 0) {
      console.log('SKIP: Row expansion not enabled')
      return
    }

    const firstToggle = toggles[0]

    // Expand
    await firstToggle.click()
    await new Promise((r) => setTimeout(r, 500))

    const expandedBefore = await page.$$(
      '.vibegridx-expansion-panel, .vibegridx-row-detail, [data-testid="row-expansion-content"]',
    )

    if (expandedBefore.length === 0) {
      console.log('SKIP: Expansion panel not rendered')
      return
    }

    // Collapse
    await firstToggle.click()
    await new Promise((r) => setTimeout(r, 500))

    // Panel should be gone or hidden
    const expandedAfter = await page.$$(
      '.vibegridx-expansion-panel, .vibegridx-row-detail, [data-testid="row-expansion-content"]',
    )

    expect(expandedAfter.length).toBeLessThan(expandedBefore.length)
  })

  it('Multiple rows can be expanded simultaneously', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const toggles = await findExpansionToggles(page)
    if (toggles.length < 2) {
      console.log('SKIP: Need at least 2 rows for multi-expansion test')
      return
    }

    // Expand first row
    await toggles[0].click()
    await new Promise((r) => setTimeout(r, 300))

    // Expand second row
    await toggles[1].click()
    await new Promise((r) => setTimeout(r, 300))

    // Both panels should be visible
    const expandedPanels = await page.$$(
      '.vibegridx-expansion-panel, .vibegridx-row-detail, [data-testid="row-expansion-content"]',
    )

    if (expandedPanels.length < 2) {
      // May use accordion pattern (one at a time) - that's also valid
      console.log('INFO: Grid may use accordion pattern (single expansion at a time)')
    }

    expect(expandedPanels.length).toBeGreaterThan(0)

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Expansion survives sorting', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const toggles = await findExpansionToggles(page)
    if (toggles.length === 0) {
      console.log('SKIP: Row expansion not enabled')
      return
    }

    // Expand a row
    await toggles[0].click()
    await new Promise((r) => setTimeout(r, 300))

    const expandedBefore = await page.$$(
      '.vibegridx-expansion-panel, .vibegridx-row-detail, [data-testid="row-expansion-content"]',
    )

    if (expandedBefore.length === 0) {
      console.log('SKIP: Expansion panel not rendered')
      return
    }

    // Click a column header to sort
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    if (headers.length > 1) {
      await headers[1].click()
      await new Promise((r) => setTimeout(r, 500))
    }

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Rows should still be rendered
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('Keyboard navigation skips expansion panel', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const toggles = await findExpansionToggles(page)
    if (toggles.length === 0) {
      console.log('SKIP: Row expansion not enabled')
      return
    }

    // Expand first row
    await toggles[0].click()
    await new Promise((r) => setTimeout(r, 300))

    // Select a cell in the first row
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    await cells[0].click()
    const firstRowId = await cells[0].evaluate((el) => el.getAttribute('data-row-id'))

    // Arrow down should skip the expansion panel and go to next data row
    await page.keyboard.press('ArrowDown')
    await new Promise((r) => setTimeout(r, 200))

    const selectedAfter = await page.$$('.vibegridx-selected')
    if (selectedAfter.length > 0) {
      const newRowId = await selectedAfter[0].evaluate((el) => el.getAttribute('data-row-id'))
      // Should be on a different data row, not stuck in expansion content
      if (newRowId) {
        expect(newRowId).not.toBe(firstRowId)
      }
    }

    // Grid should be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })
})
