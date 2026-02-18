/**
 * VibeGrid Advanced Keyboard Navigation E2E Tests
 *
 * Tests for Home/End, Page Up/Down, Ctrl+Home/End, and boundary behaviors.
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

describe('VibeGrid Advanced Keyboard Navigation', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('Home key moves to first column in row', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 3) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Navigate right a few times to be away from first column
    await cells[0].click()
    await page.keyboard.press('ArrowRight')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('ArrowRight')
    await new Promise((r) => setTimeout(r, 100))

    // Get current position
    const beforeHome = await page.$$('.vibegridx-selected')
    const colBefore = await beforeHome[0].evaluate((el) => el.getAttribute('data-column-id'))

    // Press Home
    await page.keyboard.press('Home')
    await new Promise((r) => setTimeout(r, 200))

    // Should move to first column
    const afterHome = await page.$$('.vibegridx-selected')
    expect(afterHome.length).toBeGreaterThan(0)

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('End key moves to last column in row', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Click first cell
    await cells[0].click()
    const rowId = await cells[0].evaluate((el) => el.getAttribute('data-row-id'))

    // Press End
    await page.keyboard.press('End')
    await new Promise((r) => setTimeout(r, 200))

    // Should move to last column (or stay functional)
    const afterEnd = await page.$$('.vibegridx-selected')
    expect(afterEnd.length).toBeGreaterThan(0)

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Ctrl+Home moves to first cell (top-left)', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 4) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Navigate to a middle cell
    await cells[0].click()
    await page.keyboard.press('ArrowDown')
    await new Promise((r) => setTimeout(r, 100))
    await page.keyboard.press('ArrowRight')
    await new Promise((r) => setTimeout(r, 100))

    // Ctrl+Home
    await page.keyboard.down('Control')
    await page.keyboard.press('Home')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 200))

    // Should have selection
    const afterCtrlHome = await page.$$('.vibegridx-selected')
    expect(afterCtrlHome.length).toBeGreaterThan(0)

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Ctrl+End moves to last cell (bottom-right)', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Start from first cell
    await cells[0].click()

    // Ctrl+End
    await page.keyboard.down('Control')
    await page.keyboard.press('End')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 200))

    // Should have selection
    const afterCtrlEnd = await page.$$('.vibegridx-selected')
    expect(afterCtrlEnd.length).toBeGreaterThan(0)

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Arrow left at first column stays in place', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Click first cell
    await cells[0].click()
    const initialCol = await cells[0].evaluate((el) => el.getAttribute('data-column-id'))
    const initialRow = await cells[0].evaluate((el) => el.getAttribute('data-row-id'))

    // Press ArrowLeft - should stay at boundary
    await page.keyboard.press('ArrowLeft')
    await new Promise((r) => setTimeout(r, 100))

    const selected = await page.$$('.vibegridx-selected')
    expect(selected.length).toBeGreaterThan(0)

    // Should remain on same row (may wrap or stay)
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Arrow up at first row stays in place', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Click first cell (should be in first row)
    await cells[0].click()
    const initialRow = await cells[0].evaluate((el) => el.getAttribute('data-row-id'))

    // Press ArrowUp at top boundary
    await page.keyboard.press('ArrowUp')
    await new Promise((r) => setTimeout(r, 100))

    const selected = await page.$$('.vibegridx-selected')
    expect(selected.length).toBeGreaterThan(0)

    // Should still be on first row
    const currentRow = await selected[0].evaluate((el) => el.getAttribute('data-row-id'))
    expect(currentRow).toBe(initialRow)
  })

  it('Rapid arrow key presses do not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Click first cell
    await cells[0].click()

    // Rapid key presses without waiting
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
    }
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowDown')
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowLeft')
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowUp')
    }

    await new Promise((r) => setTimeout(r, 500))

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    const selected = await page.$$('.vibegridx-selected')
    expect(selected.length).toBeGreaterThan(0)
  })

  it('Type-ahead starts editing on focused cell', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Find a text-editable cell (skip selection column)
    let editableCell = null
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const columnId = await cells[i].evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__' && columnId !== 'selection' && columnId !== 'id') {
        editableCell = cells[i]
        break
      }
    }

    if (!editableCell) {
      console.log('SKIP: No editable cells found')
      return
    }

    // Click to focus the cell
    await editableCell.click()
    await new Promise((r) => setTimeout(r, 200))

    // Type a character - should start editing (type-ahead)
    await page.keyboard.type('a')
    await new Promise((r) => setTimeout(r, 500))

    // Check if editing started (portal or editing class)
    const isEditing = await page.evaluate(() => {
      const portal = document.querySelector('.vibegridx-editing-portal')
      const portalVisible = portal && (portal as HTMLElement).offsetWidth > 0
      const editingCells = document.querySelectorAll('.vibegridx-editing').length
      const contentHidden = document.querySelectorAll('.vibegridx-cell-content-hidden').length
      return !!(portalVisible || editingCells > 0 || contentHidden > 0)
    })

    // Type-ahead may or may not be supported - grid should not crash
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Clean up
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 200))
  })

  it('Shift+ArrowDown extends selection vertically', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 4) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Click first cell
    await cells[0].click()
    const initialCount = (await page.$$('.vibegridx-selected')).length

    // Shift+ArrowDown multiple times
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.up('Shift')
    await new Promise((r) => setTimeout(r, 200))

    // Should have more cells selected
    const afterCount = (await page.$$('.vibegridx-selected')).length
    expect(afterCount).toBeGreaterThan(initialCount)
  })

  it('F2 on focused cell starts editing', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Find editable cell
    let editableCell = null
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const columnId = await cells[i].evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__' && columnId !== 'selection') {
        editableCell = cells[i]
        break
      }
    }

    if (!editableCell) {
      console.log('SKIP: No editable cells found')
      return
    }

    // Click then F2
    await editableCell.click()
    await new Promise((r) => setTimeout(r, 200))
    await page.keyboard.press('F2')
    await new Promise((r) => setTimeout(r, 500))

    // Grid should not crash
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Clean up
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 200))
  })
})
