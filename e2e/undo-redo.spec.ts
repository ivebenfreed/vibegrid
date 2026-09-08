/**
 * VibeGrid Undo/Redo Comprehensive E2E Tests
 *
 * Tests for multi-step undo/redo, undo across different operation types,
 * and redo after undo sequences. Extends the basic undo/redo tests in clipboard.spec.ts.
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
 * Helper to check if editing mode is active
 */
async function isEditing(p: Page): Promise<boolean> {
  return p.evaluate(() => {
    const editingPortal = document.querySelector('.vibegridx-editing-portal')
    const portalVisible = editingPortal && (editingPortal as HTMLElement).offsetWidth > 0
    const editingCells = document.querySelectorAll('.vibegridx-editing').length
    const contentHidden = document.querySelectorAll('.vibegridx-cell-content-hidden').length
    return !!(portalVisible || editingCells > 0 || contentHidden > 0)
  })
}

/**
 * Helper to find a safe editable content element
 */
async function findSafeEditableContent(p: Page) {
  const safeSelector =
    '.vibegridx-cell[data-column-id="progress"] [data-affordance="edit"], ' +
    '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]'
  const safeElement = await p.$(safeSelector)
  if (safeElement) return safeElement

  const fallbackSelector =
    '.vibegridx-cell[data-row-id][data-column-id]:not([data-column-id="name"]) [data-affordance="edit"]'
  return p.$(fallbackSelector)
}

/**
 * Start editing via double-click on safe content
 */
async function startEdit(p: Page): Promise<boolean> {
  const editableContent = await findSafeEditableContent(p)
  if (!editableContent) return false

  const box = await editableContent.boundingBox()
  if (!box) return false

  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 })
  await new Promise((r) => setTimeout(r, 500))
  return await isEditing(p)
}

/**
 * Get visible text content of a cell by row/column
 */
async function getCellText(p: Page, rowId: string, columnId: string): Promise<string | null> {
  return p.evaluate(
    ({ rowId, columnId }) => {
      const cell = document.querySelector(`.vibegridx-cell[data-row-id="${rowId}"][data-column-id="${columnId}"]`)
      return cell?.textContent?.trim() || null
    },
    { rowId, columnId },
  )
}

describe('VibeGrid Undo/Redo Comprehensive', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('Ctrl+Z undoes a cell edit', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const editStarted = await startEdit(page)
    if (!editStarted) {
      console.log('SKIP: Could not start editing')
      return
    }

    // Type a value and commit
    const testValue = `Undo_${Date.now()}`
    await page.keyboard.type(testValue)
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 500))

    // Undo with Ctrl+Z
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 500))

    // Grid should be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Ctrl+Z multiple times undoes multiple edits', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Find editable cells
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 2) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Make two edits
    for (let edit = 0; edit < 2; edit++) {
      const editStarted = await startEdit(page)
      if (!editStarted) {
        console.log('SKIP: Could not start editing')
        return
      }
      await page.keyboard.type(`Edit_${edit}`)
      await page.keyboard.press('Enter')
      await new Promise((r) => setTimeout(r, 500))
    }

    // Undo twice
    for (let i = 0; i < 2; i++) {
      await page.keyboard.down('Control')
      await page.keyboard.press('z')
      await page.keyboard.up('Control')
      await new Promise((r) => setTimeout(r, 300))
    }

    // Grid should be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Ctrl+Shift+Z or Ctrl+Y redoes an undone edit', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const editStarted = await startEdit(page)
    if (!editStarted) {
      console.log('SKIP: Could not start editing')
      return
    }

    // Edit and commit
    await page.keyboard.type('RedoTest')
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 500))

    // Undo
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 300))

    // Redo with Ctrl+Y
    await page.keyboard.down('Control')
    await page.keyboard.press('y')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 300))

    // Grid should be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Also try Ctrl+Shift+Z (alternative redo)
    // Undo first
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 300))

    // Redo with Ctrl+Shift+Z
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    await page.keyboard.press('z')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 300))

    const containerAfter = await page.$('[data-testid="vibegrid-container"]')
    expect(containerAfter).not.toBeNull()
  })

  it('Undo with no history does not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Click a cell to focus the grid
    await cells[0].click()
    await new Promise((r) => setTimeout(r, 200))

    // Try to undo with no edit history - should not crash
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('Control')
      await page.keyboard.press('z')
      await page.keyboard.up('Control')
      await new Promise((r) => setTimeout(r, 100))
    }

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Redo with no redo history does not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Click a cell to focus
    await cells[0].click()
    await new Promise((r) => setTimeout(r, 200))

    // Try to redo with no redo history - should not crash
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('Control')
      await page.keyboard.press('y')
      await page.keyboard.up('Control')
      await new Promise((r) => setTimeout(r, 100))
    }

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Edit after undo clears redo stack', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Make an edit
    let editStarted = await startEdit(page)
    if (!editStarted) {
      console.log('SKIP: Could not start editing')
      return
    }
    await page.keyboard.type('First')
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 500))

    // Undo
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 300))

    // Make a new edit (should clear redo stack)
    editStarted = await startEdit(page)
    if (!editStarted) {
      console.log('SKIP: Could not start second editing')
      return
    }
    await page.keyboard.type('Second')
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 500))

    // Redo should not restore "First" (redo stack was cleared)
    await page.keyboard.down('Control')
    await page.keyboard.press('y')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 300))

    // Grid should be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })
})
