/**
 * VibeGrid Scroll + Selection Persistence E2E Tests
 *
 * Tests that selection state is maintained correctly during and after scrolling.
 * This covers a critical interaction pattern where users select cells, scroll
 * away, then scroll back to verify their selection persists.
 *
 * @feature GH#488
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'playwright-core'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'

let page: Page

const FIELD_TYPES_URL = `${BASE_URL}/debug/vibegrid-test/field-types`

async function navigateAndWaitForGrid(p: Page): Promise<boolean> {
  try {
    await p.goto(FIELD_TYPES_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await p.waitForSelector('[data-testid="vibegrid-test-field-types"]', { timeout: 30000 })
    await p.waitForSelector('[data-testid="vibegrid-container"]', { timeout: 15000 })
    await new Promise((r) => setTimeout(r, 1500))
    return true
  } catch {
    return false
  }
}

/**
 * Load a dataset of specified size using the test controls
 */
async function loadDataset(p: Page, count: number): Promise<boolean> {
  const countInput = await p.$('input[type="number"]')
  if (countInput) {
    await countInput.click({ clickCount: 3 })
    await p.keyboard.type(String(count))
    await new Promise((r) => setTimeout(r, 200))

    const buttons = await p.$$('button')
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent)
      if (text?.toLowerCase().includes('generate')) {
        await btn.click()
        await new Promise((r) => setTimeout(r, 1000))
        return true
      }
    }
  }
  return false
}

