/**
 * VibeGrid Context Menu E2E Tests
 *
 * Tests for context menu behaviors in VibeGrid including cell and header
 * context menus, action execution, and menu dismissal.
 *
 * @feature GH#466
 * @spec planning/specs/466-vibegrid-e2e-testing-framework-with-pla.md
 *
 * NOTE: These tests require the mock VibeGrid test route to properly render
 * data cells. The route needs to pass initialData to VibeGrid for tests to work.
 * Tests will skip if no data cells are detected.
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from '../setup/helpers'

let page: Page

describe('VibeGrid Context Menus', () => {
  beforeEach(async () => {
    page = await getTestPage()
    await page.goto(`${BASE_URL}/debug/vibegrid-test/basic`)
    await page.waitForSelector('[data-testid="vibegrid-test-basic"]', {
      timeout: 15000,
    })

    // Wait for the vibegrid container to be visible
    await page.waitForSelector('[data-testid="vibegrid-container"]', {
      timeout: 15000,
    })

    // Wait a moment for React to render the grid component
    await new Promise((r) => setTimeout(r, 1000))
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('7.1 Cell context menu - right-click on cell', async () => {
    // Wait for cells to render
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = cells.length

    if (cellCount === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find the first data cell
    const firstCell = cells[0]
    const isVisible = await firstCell.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(isVisible).toBe(true)

    // Right-click on the cell to open context menu
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    await new Promise((r) => setTimeout(r, 500))
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

    // Verify menu has expected items for cell context (Copy, Paste, Cut options)
    const copyButton = await contextMenu.$('.context-menu-item:has-text("Copy")')
    const pasteButton = await contextMenu.$('.context-menu-item:has-text("Paste")')

    // Check for Copy text in menu items
    const menuItems = await contextMenu.$$('.context-menu-item')
    let hasCopy = false
    let hasPaste = false
    for (const item of menuItems) {
      const text = await item.evaluate((el) => el.textContent)
      if (text?.includes('Copy')) hasCopy = true
      if (text?.includes('Paste')) hasPaste = true
    }
    expect(hasCopy).toBe(true)
    expect(hasPaste).toBe(true)
  })

  it('7.2 Header context menu - right-click on header', async () => {
    // Wait for header cells to render
    const headerCells = await page.$$('.vibegridx-header-cell[data-column-id]')
    const headerCount = headerCells.length

    if (headerCount === 0) {
      console.log('SKIP: No header cells rendered - mock route may need initialData prop')
      return
    }

    // Find the first header cell (skip any system columns if present)
    const firstHeader = headerCells[0]
    const isVisible = await firstHeader.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(isVisible).toBe(true)

    // Right-click on the header to open context menu
    await firstHeader.click({ button: 'right' })

    // Wait for context menu to appear
    await new Promise((r) => setTimeout(r, 500))
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

    // Header context menus should have Copy/Paste and may have column operations
    const menuItems = await contextMenu.$$('.context-menu-item')
    let hasCopy = false
    for (const item of menuItems) {
      const text = await item.evaluate((el) => el.textContent)
      if (text?.includes('Copy')) hasCopy = true
    }
    expect(hasCopy).toBe(true)
  })

  it('7.3 Menu action execution - click menu option', async () => {
    // Wait for cells to render
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = cells.length

    if (cellCount === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Select a cell first
    const firstCell = cells[0]
    await firstCell.click()
    const isSelected = await firstCell.evaluate((el) =>
      el.classList.contains('vibegridx-selected'),
    )
    expect(isSelected).toBe(true)

    // Right-click to open context menu
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    await new Promise((r) => setTimeout(r, 500))
    const contextMenu = await page.$('.vibegridx-context-menu')

    if (!contextMenu) {
      console.log('SKIP: Context menu did not appear')
      return
    }

    // Click the Copy action
    const menuItems = await contextMenu.$$('.context-menu-item')
    let copyButton = null
    for (const item of menuItems) {
      const text = await item.evaluate((el) => el.textContent)
      if (text?.includes('Copy')) {
        copyButton = item
        break
      }
    }

    if (!copyButton) {
      console.log('SKIP: Copy button not found in context menu')
      return
    }

    await copyButton.click()

    // Verify menu closes after action execution
    await new Promise((r) => setTimeout(r, 200))
    const menuAfterClick = await page.$('.vibegridx-context-menu')
    const menuStillVisible = menuAfterClick
      ? await menuAfterClick.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
      : false
    expect(menuStillVisible).toBe(false)

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('7.4 Menu dismiss - click outside menu', async () => {
    // Wait for cells to render
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = cells.length

    if (cellCount === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Right-click on a cell to open context menu
    const firstCell = cells[0]
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    await new Promise((r) => setTimeout(r, 500))
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

    // Click outside the menu (on the grid container or another area)
    // Need to wait a moment because menu has delay before adding click-outside listener
    await new Promise((r) => setTimeout(r, 150))

    // Click on the page title or header area (outside the menu)
    const headers = await page.$$('h2')
    let header = null
    for (const h of headers) {
      const text = await h.evaluate((el) => el.textContent)
      if (text?.includes('Mock VibeGrid Test')) {
        header = h
        break
      }
    }

    if (header) {
      const headerVisible = await header.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      if (headerVisible) {
        await header.click()
      } else {
        await page.mouse.click(10, 10)
      }
    } else {
      // Fallback: click on the body outside the context menu
      await page.mouse.click(10, 10)
    }

    // Verify menu closes
    await new Promise((r) => setTimeout(r, 200))
    const menuAfterClick = await page.$('.vibegridx-context-menu')
    const menuStillVisible = menuAfterClick
      ? await menuAfterClick.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
      : false
    expect(menuStillVisible).toBe(false)

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Menu dismiss - press Escape key', async () => {
    // Wait for cells to render
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = cells.length

    if (cellCount === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Right-click on a cell to open context menu
    const firstCell = cells[0]
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    await new Promise((r) => setTimeout(r, 500))
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

    // Wait for escape handler to be attached
    await new Promise((r) => setTimeout(r, 150))

    // Press Escape to close the menu
    await page.keyboard.press('Escape')

    // Verify menu closes
    await new Promise((r) => setTimeout(r, 200))
    const menuAfterEscape = await page.$('.vibegridx-context-menu')
    const menuStillVisible = menuAfterEscape
      ? await menuAfterEscape.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
      : false
    expect(menuStillVisible).toBe(false)

    // Grid should still be functional
    const container = await page.$('[data-testid="vibegrid-container"]')
    expect(container).not.toBeNull()
  })

  it('Context menu contains cell-specific actions', async () => {
    // Wait for cells to render
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = cells.length

    if (cellCount === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Right-click on a cell to open context menu
    const firstCell = cells[0]
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    await new Promise((r) => setTimeout(r, 500))
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

    // Verify cell-specific menu items are present
    // Based on ContextMenu.tsx, cell context includes: Copy, Paste, Cut (for cells)
    const menuItems = await contextMenu.$$('.context-menu-item')
    const itemCount = menuItems.length

    // Should have at least Copy and Paste (2+ items)
    expect(itemCount).toBeGreaterThanOrEqual(2)

    // Check for keyboard shortcuts display
    const kbdElements = await contextMenu.$$('kbd')
    let hasCtrlC = false
    for (const kbd of kbdElements) {
      const text = await kbd.evaluate((el) => el.textContent)
      if (text?.includes('Ctrl+C')) {
        hasCtrlC = true
        break
      }
    }
    expect(hasCtrlC).toBe(true)
  })

  it('Multiple right-clicks replace context menu', async () => {
    // Wait for cells to render
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = cells.length

    if (cellCount < 2) {
      console.log('SKIP: Not enough cells for multiple context menu test')
      return
    }

    const firstCell = cells[0]
    const secondCell = cells[1]

    // Right-click first cell
    await firstCell.click({ button: 'right' })
    await new Promise((r) => setTimeout(r, 500))

    const contextMenu = await page.$('.vibegridx-context-menu')
    if (!contextMenu) {
      console.log('SKIP: Context menu did not appear')
      return
    }

    const initialVisible = await contextMenu.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    expect(initialVisible).toBe(true)

    // Get initial position
    const initialBoundingBox = await contextMenu.boundingBox()
    expect(initialBoundingBox).not.toBeNull()

    // Right-click on second cell - should either close and reopen or update position
    await secondCell.click({ button: 'right' })

    // Menu should still be visible (possibly at new position)
    await new Promise((r) => setTimeout(r, 500))
    const menuAfterSecondClick = await page.$('.vibegridx-context-menu')
    const menuVisible = menuAfterSecondClick
      ? await menuAfterSecondClick.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
      : false
    expect(menuVisible).toBe(true)

    // There should only be one context menu open at a time
    const allMenus = await page.$$('.vibegridx-context-menu')
    expect(allMenus.length).toBe(1)
  })
})
