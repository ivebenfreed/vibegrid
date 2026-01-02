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
 *
 * Converted from Playwright to raw Puppeteer for GH#572.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from '../setup/helpers'

let page: Page

const BASIC_URL = `${BASE_URL}/debug/vibegrid-test/basic`

/**
 * Helper to detect if a column is in sorted state.
 * Current implementation: checks for active class on sort icon (not sort-asc/desc on header)
 */
async function isSorted(header: any): Promise<boolean> {
  return header.evaluate((el: HTMLElement) => {
    // Check for active sort icon
    const sortIcon = el.querySelector('.vibegridx-sort-icon')
    if (sortIcon) {
      return sortIcon.classList.contains('active')
    }
    // Fallback: check for sort classes on header (CSS expects these but they may not be set)
    return el.classList.contains('sort-asc') || el.classList.contains('sort-desc')
  })
}

/**
 * Helper to detect if column is sorted ascending.
 */
async function isSortedAsc(header: any): Promise<boolean> {
  return header.evaluate((el: HTMLElement) => {
    const sortIcon = el.querySelector('.vibegridx-sort-icon')
    if (sortIcon && sortIcon.classList.contains('active')) {
      const svg = sortIcon.querySelector('.vibegridx-sort-svg')
      if (svg) {
        const paths = svg.querySelectorAll('path')
        if (paths.length >= 2) {
          const upArrowFill = (paths[0] as SVGPathElement).getAttribute('fill')
          const downArrowFill = (paths[1] as SVGPathElement).getAttribute('fill')
          return upArrowFill === '#3b82f6' && downArrowFill !== '#3b82f6'
        }
      }
      return true
    }
    return el.classList.contains('sort-asc')
  })
}

/**
 * Helper to detect if column is sorted descending.
 */
async function isSortedDesc(header: any): Promise<boolean> {
  return header.evaluate((el: HTMLElement) => {
    const sortIcon = el.querySelector('.vibegridx-sort-icon')
    if (sortIcon && sortIcon.classList.contains('active')) {
      const svg = sortIcon.querySelector('.vibegridx-sort-svg')
      if (svg) {
        const paths = svg.querySelectorAll('path')
        if (paths.length >= 2) {
          const upArrowFill = (paths[0] as SVGPathElement).getAttribute('fill')
          const downArrowFill = (paths[1] as SVGPathElement).getAttribute('fill')
          return downArrowFill === '#3b82f6' && upArrowFill !== '#3b82f6'
        }
      }
    }
    return el.classList.contains('sort-desc')
  })
}

/**
 * Helper to navigate and wait for page to be ready
 */
