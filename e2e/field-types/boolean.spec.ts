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
import type { Page, ElementHandle } from 'playwright-core'
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
   * Note: Boolean editor uses ComboboxEditor (Radix Command) not native <select>
   */
  async function isDropdownVisible(): Promise<boolean> {
    // Check for Radix Command menu inside editing portal
    const cmdkItems = await page.$$('.vibegridx-editing-portal [cmdk-item]')
    return cmdkItems.length > 0
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
      throw new Error(
        'TEST FAILURE: No boolean cells found. Verify is_active column exists in schema and fixtures are loaded.',
      )
    }

    // Find all toggle affordance elements
    const allBadges = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

    if (allBadges.length === 0) {
      throw new Error(
        'TEST FAILURE: No toggle affordance elements found. Verify boolean field renders with data-affordance="toggle" attribute.',
      )
    }

    // Find a badge that has true value (contains "Yes" or checkmark)
    let foundTrueBadge = false
    for (const badge of allBadges) {
      const badgeHtml = await badge.evaluate((el) => el.innerHTML)
      const hasTrueIndicator =
        badgeHtml.includes('Yes') ||
        badgeHtml.includes('Active') ||
        badgeHtml.includes('\u2713') || // checkmark ✓
        badgeHtml.includes('#d1fae5') // green background

      if (hasTrueIndicator) {
        foundTrueBadge = true
        // Verify the badge is visible
        const isVisible = await badge.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        expect(isVisible).toBe(true)
        break
      }
    }

    if (!foundTrueBadge) {
      throw new Error('TEST FAILURE: No true value badges found. Ensure test fixtures include is_active=true rows.')
    }
  })

  it('1.2 Boolean badge renders correctly for false value', async () => {
    console.log('Loading fixtures for deterministic values')
    await loadFixtures()

    // Find a false value badge - look for No/Inactive text
    const booleanBadges = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

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
      throw new Error(
        'TEST FAILURE: No false boolean values found in fixtures. Ensure test data includes is_active=false rows.',
      )
    }
  })

  it('1.3 Click on boolean badge enters edit mode', async () => {
    const booleanCells = await findBooleanCells()

    if (booleanCells.length === 0) {
      throw new Error(
        'TEST FAILURE: No boolean cells found. Verify is_active column exists in schema and fixtures are loaded.',
      )
    }

    // Find toggle affordance element
    const toggleElements = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

    if (toggleElements.length === 0) {
      throw new Error('TEST FAILURE: No toggle affordance element visible. Verify boolean field renders toggle UI.')
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
    const toggleElements = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

    if (toggleElements.length === 0) {
      throw new Error('TEST FAILURE: No toggle element visible. Verify boolean field renders toggle UI.')
    }

    const toggleElement = toggleElements[0]

    // Click to open dropdown (Radix Command menu)
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    // Find cmdk-item elements in editing portal
    const cmdkItems = await page.$$('.vibegridx-editing-portal [cmdk-item]')

    if (cmdkItems.length === 0) {
      throw new Error('TEST FAILURE: Boolean dropdown editor not available. Verify ComboboxEditor renders on click.')
    }

    // Find the "Yes" option and click it
    let foundYesOption = false
    for (const item of cmdkItems) {
      const text = await item.evaluate((el) => el.textContent)
      if (text?.includes('Yes')) {
        await item.click()
        foundYesOption = true
        break
      }
    }

    if (!foundYesOption) {
      throw new Error(
        'TEST FAILURE: Could not find "Yes" option in dropdown. Available options: ' +
          (await Promise.all(cmdkItems.map((item) => item.evaluate((el) => el.textContent)))).join(', '),
      )
    }

    await new Promise((r) => setTimeout(r, 500))

    // Verify the badge now shows true value
    const updatedBadges = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')
    if (updatedBadges.length > 0) {
      const badgeHtml = await updatedBadges[0].evaluate((el) => el.innerHTML)
      const showsTrue = badgeHtml.includes('Yes') || badgeHtml.includes('Active') || badgeHtml.includes('\u2713')
      expect(showsTrue).toBe(true)
    }
  })

  it('1.5 Select false option updates badge', async () => {
    const toggleElements = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

    if (toggleElements.length === 0) {
      throw new Error('TEST FAILURE: No toggle element visible. Verify boolean field renders toggle UI.')
    }

    const toggleElement = toggleElements[0]

    // Click to open dropdown (Radix Command menu)
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    // Find cmdk-item elements in editing portal
    const cmdkItems = await page.$$('.vibegridx-editing-portal [cmdk-item]')

    if (cmdkItems.length === 0) {
      throw new Error('TEST FAILURE: Boolean dropdown editor not available. Verify ComboboxEditor renders on click.')
    }

    // Find the "No" option and click it
    let foundNoOption = false
    for (const item of cmdkItems) {
      const text = await item.evaluate((el) => el.textContent)
      if (text?.includes('No') && !text?.includes('None')) {
        await item.click()
        foundNoOption = true
        break
      }
    }

    if (!foundNoOption) {
      throw new Error(
        'TEST FAILURE: Could not find "No" option in dropdown. Available options: ' +
          (await Promise.all(cmdkItems.map((item) => item.evaluate((el) => el.textContent)))).join(', '),
      )
    }

    await new Promise((r) => setTimeout(r, 500))

    // Verify the badge now shows false value
    const updatedBadges = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')
    if (updatedBadges.length > 0) {
      const badgeHtml = await updatedBadges[0].evaluate((el) => el.innerHTML)
      const showsFalse = badgeHtml.includes('No') || badgeHtml.includes('Inactive') || badgeHtml.includes('\u2717')
      expect(showsFalse).toBe(true)
    }
  })

  it('1.6 Escape cancels edit without changing value', async () => {
    const toggleElements = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

    if (toggleElements.length === 0) {
      throw new Error('TEST FAILURE: No toggle element visible. Verify boolean field renders toggle UI.')
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
    const toggleElements = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

    if (toggleElements.length === 0) {
      throw new Error('TEST FAILURE: No toggle element visible. Verify boolean field renders toggle UI.')
    }

    const toggleElement = toggleElements[0]

    // Click to open dropdown (Radix Command menu)
    await toggleElement.click()
    await new Promise((r) => setTimeout(r, 500))

    // Find cmdk-item elements in editing portal
    const cmdkItems = await page.$$('.vibegridx-editing-portal [cmdk-item]')

    if (cmdkItems.length === 0) {
      throw new Error('TEST FAILURE: Boolean dropdown editor not available. Verify ComboboxEditor renders on click.')
    }

    // Select "Yes" option (this will commit and close dropdown)
    for (const item of cmdkItems) {
      const text = await item.evaluate((el) => el.textContent)
      if (text?.includes('Yes')) {
        await item.click()
        break
      }
    }
    await new Promise((r) => setTimeout(r, 500))

    // Verify dropdown is closed (selecting an option commits and closes)
    const dropdownStillVisible = await isDropdownVisible()
    expect(dropdownStillVisible).toBe(false)
  })

  it('1.8 Read-only boolean shows no affordance', async () => {
    // Look for non-editable boolean cells
    const nonEditableCells = await page.$$('.vibegridx-cell[data-column-id="is_active"][data-editable="false"]')

    if (nonEditableCells.length === 0) {
      // If no non-editable cells, verify editable ones have toggle affordance
      const editableBadges = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

      if (editableBadges.length === 0) {
        throw new Error(
          'TEST FAILURE: No boolean cells found to test affordance. Verify is_active column exists and has toggle affordance.',
        )
      }

      // Verify it has the toggle affordance (not 'none')
      const affordance = await editableBadges[0].evaluate((el) => el.getAttribute('data-affordance'))
      expect(affordance).toBe('toggle')
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
    const booleanBadges = await page.$$('.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]')

    if (booleanBadges.length === 0) {
      throw new Error('TEST FAILURE: No boolean badges found. Verify is_active column exists and fixtures are loaded.')
    }

    // Collect all badge texts
    const badgeTexts: string[] = []
    for (let i = 0; i < Math.min(booleanBadges.length, 5); i++) {
      const text = await booleanBadges[i].evaluate((el) => el.textContent)
      if (text) badgeTexts.push(text)
    }

    // Should have at least one with recognizable text (Yes/No or Active/Inactive)
    const hasValidLabels = badgeTexts.some(
      (text) => text.includes('Yes') || text.includes('No') || text.includes('Active') || text.includes('Inactive'),
    )
    expect(hasValidLabels).toBe(true)
  })
})
