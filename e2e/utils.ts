/**
 * Shared VibeGrid E2E Test Utilities
 *
 * Common helpers for VibeGrid field type tests.
 * Import these in test files instead of duplicating code.
 */

import type { Page, ElementHandle } from 'playwright-core'

/**
 * Check if an element is visible (has non-zero dimensions)
 */
export async function isElementVisible(element: ElementHandle | null): Promise<boolean> {
  if (!element) return false
  try {
    return await element.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
  } catch {
    return false
  }
}

/**
 * Get list of visible column IDs for debugging
 */
export async function getVisibleColumns(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cells = document.querySelectorAll('.vibegridx-cell[data-column-id]')
    const columnIds = new Set<string>()
    cells.forEach((c) => {
      const id = c.getAttribute('data-column-id')
      if (id) columnIds.add(id)
    })
    return Array.from(columnIds)
  })
}

/**
 * Scroll horizontally to find a column by ID
 * Returns true if column was found and is visible
 */
export async function scrollToColumn(page: Page, columnId: string): Promise<boolean> {
  const gridScroller = await page.$('.vibegridx-scroller, .vibegridx-body, [data-testid="vibegrid-container"]')
  if (!gridScroller) return false

  // Check if column is already visible
  let cell = await page.$(`.vibegridx-cell[data-column-id="${columnId}"]`)
  if (cell) {
    const visible = await isElementVisible(cell)
    if (visible) return true
  }

  // Try scrolling right to find the column
  for (let i = 0; i < 15; i++) {
    await gridScroller.evaluate((el) => {
      el.scrollLeft += 200
    })
    await new Promise((r) => setTimeout(r, 300))

    cell = await page.$(`.vibegridx-cell[data-column-id="${columnId}"]`)
    if (cell) {
      const visible = await isElementVisible(cell)
      if (visible) return true
    }
  }
  return false
}

/**
 * Load test fixtures by clicking the load button
 */
export async function loadFixtures(page: Page): Promise<void> {
  const loadBtn = await page.$('[data-testid="load-fixtures-btn"]')
  if (loadBtn) {
    const isVisible = await loadBtn.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    if (isVisible) {
      await loadBtn.click()
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

/**
 * Double-click a cell to enter edit mode
 */
export async function doubleClickCell(page: Page, cell: ElementHandle): Promise<void> {
  const box = await cell.boundingBox()
  if (!box) {
    throw new Error('TEST FAILURE: Could not get cell bounding box')
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 })
}

/**
 * Click on cell content (not padding) to trigger affordance action
 */
export async function clickCellContent(cell: ElementHandle): Promise<void> {
  await cell.evaluate((el) => {
    const content = el.firstElementChild
    if (content) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      content.dispatchEvent(event)
    }
  })
}

/**
 * Click outside to blur and save (clicks grid header)
 */
export async function blurToSave(page: Page): Promise<void> {
  const header = await page.$('.vibegridx-header-cell')
  if (header) {
    await header.click()
  } else {
    await page.click('body')
  }
  await new Promise((r) => setTimeout(r, 500))
}

/**
 * Find first visible, editable cell from a list
 */
export async function findEditableCell(cells: ElementHandle[]): Promise<ElementHandle | null> {
  for (const cell of cells) {
    const isVisible = await isElementVisible(cell)
    const isEditable = await cell.evaluate((el) => el.getAttribute('data-editable') !== 'false')
    if (isVisible && isEditable) {
      return cell
    }
  }
  return null
}

/**
 * Check if text editor (input/textarea) is visible in editing portal
 */
export async function isTextEditorVisible(page: Page): Promise<boolean> {
  const editors = await page.$$('.vibegridx-editing-portal input, .vibegridx-editing-portal textarea')
  const inlineEditors = await page.$$('.vibegridx-text-editor, .vibegridx-email-editor')
  return editors.length > 0 || inlineEditors.length > 0
}

/**
 * Check if number editor is visible in the editing portal
 */
export async function isNumberEditorVisible(page: Page): Promise<boolean> {
  // Check portal is visible and has a number input
  const portalWithInput = await page.$('.vibegridx-editing-portal[style*="display: block"] input[type="number"]')
  if (portalWithInput) return true

  // Check portal is visible and has editing content
  const visiblePortal = await page.evaluate(() => {
    const portal = document.querySelector('.vibegridx-editing-portal') as HTMLElement
    if (!portal) return false
    return portal.style.display === 'block' && portal.querySelector('input') !== null
  })
  if (visiblePortal) return true

  // Check for vibegridx-editing class with input (legacy pattern)
  const editingInputs = await page.$$('.vibegridx-editing input[type="number"]')
  if (editingInputs.length > 0) return true

  return false
}

/**
 * Get text editor input element from editing portal
 */
export async function getTextEditorInput(page: Page): Promise<ElementHandle | null> {
  let input = await page.$('.vibegridx-editing-portal input')
  if (input) return input

  input = await page.$('.vibegridx-editing-portal textarea')
  if (input) return input

  input = await page.$('.vibegridx-text-editor')
  if (input) return input

  input = await page.$('.vibegridx-email-editor')
  if (input) return input

  return null
}

/**
 * Standard viewport size for VibeGrid tests (wide enough for most columns)
 */
export const VIBEGRID_VIEWPORT = { width: 2400, height: 900 }

/**
 * Standard wait times
 */
export const WAIT = {
  SHORT: 200,
  MEDIUM: 500,
  LONG: 1500,
  GRID_RENDER: 1500,
  EDITOR_OPEN: 500,
  SAVE: 500,
}