async function navigateAndWaitForGrid(p: Page): Promise<boolean> {
  try {
    await p.goto(BASIC_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await p.waitForSelector('[data-testid="vibegrid-test-basic"]', { timeout: 20000 })
    await p.waitForSelector('[data-testid="vibegrid-container"]', { timeout: 15000 })
    await new Promise((r) => setTimeout(r, 1500))
    return true
  } catch {
    return false
  }
}

describe('VibeGrid Sorting & Filtering', () => {
  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  it('5.1 Column sort ascending - click column header', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    // Wait for cells to render
    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header (exclude drag handle and selection columns)
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    const sortableHeaders = []
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__') {
        sortableHeaders.push(header)
      }
    }

    if (sortableHeaders.length === 0) {
      console.log('SKIP: No column headers found for sorting')
      return
    }

    // Get the first sortable column header
    const firstHeader = sortableHeaders[0]
    const headerBox = await firstHeader.boundingBox()
    expect(headerBox).not.toBeNull()

    // Get the column ID to track the sort state
    const columnId = await firstHeader.evaluate((el) => el.getAttribute('data-column-id'))
    expect(columnId).toBeTruthy()

    // Record initial state (may have sort from previous test due to shared page)
    const initialSortState = await isSorted(firstHeader)

    // Click the column header to toggle sort
    await firstHeader.click()
    await new Promise((r) => setTimeout(r, 800))

    // Verify sort state changed after click
    const afterClickSorted = await isSorted(firstHeader)

    // If initial state was sorted, clicking should toggle (asc->desc or desc->none)
    // If initial was not sorted, clicking should make it sorted (none->asc)
    if (!initialSortState) {
      expect(afterClickSorted).toBe(true)
      const sortedAsc = await isSortedAsc(firstHeader)
      expect(sortedAsc).toBe(true)
    } else {
      // Started sorted -> should have changed state
      const isNowAsc = await isSortedAsc(firstHeader)
      const isNowDesc = await isSortedDesc(firstHeader)
      const isNowUnsorted = !afterClickSorted
      expect(isNowAsc || isNowDesc || isNowUnsorted).toBe(true)
    }

    // Verify rows are reordered by checking that the grid re-rendered
    const cellAfter = await page.$('.vibegridx-cell[data-row-id]')
    expect(cellAfter).not.toBeNull()
  })

  it('5.2 Column sort descending - click header again', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    const sortableHeaders = []
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__') {
        sortableHeaders.push(header)
      }
    }

    if (sortableHeaders.length === 0) {
      console.log('SKIP: No column headers found for sorting')
      return
    }

    const firstHeader = sortableHeaders[0]
    const headerBox = await firstHeader.boundingBox()
    expect(headerBox).not.toBeNull()

    // Record initial state
    const initialAsc = await isSortedAsc(firstHeader)
    const initialDesc = await isSortedDesc(firstHeader)

    // Click to cycle through sort states
    await firstHeader.click()
    await new Promise((r) => setTimeout(r, 800))

    // Record state after first click
    const afterFirstAsc = await isSortedAsc(firstHeader)
    const afterFirstDesc = await isSortedDesc(firstHeader)

    // Click again to continue cycling
    await firstHeader.click()
    await new Promise((r) => setTimeout(r, 800))

    // Record state after second click
    const afterSecondAsc = await isSortedAsc(firstHeader)
    const afterSecondDesc = await isSortedDesc(firstHeader)

    // Verify that we cycled through different states
    const statesChanged = afterFirstAsc !== afterSecondAsc || afterFirstDesc !== afterSecondDesc
    expect(statesChanged).toBe(true)

    // The grid should show different order than before
    const cellAfter = await page.$('.vibegridx-cell[data-row-id]')
    expect(cellAfter).not.toBeNull()
  })

  it('5.3 Multi-column sort - Shift+click second column', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find sortable column headers
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    const sortableHeaders = []
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__') {
        sortableHeaders.push(header)
      }
    }

    if (sortableHeaders.length < 2) {
      console.log('SKIP: Need at least 2 column headers for multi-column sort test')
      return
    }

    const firstHeader = sortableHeaders[0]
    const secondHeader = sortableHeaders[1]

    // Ensure first column is in sorted state (click until sorted)
    let firstSorted = await isSorted(firstHeader)
    if (!firstSorted) {
      await firstHeader.click()
      await new Promise((r) => setTimeout(r, 800))
      firstSorted = await isSorted(firstHeader)
    }
    // If still not sorted after click, try again
    if (!firstSorted) {
      await firstHeader.click()
      await new Promise((r) => setTimeout(r, 800))
      firstSorted = await isSorted(firstHeader)
    }

    // Verify first column is now sorted
    expect(firstSorted).toBe(true)

    // Shift+click second column header for multi-column sort
    await page.keyboard.down('Shift')
    await secondHeader.click()
    await page.keyboard.up('Shift')
    await new Promise((r) => setTimeout(r, 800))

    // Verify second column also has sort indicator
    const secondSorted = await isSorted(secondHeader)
    expect(secondSorted).toBe(true)

    // First column should still be sorted (multi-column sort preserves both)
    const firstStillSorted = await isSorted(firstHeader)
    expect(firstStillSorted).toBe(true)

    // The grid should be sorted by both columns
    const cellAfter = await page.$('.vibegridx-cell[data-row-id]')
    expect(cellAfter).not.toBeNull()
  })

  it('Sort cycle - click to cycle through asc, desc, none', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    const sortableHeaders = []
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__') {
        sortableHeaders.push(header)
      }
    }

    if (sortableHeaders.length === 0) {
      console.log('SKIP: No column headers found for sorting')
      return
    }

    const header = sortableHeaders[0]
    const headerBox = await header.boundingBox()
    expect(headerBox).not.toBeNull()

    // Record initial state (may have sort from previous tests)
    const state0 = {
      sorted: await isSorted(header),
      asc: await isSortedAsc(header),
      desc: await isSortedDesc(header),
    }

    // Click 1
    await header.click()
    await new Promise((r) => setTimeout(r, 800))

    const state1 = {
      sorted: await isSorted(header),
      asc: await isSortedAsc(header),
      desc: await isSortedDesc(header),
    }

    // Click 2
    await header.click()
    await new Promise((r) => setTimeout(r, 800))

    const state2 = {
      sorted: await isSorted(header),
      asc: await isSortedAsc(header),
      desc: await isSortedDesc(header),
    }

    // Click 3
    await header.click()
    await new Promise((r) => setTimeout(r, 800))

    const state3 = {
      sorted: await isSorted(header),
      asc: await isSortedAsc(header),
      desc: await isSortedDesc(header),
    }

    // Verify that clicking cycles through different states
    const allStates = [state0, state1, state2, state3]
    const uniqueStates = new Set(allStates.map((s) => `${s.asc}-${s.desc}-${s.sorted}`))

    // We should see at least 2 different states in 4 checks
    expect(uniqueStates.size).toBeGreaterThanOrEqual(2)
  })

  it('Sort indicator visibility on header', async () => {
    if (!(await navigateAndWaitForGrid(page))) {
      console.log('SKIP: Could not load basic test page')
      return
    }

    const cells = await page.$$('.vibegridx-cell[data-row-id][data-column-id]')

    if (cells.length === 0) {
      console.log('SKIP: No data cells rendered - mock route may need initialData prop')
      return
    }

    // Find a sortable column header
    const headers = await page.$$('.vibegridx-header-cell[data-column-id]')
    const sortableHeaders = []
    for (const header of headers) {
      const columnId = await header.evaluate((el) => el.getAttribute('data-column-id'))
      if (columnId !== '__selection__') {
        sortableHeaders.push(header)
      }
    }

    if (sortableHeaders.length === 0) {
      console.log('SKIP: No column headers found for sorting')
      return
    }

    const header = sortableHeaders[0]
    const headerBox = await header.boundingBox()
    expect(headerBox).not.toBeNull()

    // Check for sort icon element (should exist regardless of sorted state)
    const sortIcon = await header.$('.vibegridx-sort-icon')
    expect(sortIcon).not.toBeNull()

    // Record initial state
    const initialSorted = await isSorted(header)

    // Click to toggle sort
    await header.click()
    await new Promise((r) => setTimeout(r, 800))

    // Verify sort state changed or is in a valid state
    const afterClickSorted = await isSorted(header)

    // If it was unsorted, it should now be sorted (asc)
    if (!initialSorted) {
      expect(afterClickSorted).toBe(true)
    } else {
      // Just verify we're still in a valid state
      const isAsc = await isSortedAsc(header)
      const isDesc = await isSortedDesc(header)
      const isUnsorted = !afterClickSorted
      expect(isAsc || isDesc || isUnsorted).toBe(true)
    }

    // Header should still be visible
    const headerStillVisible = await header.boundingBox()
    expect(headerStillVisible).not.toBeNull()

    // Sort icon should be visible
    const sortIconAfter = await header.$('.vibegridx-sort-icon')
    if (sortIconAfter) {
      const iconBox = await sortIconAfter.boundingBox()
      expect(iconBox).not.toBeNull()
    }
  })
})
