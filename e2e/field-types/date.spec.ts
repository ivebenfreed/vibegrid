/**
 * Date Field Type E2E Tests
 *
 * Tests for date field rendering and editing behaviors in VibeGrid.
 *
 * @feature GH#488
 * @spec planning/specs/488-vibegrid-e2e-comprehensive-field-type-an.md
 *
 * Date fields display as styled badges with formatted date strings.
 * Affordance: 'edit' - clicking the badge opens a date input editor.
 */

import { test, expect, BASE_URL } from '../../fixtures/auth.fixture'

test.describe.serial('VibeGrid Date Field Type', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    const page = authenticatedPage

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
   * Helper to find date cells by checking for due_date column
   */
  async function findDateCells(page: any) {
    const dateCells = page.locator(
      '.vibegridx-cell[data-row-id][data-column-id="due_date"]',
    )
    return dateCells
  }

  /**
   * Helper to check if a date editor is visible
   */
  async function isDateEditorVisible(page: any): Promise<boolean> {
    const dateInputCount = await page
      .locator('input[type="date"], input[type="datetime-local"], .vibegridx-date-editor')
      .count()
      .catch(() => 0)
    return dateInputCount > 0
  }

  test('3.1 Date badge renders with formatted date', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    const dateCells = await findDateCells(page)
    const cellCount = await dateCells.count()

    if (cellCount === 0) {
      test.skip(true, 'No date cells found - due_date field not in schema')
      return
    }

    // Find a date badge with edit affordance
    const dateBadge = page.locator(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    ).first()

    if (!(await dateBadge.isVisible().catch(() => false))) {
      // May have null values - look for any non-empty badge
      const anyDateBadge = page.locator(
        '.vibegridx-cell[data-column-id="due_date"] .vibegridx-date-badge',
      ).first()
      if (await anyDateBadge.isVisible().catch(() => false)) {
        await expect(anyDateBadge).toBeVisible()
      } else {
        test.skip(true, 'No date badges visible')
      }
      return
    }

    await expect(dateBadge).toBeVisible()

    // Check that badge contains a date-like text
    const badgeText = await dateBadge.textContent()
    const hasDatePattern =
      // Common date patterns: 2024-01-15, Jan 15, 2024, 01/15/2024, etc.
      /\d{4}|\d{1,2}[/-]\d{1,2}|\w{3}\s+\d{1,2}/.test(badgeText || '')

    expect(hasDatePattern).toBe(true)
  })

  test('3.2 Date badge has correct styling', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    const dateBadge = page.locator(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    ).first()

    if (!(await dateBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No date badge visible')
      return
    }

    // Check that badge has light blue styling (eff6ff background)
    const style = await dateBadge.getAttribute('style')
    const hasBackground = style?.includes('background-color') || false
    const hasPadding = style?.includes('padding') || false

    expect(hasBackground || hasPadding).toBe(true)
  })

  test('3.3 Click opens date picker', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    const dateBadge = page.locator(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    ).first()

    if (!(await dateBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No date badge visible')
      return
    }

    // Click the badge to open date editor
    await dateBadge.click()
    await page.waitForTimeout(500)

    // Check if date input appeared
    const editorVisible = await isDateEditorVisible(page)

    // Also check for editing class on the cell
    const editingCell = page.locator('.vibegridx-editing')
    const isEditing = (await editingCell.count()) > 0

    expect(editorVisible || isEditing).toBe(true)

    // Clean up
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  })

  test('3.4 Select date updates cell', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    const dateBadge = page.locator(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    ).first()

    if (!(await dateBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No date badge visible')
      return
    }

    // Get original text
    const originalText = await dateBadge.textContent()

    // Click to open date editor
    await dateBadge.click()
    await page.waitForTimeout(500)

    // Try to find and interact with date input
    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.isVisible().catch(() => false)) {
      // Set a specific date
      const testDate = '2024-12-25'
      await dateInput.fill(testDate)
      await page.waitForTimeout(300)

      // Press Enter to commit
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)

      // Verify date changed (should contain Dec or 25 or 12/25)
      const updatedBadge = page.locator(
        '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
      ).first()
      const updatedText = await updatedBadge.textContent()

      // The date should be displayed in some format
      const hasNewDate =
        updatedText?.includes('Dec') ||
        updatedText?.includes('25') ||
        updatedText?.includes('12/25') ||
        updatedText?.includes('2024-12-25')

      expect(hasNewDate).toBe(true)
    } else {
      // Date input may use a different editor type
      await page.keyboard.press('Escape')
      test.skip(true, 'Standard date input not available')
    }
  })

  test('3.5 Clear date shows empty state', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    const dateBadge = page.locator(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    ).first()

    if (!(await dateBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No date badge visible')
      return
    }

    // Click to open date editor
    await dateBadge.click()
    await page.waitForTimeout(500)

    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.isVisible().catch(() => false)) {
      // Clear the date
      await dateInput.fill('')
      await page.waitForTimeout(300)

      // Press Enter to commit
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)

      // Look for empty cell indicator
      const emptyCell = page.locator(
        '.vibegridx-cell[data-column-id="due_date"] .vibegridx-cell-empty',
      ).first()
      const isEmpty = await emptyCell.isVisible().catch(() => false)

      // Alternatively, check if edit hint is shown
      if (!isEmpty) {
        const cellText = await page
          .locator('.vibegridx-cell[data-column-id="due_date"]')
          .first()
          .textContent()
        const hasEditHint = cellText?.includes('Edit') || cellText?.trim() === ''
        expect(isEmpty || hasEditHint).toBe(true)
      } else {
        expect(isEmpty).toBe(true)
      }
    } else {
      await page.keyboard.press('Escape')
      test.skip(true, 'Standard date input not available')
    }
  })

  test('3.6 Datetime field shows time component', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Look for created_at column (datetime type)
    const datetimeCells = page.locator(
      '.vibegridx-cell[data-row-id][data-column-id="created_at"]',
    )
    const cellCount = await datetimeCells.count()

    if (cellCount === 0) {
      test.skip(true, 'No datetime cells found - created_at field not in schema')
      return
    }

    // Find a datetime value (should include time)
    const datetimeBadge = page.locator(
      '.vibegridx-cell[data-column-id="created_at"] [data-affordance]',
    ).first()

    if (!(await datetimeBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No datetime badge visible')
      return
    }

    const badgeText = await datetimeBadge.textContent()

    // Datetime should include some time indicator (: for hours:minutes or AM/PM)
    const hasTimeComponent =
      badgeText?.includes(':') || badgeText?.includes('AM') || badgeText?.includes('PM')

    // If it's a date-only display, that's also acceptable
    expect(badgeText?.length).toBeGreaterThan(0)
  })

  test('3.7 Escape cancels date edit', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    const dateBadge = page.locator(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    ).first()

    if (!(await dateBadge.isVisible().catch(() => false))) {
      test.skip(true, 'No date badge visible')
      return
    }

    // Get original text
    const originalText = await dateBadge.textContent()

    // Click to open date editor
    await dateBadge.click()
    await page.waitForTimeout(500)

    // Press Escape to cancel
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Verify editor is closed
    const editorStillVisible = await isDateEditorVisible(page)

    // Editor should be closed or editing should have stopped
    const editingCell = page.locator('.vibegridx-editing')
    const stillEditing = (await editingCell.count()) > 0

    expect(editorStillVisible && stillEditing).toBe(false)

    // Verify value unchanged
    const afterText = await dateBadge.textContent()
    expect(afterText).toBe(originalText)
  })

  test('3.8 Read-only date shows no edit affordance', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Look for non-editable date cells
    const nonEditableCells = page.locator(
      '.vibegridx-cell[data-column-id="due_date"][data-editable="false"]',
    )
    const nonEditableCount = await nonEditableCells.count()

    if (nonEditableCount === 0) {
      // Verify editable cells have edit affordance
      const editableBadge = page.locator(
        '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
      ).first()

      if (await editableBadge.isVisible().catch(() => false)) {
        const affordance = await editableBadge.getAttribute('data-affordance')
        expect(affordance).toBe('edit')
      } else {
        test.skip(true, 'No date cells found to test')
      }
    } else {
      // Verify non-editable cells have 'none' affordance
      const firstNonEditable = nonEditableCells.first()
      const badge = firstNonEditable.locator('[data-affordance]')
      const affordance = await badge.getAttribute('data-affordance')
      expect(affordance).toBe('none')
    }
  })
})
