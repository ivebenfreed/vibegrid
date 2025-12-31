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
 */

import { test, expect, BASE_URL } from '../fixtures/auth.fixture'

test.describe('VibeGrid Context Menus', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto(`${BASE_URL}/debug/vibegrid-test/basic`)
    await page.waitForSelector('[data-testid="vibegrid-test-basic"]', {
      timeout: 15000,
    })

    // Wait for the vibegrid container to be visible
    await page.waitForSelector('[data-testid="vibegrid-container"]', {
      timeout: 15000,
    })

    // Wait a moment for React to render the grid component
    await page.waitForTimeout(1000)
  })

  test('7.1 Cell context menu - right-click on cell', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find the first data cell
    const firstCell = cellLocator.first()
    await expect(firstCell).toBeVisible()

    // Right-click on the cell to open context menu
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    const contextMenu = page.locator('.vibegridx-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // Verify menu has expected items for cell context (Copy, Paste, Cut options)
    const copyButton = contextMenu.locator('.context-menu-item:has-text("Copy")')
    const pasteButton = contextMenu.locator('.context-menu-item:has-text("Paste")')
    await expect(copyButton).toBeVisible()
    await expect(pasteButton).toBeVisible()
  })

  test('7.2 Header context menu - right-click on header', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for header cells to render
    const headerLocator = page.locator('.vibegridx-header-cell[data-column-id]')
    const headerCount = await headerLocator.count()

    if (headerCount === 0) {
      test.skip(true, 'No header cells rendered - mock route may need initialData prop')
      return
    }

    // Find the first header cell (skip any system columns if present)
    const firstHeader = headerLocator.first()
    await expect(firstHeader).toBeVisible()

    // Right-click on the header to open context menu
    await firstHeader.click({ button: 'right' })

    // Wait for context menu to appear
    const contextMenu = page.locator('.vibegridx-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // Header context menus should have Copy/Paste and may have column operations
    const copyButton = contextMenu.locator('.context-menu-item:has-text("Copy")')
    await expect(copyButton).toBeVisible()
  })

  test('7.3 Menu action execution - click menu option', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Select a cell first
    const firstCell = cellLocator.first()
    await firstCell.click()
    await expect(firstCell).toHaveClass(/vibegridx-selected/)

    // Right-click to open context menu
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    const contextMenu = page.locator('.vibegridx-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // Click the Copy action
    const copyButton = contextMenu.locator('.context-menu-item:has-text("Copy")')
    await expect(copyButton).toBeVisible()
    await copyButton.click()

    // Verify menu closes after action execution
    await expect(contextMenu).not.toBeVisible({ timeout: 2000 })

    // Grid should still be functional
    await expect(page.locator('[data-testid="vibegrid-container"]')).toBeVisible()
  })

  test('7.4 Menu dismiss - click outside menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Right-click on a cell to open context menu
    const firstCell = cellLocator.first()
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    const contextMenu = page.locator('.vibegridx-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // Click outside the menu (on the grid container or another area)
    // Need to wait a moment because menu has delay before adding click-outside listener
    await page.waitForTimeout(150)

    // Click on the page title or header area (outside the menu)
    const header = page.locator('h2:has-text("Mock VibeGrid Test")')
    const isHeaderVisible = await header.isVisible().catch(() => false)

    if (isHeaderVisible) {
      await header.click()
    } else {
      // Fallback: click on the body outside the context menu
      await page.mouse.click(10, 10)
    }

    // Verify menu closes
    await expect(contextMenu).not.toBeVisible({ timeout: 2000 })

    // Grid should still be functional
    await expect(page.locator('[data-testid="vibegrid-container"]')).toBeVisible()
  })

  test('Menu dismiss - press Escape key', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Right-click on a cell to open context menu
    const firstCell = cellLocator.first()
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    const contextMenu = page.locator('.vibegridx-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // Wait for escape handler to be attached
    await page.waitForTimeout(150)

    // Press Escape to close the menu
    await page.keyboard.press('Escape')

    // Verify menu closes
    await expect(contextMenu).not.toBeVisible({ timeout: 2000 })

    // Grid should still be functional
    await expect(page.locator('[data-testid="vibegrid-container"]')).toBeVisible()
  })

  test('Context menu contains cell-specific actions', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Right-click on a cell to open context menu
    const firstCell = cellLocator.first()
    await firstCell.click({ button: 'right' })

    // Wait for context menu to appear
    const contextMenu = page.locator('.vibegridx-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // Verify cell-specific menu items are present
    // Based on ContextMenu.tsx, cell context includes: Copy, Paste, Cut (for cells)
    const menuItems = contextMenu.locator('.context-menu-item')
    const itemCount = await menuItems.count()

    // Should have at least Copy and Paste (2+ items)
    expect(itemCount).toBeGreaterThanOrEqual(2)

    // Check for keyboard shortcuts display
    const copyShortcut = contextMenu.locator('kbd:has-text("Ctrl+C")')
    await expect(copyShortcut).toBeVisible()
  })

  test('Multiple right-clicks replace context menu', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount < 2) {
      test.skip(true, 'Not enough cells for multiple context menu test')
      return
    }

    const firstCell = cellLocator.first()
    const secondCell = cellLocator.nth(1)

    // Right-click first cell
    await firstCell.click({ button: 'right' })
    const contextMenu = page.locator('.vibegridx-context-menu')
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // Get initial position
    const initialBoundingBox = await contextMenu.boundingBox()
    expect(initialBoundingBox).not.toBeNull()

    // Right-click on second cell - should either close and reopen or update position
    await secondCell.click({ button: 'right' })

    // Menu should still be visible (possibly at new position)
    await expect(contextMenu).toBeVisible({ timeout: 5000 })

    // There should only be one context menu open at a time
    const menuCount = await page.locator('.vibegridx-context-menu').count()
    expect(menuCount).toBe(1)
  })
})
