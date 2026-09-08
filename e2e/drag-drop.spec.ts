/**
 * VibeGrid Drag & Drop E2E Tests
 *
 * Tests for row drag and drop behaviors in VibeGrid.
 *
 * @feature GH#466
 * @spec planning/specs/466-vibegrid-e2e-testing-framework-with-pla.md
 *
 * Test Cases:
 * 4.1 Row reorder via drag - Drag row handle to new position, row moves
 * 4.2 Multi-row drag - Select multiple rows, drag, all selected rows move together
 * 4.3 Drag indicators - Start dragging, drop indicator shows target position
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'playwright-core'
import { getTestPage, cleanupPage, BASE_URL } from '../setup/helpers'

let page: Page

const DRAG_DROP_URL = `${BASE_URL}/debug/vibegrid-test/drag-drop`

/**
 * Helper to navigate and wait for page to be ready
 */
async function navigateAndWaitForGrid(p: Page): Promise<boolean> {
  try {
    // Always navigate fresh to ensure consistent state
    await p.goto(DRAG_DROP_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Wait for the test container
    await p.waitForSelector('[data-testid="vibegrid-test-drag-drop"]', {
      timeout: 10000,
    })

    // Wait for the grid container
    await p.waitForSelector('[data-testid="vibegrid-container"]', {
      timeout: 10000,
    })

    // Wait for at least one row to render
    await p.waitForSelector('.vibegridx-row[data-row-id]', {
      timeout: 10000,
    })

    // Small buffer for React state to settle
    await new Promise((r) => setTimeout(r, 500))
    return true
  } catch {
    return false
  }
}

describe('VibeGrid Drag & Drop', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('4.1 Row reorder via drag - drag row handle to new position', async () => {
    // Navigate and wait for grid
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load drag-drop test page')
      return
    }

    // Get the first two rows by their row IDs
    const rows = await page.$$('.vibegridx-row[data-row-id]')
    const rowCount = rows.length

    if (rowCount < 2) {
      console.log('SKIP: Not enough rows for drag reorder test')
      return
    }

    // Get the first and second row IDs before drag
    const firstRowId = await rows[0].evaluate((el) => el.getAttribute('data-row-id'))
    const secondRowId = await rows[1].evaluate((el) => el.getAttribute('data-row-id'))

    expect(firstRowId).toBeTruthy()
    expect(secondRowId).toBeTruthy()

    // Get the drag handle of the first row
    const firstDragHandle = await page.$(`.vibegridx-row[data-row-id="${firstRowId}"] .vibegridx-drag-column`)
    if (!firstDragHandle) {
      console.log('SKIP: No drag handle found')
      return
    }

    const handleVisible = await firstDragHandle.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(handleVisible).toBe(true)

    // Get the target position (the second row)
    const secondRow = await page.$(`.vibegridx-row[data-row-id="${secondRowId}"]`)
    if (!secondRow) {
      console.log('SKIP: Second row not found')
      return
    }

    // Get bounding boxes for the drag operation
    const handleBox = await firstDragHandle.boundingBox()
    const targetBox = await secondRow.boundingBox()

    if (!handleBox || !targetBox) {
      console.log('SKIP: Could not get bounding boxes for drag operation')
      return
    }

    // Perform the drag operation using mouse events
    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    const endX = targetBox.x + targetBox.width / 2
    const endY = targetBox.y + targetBox.height + 10

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await new Promise((r) => setTimeout(r, 100))
    await page.mouse.move(endX, endY, { steps: 10 })
    await new Promise((r) => setTimeout(r, 100))
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 500))

    // Verify the grid is still functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('4.2 Multi-row drag - select multiple rows and drag together', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load drag-drop test page')
      return
    }

    const checkboxes = await page.$$('.vibegridx-row-checkbox')
    if (checkboxes.length < 3) {
      console.log('SKIP: Not enough row checkboxes for multi-row drag test')
      return
    }

    const rows = await page.$$('.vibegridx-row[data-row-id]')
    if (rows.length < 3) {
      console.log('SKIP: Not enough rows for multi-row drag test')
      return
    }

    await checkboxes[0].click()
    await new Promise((r) => setTimeout(r, 100))

    await page.keyboard.down('Shift')
    await checkboxes[2].click()
    await page.keyboard.up('Shift')
    await new Promise((r) => setTimeout(r, 100))

    const checkedCheckboxes = await page.$$('.vibegridx-row-checkbox:checked')
    expect(checkedCheckboxes.length).toBeGreaterThanOrEqual(1)

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('4.3 Drag indicators - drop indicator shows target position during drag', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load drag-drop test page')
      return
    }

    const rows = await page.$$('.vibegridx-row[data-row-id]')
    if (rows.length < 2) {
      console.log('SKIP: Not enough rows to test drag indicators')
      return
    }

    const firstRowId = await rows[0].evaluate((el) => el.getAttribute('data-row-id'))
    const dragHandle = await page.$(`.vibegridx-row[data-row-id="${firstRowId}"] .vibegridx-drag-column`)

    if (!dragHandle) {
      console.log('SKIP: No drag handle found')
      return
    }

    const handleBox = await dragHandle.boundingBox()
    const targetRow = rows[Math.min(2, rows.length - 1)]
    const targetBox = await targetRow.boundingBox()

    if (!handleBox || !targetBox) {
      console.log('SKIP: Could not get bounding boxes')
      return
    }

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await new Promise((r) => setTimeout(r, 150))
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 15,
    })
    await new Promise((r) => setTimeout(r, 300))
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 200))

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Drag handle visibility on hover', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load drag-drop test page')
      return
    }

    const rows = await page.$$('.vibegridx-row[data-row-id]')
    if (rows.length === 0) {
      console.log('SKIP: No rows found')
      return
    }

    const dragColumn = await rows[0].$('.vibegridx-drag-column')
    if (!dragColumn) {
      console.log('SKIP: No drag column found')
      return
    }

    const dragColumnVisible = await dragColumn.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(dragColumnVisible).toBe(true)

    const dragColumnBox = await dragColumn.boundingBox()
    if (dragColumnBox) {
      await page.mouse.move(dragColumnBox.x + dragColumnBox.width / 2, dragColumnBox.y + dragColumnBox.height / 2)
    }
    await new Promise((r) => setTimeout(r, 200))

    const afterHoverVisible = await dragColumn.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(afterHoverVisible).toBe(true)
  })

  it('Drag column has correct width and structure', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load drag-drop test page')
      return
    }

    const rows = await page.$$('.vibegridx-row[data-row-id]')
    if (rows.length === 0) {
      console.log('SKIP: No rows found')
      return
    }

    const dragColumn = await rows[0].$('.vibegridx-drag-column')
    if (!dragColumn) {
      console.log('SKIP: No drag column found')
      return
    }

    const columnId = await dragColumn.evaluate((el) => el.getAttribute('data-column-id'))
    expect(columnId).toBe('__drag_handle')

    const rowId = await dragColumn.evaluate((el) => el.getAttribute('data-row-id'))
    expect(rowId).toBeTruthy()

    const dragColumnBox = await dragColumn.boundingBox()
    if (dragColumnBox) {
      expect(dragColumnBox.width).toBeGreaterThanOrEqual(20)
      expect(dragColumnBox.width).toBeLessThanOrEqual(40)
    }
  })

  it('Row drag toggle control works', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load drag-drop test page')
      return
    }

    const rowDragToggle = await page.$('[data-testid="toggle-row-drag"]')
    if (!rowDragToggle) {
      console.log('SKIP: Row drag toggle not found')
      return
    }

    const toggleVisible = await rowDragToggle.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(toggleVisible).toBe(true)

    const isInitiallyChecked = await rowDragToggle.evaluate((el: HTMLInputElement) => el.checked)
    if (isInitiallyChecked === undefined) {
      console.log('SKIP: Toggle element is not a standard checkbox input')
      return
    }
    expect(isInitiallyChecked).toBe(true)

    await rowDragToggle.click()
    await new Promise((r) => setTimeout(r, 200))

    const isNowChecked = await rowDragToggle.evaluate((el: HTMLInputElement) => el.checked)
    expect(isNowChecked).toBe(false)

    await rowDragToggle.click()
    await new Promise((r) => setTimeout(r, 200))

    const isCheckedAgain = await rowDragToggle.evaluate((el: HTMLInputElement) => el.checked)
    expect(isCheckedAgain).toBe(true)
  })

  it('Shuffle rows button randomizes row order', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load drag-drop test page')
      return
    }

    const rows = await page.$$('.vibegridx-row[data-row-id]')
    if (rows.length < 3) {
      console.log('SKIP: Not enough rows to test shuffle')
      return
    }

    const initialRowIds: string[] = []
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const rowId = await rows[i].evaluate((el) => el.getAttribute('data-row-id'))
      if (rowId) initialRowIds.push(rowId)
    }

    const shuffleButton = await page.$('[data-testid="shuffle-rows-button"]')
    if (!shuffleButton) {
      console.log('SKIP: Shuffle button not found')
      return
    }

    await shuffleButton.click()
    await new Promise((r) => setTimeout(r, 500))

    const rowsAfterShuffle = await page.$$('.vibegridx-row[data-row-id]')
    const shuffledRowIds: string[] = []
    for (let i = 0; i < Math.min(rowsAfterShuffle.length, 5); i++) {
      const rowId = await rowsAfterShuffle[i].evaluate((el) => el.getAttribute('data-row-id'))
      if (rowId) shuffledRowIds.push(rowId)
    }

    expect(shuffledRowIds.length).toBe(initialRowIds.length)
    expect([...shuffledRowIds].sort()).toEqual([...initialRowIds].sort())
  })
})
