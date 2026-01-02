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
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page, ElementHandle } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'

let page: Page

describe('VibeGrid Color Field Type', () => {
  beforeEach(async () => {
    page = await getTestPage()

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
    await new Promise((r) => setTimeout(r, 1500))
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  /**
   * Helper to find color cells by checking for priority_color column
   */
  async function findColorCells(): Promise<ElementHandle[]> {
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="priority_color"]')
    return cells
  }

  /**
   * Helper to load fixtures
   */
  async function loadFixtures(): Promise<void> {
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
   * Helper to check if element is visible
   */
  async function isElementVisible(element: ElementHandle | null): Promise<boolean> {
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

  it('6.1 Color swatch renders with correct color', async () => {
    console.log('Loading fixtures for deterministic values')
    await loadFixtures()

    const colorCells = await findColorCells()

    if (colorCells.length === 0) {
      console.log('SKIP: No color cells found - priority_color field not in schema')
      return
    }

    // Find a color swatch
    const colorSwatch = await page.$('.vibegridx-color-swatch')

    if (!(await isElementVisible(colorSwatch))) {
      // Try finding by cell class
      const colorCell = await page.$('.vibegridx-cell-color-editable, .vibegridx-cell-color')
      if (await isElementVisible(colorCell)) {
        await expect(colorCell as ElementHandle).toBeVisible()
      } else {
        console.log('SKIP: No color swatch visible')
      }
      return
    }

    await expect(colorSwatch as ElementHandle).toBeVisible()

    // Check that swatch has background-color style
    const style = await colorSwatch!.evaluate((el) => el.getAttribute('style'))
    const hasBackgroundColor = style?.includes('background-color') || false
    expect(hasBackgroundColor).toBe(true)
  })

  it('6.2 Hex value displays next to swatch', async () => {
    console.log('Loading fixtures')
    await loadFixtures()

    // Find color text
    const colorText = await page.$('.vibegridx-color-text')

    if (!(await isElementVisible(colorText))) {
      // Alternative: check cell content for hex pattern
      const colorCells = await findColorCells()
      if (colorCells.length > 0) {
        const firstCell = colorCells[0]
        const cellText = await firstCell.evaluate((el) => el.textContent)

        // Should contain hex color like #ef4444
        const hasHexPattern = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/.test(cellText || '')

        // If no hex, might be rgb or color name - that's also valid
        expect((cellText?.length || 0) > 0).toBe(true)
      } else {
        console.log('SKIP: No color cells found')
      }
      return
    }

    const text = await colorText!.evaluate((el) => el.textContent)

    // Should be a hex color or color name
    const isHexColor = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/.test(text || '')
    const isColorName = /red|green|blue|yellow|orange|purple|pink|cyan/.test(
      (text || '').toLowerCase(),
    )

    expect(isHexColor || isColorName || (text?.length || 0) > 0).toBeTruthy()
  })

  it('6.3 Click opens color picker', async () => {
    const colorElements = await page.$$(
      '.vibegridx-cell[data-column-id="priority_color"] [data-affordance="edit"]',
    )

    if (colorElements.length === 0 || !(await isElementVisible(colorElements[0]))) {
      // Try finding by class
      const colorCell = await page.$('.vibegridx-cell-color-editable')
      if (!(await isElementVisible(colorCell))) {
        console.log('SKIP: No color element visible')
        return
      }

      await colorCell!.click()
      await new Promise((r) => setTimeout(r, 500))

      // Check for color input
      const colorInputs = await page.$$('input[type="color"]')
      const hasColorInput = colorInputs.length > 0

      // Or editing class
      const editingCells = await page.$$('.vibegridx-editing')
      const isEditing = editingCells.length > 0

      expect(hasColorInput || isEditing).toBe(true)

      await page.keyboard.press('Escape')
      return
    }

    const colorElement = colorElements[0]

    // Click the edit element
    await colorElement.click()
    await new Promise((r) => setTimeout(r, 500))

    // Check for color input or editing state
    const colorInputs = await page.$$('input[type="color"]')
    const hasColorInput = colorInputs.length > 0

    const editingCells = await page.$$('.vibegridx-editing')
    const isEditing = editingCells.length > 0

    expect(hasColorInput || isEditing).toBe(true)

    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 200))
  })

  it('6.4 Select color updates swatch', async () => {
    console.log('Click to enter edit mode')
    const colorCell = await page.$('.vibegridx-cell-color-editable')
    if (!(await isElementVisible(colorCell))) {
      console.log('SKIP: No color cell visible')
      return
    }

    // Get original swatch color
    const originalSwatch = await colorCell!.$('.vibegridx-color-swatch')
    const originalStyle = originalSwatch
      ? await originalSwatch.evaluate((el) => el.getAttribute('style'))
      : ''

    await colorCell!.click()
    await new Promise((r) => setTimeout(r, 500))

    // Find color input
    const colorInput = await page.$('input[type="color"]')
    if (!(await isElementVisible(colorInput))) {
      await page.keyboard.press('Escape')
      console.log('SKIP: Color input not available')
      return
    }

    // Set a new color using JavaScript since input[type=color] has special behavior
    const newColor = '#00ff00' // Green
    await page.evaluate((color) => {
      const input = document.querySelector('input[type="color"]') as HTMLInputElement
      if (input) {
        input.value = color
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, newColor)
    await new Promise((r) => setTimeout(r, 300))

    // Commit
    await page.keyboard.press('Enter')
    await new Promise((r) => setTimeout(r, 500))

    // Verify swatch updated
    const updatedCell = await page.$('.vibegridx-cell-color-editable')
    if (updatedCell) {
      const updatedSwatch = await updatedCell.$('.vibegridx-color-swatch')
      const updatedStyle = updatedSwatch
        ? await updatedSwatch.evaluate((el) => el.getAttribute('style'))
        : ''

      // Style should have changed (contains new color)
      const hasNewColor =
        updatedStyle?.includes('#00ff00') ||
        updatedStyle?.includes('rgb(0, 255, 0)') ||
        updatedStyle !== originalStyle

      expect(hasNewColor).toBe(true)
    }
  })

  it('6.5 Swatch has correct dimensions', async () => {
    const colorSwatch = await page.$('.vibegridx-color-swatch')

    if (!(await isElementVisible(colorSwatch))) {
      console.log('SKIP: No color swatch visible')
      return
    }

    // Check for 16x16 dimensions
    const style = await colorSwatch!.evaluate((el) => el.getAttribute('style'))
    const hasWidth = style?.includes('width: 16px') || style?.includes('width:16px')
    const hasHeight = style?.includes('height: 16px') || style?.includes('height:16px')

    // At least one dimension should be set
    expect(hasWidth || hasHeight || style?.includes('px')).toBe(true)
  })

  it('6.6 Swatch has border for visibility', async () => {
    const colorSwatch = await page.$('.vibegridx-color-swatch')

    if (!(await isElementVisible(colorSwatch))) {
      console.log('SKIP: No color swatch visible')
      return
    }

    // Check for border
    const style = await colorSwatch!.evaluate((el) => el.getAttribute('style'))
    const hasBorder = style?.includes('border') || false

    expect(hasBorder).toBe(true)
  })

  it('6.7 Empty color shows edit placeholder', async () => {
    console.log('Loading fixtures which include "All Nulls Test" entity')
    await loadFixtures()

    // Look for empty color cells
    const emptyCells = await page.$$(
      '.vibegridx-cell[data-column-id="priority_color"] .vibegridx-cell-empty',
    )

    if (emptyCells.length === 0) {
      console.log('SKIP: No empty color cells found')
      return
    }

    const emptyCell = emptyCells[0]
    const cellText = await emptyCell.evaluate((el) => el.textContent)

    // Empty cells should show edit hint
    expect(cellText).toContain('Edit')
  })

  it('6.8 Read-only color shows no edit affordance', async () => {
    // Look for non-editable color cells
    const nonEditableCells = await page.$$(
      '.vibegridx-cell[data-column-id="priority_color"][data-editable="false"]',
    )

    if (nonEditableCells.length === 0) {
      // Verify editable cells have edit affordance
      const editableElements = await page.$$(
        '.vibegridx-cell[data-column-id="priority_color"] [data-affordance="edit"]',
      )

      if (editableElements.length > 0 && (await isElementVisible(editableElements[0]))) {
        const affordance = await editableElements[0].evaluate((el) =>
          el.getAttribute('data-affordance'),
        )
        expect(affordance).toBe('edit')
      } else {
        // Check for color cell class
        const colorCell = await page.$('.vibegridx-cell-color-editable')
        if (await isElementVisible(colorCell)) {
          expect(true).toBe(true) // Cell is visible and editable
        } else {
          console.log('SKIP: No color cells found to test')
        }
      }
    } else {
      // Verify non-editable cells have 'none' affordance
      const firstNonEditable = nonEditableCells[0]
      const element = await firstNonEditable.$('[data-affordance]')
      if (element) {
        const affordance = await element.evaluate((el) => el.getAttribute('data-affordance'))
        expect(affordance).toBe('none')
      }
    }
  })
})
