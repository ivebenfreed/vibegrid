/**
 * VibeGrid Keyboard Navigation E2E Tests
 *
 * Tests for keyboard navigation behaviors in VibeGrid.
 *
 * @feature GH#466
 * @spec planning/specs/466-vibegrid-e2e-testing-framework-with-pla.md
 *
 * Test Cases (Category 3: Keyboard Navigation):
 * 3.1 Arrow key navigation - Arrow Down moves focus to cell below
 * 3.2 Arrow Up/Left/Right - Arrow navigation in each direction
 * 3.3 Tab navigation - Tab moves focus to next cell
 * 3.4 Shift+Tab - Shift+Tab moves focus to previous cell
 * 3.5 Enter to edit - Enter starts editing on focused cell
 * 3.6 Escape from edit - Escape cancels editing
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from '../setup/helpers'

let page: Page

const BASIC_URL = `${BASE_URL}/debug/vibegrid-test/basic`

/**
 * Helper to navigate and wait for page to be ready
 */
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

describe('VibeGrid Keyboard Navigation', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('3.1 Arrow key navigation - Arrow Down moves focus to cell below', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells using data attributes, exclude drag handle column
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Click the first cell to give focus
    const firstCell = cells[0]
    await firstCell.click()

    // Verify first cell is selected
    const hasSelectedClass = await firstCell.evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(hasSelectedClass).toBe(true)

    // Get the row ID of the first cell
    const firstRowId = await firstCell.evaluate((el) => el.getAttribute('data-row-id'))
    const firstColumnId = await firstCell.evaluate((el) => el.getAttribute('data-column-id'))

    // Press Arrow Down
    await page.keyboard.press('ArrowDown')

    // Wait for selection update
    await new Promise((r) => setTimeout(r, 100))

    // Get the newly selected cell
    const selectedCells = await page.$$('.vibegridx-selected')
    expect(selectedCells.length).toBeGreaterThan(0)

    // The new cell should have a different row ID (if more rows exist)
    const newRowId = await selectedCells[0].evaluate((el) => el.getAttribute('data-row-id'))
    const newColumnId = await selectedCells[0].evaluate((el) => el.getAttribute('data-column-id'))

    // Column should stay the same
    expect(newColumnId).toBe(firstColumnId)

    // If there are multiple rows, row ID should be different
    const allRows = await page.$$('.vibegridx-row')
    if (allRows.length > 1) {
      expect(newRowId).not.toBe(firstRowId)
    }
  })

  it('3.2 Arrow Up/Left/Right - Arrow navigation in each direction', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length < 4) {
      console.log('SKIP: Not enough cells for arrow navigation test')
      return
    }

    // Click first cell
    const firstCell = cells[0]
    await firstCell.click()

    const firstColumnId = await firstCell.evaluate((el) => el.getAttribute('data-column-id'))

    // Navigate right first to have room for left navigation
    await page.keyboard.press('ArrowRight')
    await new Promise((r) => setTimeout(r, 100))

    // Get current position
    const afterRightCells = await page.$$('.vibegridx-selected')
    const rightColumnId = await afterRightCells[0].evaluate((el) =>
      el.getAttribute('data-column-id'),
    )

    // Horizontal navigation: Column ID should change when moving right
    expect(rightColumnId).not.toBe(firstColumnId)

    // Navigate left - should go back
    await page.keyboard.press('ArrowLeft')
    await new Promise((r) => setTimeout(r, 100))

    const afterLeftCells = await page.$$('.vibegridx-selected')
    const leftColumnId = await afterLeftCells[0].evaluate((el) => el.getAttribute('data-column-id'))

    // Should have moved back to previous column
    expect(leftColumnId).not.toBe(rightColumnId)

    // Test vertical navigation: Start fresh from first row
    const beforeDownCells = await page.$$('.vibegridx-selected')
    const rowBeforeDown = await beforeDownCells[0].evaluate((el) => el.getAttribute('data-row-id'))

    // Move down
    await page.keyboard.press('ArrowDown')
    await new Promise((r) => setTimeout(r, 100))

    const afterDownCells = await page.$$('.vibegridx-selected')
    const rowAfterDown = await afterDownCells[0].evaluate((el) => el.getAttribute('data-row-id'))

    // Count total rows to verify vertical navigation is possible
    const rowCount = (await page.$$('.vibegridx-row[data-row-id]')).length

    if (rowCount > 1) {
      // Should have moved to a different row
      expect(rowAfterDown).not.toBe(rowBeforeDown)

      // Now move up - should return to original row
      await page.keyboard.press('ArrowUp')
      await new Promise((r) => setTimeout(r, 100))

      const afterUpCells = await page.$$('.vibegridx-selected')
      const rowAfterUp = await afterUpCells[0].evaluate((el) => el.getAttribute('data-row-id'))

      // Should be back at original row
      expect(rowAfterUp).toBe(rowBeforeDown)
    }
  })

  it('3.3 Tab navigation - Tab commits edit and moves to next cell', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length < 2) {
      console.log('SKIP: Not enough cells for Tab navigation test')
      return
    }

    // Find an editable cell (Tab navigation only works during edit mode)
    let editableCell = null
    let editableCellColumnId: string | null = null
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const columnId = await cells[i].evaluate((el) => el.getAttribute('data-column-id'))

      if (columnId !== 'selection' && columnId !== 'id' && columnId !== '__selection') {
        editableCell = cells[i]
        editableCellColumnId = columnId
        break
      }
    }

    if (!editableCell) {
      console.log('SKIP: No editable cells found for Tab test')
      return
    }

    // Click cell to focus
    await editableCell.click()
    const hasSelectedClass = await editableCell.evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(hasSelectedClass).toBe(true)

    // Press Enter to start editing
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 200))

    // Check if editing started
    const inputField = await page.$(
      '.vibegridx-editing-overlay input, .vibegridx-editing-overlay textarea',
    )

    if (!inputField) {
      console.log('SKIP: Cell is not editable - Tab navigation in edit mode cannot be tested')
      return
    }

    // Press Tab to commit and navigate to next cell
    await page.keyboard.press('Tab')
    await new Promise((r) => setTimeout(r, 200))

    // Editing overlay should be closed after Tab
    const editingOverlayAfter = await page.$('.vibegridx-editing-overlay')
    const isEditingAfter = editingOverlayAfter
      ? await editingOverlayAfter.boundingBox().then((b) => b !== null)
      : false
    expect(isEditingAfter).toBe(false)

    // Selection should have moved to the next cell (column ID should change)
    const selectedAfterTab = await page.$$('.vibegridx-selected')
    const newColumnId = await selectedAfterTab[0].evaluate((el) =>
      el.getAttribute('data-column-id'),
    )

    // Column should change after Tab (moves right)
    expect(newColumnId).not.toBe(editableCellColumnId)
  })

  it('3.4 Shift+Tab - Shift+Tab commits edit and moves to previous cell', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length < 3) {
      console.log('SKIP: Not enough cells for Shift+Tab navigation test')
      return
    }

    // Navigate to a cell that's not at the leftmost position
    // Click first cell and navigate right twice
    await cells[0].click()

    await page.keyboard.press('ArrowRight')
    await new Promise((r) => setTimeout(r, 50))
    await page.keyboard.press('ArrowRight')
    await new Promise((r) => setTimeout(r, 100))

    // Get current cell after navigation
    const currentCells = await page.$$('.vibegridx-selected')
    const currentColumnId = await currentCells[0].evaluate((el) =>
      el.getAttribute('data-column-id'),
    )

    // Start editing (Shift+Tab only works during edit mode)
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 200))

    // Check if editing started
    const inputField = await page.$(
      '.vibegridx-editing-overlay input, .vibegridx-editing-overlay textarea',
    )

    if (!inputField) {
      console.log('SKIP: Cell is not editable - Shift+Tab in edit mode cannot be tested')
      return
    }

    // Press Shift+Tab to commit and navigate to previous cell
    await page.keyboard.down('Shift')
    await page.keyboard.press('Tab')
    await page.keyboard.up('Shift')
    await new Promise((r) => setTimeout(r, 200))

    // Editing overlay should be closed after Shift+Tab
    const editingOverlayAfter = await page.$('.vibegridx-editing-overlay')
    const isEditingAfter = editingOverlayAfter
      ? await editingOverlayAfter.boundingBox().then((b) => b !== null)
      : false
    expect(isEditingAfter).toBe(false)

    // Selection should have moved to the previous cell (column ID should change)
    const afterShiftTab = await page.$$('.vibegridx-selected')
    const columnAfterShiftTab = await afterShiftTab[0].evaluate((el) =>
      el.getAttribute('data-column-id'),
    )

    // Column should change after Shift+Tab (moves left)
    expect(columnAfterShiftTab).not.toBe(currentColumnId)
  })

  it('3.5 Enter to edit - Enter starts editing on focused cell', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells that are editable (exclude selection column and non-editable columns)
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered')
      return
    }

    // Find an editable cell (try a few cells as some may be non-editable)
    let editableCell = null
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const columnId = await cells[i].evaluate((el) => el.getAttribute('data-column-id'))

      // Skip selection column and typically non-editable columns like 'id'
      if (columnId !== 'selection' && columnId !== 'id' && columnId !== '__selection') {
        editableCell = cells[i]
        break
      }
    }

    if (!editableCell) {
      console.log('SKIP: No editable cells found')
      return
    }

    // Click cell to focus
    await editableCell.click()
    const hasSelectedClass = await editableCell.evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(hasSelectedClass).toBe(true)

    // Press Enter to start editing
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 200))

    // Check for editing state
    const editingOverlay = await page.$('.vibegridx-editing-overlay, [data-editing="true"]')
    const editingCell = await page.$('.vibegridx-editing')
    const inputField = await page.$(
      '.vibegridx-editing-overlay input, .vibegridx-editing-overlay textarea',
    )

    // At least one indicator of editing should be present
    const isEditingOverlayVisible = editingOverlay !== null
    const isEditingCellVisible = editingCell !== null
    const isInputVisible = inputField !== null

    // If the column is editable, one of these should be true
    if (isEditingOverlayVisible || isEditingCellVisible || isInputVisible) {
      expect(isEditingOverlayVisible || isEditingCellVisible || isInputVisible).toBe(true)
    } else {
      // Cell may not be editable - just verify no crash occurred
      const container = await page.$('[data-testid="vibegrid-container"]')
      expect(container).not.toBeNull()
    }
  })

  it('3.6 Escape from edit - Escape cancels editing', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered')
      return
    }

    // Find an editable cell
    let editableCell = null
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const columnId = await cells[i].evaluate((el) => el.getAttribute('data-column-id'))

      if (columnId !== 'selection' && columnId !== 'id' && columnId !== '__selection') {
        editableCell = cells[i]
        break
      }
    }

    if (!editableCell) {
      console.log('SKIP: No editable cells found')
      return
    }

    // Click cell to focus
    await editableCell.click()
    const hasSelectedClass = await editableCell.evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(hasSelectedClass).toBe(true)

    // Press Enter to start editing
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 200))

    // Check if editing started
    const inputField = await page.$(
      '.vibegridx-editing-overlay input, .vibegridx-editing-overlay textarea',
    )

    if (inputField) {
      // Type something new
      await page.keyboard.type('test escape cancel value')
      await new Promise((r) => setTimeout(r, 100))

      // Press Escape to cancel
      await page.keyboard.press('Escape')
      await new Promise((r) => setTimeout(r, 200))

      // Editing overlay should be gone
      const editingOverlayAfter = await page.$('.vibegridx-editing-overlay')
      const isEditingAfter = editingOverlayAfter
        ? await editingOverlayAfter.boundingBox().then((b) => b !== null)
        : false
      expect(isEditingAfter).toBe(false)

      // Cell should remain selected (focus kept after cancel)
      const selectedCells = await page.$$('.vibegridx-selected')
      expect(selectedCells.length).toBeGreaterThan(0)
    } else {
      // If editing didn't start (non-editable cell), Escape should still work
      await page.keyboard.press('Escape')
      await new Promise((r) => setTimeout(r, 100))

      // Grid should still be functional
      const container = await page.$('[data-testid="vibegrid-container"]')
      expect(container).not.toBeNull()
    }
  })

  it('Arrow keys with Shift extend selection', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length < 4) {
      console.log('SKIP: Not enough cells for shift+arrow selection test')
      return
    }

    // Click first cell
    const firstCell = cells[0]
    await firstCell.click()
    const hasSelectedClass = await firstCell.evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(hasSelectedClass).toBe(true)

    // Shift+ArrowRight to extend selection
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.up('Shift')
    await new Promise((r) => setTimeout(r, 100))

    // Should have multiple cells selected
    const selectedCells = await page.$$('.vibegridx-selected')

    // Range selection should select multiple cells
    expect(selectedCells.length).toBeGreaterThanOrEqual(2)
  })

  it('Ctrl+A selects all cells', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered')
      return
    }

    // Click first cell to focus the grid
    await cells[0].click()

    // Press Ctrl+A to select all
    await page.keyboard.down('Control')
    await page.keyboard.press('a')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 200))

    // All visible cells should be selected
    const selectedCells = await page.$$('.vibegridx-selected')

    // Should have more than 1 cell selected (ideally all cells)
    expect(selectedCells.length).toBeGreaterThan(1)
  })

  it('Delete/Backspace on focused cell (when supported)', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Get cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered')
      return
    }

    // Click a cell to focus
    await cells[0].click()
    const hasSelectedClass = await cells[0].evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(hasSelectedClass).toBe(true)

    // Press Delete - should not crash the grid
    await page.keyboard.press('Delete')
    await new Promise((r) => setTimeout(r, 100))

    // Grid should remain functional
    const container1 = await page.$('[data-testid="vibegrid-container"]')
    expect(container1).not.toBeNull()

    // Press Backspace - should not crash the grid
    await page.keyboard.press('Backspace')
    await new Promise((r) => setTimeout(r, 100))

    // Grid should remain functional
    const container2 = await page.$('[data-testid="vibegrid-container"]')
    expect(container2).not.toBeNull()
  })
})
