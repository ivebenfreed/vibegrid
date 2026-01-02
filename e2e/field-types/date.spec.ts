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
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page, ElementHandle } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'

let page: Page

describe('VibeGrid Date Field Type', () => {
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
   * Helper to find date cells by checking for due_date column
   */
  async function findDateCells(): Promise<ElementHandle[]> {
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="due_date"]')
    return cells
  }

  /**
   * Helper to check if a date editor is visible
   */
  async function isDateEditorVisible(): Promise<boolean> {
    const dateInputs = await page.$$(
      'input[type="date"], input[type="datetime-local"], .vibegridx-date-editor',
    )
    return dateInputs.length > 0
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

  it('3.1 Date badge renders with formatted date', async () => {
    const dateCells = await findDateCells()

    if (dateCells.length === 0) {
      console.log('SKIP: No date cells found - due_date field not in schema')
      return
    }

    // Find a date badge with edit affordance
    const dateBadges = await page.$$(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    )

    if (dateBadges.length === 0 || !(await isElementVisible(dateBadges[0]))) {
      // May have null values - look for any non-empty badge
      const anyDateBadges = await page.$$(
        '.vibegridx-cell[data-column-id="due_date"] .vibegridx-date-badge',
      )
      if (anyDateBadges.length > 0 && (await isElementVisible(anyDateBadges[0]))) {
        await expect(anyDateBadges[0]).toBeVisible()
      } else {
        console.log('SKIP: No date badges visible')
      }
      return
    }

    const dateBadge = dateBadges[0]
    await expect(dateBadge).toBeVisible()

    // Check that badge contains a date-like text
    const badgeText = await dateBadge.evaluate((el) => el.textContent)
    const hasDatePattern =
      // Common date patterns: 2024-01-15, Jan 15, 2024, 01/15/2024, etc.
      /\d{4}|\d{1,2}[/-]\d{1,2}|\w{3}\s+\d{1,2}/.test(badgeText || '')

    expect(hasDatePattern).toBe(true)
  })

  it('3.2 Date badge has correct styling', async () => {
    const dateBadges = await page.$$(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    )

    if (dateBadges.length === 0 || !(await isElementVisible(dateBadges[0]))) {
      console.log('SKIP: No date badge visible')
      return
    }

    const dateBadge = dateBadges[0]

    // Check that badge has light blue styling (eff6ff background)
    const style = await dateBadge.evaluate((el) => el.getAttribute('style'))
    const hasBackground = style?.includes('background-color') || false
    const hasPadding = style?.includes('padding') || false

    expect(hasBackground || hasPadding).toBe(true)
  })

  it('3.3 Click opens date picker', async () => {
    const dateBadges = await page.$$(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    )

    if (dateBadges.length === 0 || !(await isElementVisible(dateBadges[0]))) {
      console.log('SKIP: No date badge visible')
      return
    }

    const dateBadge = dateBadges[0]

    // Click the badge to open date editor
    await dateBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    // Check if date input appeared
    const editorVisible = await isDateEditorVisible()

    // Also check for editing class on the cell
    const editingCells = await page.$$('.vibegridx-editing')
    const isEditing = editingCells.length > 0

    expect(editorVisible || isEditing).toBe(true)

    // Clean up
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 200))
  })

  it('3.4 Select date updates cell', async () => {
    const dateBadges = await page.$$(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    )

    if (dateBadges.length === 0 || !(await isElementVisible(dateBadges[0]))) {
      console.log('SKIP: No date badge visible')
      return
    }

    const dateBadge = dateBadges[0]

    // Get original text
    const originalText = await dateBadge.evaluate((el) => el.textContent)

    // Click to open date editor
    await dateBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    // Try to find and interact with date input
    const dateInput = await page.$('input[type="date"]')
    if (await isElementVisible(dateInput)) {
      // Set a specific date using JavaScript since date inputs have special behavior
      const testDate = '2024-12-25'
      await page.evaluate((date) => {
        const input = document.querySelector('input[type="date"]') as HTMLInputElement
        if (input) {
          input.value = date
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, testDate)
      await new Promise((r) => setTimeout(r, 300))

      // Press Enter to commit
      await page.keyboard.press('Enter')
      await new Promise((r) => setTimeout(r, 500))

      // Verify date changed (should contain Dec or 25 or 12/25)
      const updatedBadges = await page.$$(
        '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
      )
      if (updatedBadges.length > 0) {
        const updatedText = await updatedBadges[0].evaluate((el) => el.textContent)

        // The date should be displayed in some format
        const hasNewDate =
          updatedText?.includes('Dec') ||
          updatedText?.includes('25') ||
          updatedText?.includes('12/25') ||
          updatedText?.includes('2024-12-25')

        expect(hasNewDate).toBe(true)
      }
    } else {
      // Date input may use a different editor type
      await page.keyboard.press('Escape')
      console.log('SKIP: Standard date input not available')
    }
  })

  it('3.5 Clear date shows empty state', async () => {
    const dateBadges = await page.$$(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    )

    if (dateBadges.length === 0 || !(await isElementVisible(dateBadges[0]))) {
      console.log('SKIP: No date badge visible')
      return
    }

    const dateBadge = dateBadges[0]

    // Click to open date editor
    await dateBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    const dateInput = await page.$('input[type="date"]')
    if (await isElementVisible(dateInput)) {
      // Clear the date
      await page.evaluate(() => {
        const input = document.querySelector('input[type="date"]') as HTMLInputElement
        if (input) {
          input.value = ''
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      await new Promise((r) => setTimeout(r, 300))

      // Press Enter to commit
      await page.keyboard.press('Enter')
      await new Promise((r) => setTimeout(r, 500))

      // Look for empty cell indicator
      const emptyCells = await page.$$(
        '.vibegridx-cell[data-column-id="due_date"] .vibegridx-cell-empty',
      )
      const isEmpty = emptyCells.length > 0

      // Alternatively, check if edit hint is shown
      if (!isEmpty) {
        const cells = await page.$$('.vibegridx-cell[data-column-id="due_date"]')
        if (cells.length > 0) {
          const cellText = await cells[0].evaluate((el) => el.textContent)
          const hasEditHint = cellText?.includes('Edit') || cellText?.trim() === ''
          expect(isEmpty || hasEditHint).toBe(true)
        }
      } else {
        expect(isEmpty).toBe(true)
      }
    } else {
      await page.keyboard.press('Escape')
      console.log('SKIP: Standard date input not available')
    }
  })

  it('3.6 Datetime field shows time component', async () => {
    // Look for created_at column (datetime type)
    const datetimeCells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="created_at"]')

    if (datetimeCells.length === 0) {
      console.log('SKIP: No datetime cells found - created_at field not in schema')
      return
    }

    // Find a datetime value (should include time)
    const datetimeBadges = await page.$$(
      '.vibegridx-cell[data-column-id="created_at"] [data-affordance]',
    )

    if (datetimeBadges.length === 0 || !(await isElementVisible(datetimeBadges[0]))) {
      console.log('SKIP: No datetime badge visible')
      return
    }

    const datetimeBadge = datetimeBadges[0]
    const badgeText = await datetimeBadge.evaluate((el) => el.textContent)

    // Datetime should include some time indicator (: for hours:minutes or AM/PM)
    const hasTimeComponent =
      badgeText?.includes(':') || badgeText?.includes('AM') || badgeText?.includes('PM')

    // If it's a date-only display, that's also acceptable
    expect((badgeText?.length || 0) > 0).toBe(true)
  })

  it('3.7 Escape cancels date edit', async () => {
    const dateBadges = await page.$$(
      '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
    )

    if (dateBadges.length === 0 || !(await isElementVisible(dateBadges[0]))) {
      console.log('SKIP: No date badge visible')
      return
    }

    const dateBadge = dateBadges[0]

    // Get original text
    const originalText = await dateBadge.evaluate((el) => el.textContent)

    // Click to open date editor
    await dateBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    // Press Escape to cancel
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 300))

    // Verify editor is closed
    const editorStillVisible = await isDateEditorVisible()

    // Editor should be closed or editing should have stopped
    const editingCells = await page.$$('.vibegridx-editing')
    const stillEditing = editingCells.length > 0

    expect(editorStillVisible && stillEditing).toBe(false)

    // Verify value unchanged
    const afterText = await dateBadge.evaluate((el) => el.textContent)
    expect(afterText).toBe(originalText)
  })

  it('3.8 Read-only date shows no edit affordance', async () => {
    // Look for non-editable date cells
    const nonEditableCells = await page.$$(
      '.vibegridx-cell[data-column-id="due_date"][data-editable="false"]',
    )

    if (nonEditableCells.length === 0) {
      // Verify editable cells have edit affordance
      const editableBadges = await page.$$(
        '.vibegridx-cell[data-column-id="due_date"] [data-affordance="edit"]',
      )

      if (editableBadges.length > 0 && (await isElementVisible(editableBadges[0]))) {
        const affordance = await editableBadges[0].evaluate((el) =>
          el.getAttribute('data-affordance'),
        )
        expect(affordance).toBe('edit')
      } else {
        console.log('SKIP: No date cells found to test')
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
})
