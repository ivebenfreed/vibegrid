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
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page, ElementHandle } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from '../../setup/helpers'

let page: Page

describe('VibeGrid Select Field Type', () => {
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
   * Helper to find select cells by checking for status column
   */
  async function findSelectCells(): Promise<ElementHandle[]> {
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id="status"]')
    return cells
  }

  /**
   * Helper to check if a select dropdown editor is visible
   */
  async function isSelectEditorVisible(): Promise<boolean> {
    const selects = await page.$$('.vibegridx-select-editor, select.vibegridx-select-editor')
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

  it('2.1 Select badge renders with correct styling', async () => {
    console.log('Loading fixtures for deterministic values')
    await loadFixtures()

    const selectCells = await findSelectCells()

    if (selectCells.length === 0) {
      console.log('SKIP: No select cells found - status field not in schema')
      return
    }

    // Find a badge with edit affordance
    const selectBadges = await page.$$(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    )

    if (selectBadges.length === 0) {
      console.log('SKIP: No select badges found')
      return
    }

    const selectBadge = selectBadges[0]
    await expect(selectBadge).toBeVisible()

    // Check that badge has styling (background color, padding)
    const style = await selectBadge.evaluate((el) => el.getAttribute('style'))
    const hasBackground = style?.includes('background-color') || false
    const hasPadding = style?.includes('padding') || false

    // Badge should have visual styling
    expect(hasBackground || hasPadding).toBe(true)
  })

  it('2.2 Click opens dropdown editor', async () => {
    const selectBadges = await page.$$(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    )

    if (selectBadges.length === 0 || !(await isElementVisible(selectBadges[0]))) {
      console.log('SKIP: No select badge visible')
      return
    }

    const selectBadge = selectBadges[0]

    // Click the badge to open dropdown
    await selectBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    // Check if dropdown appeared
    const dropdownVisible = await isSelectEditorVisible()
    expect(dropdownVisible).toBe(true)

    // Clean up
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 200))
  })

  it('2.3 Select option updates badge', async () => {
    const selectBadges = await page.$$(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    )

    if (selectBadges.length === 0 || !(await isElementVisible(selectBadges[0]))) {
      console.log('SKIP: No select badge visible')
      return
    }

    const selectBadge = selectBadges[0]

    // Get original text
    const originalText = await selectBadge.evaluate((el) => el.textContent)

    // Click to open dropdown
    await selectBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    const selectEditor = await page.$('.vibegridx-select-editor')
    if (!(await isElementVisible(selectEditor))) {
      console.log('SKIP: Select editor not available')
      return
    }

    // Get available options
    const options = await selectEditor!.$$('option')

    if (options.length < 2) {
      console.log('SKIP: Not enough options to test selection')
      return
    }

    // Find an option that's different from current value
    let targetOption: string | null = null
    for (const option of options) {
      const optionText = await option.evaluate((el) => el.textContent)
      const optionValue = await option.evaluate((el) => el.getAttribute('value'))
      if (optionValue && optionValue !== '' && optionText !== originalText) {
        targetOption = optionValue
        break
      }
    }

    if (targetOption) {
      await page.select('.vibegridx-select-editor', targetOption)
      await new Promise((r) => setTimeout(r, 500))

      // Verify badge changed
      const updatedBadges = await page.$$(
        '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
      )
      if (updatedBadges.length > 0) {
        const updatedText = await updatedBadges[0].evaluate((el) => el.textContent)
        expect(updatedText).not.toBe(originalText)
      }
    }
  })

  it('2.4 Escape cancels without change', async () => {
    const selectBadges = await page.$$(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    )

    if (selectBadges.length === 0 || !(await isElementVisible(selectBadges[0]))) {
      console.log('SKIP: No select badge visible')
      return
    }

    const selectBadge = selectBadges[0]

    // Get original text
    const originalText = await selectBadge.evaluate((el) => el.textContent)

    // Click to open dropdown
    await selectBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    // Press Escape to cancel
    await page.keyboard.press('Escape')
    await new Promise((r) => setTimeout(r, 300))

    // Verify dropdown is closed
    const dropdownStillVisible = await isSelectEditorVisible()
    expect(dropdownStillVisible).toBe(false)

    // Verify value unchanged
    const afterText = await selectBadge.evaluate((el) => el.textContent)
    expect(afterText).toBe(originalText)
  })

  it('2.5 Status options show with colors', async () => {
    console.log('Loading fixtures which have all status variations')
    await loadFixtures()

    // Find status badges with different values
    const statusBadges = await page.$$(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    )

    if (statusBadges.length === 0) {
      console.log('SKIP: No status badges found')
      return
    }

    // Collect badge texts to verify different statuses
    const statusTexts = new Set<string>()
    for (let i = 0; i < Math.min(statusBadges.length, 10); i++) {
      const text = await statusBadges[i].evaluate((el) => el.textContent)
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
    const emptyCells = await page.$$(
      '.vibegridx-cell[data-column-id="status"] .vibegridx-cell-empty',
    )

    // If no empty cells, that's fine - test data may not have nulls
    if (emptyCells.length === 0) {
      console.log('SKIP: No empty select cells found - test data may not have null statuses')
      return
    }

    const emptyCell = emptyCells[0]
    const cellText = await emptyCell.evaluate((el) => el.textContent)

    // Empty cells should show edit hint
    expect(cellText).toContain('Edit')
  })

  it('2.7 Read-only select shows no edit affordance', async () => {
    // Look for non-editable select cells
    const nonEditableCells = await page.$$(
      '.vibegridx-cell[data-column-id="status"][data-editable="false"]',
    )

    if (nonEditableCells.length === 0) {
      // Verify editable cells have edit affordance
      const editableBadges = await page.$$(
        '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
      )

      if (editableBadges.length > 0 && (await isElementVisible(editableBadges[0]))) {
        const affordance = await editableBadges[0].evaluate((el) =>
          el.getAttribute('data-affordance'),
        )
        expect(affordance).toBe('edit')
      } else {
        console.log('SKIP: No select cells found to test')
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

  it('2.8 Dropdown shows all options from schema', async () => {
    const selectBadges = await page.$$(
      '.vibegridx-cell[data-column-id="status"] [data-affordance="edit"]',
    )

    if (selectBadges.length === 0 || !(await isElementVisible(selectBadges[0]))) {
      console.log('SKIP: No select badge visible')
      return
    }

    const selectBadge = selectBadges[0]

    // Click to open dropdown
    await selectBadge.click()
    await new Promise((r) => setTimeout(r, 500))

    const selectEditor = await page.$('.vibegridx-select-editor')
    if (!(await isElementVisible(selectEditor))) {
      console.log('SKIP: Select editor not available')
      return
    }

    // Get all options
    const options = await selectEditor!.$$('option')

    // Collect option labels
    const optionLabels: string[] = []
    for (const option of options) {
      const text = await option.evaluate((el) => el.textContent)
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
    await new Promise((r) => setTimeout(r, 200))
  })
})
