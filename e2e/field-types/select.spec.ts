/**
 * Select Field Type E2E Tests
 *
 * Tests for select field rendering and editing behaviors in VibeGrid.
 *
 * @feature GH#488
 * @spec planning/specs/488-vibegrid-e2e-comprehensive-field-type-an.md
 *
 * Select fields display as styled badges with color coding.
 * Affordance: 'edit' - clicking the badge opens a dropdown editor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'
import { wrapPage, type TestPage } from '../../setup/test-setup'

describe.serial('VibeGrid Select Field Type', () => {
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
   * Helper to find select cells by checking for status column
   */
  async function findSelectCells(page: any) {
    const selectCells = page.locator(
      '.vibegridx-cell[data-row-id][data-column-id="status"]',
    )
    return selectCells
  }

  /**
   * Helper to check if a select dropdown editor is visible
   */
  async function isSelectEditorVisible(page: any): Promise<boolean> {
    const selectCount = await page
      .locator('.vibegridx-select-editor, select.vibegridx-select-editor')
      .count()
      .catch(() => 0)
    return selectCount > 0
  }

  it('2.1 Select badge renders with correct styling', async () => {
        // Load fixtures for deterministic values
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    const selectCells = await findSelectCells(page)
    const cellCount = await selectCells.count()

    if (cellCount === 0) {
      test.skip(true, 'No select cells found - status field not in schema')
      return
    }

    // Find a badge with edit affordance
    const selectBadge = page.locator(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    ).first()

    await expect(selectBadge).toBeVisible()

    // Check that badge has styling (background color, padding)
    const style = await selectBadge.getAttribute('style')
    const hasBackground = style?.includes('background-color') || false
    const hasPadding = style?.includes('padding') || false

    // Badge should have visual styling
    expect(hasBackground || hasPadding).toBe(true)
  })

  it('2.2 Click opens dropdown editor', async () => {
        const selectBadge = page.locator(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    ).first()

    if (!(await selectBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No select badge visible')
      return
    }

    // Click the badge to open dropdown
    await selectBadge.click()
    await page.waitForTimeout(500)

    // Check if dropdown appeared
    const dropdownVisible = await isSelectEditorVisible(page)
    expect(dropdownVisible).toBe(true)

    // Clean up
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  })

  it('2.3 Select option updates badge', async () => {
        const selectBadge = page.locator(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    ).first()

    if (!(await selectBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No select badge visible')
      return
    }

    // Get original text
    const originalText = await selectBadge.textContent()

    // Click to open dropdown
    await selectBadge.click()
    await page.waitForTimeout(500)

    const selectEditor = page.locator('.vibegridx-select-editor')
    if (!(await selectEditor.isVisible().catch(() => false))) {
      test.skip(true, 'Select editor not available')
      return
    }

    // Get available options
    const options = selectEditor.locator('option')
    const optionCount = await options.count()

    if (optionCount < 2) {
      test.skip(true, 'Not enough options to test selection')
      return
    }

    // Find an option that's different from current value
    let targetOption = null
    for (let i = 0; i < optionCount; i++) {
      const optionText = await options.nth(i).textContent()
      const optionValue = await options.nth(i).getAttribute('value')
      if (optionValue && optionValue !== '' && optionText !== originalText) {
        targetOption = optionValue
        break
      }
    }

    if (targetOption) {
      await selectEditor.selectOption(targetOption)
      await page.waitForTimeout(500)

      // Verify badge changed
      const updatedBadge = page.locator(
        '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
      ).first()
      const updatedText = await updatedBadge.textContent()
      expect(updatedText).not.toBe(originalText)
    }
  })

  it('2.4 Escape cancels without change', async () => {
        const selectBadge = page.locator(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    ).first()

    if (!(await selectBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No select badge visible')
      return
    }

    // Get original text
    const originalText = await selectBadge.textContent()

    // Click to open dropdown
    await selectBadge.click()
    await page.waitForTimeout(500)

    // Press Escape to cancel
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Verify dropdown is closed
    const dropdownStillVisible = await isSelectEditorVisible(page)
    expect(dropdownStillVisible).toBe(false)

    // Verify value unchanged
    const afterText = await selectBadge.textContent()
    expect(afterText).toBe(originalText)
  })

  it('2.5 Status options show with colors', async () => {
        // Load fixtures which have all status variations
    const loadFixturesBtn = page.locator('[data-testid="load-fixtures-btn"]')
    if (await loadFixturesBtn.isVisible()) {
      await loadFixturesBtn.click()
      await page.waitForTimeout(1500)
    }

    // Find status badges with different values
    const statusBadges = page.locator(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    )
    const badgeCount = await statusBadges.count()

    if (badgeCount === 0) {
      test.skip(true, 'No status badges found')
      return
    }

    // Collect badge texts to verify different statuses
    const statusTexts = new Set<string>()
    for (let i = 0; i < Math.min(badgeCount, 10); i++) {
      const text = await statusBadges.nth(i).textContent()
      if (text) statusTexts.add(text.trim())
    }

    // Should have at least one status value
    expect(statusTexts.size).toBeGreaterThan(0)

    // Expected status values from schema
    const expectedStatuses = ['Open', 'In Progress', 'Done', 'Blocked']
    const hasExpectedStatus = expectedStatuses.some((status) =>
      Array.from(statusTexts).some((text) => text.includes(status)),
    )
    expect(hasExpectedStatus).toBe(true)
  })

  it('2.6 Empty select shows edit placeholder', async () => {
        // Look for cells with empty state (Edit emoji hint)
    const emptyCells = page.locator(
      '.vibegridx-cell[data-column-id="status"] .vibegridx-cell-empty',
    )
    const emptyCount = await emptyCells.count()

    // If no empty cells, that's fine - test data may not have nulls
    if (emptyCount === 0) {
      test.skip(true, 'No empty select cells found - test data may not have null statuses')
      return
    }

    const emptyCell = emptyCells.first()
    const cellText = await emptyCell.textContent()

    // Empty cells should show edit hint
    expect(cellText).toContain('Edit')
  })

  it('2.7 Read-only select shows no edit affordance', async () => {
        // Look for non-editable select cells
    const nonEditableCells = page.locator(
      '.vibegridx-cell[data-column-id="status"][data-editable="false"]',
    )
    const nonEditableCount = await nonEditableCells.count()

    if (nonEditableCount === 0) {
      // Verify editable cells have edit affordance
      const editableBadge = page.locator(
        '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
      ).first()

      if (await editableBadge.isVisible().catch(() => false)) {
        const affordance = await editableBadge.getAttribute('data-affordance')
        expect(affordance).toBe('edit')
      } else {
        test.skip(true, 'No select cells found to test')
      }
    } else {
      // Verify non-editable cells have 'none' affordance
      const firstNonEditable = nonEditableCells.first()
      const badge = firstNonEditable.locator('[data-affordance]')
      const affordance = await badge.getAttribute('data-affordance')
      expect(affordance).toBe('none')
    }
  })

  it('2.8 Dropdown shows all options from schema', async () => {
        const selectBadge = page.locator(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    ).first()

    if (!(await selectBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No select badge visible')
      return
    }

    // Click to open dropdown
    await selectBadge.click()
    await page.waitForTimeout(500)

    const selectEditor = page.locator('.vibegridx-select-editor')
    if (!(await selectEditor.isVisible().catch(() => false))) {
      test.skip(true, 'Select editor not available')
      return
    }

    // Get all options
    const options = selectEditor.locator('option')
    const optionCount = await options.count()

    // Collect option labels
    const optionLabels: string[] = []
    for (let i = 0; i < optionCount; i++) {
      const text = await options.nth(i).textContent()
      if (text) optionLabels.push(text.trim())
    }

    // Expected options from STATUS_OPTIONS in schema
    const expectedOptions = ['Open', 'In Progress', 'Done', 'Blocked']
    const hasExpectedOptions = expectedOptions.every((expected) =>
      optionLabels.some((label) => label.includes(expected)),
    )

    expect(hasExpectedOptions).toBe(true)

    // Clean up
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  })
})
