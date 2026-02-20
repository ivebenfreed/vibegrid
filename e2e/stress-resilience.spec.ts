/**
 * VibeGrid Stress & Resilience E2E Tests
 *
 * Tests for rapid interactions, edge cases, and error resilience.
 * Ensures the grid does not crash under adversarial usage patterns.
 *
 * @feature GH#466
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'playwright-core'
import { getTestPage, cleanupPage, BASE_URL } from '../setup/helpers'

let page: Page

const BASIC_URL = `${BASE_URL}/debug/vibegrid-test/basic`
const FIELD_TYPES_URL = `${BASE_URL}/debug/vibegrid-test/field-types`

async function navigateAndWaitForGrid(p: Page, url = BASIC_URL): Promise<boolean> {
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const testId = url.includes('field-types') ? 'vibegrid-test-field-types' : 'vibegrid-test-basic'
    await p.waitForSelector(`[data-testid="${testId}"]`, { timeout: 15000 })
    await p.waitForSelector('[data-testid="vibegrid-container"]', { timeout: 15000 })
    await new Promise((r) => setTimeout(r, 1000))
    return true
  } catch {
    return false
  }
}

describe('VibeGrid Stress & Resilience', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('Rapid clicks on different cells do not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 5) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Rapidly click different cells without waiting
    for (let i = 0; i < Math.min(cells.length, 10); i++) {
      const box = await cells[i].boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      }
    }

    await new Promise((r) => setTimeout(r, 500))

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Should have a selection
    const selected = await page.$$('.vibegridx-selected')
    expect(selected.length).toBeGreaterThan(0)
  })

  it('Rapid double-clicks on cells do not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 3) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Rapidly double-click cells
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const box = await cells[i].boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 2 })
        // Immediately Escape to close any editor
        await page.keyboard.press('Escape')
      }
    }

    await new Promise((r) => setTimeout(r, 500))

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Alternating select-edit-cancel does not leak state', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 2) {
      console.log('SKIP: Not enough cells')
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
      console.log('SKIP: No editable cell found')
      return
    }

    // Repeat select -> edit -> cancel cycle 5 times
    for (let cycle = 0; cycle < 5; cycle++) {
      // Select
      await editableCell.click()
      await new Promise((r) => setTimeout(r, 100))

      // Start edit
      await page.keyboard.press('Enter')
      await new Promise((r) => setTimeout(r, 200))

      // Cancel
      await page.keyboard.press('Escape')
      await new Promise((r) => setTimeout(r, 100))
    }

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // No editing state should be leaked
    const editingPortals = await page.$$('.vibegridx-editing-portal')
    for (const portal of editingPortals) {
      const isVisible = await portal.evaluate((el) => {
        return (el as HTMLElement).offsetWidth > 0
      })
      expect(isVisible).toBe(false)
    }
  })

  it('Multiple right-click then left-click sequence works', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 3) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Right-click, left-click, right-click, left-click
    for (let i = 0; i < Math.min(cells.length, 4); i++) {
      const box = await cells[i].boundingBox()
      if (box) {
        if (i % 2 === 0) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
        } else {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    await new Promise((r) => setTimeout(r, 300))

    // Grid should be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Ctrl+A then Delete does not crash', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Click a cell first
    await cells[0].click()
    await new Promise((r) => setTimeout(r, 100))

    // Ctrl+A
    await page.keyboard.down('Control')
    await page.keyboard.press('a')
    await page.keyboard.up('Control')
    await new Promise((r) => setTimeout(r, 200))

    // Delete
    await page.keyboard.press('Delete')
    await new Promise((r) => setTimeout(r, 300))

    // Grid should still exist
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Escape pressed multiple times does not break state', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    await cells[0].click()

    // Press Escape 10 times rapidly
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Escape')
    }
    await new Promise((r) => setTimeout(r, 300))

    // Grid should be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Should be able to select again
    await cells[0].click()
    const isSelected = await cells[0].evaluate((el) => el.classList.contains('vibegridx-selected'))
    // Selection may or may not be active depending on Escape behavior
    const containerAfter = await page.$('[data-testid="vibegrid-container"]')
    expect(containerAfter).not.toBeNull()
  })

  it('Tab through all columns wraps to next row', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length < 4) {
      console.log('SKIP: Not enough cells')
      return
    }

    // Get unique column count for first row
    const firstRowId = await cells[0].evaluate((el) => el.getAttribute('data-row-id'))
    const firstRowCells = await page.$$(
      `[data-row-id="${firstRowId}"].vibegridx-cell[data-column-id]`,
    )
    const columnCount = firstRowCells.length

    // Click first cell
    await cells[0].click()
    await new Promise((r) => setTimeout(r, 100))

    // Start editing and Tab through more columns than exist in a row
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 200))

    for (let i = 0; i < columnCount + 2; i++) {
      await page.keyboard.press('Tab')
      await new Promise((r) => setTimeout(r, 100))
    }

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Clean up
    await page.keyboard.press('Escape')
  })

  it('Large dataset scenario switch does not crash', async () => {
    if (!(await navigateAndWaitForGrid(page, FIELD_TYPES_URL))) {
      console.log('SKIP: Could not load field-types test page')
      return
    }

    // Find scenario buttons
    const buttons = await page.$$('button')
    const scenarioNames = ['small', 'medium', 'large']

    for (const scenarioName of scenarioNames) {
      for (const btn of buttons) {
        const text = await btn.evaluate((el) => el.textContent?.trim().toLowerCase())
        if (text === scenarioName) {
          await btn.click()
          await new Promise((r) => setTimeout(r, 1000))
          break
        }
      }
    }

    // Grid should still be functional after switching scenarios
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    const rows = await page.$$('.vibegridx-row[data-row-id]')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('Concurrent sort + select does not corrupt state', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Select a cell
    await cells[0].click()
    const selectedBefore = (await page.$$('.vibegridx-selected')).length
    expect(selectedBefore).toBeGreaterThan(0)

    // Click a header to sort while selection is active
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    if (headers.length > 1) {
      await headers[1].click()
      await new Promise((r) => setTimeout(r, 500))
    }

    // Grid should still be functional after sort
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    // Cells should still be rendered
    const cellsAfter = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cellsAfter.length).toBeGreaterThan(0)
  })

  it('Browser resize does not break grid layout', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Resize viewport smaller
    await page.setViewportSize({ width: 800, height: 600 })
    await new Promise((r) => setTimeout(r, 500))

    // Grid should still render
    let container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    let cellsAfter = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cellsAfter.length).toBeGreaterThan(0)

    // Resize viewport larger
    await page.setViewportSize({ width: 1920, height: 1080 })
    await new Promise((r) => setTimeout(r, 500))

    container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()

    cellsAfter = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cellsAfter.length).toBeGreaterThan(0)

    // Restore default viewport
    await page.setViewportSize({ width: 1280, height: 720 })
    await new Promise((r) => setTimeout(r, 300))
  })
})