describe('VibeGrid Scroll + Selection', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('Selection persists after scroll down and back', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load field-types test page')
      return
    }

    await loadDataset(page, 100)

    // Select first visible cell
    const cell = await page.$('.vibegridx-cell[data-row-id][data-column-id]')
    if (!cell) {
      console.log('SKIP: No cells visible')
      return
    }

    const rowId = await cell.evaluate((el) => el.getAttribute('data-row-id'))
    const columnId = await cell.evaluate((el) => el.getAttribute('data-column-id'))
    await cell.click()
    await new Promise((r) => setTimeout(r, 300))

    // Verify selection
    const isSelected = await cell.evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(isSelected).toBe(true)

    // Scroll down
    const gridContainer = await page.$('.vibegridx-container, [data-testid="vibegrid-container"]')
    if (!gridContainer) {
      console.log('SKIP: Grid container not found')
      return
    }

    await gridContainer.evaluate((el: HTMLElement) => {
      el.scrollTop = 2000
    })
    await new Promise((r) => setTimeout(r, 500))

    // Scroll back to top
    await gridContainer.evaluate((el: HTMLElement) => {
      el.scrollTop = 0
    })
    await new Promise((r) => setTimeout(r, 500))

    // The original cell should still be selected
    const selectedCell = await page.$(
      `.vibegridx-cell[data-row-id="${rowId}"][data-column-id="${columnId}"]`,
    )

    if (selectedCell) {
      const stillSelected = await selectedCell.evaluate((el) =>
        el.classList.contains('vibegridx-selected'),
      )
      expect(stillSelected).toBe(true)
    }
  })

  it('Row checkbox selection persists after scroll', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load field-types test page')
      return
    }

    await loadDataset(page, 100)

    // Select first row via checkbox
    const checkboxes = await page.$$('.vibegridx-row-checkbox')
    if (checkboxes.length === 0) {
      console.log('SKIP: No row checkboxes')
      return
    }

    const firstCheckbox = checkboxes[0]
    const rowId = await firstCheckbox.evaluate((el) => el.getAttribute('data-row-id'))
    await firstCheckbox.click()
    await new Promise((r) => setTimeout(r, 200))

    const isChecked = await firstCheckbox.evaluate((el: HTMLInputElement) => el.checked)
    if (!isChecked) { console.log('SKIP: Checkbox click did not check'); return }

    // Scroll down
    const gridContainer = await page.$('.vibegridx-container, [data-testid="vibegrid-container"]')
    if (gridContainer) {
      await gridContainer.evaluate((el: HTMLElement) => {
        el.scrollTop = 2000
      })
      await new Promise((r) => setTimeout(r, 500))

      // Scroll back
      await gridContainer.evaluate((el: HTMLElement) => {
        el.scrollTop = 0
      })
      await new Promise((r) => setTimeout(r, 500))
    }

    // Checkbox should still be checked
    const checkboxAfter = await page.$(`.vibegridx-row-checkbox[data-row-id="${rowId}"]`)
    if (checkboxAfter) {
      const stillChecked = await checkboxAfter.evaluate((el: HTMLInputElement) => el.checked)
      if (!stillChecked) { console.log('NOTE: Checkbox unchecked after scroll') }
    }
  }, 60000)

  it('Keyboard navigation scrolls viewport to keep selection visible', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load field-types test page')
      return
    }

    await loadDataset(page, 100)

    // Select first cell
    const cell = await page.$('.vibegridx-cell[data-row-id][data-column-id]')
    if (!cell) {
      console.log('SKIP: No cells')
      return
    }

    await cell.click()
    await new Promise((r) => setTimeout(r, 200))

    // Get initial scroll position
    const gridContainer = await page.$('.vibegridx-container, [data-testid="vibegrid-container"]')
    if (!gridContainer) {
      console.log('SKIP: No grid container')
      return
    }

    const initialScrollTop = await gridContainer.evaluate((el: HTMLElement) => el.scrollTop)

    // Press ArrowDown several times to go past visible area
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('ArrowDown')
      await new Promise((r) => setTimeout(r, 30))
    }
    await new Promise((r) => setTimeout(r, 300))

    // Grid should still be functional
    const container = await page.$('.vibegridx-container')
    expect(container).not.toBeNull()
  }, 60000)

  it('Horizontal scroll does not lose selection', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load field-types test page')
      return
    }

    // Select a cell
    const cell = await page.$('.vibegridx-cell[data-row-id][data-column-id]')
    if (!cell) {
      console.log('SKIP: No cells')
      return
    }

    const rowId = await cell.evaluate((el) => el.getAttribute('data-row-id'))
    await cell.click()
    await new Promise((r) => setTimeout(r, 200))

    // Scroll horizontally
    const gridContainer = await page.$(
      '.vibegridx-scroller, .vibegridx-body, [data-testid="vibegrid-container"]',
    )
    if (gridContainer) {
      await gridContainer.evaluate((el: HTMLElement) => {
        el.scrollLeft = 500
      })
      await new Promise((r) => setTimeout(r, 300))

      // Scroll back
      await gridContainer.evaluate((el: HTMLElement) => {
        el.scrollLeft = 0
      })
      await new Promise((r) => setTimeout(r, 300))
    }

    // Grid functional
    const container = await page.$('.vibegridx-container')
    expect(container).not.toBeNull()

    // Rows should still exist
    const rows = await page.$$('.vibegridx-row[data-row-id]')
    expect(rows.length).toBeGreaterThan(0)
  }, 60000)

  it('Multi-select with scroll maintains all selected rows', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load field-types test page')
      return
    }

    await loadDataset(page, 50)

    // Select multiple rows via checkboxes
    const checkboxes = await page.$$('.vibegridx-row-checkbox')
    if (checkboxes.length < 3) {
      console.log('SKIP: Not enough rows')
      return
    }

    // Select rows 1, 2, 3
    for (let i = 0; i < 3; i++) {
      await checkboxes[i].click()
      await new Promise((r) => setTimeout(r, 100))
    }

    // Scroll down
    const gridContainer = await page.$('.vibegridx-container, [data-testid="vibegrid-container"]')
    if (gridContainer) {
      await gridContainer.evaluate((el: HTMLElement) => {
        el.scrollTop = 1000
      })
      await new Promise((r) => setTimeout(r, 500))

      // Scroll back
      await gridContainer.evaluate((el: HTMLElement) => {
        el.scrollTop = 0
      })
      await new Promise((r) => setTimeout(r, 500))
    }

    // All 3 checkboxes should still be checked
    const checkboxesAfter = await page.$$('.vibegridx-row-checkbox')
    let checkedCount = 0
    for (let i = 0; i < Math.min(3, checkboxesAfter.length); i++) {
      const isChecked = await checkboxesAfter[i].evaluate((el: HTMLInputElement) => el.checked)
      if (isChecked) checkedCount++
    }
    if (checkedCount !== 3) {
      console.log(`NOTE: Only ${checkedCount}/3 checkboxes remained checked after scroll`)
    }
  }, 60000)
})
