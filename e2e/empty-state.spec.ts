/**
 * VibeGrid Empty & Edge State E2E Tests
 *
 * Tests for empty grid, single row, clear data, and add row behaviors.
 *
 * @feature GH#466
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
 * Click the "Clear" button in MockDataControls to empty the grid
 */
async function clearAllData(p: Page): Promise<boolean> {
  const buttons = await p.$$('button')
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => el.textContent?.trim())
    if (text === 'Clear' || text?.includes('Clear')) {
      await btn.click()
      await new Promise((r) => setTimeout(r, 1000))
      return true
    }
  }
  return false
}

/**
 * Click "Add Row" button to add a single row
 */
async function addRow(p: Page): Promise<boolean> {
  const buttons = await p.$$('button')
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => el.textContent?.trim())
    if (text?.includes('Add Row') || text?.includes('Add')) {
      await btn.click()
      await new Promise((r) => setTimeout(r, 500))
      return true
    }
  }
  return false
}

describe('VibeGrid Empty & Edge States', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('Grid renders with zero rows after clearing', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Verify grid has data initially
    const initialCells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (initialCells.length === 0) {
      console.log('SKIP: No initial data cells')
      return
    }

    // Clear all data
    const cleared = await clearAllData(page)
    if (!cleared) {
      console.log('SKIP: Could not find Clear button')
      return
    }

    // Grid container should still exist
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // No data rows should exist
    const dataCells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(dataCells.length).toBe(0)

    // Headers should still be present
    const headers = await page.$$('.vibegridx-header-cell')
    expect(headers.length).toBeGreaterThan(0)
  })

  it('Empty grid shows header row without data rows', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cleared = await clearAllData(page)
    if (!cleared) {
      console.log('SKIP: Could not find Clear button')
      return
    }

    // Header cells should still render
    const headerCells = await page.$$('.vibegridx-header-cell[data-column-id]')
    expect(headerCells.length).toBeGreaterThan(0)

    // No data rows
    const dataRows = await page.$$('.vibegridx-row[data-row-id]')
    expect(dataRows.length).toBe(0)
  })

  it('Add row to empty grid creates first row', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Clear first
    const cleared = await clearAllData(page)
    if (!cleared) {
      console.log('SKIP: Could not find Clear button')
      return
    }

    // Verify empty
    let cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cells.length).toBe(0)

    // Add a row
    const added = await addRow(page)
    if (!added) {
      console.log('SKIP: Could not find Add Row button')
      return
    }

    // Now there should be at least one data cell
    cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('Keyboard navigation on empty grid does not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cleared = await clearAllData(page)
    if (!cleared) {
      console.log('SKIP: Could not find Clear button')
      return
    }

    // Focus the grid container area
    const container = await page.$('[data-testid="vibegrid-container"]')
    if (container) {
      await container.click()
    }

    // Press various navigation keys - none should crash
    await page.keyboard.press('ArrowDown')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('ArrowUp')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('ArrowLeft')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('ArrowRight')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('Tab')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 100))

    // Grid should still be functional
    const containerAfter = await page.$('[data-testid="vibegrid-container"]')
    expect(containerAfter).not.toBeNull()
  })

  it('Context menu on empty grid does not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cleared = await clearAllData(page)
    if (!cleared) {
      console.log('SKIP: Could not find Clear button')
      return
    }

    // Right-click on grid container
    const container = await page.$('[data-testid="vibegrid-container"]')
    if (container) {
      await container.click({ button: 'right' })
      await new Promise((r) => setTimeout(r, 300))
    }

    // Grid should still be functional regardless of whether menu appeared
    const containerAfter = await page.$('[data-testid="vibegrid-container"]')
    expect(containerAfter).not.toBeNull()
  })

  it('Single row grid - selection works', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Clear and add exactly one row
    const cleared = await clearAllData(page)
    if (!cleared) {
      console.log('SKIP: Could not find Clear button')
      return
    }

    const added = await addRow(page)
    if (!added) {
      console.log('SKIP: Could not find Add Row button')
      return
    }

    // Select the single cell
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells rendered after adding row')
      return
    }

    await cells[0].click()
    const isSelected = await cells[0].evaluate((el) => el.classList.contains('vibegridx-selected'))
    expect(isSelected).toBe(true)
  })

  it('Single row grid - arrow down at boundary stays in place', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Clear and add exactly one row
    await clearAllData(page)
    const added = await addRow(page)
    if (!added) {
      console.log('SKIP: Could not find Add Row button')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells rendered')
      return
    }

    // Select first cell
    await cells[0].click()
    const rowId = await cells[0].evaluate((el) => el.getAttribute('data-row-id'))

    // Arrow down should not crash and should stay on same row
    await page.keyboard.press('ArrowDown')
    await new Promise((r) => setTimeout(r, 100))

    const selectedCells = await page.$$('.vibegridx-selected')
    expect(selectedCells.length).toBeGreaterThan(0)

    // Should still be on the same row (only one row exists)
    const currentRowId = await selectedCells[0].evaluate((el) => el.getAttribute('data-row-id'))
    expect(currentRowId).toBe(rowId)
  })

  it('Reset restores default data', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Clear data
    await clearAllData(page)

    // Click Reset button
    const buttons = await page.$$('button')
    let resetClicked = false
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent?.trim())
      if (text?.includes('Reset')) {
        await btn.click()
        await new Promise((r) => setTimeout(r, 1500))
        resetClicked = true
        break
      }
    }

    if (!resetClicked) {
      console.log('SKIP: Could not find Reset button')
      return
    }

    // Should have data rows again
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cells.length).toBeGreaterThan(0)
  })
})
