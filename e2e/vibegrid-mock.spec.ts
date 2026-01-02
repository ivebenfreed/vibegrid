/**
 * VibeGrid Mock Routes E2E Tests
 *
 * Tests the mock VibeGrid routes for component testing.
 * Uses data-testid attributes for reliable element selection.
 *
 * @feature GH#415
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page, ElementHandle } from 'puppeteer-core'
import { getTestPage, cleanupPage, BASE_URL } from './setup/helpers'

describe('VibeGrid Mock Routes', () => {
  let page: Page

  beforeEach(async () => {
    page = await getTestPage()
  })

  afterEach(async () => {
    if (page) {
      await cleanupPage(page)
    }
  })

  describe('Basic Route', () => {
    beforeEach(async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/basic`)
      await page.waitForSelector('[data-testid="vibegrid-test-basic"]', {
        timeout: 15000,
      })
    })

    it('renders basic route with mock data controls', async () => {
      // Verify main container is visible
      const container = await page.$('[data-testid="vibegrid-test-basic"]')
      await expect(container as ElementHandle).toBeVisible()

      // Verify mock data controls are present
      const controls = await page.$('[data-testid="mock-data-controls"]')
      await expect(controls as ElementHandle).toBeVisible()

      // Verify scenario selector
      const scenario = await page.$('[data-testid="scenario-select"]')
      await expect(scenario as ElementHandle).toBeVisible()

      // Verify action buttons
      const addRow = await page.$('[data-testid="add-row-button"]')
      await expect(addRow as ElementHandle).toBeVisible()
      const clear = await page.$('[data-testid="clear-button"]')
      await expect(clear as ElementHandle).toBeVisible()
      const reset = await page.$('[data-testid="reset-button"]')
      await expect(reset as ElementHandle).toBeVisible()
    })

    it('can change scenario via dropdown', async () => {
      // Click scenario dropdown
      const scenarioSelect = await page.$('[data-testid="scenario-select"]')
      await scenarioSelect?.click()

      // Select medium scenario
      const mediumOption = await page.waitForSelector('[data-testid="scenario-medium"]', {
        visible: true,
      })
      await mediumOption?.click()

      // Verify scenario changed (50 rows for medium)
      const controls = await page.$('[data-testid="mock-data-controls"]')
      const text = await controls?.evaluate((el) => el.textContent)
      expect(text).toContain('50 rows')
    })

    it('can add a row', async () => {
      // Get initial row count text
      const controls = await page.$('[data-testid="mock-data-controls"]')
      const controlsText = await controls?.evaluate((el) => el.textContent)
      const initialMatch = controlsText?.match(/(\d+) rows/)
      const initialCount = initialMatch ? parseInt(initialMatch[1]) : 0

      // Click add row button
      const addRow = await page.$('[data-testid="add-row-button"]')
      await addRow?.click()

      // Verify row count increased
      const controlsAfter = await page.$('[data-testid="mock-data-controls"]')
      const textAfter = await controlsAfter?.evaluate((el) => el.textContent)
      expect(textAfter).toContain(`${initialCount + 1} rows`)
    })

    it('can clear all rows', async () => {
      // Click clear button
      const clear = await page.$('[data-testid="clear-button"]')
      await clear?.click()

      // Verify 0 rows
      const controls = await page.$('[data-testid="mock-data-controls"]')
      const text = await controls?.evaluate((el) => el.textContent)
      expect(text).toContain('0 rows')
    })

    it('vibegrid container is rendered', async () => {
      // Verify vibegrid container
      const container = await page.$('[data-testid="vibegrid-container"]')
      await expect(container as ElementHandle).toBeVisible()
    })
  })

  describe('Gantt Route', () => {
    it('renders gantt route with gantt controls', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/gantt`)
      await page.waitForSelector('[data-testid="vibegrid-test-gantt"]', {
        timeout: 15000,
      })

      // Verify main container
      const container = await page.$('[data-testid="vibegrid-test-gantt"]')
      await expect(container as ElementHandle).toBeVisible()

      // Verify gantt-specific controls
      const ganttControls = await page.$('[data-testid="gantt-controls"]')
      await expect(ganttControls as ElementHandle).toBeVisible()
      const genDeps = await page.$('[data-testid="generate-dependencies-button"]')
      await expect(genDeps as ElementHandle).toBeVisible()
      const clearDeps = await page.$('[data-testid="clear-dependencies-button"]')
      await expect(clearDeps as ElementHandle).toBeVisible()
    })

    it('can generate dependencies', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/gantt`)
      await page.waitForSelector('[data-testid="vibegrid-test-gantt"]', {
        timeout: 15000,
      })

      // Click generate dependencies
      const genDeps = await page.$('[data-testid="generate-dependencies-button"]')
      await genDeps?.click()

      // Verify dependencies were created (text should show non-zero count)
      const ganttControls = await page.$('[data-testid="gantt-controls"]')
      const text = await ganttControls?.evaluate((el) => el.textContent)
      expect(text).not.toContain('0 dependencies')
    })
  })

  describe('Grouping Route', () => {
    it('renders grouping route with grouping controls', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/grouping`)
      await page.waitForSelector('[data-testid="vibegrid-test-grouping"]', {
        timeout: 15000,
      })

      // Verify main container
      const container = await page.$('[data-testid="vibegrid-test-grouping"]')
      await expect(container as ElementHandle).toBeVisible()

      // Verify grouping-specific controls
      const groupingControls = await page.$('[data-testid="grouping-controls"]')
      await expect(groupingControls as ElementHandle).toBeVisible()
      const groupBySelect = await page.$('[data-testid="group-by-select"]')
      await expect(groupBySelect as ElementHandle).toBeVisible()
      const toggleHierarchy = await page.$('[data-testid="toggle-hierarchy-button"]')
      await expect(toggleHierarchy as ElementHandle).toBeVisible()
    })

    it('can toggle hierarchy', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/grouping`)
      await page.waitForSelector('[data-testid="vibegrid-test-grouping"]', {
        timeout: 15000,
      })

      // Click toggle hierarchy
      const toggleHierarchy = await page.$('[data-testid="toggle-hierarchy-button"]')
      await toggleHierarchy?.click()

      // Verify button text changed
      const buttonText = await toggleHierarchy?.evaluate((el) => el.textContent)
      expect(buttonText).toContain('Hierarchy Off')
    })
  })

  describe('Drag & Drop Route', () => {
    it('renders drag-drop route with controls', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/drag-drop`)
      await page.waitForSelector('[data-testid="vibegrid-test-drag-drop"]', {
        timeout: 15000,
      })

      // Verify main container
      const container = await page.$('[data-testid="vibegrid-test-drag-drop"]')
      await expect(container as ElementHandle).toBeVisible()

      // Verify drag-drop controls
      const ddControls = await page.$('[data-testid="drag-drop-controls"]')
      await expect(ddControls as ElementHandle).toBeVisible()
      const toggleRowDrag = await page.$('[data-testid="toggle-row-drag"]')
      await expect(toggleRowDrag as ElementHandle).toBeVisible()
      const toggleFillHandle = await page.$('[data-testid="toggle-fill-handle"]')
      await expect(toggleFillHandle as ElementHandle).toBeVisible()
      const shuffleRows = await page.$('[data-testid="shuffle-rows-button"]')
      await expect(shuffleRows as ElementHandle).toBeVisible()
    })
  })
})
