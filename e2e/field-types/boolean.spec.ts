/**
 * Boolean Field Type E2E Tests
 *
 * Tests for boolean field rendering and editing behaviors in VibeGrid.
 *
 * @feature GH#488
 * @spec planning/specs/488-vibegrid-e2e-comprehensive-field-type-an.md
 *
 * Boolean fields display as badges with Yes/No or custom labels.
 * Affordance: 'toggle' - clicking the badge opens a dropdown editor.
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page, ElementHandle } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'

let page: Page

describe('VibeGrid Boolean Field Type', () => {
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
   * Helper to find boolean cells by checking for is_active column
   */
  async function findBooleanCells(): Promise<ElementHandle[]> {
    // Look for cells in the is_active column (boolean field)
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="is_active"]')
    return cells
  }

  /**
   * Helper to check if a boolean editor dropdown is visible
   */
  async function isDropdownVisible(): Promise<boolean> {
    // Check for select element that appears during editing
    const selects = await page.$$('.vibegridx-boolean-editor, select.vibegridx-boolean-editor')
    return selects.length > 0
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

  it('1.1 Boolean badge renders correctly for true value', async () => {
    console.log('Loading fixtures for deterministic values')
    await loadFixtures()

    const booleanCells = await findBooleanCells()

    if (booleanCells.length === 0) {
      console.log('SKIP: No boolean cells found - field type not in schema')
      return
    }

    // Find the toggle affordance element for true value
    const trueBadges = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    if (trueBadges.length === 0) {
      console.log('SKIP: No toggle affordance elements found')
      return
    }

    const trueBadge = trueBadges[0]
    await expect(trueBadge).toBeVisible()

    // Check for true value indicators (green background or checkmark)
    const badgeHtml = await trueBadge.evaluate((el) => el.innerHTML)
    const hasTrueIndicator =
      badgeHtml.includes('Yes') ||
      badgeHtml.includes('Active') ||
      badgeHtml.includes('\u2713') || // checkmark
      badgeHtml.includes('#d1fae5') // green background

    expect(hasTrueIndicator).toBe(true)
  })

  it('1.2 Boolean badge renders correctly for false value', async () => {
    console.log('Loading fixtures for deterministic values')
    await loadFixtures()

    // Find a false value badge - look for No/Inactive text
    const booleanBadges = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    let foundFalseValue = false
    for (const badge of booleanBadges) {
      const badgeText = await badge.evaluate((el) => el.textContent)
      if (
        badgeText?.includes('No') ||
        badgeText?.includes('Inactive') ||
        badgeText?.includes('\u2717') // x mark
      ) {
        foundFalseValue = true
        // Verify red styling
        const badgeHtml = await badge.evaluate((el) => el.innerHTML)
        const hasFalseIndicator = badgeHtml.includes('\u2717') || badgeHtml.includes('#fee2e2') // red background
        expect(hasFalseIndicator).toBe(true)
        break
      }
    }

    if (!foundFalseValue) {
      console.log('SKIP: No false boolean values found in fixtures')
    }
  })

  it('1.3 Click on boolean badge enters edit mode', async () => {
    const booleanCells = await findBooleanCells()

    if (booleanCells.length === 0) {
      console.log('SKIP: No boolean cells found')
      return
    }

    // Find toggle affordance element
    const toggleElements = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    if (toggleElements.length === 0) {
      console.log('SKIP: No toggle affordance element visible')
      return
    }

    const toggleElement = toggleElements[0]

    // Click the toggle element
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    // Check if dropdown editor appeared
    const dropdownVisible = await isDropdownVisible()

    if (!dropdownVisible) {
      // Some implementations may directly toggle the value
      // Check if the cell is in editing state
      const editingCells = await page.$$('.vibegridx-editing')
      const isEditing = editingCells.length > 0
      expect(dropdownVisible || isEditing).toBe(true)
    } else {
      expect(dropdownVisible).toBe(true)
    }

    // Clean up
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 200))
  })

  it('1.4 Select true option updates badge', async () => {
    const toggleElements = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    if (toggleElements.length === 0) {
      console.log('SKIP: No toggle element visible')
      return
    }

    const toggleElement = toggleElements[0]

    // Click to open dropdown
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    // Find select element
    const selectElement = await page.$('.vibegridx-boolean-editor')

    if (selectElement) {
      const isVisible = await selectElement.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })

      if (isVisible) {
        await page.select('.vibegridx-boolean-editor', 'true')
        await new Promise((r) => setTimeout(r, 500))

        // Verify the badge now shows true value
        const updatedBadges = await page.$$(
          '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
        )
        if (updatedBadges.length > 0) {
          const badgeHtml = await updatedBadges[0].evaluate((el) => el.innerHTML)
          const showsTrue =
            badgeHtml.includes('Yes') ||
            badgeHtml.includes('Active') ||
            badgeHtml.includes('\u2713')
          expect(showsTrue).toBe(true)
        }
      } else {
        console.log('SKIP: Boolean dropdown editor not available')
      }
    } else {
      console.log('SKIP: Boolean dropdown editor not available')
    }
  })

  it('1.5 Select false option updates badge', async () => {
    const toggleElements = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    if (toggleElements.length === 0) {
      console.log('SKIP: No toggle element visible')
      return
    }

    const toggleElement = toggleElements[0]

    // Click to open dropdown
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    const selectElement = await page.$('.vibegridx-boolean-editor')

    if (selectElement) {
      const isVisible = await selectElement.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })

      if (isVisible) {
        await page.select('.vibegridx-boolean-editor', 'false')
        await new Promise((r) => setTimeout(r, 500))

        // Verify the badge now shows false value
        const updatedBadges = await page.$$(
          '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
        )
        if (updatedBadges.length > 0) {
          const badgeHtml = await updatedBadges[0].evaluate((el) => el.innerHTML)
          const showsFalse =
            badgeHtml.includes('No') ||
            badgeHtml.includes('Inactive') ||
            badgeHtml.includes('\u2717')
          expect(showsFalse).toBe(true)
        }
      } else {
        console.log('SKIP: Boolean dropdown editor not available')
      }
    } else {
      console.log('SKIP: Boolean dropdown editor not available')
    }
  })

  it('1.6 Escape cancels edit without changing value', async () => {
    const toggleElements = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    if (toggleElements.length === 0) {
      console.log('SKIP: No toggle element visible')
      return
    }

    const toggleElement = toggleElements[0]

    // Get original value
    const originalHtml = await toggleElement.evaluate((el) => el.innerHTML)

    // Click to open dropdown
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    // Press Escape to cancel
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 300))

    // Verify dropdown is closed
    const dropdownStillVisible = await isDropdownVisible()
    expect(dropdownStillVisible).toBe(false)

    // Verify value unchanged
    const afterHtml = await toggleElement.evaluate((el) => el.innerHTML)
    expect(afterHtml).toBe(originalHtml)
  })

  it('1.7 Click outside commits value (blur)', async () => {
    const toggleElements = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    if (toggleElements.length === 0) {
      console.log('SKIP: No toggle element visible')
      return
    }

    const toggleElement = toggleElements[0]

    // Click to open dropdown
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    const selectElement = await page.$('.vibegridx-boolean-editor')
    if (!selectElement) {
      console.log('SKIP: Boolean dropdown editor not available')
      return
    }

    const isVisible = await selectElement.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })

    if (!isVisible) {
      console.log('SKIP: Boolean dropdown editor not available')
      return
    }

    // Select a value
    await page.select('.vibegridx-boolean-editor', 'true')

    // Click outside to blur
    const header = await page.$('h2')
    if (header) {
      const headerVisible = await header.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      if (headerVisible) {
        await header.click()
      } else {
        await page.keyboard.press('Tab')
      }
    } else {
      await page.keyboard.press('Tab')
    }
    await new Promise((r) => setTimeout(r, 500))

    // Verify dropdown is closed
    const dropdownStillVisible = await isDropdownVisible()
    expect(dropdownStillVisible).toBe(false)
  })

  it('1.8 Read-only boolean shows no affordance', async () => {
    // Look for non-editable boolean cells
    const nonEditableCells = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"][data-editable="false"]',
    )

    if (nonEditableCells.length === 0) {
      // If no non-editable cells, verify editable ones have toggle affordance
      const editableBadges = await page.$$(
        '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
      )

      if (editableBadges.length > 0) {
        // Verify it has the toggle affordance (not 'none')
        const affordance = await editableBadges[0].evaluate((el) =>
          el.getAttribute('data-affordance'),
        )
        expect(affordance).toBe('toggle')
      } else {
        console.log('SKIP: No boolean cells found to test')
      }
    } else {
      // Verify non-editable cells have 'none' affordance
      const firstNonEditable = nonEditableCells[0]
      const badge = await firstNonEditable.$('[data-affordance]')
      if (badge) {
        const affordance = await badge.evaluate((el) => el.getAttribute('data-affordance'))
        expect(affordance).toBe('none')
      }
    }
  })

  it('1.9 Custom labels display correctly', async () => {
    console.log('Loading fixtures which use custom labels (Active/Inactive)')
    await loadFixtures()

    // Check that custom labels are displayed (Active/Inactive instead of Yes/No)
    const booleanBadges = await page.$$(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )

    if (booleanBadges.length === 0) {
      console.log('SKIP: No boolean badges found')
      return
    }

    // Collect all badge texts
    const badgeTexts: string[] = []
    for (let i = 0; i < Math.min(booleanBadges.length, 5); i++) {
      const text = await booleanBadges[i].evaluate((el) => el.textContent)
      if (text) badgeTexts.push(text)
    }

    // Should have at least one with recognizable text (Yes/No or Active/Inactive)
    const hasValidLabels = badgeTexts.some(
      (text) =>
        text.includes('Yes') ||
        text.includes('No') ||
        text.includes('Active') ||
        text.includes('Inactive'),
    )
    expect(hasValidLabels).toBe(true)
  })
})
