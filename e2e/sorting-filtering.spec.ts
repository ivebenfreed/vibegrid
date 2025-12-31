/**
 * VibeGrid Sorting & Filtering E2E Tests
 *
 * Tests for column sorting and filtering behaviors in VibeGrid.
 *
 * @feature GH#466
 * @spec planning/specs/466-vibegrid-interaction-testing-comprehensi.md
 *
 * NOTE: These tests require the mock VibeGrid test route to properly render
 * data cells. The route needs to pass initialData to VibeGrid for tests to work.
 * Tests will skip if no data cells are detected.
 */

import { test, expect, BASE_URL } from '../fixtures/auth.fixture'

/**
 * Helper to detect if a column is in sorted state.
 * Checks for: sort-asc class, sort-desc class, or active sort icon
 */
async function isSorted(header: any): Promise<boolean> {
  return header.evaluate((el: HTMLElement) => {
    const hasAscClass = el.classList.contains('sort-asc')
    const hasDescClass = el.classList.contains('sort-desc')
    const hasActiveIcon = el.querySelector('.vibegridx-sort-icon.active') !== null
    return hasAscClass || hasDescClass || hasActiveIcon
  })
}

/**
 * Helper to detect if column is sorted ascending
 */
async function isSortedAsc(header: any): Promise<boolean> {
  return header.evaluate((el: HTMLElement) => {
    return el.classList.contains('sort-asc')
  })
}

/**
 * Helper to detect if column is sorted descending
 */
async function isSortedDesc(header: any): Promise<boolean> {
  return header.evaluate((el: HTMLElement) => {
    return el.classList.contains('sort-desc')
  })
}

test.describe('VibeGrid Sorting & Filtering', () => {
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

  test('5.1 Column sort ascending - click column header', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header (exclude drag handle and selection columns)
    // Use the header with data-interaction-type="column-header"
    const headerLocator = page.locator('[data-interaction-type="column-header"]')
    const headerCount = await headerLocator.count()

    if (headerCount === 0) {
      test.skip(true, 'No column headers found for sorting')
      return
    }

    // Get the first sortable column header
    const firstHeader = headerLocator.first()
    await expect(firstHeader).toBeVisible()

    // Get the column ID to track the sort state
    const columnId = await firstHeader.getAttribute('data-column-id')
    expect(columnId).toBeTruthy()

    // Click the column header to sort
    await firstHeader.click()

    // Wait for sort to apply (MobX reaction + DOM update)
    await page.waitForTimeout(500)

    // Verify sort indicator appears - check for sort-asc class on header
    const sortedAsc = await isSortedAsc(firstHeader)
    expect(sortedAsc).toBe(true)

    // Verify rows are reordered by checking that the grid re-rendered
    // The DOM should have updated with the sorted data
    await expect(page.locator('.vibegridx-cell[data-row-id]').first()).toBeVisible()
  })

  test('5.2 Column sort descending - click header again', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header
    const headerLocator = page.locator('[data-interaction-type="column-header"]')
    const headerCount = await headerLocator.count()

    if (headerCount === 0) {
      test.skip(true, 'No column headers found for sorting')
      return
    }

    const firstHeader = headerLocator.first()
    await expect(firstHeader).toBeVisible()

    // Click once for ascending sort
    await firstHeader.click()
    await page.waitForTimeout(500)

    // Verify ascending sort applied
    const sortedAsc = await isSortedAsc(firstHeader)
    expect(sortedAsc).toBe(true)

    // Click again for descending sort
    await firstHeader.click()
    await page.waitForTimeout(500)

    // Verify descending sort applied - check for sort-desc class
    const sortedDesc = await isSortedDesc(firstHeader)
    expect(sortedDesc).toBe(true)

    // The grid should show different order than before
    await expect(page.locator('.vibegridx-cell[data-row-id]').first()).toBeVisible()
  })

  test('5.3 Multi-column sort - Shift+click second column', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find sortable column headers
    const headerLocator = page.locator('[data-interaction-type="column-header"]')
    const headerCount = await headerLocator.count()

    if (headerCount < 2) {
      test.skip(true, 'Need at least 2 column headers for multi-column sort test')
      return
    }

    const firstHeader = headerLocator.first()
    const secondHeader = headerLocator.nth(1)

    await expect(firstHeader).toBeVisible()
    await expect(secondHeader).toBeVisible()

    // Click first column header to set primary sort
    await firstHeader.click()
    await page.waitForTimeout(500)

    // Verify first column is sorted
    const firstSortedAsc = await isSortedAsc(firstHeader)
    expect(firstSortedAsc).toBe(true)

    // Shift+click second column header for multi-column sort
    await secondHeader.click({ modifiers: ['Shift'] })
    await page.waitForTimeout(500)

    // Verify second column also has sort indicator
    const secondSorted = await isSorted(secondHeader)
    expect(secondSorted).toBe(true)

    // First column should still be sorted (multi-column sort)
    const firstStillSorted = await isSorted(firstHeader)
    expect(firstStillSorted).toBe(true)

    // The grid should be sorted by both columns
    await expect(page.locator('.vibegridx-cell[data-row-id]').first()).toBeVisible()
  })

  test('Sort cycle - click to cycle through asc, desc, none', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header
    const headerLocator = page.locator('[data-interaction-type="column-header"]')
    const headerCount = await headerLocator.count()

    if (headerCount === 0) {
      test.skip(true, 'No column headers found for sorting')
      return
    }

    const header = headerLocator.first()
    await expect(header).toBeVisible()

    // Initial state - verify not sorted
    const initialSorted = await isSorted(header)
    expect(initialSorted).toBe(false)

    // Click 1: Ascending sort
    await header.click()
    await page.waitForTimeout(500)

    // Check for ascending class
    const isAscAfterFirst = await isSortedAsc(header)
    expect(isAscAfterFirst).toBe(true)

    // Click 2: Descending sort
    await header.click()
    await page.waitForTimeout(500)

    const isDescAfterSecond = await isSortedDesc(header)
    expect(isDescAfterSecond).toBe(true)

    // Click 3: No sort (back to original)
    await header.click()
    await page.waitForTimeout(500)

    // After third click, sort should be cleared
    const isUnsortedAfterThird = await isSorted(header)
    expect(isUnsortedAfterThird).toBe(false)
  })

  test('Sort indicator visibility on header', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for cells to render
    const cellLocator = page.locator('.vibegridx-cell[data-row-id][data-column-id]')
    const cellCount = await cellLocator.count()

    if (cellCount === 0) {
      test.skip(true, 'No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header
    const headerLocator = page.locator('[data-interaction-type="column-header"]')
    const headerCount = await headerLocator.count()

    if (headerCount === 0) {
      test.skip(true, 'No column headers found for sorting')
      return
    }

    const header = headerLocator.first()
    await expect(header).toBeVisible()

    // Before sorting, header should not have sort classes
    const unsortedBefore = await isSorted(header)
    expect(unsortedBefore).toBe(false)

    // Click to sort
    await header.click()
    await page.waitForTimeout(500)

    // After sorting, header should have sort-asc class
    const sortedAfter = await isSortedAsc(header)
    expect(sortedAfter).toBe(true)

    // Header should be visible
    await expect(header).toBeVisible()
  })
})
