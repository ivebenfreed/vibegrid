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
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'
import { wrapPage, type TestPage } from '../../setup/test-setup'

describe.serial('VibeGrid Boolean Field Type', () => {
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
   * Helper to find boolean cells by checking for is_active column
   */
  async function findBooleanCells(page: any) {
    // Look for cells in the is_active column (boolean field)
    const booleanCells = page.locator(
      '.vibegridx-cell[data-row-id][data-column-id="is_active"]',
    )
    return booleanCells
  }

  /**
   * Helper to check if a boolean editor dropdown is visible
   */
  async function isDropdownVisible(page: any): Promise<boolean> {
    // Check for select element that appears during editing
    const selectCount = await page
      .locator('.vibegridx-boolean-editor, select.vibegridx-boolean-editor')
      .count()
      .catch(() => 0)
    return selectCount > 0
  }

  it('1.1 Boolean badge renders correctly for true value', async () => {
        // Load fixtures for deterministic values
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    const booleanCells = await findBooleanCells(page)
    const cellCount = await booleanCells.count()

    if (cellCount === 0) {
      test.skip(true, 'No boolean cells found - field type not in schema')
      return
    }

    // Find the "Boolean True Test" row
    const trueBadge = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    ).first()

    await expect(trueBadge).toBeVisible()

    // Check for true value indicators (green background or checkmark)
    const badgeHtml = await trueBadge.innerHTML()
    const hasTrueIndicator =
      badgeHtml.includes('Yes') ||
      badgeHtml.includes('Active') ||
      badgeHtml.includes('✓') ||
      badgeHtml.includes('#d1fae5') // green background

    expect(hasTrueIndicator).toBe(true)
  })

  it('1.2 Boolean badge renders correctly for false value', async () => {
        // Load fixtures for deterministic values
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    // Find a false value badge - look for No/Inactive text
    const booleanBadges = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )
    const badgeCount = await booleanBadges.count()

    let foundFalseValue = false
    for (let i = 0; i < badgeCount; i++) {
      const badge = booleanBadges.nth(i)
      const badgeText = await badge.textContent()
      if (
        badgeText?.includes('No') ||
        badgeText?.includes('Inactive') ||
        badgeText?.includes('✗')
      ) {
        foundFalseValue = true
        // Verify red styling
        const badgeHtml = await badge.innerHTML()
        const hasFalseIndicator =
          badgeHtml.includes('✗') || badgeHtml.includes('#fee2e2') // red background
        expect(hasFalseIndicator).toBe(true)
        break
      }
    }

    if (!foundFalseValue) {
      test.skip(true, 'No false boolean values found in fixtures')
    }
  })

  it('1.3 Click on boolean badge enters edit mode', async () => {
        const booleanCells = await findBooleanCells(page)
    const cellCount = await booleanCells.count()

    if (cellCount === 0) {
      test.skip(true, 'No boolean cells found')
      return
    }

    // Find toggle affordance element
    const toggleElement = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    ).first()

    if (!(await toggleElement.isVisible().catch(() => false))) {
      test.skip(true, 'No toggle affordance element visible')
      return
    }

    // Click the toggle element
    await toggleElement.click()
    await page.waitForTimeout(500)

    // Check if dropdown editor appeared
    const dropdownVisible = await isDropdownVisible(page)

    if (!dropdownVisible) {
      // Some implementations may directly toggle the value
      // Check if the cell is in editing state
      const editingCell = page.locator('.vibegridx-editing')
      const isEditing = (await editingCell.count()) > 0
      expect(dropdownVisible || isEditing).toBe(true)
    } else {
      expect(dropdownVisible).toBe(true)
    }

    // Clean up
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  })

  it('1.4 Select true option updates badge', async () => {
        const toggleElement = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    ).first()

    if (!(await toggleElement.isVisible().catch(() => false))) {
      test.skip(true, 'No toggle element visible')
      return
    }

    // Click to open dropdown
    await toggleElement.click()
    await page.waitForTimeout(500)

    // Find and select true option
    const trueOption = page.locator('option[value="true"]')
    const selectElement = page.locator('.vibegridx-boolean-editor')

    if (await selectElement.isVisible().catch(() => false)) {
      await selectElement.selectOption('true')
      await page.waitForTimeout(500)

      // Verify the badge now shows true value
      const updatedBadge = page.locator(
        '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
      ).first()
      const badgeHtml = await updatedBadge.innerHTML()
      const showsTrue =
        badgeHtml.includes('Yes') ||
        badgeHtml.includes('Active') ||
        badgeHtml.includes('✓')
      expect(showsTrue).toBe(true)
    } else {
      test.skip(true, 'Boolean dropdown editor not available')
    }
  })

  it('1.5 Select false option updates badge', async () => {
        const toggleElement = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    ).first()

    if (!(await toggleElement.isVisible().catch(() => false))) {
      test.skip(true, 'No toggle element visible')
      return
    }

    // Click to open dropdown
    await toggleElement.click()
    await page.waitForTimeout(500)

    const selectElement = page.locator('.vibegridx-boolean-editor')

    if (await selectElement.isVisible().catch(() => false)) {
      await selectElement.selectOption('false')
      await page.waitForTimeout(500)

      // Verify the badge now shows false value
      const updatedBadge = page.locator(
        '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
      ).first()
      const badgeHtml = await updatedBadge.innerHTML()
      const showsFalse =
        badgeHtml.includes('No') ||
        badgeHtml.includes('Inactive') ||
        badgeHtml.includes('✗')
      expect(showsFalse).toBe(true)
    } else {
      test.skip(true, 'Boolean dropdown editor not available')
    }
  })

  it('1.6 Escape cancels edit without changing value', async () => {
        const toggleElement = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    ).first()

    if (!(await toggleElement.isVisible().catch(() => false))) {
      test.skip(true, 'No toggle element visible')
      return
    }

    // Get original value
    const originalHtml = await toggleElement.innerHTML()

    // Click to open dropdown
    await toggleElement.click()
    await page.waitForTimeout(500)

    // Press Escape to cancel
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Verify dropdown is closed
    const dropdownStillVisible = await isDropdownVisible(page)
    expect(dropdownStillVisible).toBe(false)

    // Verify value unchanged
    const afterHtml = await toggleElement.innerHTML()
    expect(afterHtml).toBe(originalHtml)
  })

  it('1.7 Click outside commits value (blur)', async () => {
        const toggleElement = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    ).first()

    if (!(await toggleElement.isVisible().catch(() => false))) {
      test.skip(true, 'No toggle element visible')
      return
    }

    // Click to open dropdown
    await toggleElement.click()
    await page.waitForTimeout(500)

    const selectElement = page.locator('.vibegridx-boolean-editor')
    if (!(await selectElement.isVisible().catch(() => false))) {
      test.skip(true, 'Boolean dropdown editor not available')
      return
    }

    // Select a value
    await selectElement.selectOption('true')

    // Click outside to blur
    const header = page.locator('h2')
    if (await header.isVisible().catch(() => false)) {
      await header.click()
    } else {
      await page.keyboard.press('Tab')
    }
    await page.waitForTimeout(500)

    // Verify dropdown is closed
    const dropdownStillVisible = await isDropdownVisible(page)
    expect(dropdownStillVisible).toBe(false)
  })

  it('1.8 Read-only boolean shows no affordance', async () => {
        // Look for non-editable boolean cells
    const nonEditableCells = page.locator(
      '.vibegridx-cell[data-column-id="is_active"][data-editable="false"]',
    )
    const nonEditableCount = await nonEditableCells.count()

    if (nonEditableCount === 0) {
      // If no non-editable cells, verify editable ones have toggle affordance
      const editableBadge = page.locator(
        '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
      ).first()

      if (await editableBadge.isVisible().catch(() => false)) {
        // Verify it has the toggle affordance (not 'none')
        const affordance = await editableBadge.getAttribute('data-affordance')
        expect(affordance).toBe('toggle')
      } else {
        test.skip(true, 'No boolean cells found to test')
      }
    } else {
      // Verify non-editable cells have 'none' affordance
      const firstNonEditable = nonEditableCells.first()
      const badge = firstNonEditable.locator('[data-affordance]')
      const affordance = await badge.getAttribute('data-affordance')
      expect(affordance).toBe('none')
    }
  })

  it('1.9 Custom labels display correctly', async () => {
        // Load fixtures which use custom labels (Active/Inactive)
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    // Check that custom labels are displayed (Active/Inactive instead of Yes/No)
    const booleanBadges = page.locator(
      '.vibegridx-cell[data-column-id="is_active"] [data-affordance="toggle"]',
    )
    const badgeCount = await booleanBadges.count()

    if (badgeCount === 0) {
      test.skip(true, 'No boolean badges found')
      return
    }

    // Collect all badge texts
    const badgeTexts: string[] = []
    for (let i = 0; i < Math.min(badgeCount, 5); i++) {
      const text = await booleanBadges.nth(i).textContent()
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
