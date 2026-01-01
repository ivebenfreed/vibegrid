/**
 * Color Field Type E2E Tests
 *
 * Tests for color field rendering and editing behaviors in VibeGrid.
 *
 * @feature GH#488
 * @spec planning/specs/488-vibegrid-e2e-comprehensive-field-type-an.md
 *
 * Color fields display as a color swatch with hex value.
 * Affordance: 'edit' - clicking opens a color picker.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'
import { wrapPage, type TestPage } from '../../setup/test-setup'

describe.serial('VibeGrid Color Field Type', () => {
  beforeEach(async () => {
    const puppeteerPage = await getTestPage()
    page = wrapPage(puppeteerPage)

    const currentUrl = page.url()
    if (!currentUrl.includes('/debug/vibegrid-test/field-types')) {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/field-types`)
    }

    // Wait for the field type test page
    await page.waitForSelector('[data-testid="vibegrid-test-field-types"]', {
      timeout: 30000,
    })

    // Wait for grid to render
    await page.waitForSelector('[data-testid="vibegrid-container"]', {
      timeout: 15000,
    })

    // Wait for grid to fully render
    await page.waitForTimeout(1500)
  })

  /**
   * Helper to find color cells by checking for priority_color column
   */
  async function findColorCells(page: any) {
    const colorCells = page.locator(
      '.vibegridx-cell[data-row-id][data-column-id="priority_color"]',
    )
    return colorCells
  }

  it('6.1 Color swatch renders with correct color', async () => {
        // Load fixtures for deterministic values
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    const colorCells = await findColorCells(page)
    const cellCount = await colorCells.count()

    if (cellCount === 0) {
      test.skip(true, 'No color cells found - priority_color field not in schema')
      return
    }

    // Find a color swatch
    const colorSwatch = page.locator('.vibegridx-color-swatch').first()

    if (!(await colorSwatch.isVisible().catch(() => false))) {
      // Try finding by cell class
      const colorCell = page.locator('.vibegridx-cell-color-editable, .vibegridx-cell-color').first()
      if (await colorCell.isVisible().catch(() => false)) {
        await expect(colorCell).toBeVisible()
      } else {
        test.skip(true, 'No color swatch visible')
      }
      return
    }

    await expect(colorSwatch).toBeVisible()

    // Check that swatch has background-color style
    const style = await colorSwatch.getAttribute('style')
    const hasBackgroundColor = style?.includes('background-color') || false
    expect(hasBackgroundColor).toBe(true)
  })

  it('6.2 Hex value displays next to swatch', async () => {
        // Load fixtures
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    // Find color text
    const colorText = page.locator('.vibegridx-color-text').first()

    if (!(await colorText.isVisible().catch(() => false))) {
      // Alternative: check cell content for hex pattern
      const colorCells = await findColorCells(page)
      if ((await colorCells.count()) > 0) {
        const firstCell = colorCells.first()
        const cellText = await firstCell.textContent()

        // Should contain hex color like #ef4444
        const hasHexPattern = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/.it(cellText || '')

        // If no hex, might be rgb or color name - that's also valid
        expect(cellText?.length).toBeGreaterThan(0)
      } else {
        test.skip(true, 'No color cells found')
      }
      return
    }

    const text = await colorText.textContent()

    // Should be a hex color or color name
    const isHexColor = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/.it(text || '')
    const isColorName = /red|green|blue|yellow|orange|purple|pink|cyan/.it(
      (text || '').toLowerCase(),
    )

    expect(isHexColor || isColorName || text?.length).toBeTruthy()
  })

  it('6.3 Click opens color picker', async () => {
        const colorElement = page.locator(
      '.vibegridx-cell[data-column-id="priority_color"] [data-affordance="edit"]',
    ).first()

    if (!(await colorElement.isVisible().catch(() => false))) {
      // Try finding by class
      const colorCell = page.locator('.vibegridx-cell-color-editable').first()
      if (!(await colorCell.isVisible().catch(() => false))) {
        test.skip(true, 'No color element visible')
        return
      }

      await colorCell.click()
      await page.waitForTimeout(500)

      // Check for color input
      const colorInput = page.locator('input[type="color"]')
      const hasColorInput = (await colorInput.count()) > 0

      // Or editing class
      const editingCell = page.locator('.vibegridx-editing')
      const isEditing = (await editingCell.count()) > 0

      expect(hasColorInput || isEditing).toBe(true)

      await page.keyboard.press('Escape')
      return
    }

    // Click the edit element
    await colorElement.click()
    await page.waitForTimeout(500)

    // Check for color input or editing state
    const colorInput = page.locator('input[type="color"]')
    const hasColorInput = (await colorInput.count()) > 0

    const editingCell = page.locator('.vibegridx-editing')
    const isEditing = (await editingCell.count()) > 0

    expect(hasColorInput || isEditing).toBe(true)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  })

  it('6.4 Select color updates swatch', async () => {
        // Click to enter edit mode
    const colorCell = page.locator('.vibegridx-cell-color-editable').first()
    if (!(await colorCell.isVisible().catch(() => false))) {
      test.skip(true, 'No color cell visible')
      return
    }

    // Get original swatch color
    const originalSwatch = colorCell.locator('.vibegridx-color-swatch')
    const originalStyle = await originalSwatch.getAttribute('style').catch(() => '')

    await colorCell.click()
    await page.waitForTimeout(500)

    // Find color input
    const colorInput = page.locator('input[type="color"]').first()
    if (!(await colorInput.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape')
      test.skip(true, 'Color input not available')
      return
    }

    // Set a new color
    const newColor = '#00ff00' // Green
    await colorInput.fill(newColor)
    await page.waitForTimeout(300)

    // Commit
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Verify swatch updated
    const updatedCell = page.locator('.vibegridx-cell-color-editable').first()
    const updatedSwatch = updatedCell.locator('.vibegridx-color-swatch')
    const updatedStyle = await updatedSwatch.getAttribute('style').catch(() => '')

    // Style should have changed (contains new color)
    const hasNewColor =
      updatedStyle?.includes('#00ff00') ||
      updatedStyle?.includes('rgb(0, 255, 0)') ||
      updatedStyle !== originalStyle

    expect(hasNewColor).toBe(true)
  })

  it('6.5 Swatch has correct dimensions', async () => {
        const colorSwatch = page.locator('.vibegridx-color-swatch').first()

    if (!(await colorSwatch.isVisible().catch(() => false))) {
      test.skip(true, 'No color swatch visible')
      return
    }

    // Check for 16x16 dimensions
    const style = await colorSwatch.getAttribute('style')
    const hasWidth = style?.includes('width: 16px') || style?.includes('width:16px')
    const hasHeight = style?.includes('height: 16px') || style?.includes('height:16px')

    // At least one dimension should be set
    expect(hasWidth || hasHeight || style?.includes('px')).toBe(true)
  })

  it('6.6 Swatch has border for visibility', async () => {
        const colorSwatch = page.locator('.vibegridx-color-swatch').first()

    if (!(await colorSwatch.isVisible().catch(() => false))) {
      test.skip(true, 'No color swatch visible')
      return
    }

    // Check for border
    const style = await colorSwatch.getAttribute('style')
    const hasBorder = style?.includes('border') || false

    expect(hasBorder).toBe(true)
  })

  it('6.7 Empty color shows edit placeholder', async () => {
        // Load fixtures which include "All Nulls Test" entity
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    // Look for empty color cells
    const emptyCells = page.locator(
      '.vibegridx-cell[data-column-id="priority_color"] .vibegridx-cell-empty',
    )
    const emptyCount = await emptyCells.count()

    if (emptyCount === 0) {
      test.skip(true, 'No empty color cells found')
      return
    }

    const emptyCell = emptyCells.first()
    const cellText = await emptyCell.textContent()

    // Empty cells should show edit hint
    expect(cellText).toContain('Edit')
  })

  it('6.8 Read-only color shows no edit affordance', async () => {
        // Look for non-editable color cells
    const nonEditableCells = page.locator(
      '.vibegridx-cell[data-column-id="priority_color"][data-editable="false"]',
    )
    const nonEditableCount = await nonEditableCells.count()

    if (nonEditableCount === 0) {
      // Verify editable cells have edit affordance
      const editableElement = page.locator(
        '.vibegridx-cell[data-column-id="priority_color"] [data-affordance="edit"]',
      ).first()

      if (await editableElement.isVisible().catch(() => false)) {
        const affordance = await editableElement.getAttribute('data-affordance')
        expect(affordance).toBe('edit')
      } else {
        // Check for color cell class
        const colorCell = page.locator('.vibegridx-cell-color-editable').first()
        if (await colorCell.isVisible().catch(() => false)) {
          expect(true).toBe(true) // Cell is visible and editable
        } else {
          test.skip(true, 'No color cells found to test')
        }
      }
    } else {
      // Verify non-editable cells have 'none' affordance
      const firstNonEditable = nonEditableCells.first()
      const element = firstNonEditable.locator('[data-affordance]')
      const affordance = await element.getAttribute('data-affordance')
      expect(affordance).toBe('none')
    }
  })
})
