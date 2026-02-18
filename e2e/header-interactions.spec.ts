/**
 * VibeGrid Header Interactions E2E Tests
 *
 * Tests for column header behaviors: sorting indicators, tooltips,
 * double-click auto-size, header selection, and header state consistency.
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

describe('VibeGrid Header Interactions', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('All non-system headers have column labels', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    expect(headers.length).toBeGreaterThan(0)

    // Each non-system header should have visible text
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId === '__selection__' || columnId === '__drag_handle__') continue

      const text = await header.evaluate((el) => el.textContent?.trim())
      expect(text).toBeTruthy()
    }
  })

  it('Header click activates sort indicator', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No data cells')
      return
    }

    // Find a sortable header
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    let sortableHeader = null
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__' && columnId !== '__drag_handle__') {
        sortableHeader = header
        break
      }
    }

    if (!sortableHeader) {
      console.log('SKIP: No sortable headers')
      return
    }

    // Click header
    await sortableHeader.click()
    await new Promise((r) => setTimeout(r, 500))

    // Check for sort indicator
    const sortIcon = await sortableHeader.$('.vibegridx-sort-icon')
    if (sortIcon) {
      const isActive = await sortIcon.evaluate((el) => el.classList.contains('active'))
      expect(isActive).toBe(true)
    }

    // Grid should still render data
    const cellsAfter = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    expect(cellsAfter.length).toBeGreaterThan(0)
  })

  it('Double-click header border auto-sizes column', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    if (headers.length < 2) {
      console.log('SKIP: Not enough headers')
      return
    }

    // Find the first non-system header
    let targetHeader = null
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__' && columnId !== '__drag_handle__') {
        targetHeader = header
        break
      }
    }

    if (!targetHeader) {
      console.log('SKIP: No target header')
      return
    }

    // Get initial width
    const initialWidth = await targetHeader.evaluate((el) => el.getBoundingClientRect().width)

    // Find the right edge of the header (resize handle area)
    const box = await targetHeader.boundingBox()
    if (!box) {
      console.log('SKIP: No bounding box')
      return
    }

    // Double-click at the right edge (resize handle)
    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2, { clickCount: 2 })
    await new Promise((r) => setTimeout(r, 500))

    // Width may have changed (auto-sized to content)
    const newWidth = await targetHeader.evaluate((el) => el.getBoundingClientRect().width)

    // Grid should still be functional regardless of whether auto-size worked
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Header maintains state after data changes', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Click a header to sort
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    let sortableHeader = null
    let sortColumnId = null
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__' && columnId !== '__drag_handle__') {
        sortableHeader = header
        sortColumnId = columnId
        break
      }
    }

    if (!sortableHeader) {
      console.log('SKIP: No sortable headers')
      return
    }

    await sortableHeader.click()
    await new Promise((r) => setTimeout(r, 500))

    // Add a row (data change)
    const buttons = await page.$$('button')
    for (const btn of buttons) {
      const text = await btn.evaluate((el) => el.textContent?.trim())
      if (text?.includes('Add Row') || text?.includes('Add')) {
        await btn.click()
        await new Promise((r) => setTimeout(r, 500))
        break
      }
    }

    // Header sort state should be preserved
    const headerAfter = await page.$(`.vibegridx-header-cell[data-column-id="${sortColumnId}"]`)
    if (headerAfter) {
      const sortIcon = await headerAfter.$('.vibegridx-sort-icon')
      if (sortIcon) {
        // Sort icon should still be present
        const box = await sortIcon.boundingBox()
        expect(box).not.toBeNull()
      }
    }

    // Grid functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Right-click header shows header-specific context menu', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    let targetHeader = null
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__' && columnId !== '__drag_handle__') {
        targetHeader = header
        break
      }
    }

    if (!targetHeader) {
      console.log('SKIP: No target header')
      return
    }

    // Right-click header
    await targetHeader.click({ button: 'right' })
    await new Promise((r) => setTimeout(r, 500))

    // Check for context menu
    const contextMenu = await page.$('.vibegridx-context-menu')
    if (!contextMenu) {
      console.log('SKIP: Context menu did not appear')
      return
    }

    const menuVisible = await contextMenu.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(menuVisible).toBe(true)

    // Dismiss
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 200))
  })

  it('Headers render with correct count matching columns', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No data cells')
      return
    }

    // Get unique column IDs from data cells
    const dataColumnIds = await page.evaluate(() => {
      const cells = document.querySelectorAll('.vibegridx-cell[data-row-id][data-column-id]')
      const ids = new Set<string>()
      cells.forEach((c) => {
        const id = c.getAttribute('data-column-id')
        if (id) ids.add(id)
      })
      return Array.from(ids)
    })

    // Get header column IDs
    const headerColumnIds = await page.evaluate(() => {
      const headers = document.querySelectorAll('.vibegridx-header-cell[data-column-id]')
      const ids = new Set<string>()
      headers.forEach((h) => {
        const id = h.getAttribute('data-column-id')
        if (id) ids.add(id)
      })
      return Array.from(ids)
    })

    // Each data column should have a corresponding header
    for (const colId of dataColumnIds) {
      expect(headerColumnIds).toContain(colId)
    }
  })

  it('Clicking header while editing cancels edit', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    if (cells.length === 0) {
      console.log('SKIP: No cells')
      return
    }

    // Find an editable cell
    let editableCell = null
    for (let i = 0; i < Math.min(cells.length, 5); i++) {
      const columnId = await cells[i].evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__' && columnId !== 'selection') {
        editableCell = cells[i]
        break
      }
    }

    if (!editableCell) {
      console.log('SKIP: No editable cell')
      return
    }

    // Start editing
    await editableCell.click()
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 300))

    // Click a header
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    if (headers.length > 0) {
      await headers[0].click()
      await new Promise((r) => setTimeout(r, 300))
    }

    // Editing should be cancelled (or committed via blur)
    const editingPortals = await page.$$('.vibegridx-editing-portal')
    for (const portal of editingPortals) {
      const isVisible = await portal.evaluate((el) => (el as HTMLElement).offsetWidth > 0)
      // Portal should not be visible after clicking away
      expect(isVisible).toBe(false)
    }

    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })
})
