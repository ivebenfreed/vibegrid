/**
 * VibeGrid Mock Routes E2E Tests
 *
 * Tests the mock VibeGrid routes for component testing.
 * Uses data-testid attributes for reliable element selection.
 *
 * @feature GH#415
 */

import { getTestPage, cleanupPage, BASE_URL } from 'setup/helpers'
import { wrapPage, type TestPage } from 'setup/test-setup'

describe('VibeGrid Mock Routes', () => {
  let page: TestPage

  describe('Basic Route', () => {
    beforeEach(async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/basic`)
      await page.waitForSelector('[data-testid="vibegrid-test-basic"]', {
        timeout: 15000,
      })
    })

    it('renders basic route with mock data controls', async () => {
            // Verify main container is visible
      await expect(page.locator('[data-testid="vibegrid-test-basic"]')).toBeVisible()

      // Verify mock data controls are present
      await expect(page.locator('[data-testid="mock-data-controls"]')).toBeVisible()

      // Verify scenario selector
      await expect(page.locator('[data-testid="scenario-select"]')).toBeVisible()

      // Verify action buttons
      await expect(page.locator('[data-testid="add-row-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="clear-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="reset-button"]')).toBeVisible()
    })

    it('can change scenario via dropdown', async () => {
            // Click scenario dropdown
      await page.locator('[data-testid="scenario-select"]').click()

      // Select medium scenario
      await page.locator('[data-testid="scenario-medium"]').click()

      // Verify scenario changed (50 rows for medium)
      // Note: The actual row count depends on mock data generation
      await expect(page.locator('[data-testid="mock-data-controls"]')).toContainText('50 rows')
    })

    it('can add a row', async () => {
            // Get initial row count text
      const controlsText = await page.locator('[data-testid="mock-data-controls"]').textContent()
      const initialMatch = controlsText?.match(/(\d+) rows/)
      const initialCount = initialMatch ? parseInt(initialMatch[1]) : 0

      // Click add row button
      await page.locator('[data-testid="add-row-button"]').click()

      // Verify row count increased
      await expect(page.locator('[data-testid="mock-data-controls"]')).toContainText(
        `${initialCount + 1} rows`,
      )
    })

    it('can clear all rows', async () => {
            // Click clear button
      await page.locator('[data-testid="clear-button"]').click()

      // Verify 0 rows
      await expect(page.locator('[data-testid="mock-data-controls"]')).toContainText('0 rows')
    })

    it('vibegrid container is rendered', async () => {
            // Verify vibegrid container
      await expect(page.locator('[data-testid="vibegrid-container"]')).toBeVisible()
    })
  })

  describe('Gantt Route', () => {
    it('renders gantt route with gantt controls', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/gantt`)
      await page.waitForSelector('[data-testid="vibegrid-test-gantt"]', {
        timeout: 15000,
      })

            // Verify main container
      await expect(page.locator('[data-testid="vibegrid-test-gantt"]')).toBeVisible()

      // Verify gantt-specific controls
      await expect(page.locator('[data-testid="gantt-controls"]')).toBeVisible()
      await expect(page.locator('[data-testid="generate-dependencies-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="clear-dependencies-button"]')).toBeVisible()
    })

    it('can generate dependencies', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/gantt`)
      await page.waitForSelector('[data-testid="vibegrid-test-gantt"]', {
        timeout: 15000,
      })

            // Click generate dependencies
      await page.locator('[data-testid="generate-dependencies-button"]').click()

      // Verify dependencies were created (text should show non-zero count)
      await expect(page.locator('[data-testid="gantt-controls"]')).not.toContainText(
        '0 dependencies',
      )
    })
  })

  describe('Grouping Route', () => {
    it('renders grouping route with grouping controls', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/grouping`)
      await page.waitForSelector('[data-testid="vibegrid-test-grouping"]', {
        timeout: 15000,
      })

            // Verify main container
      await expect(page.locator('[data-testid="vibegrid-test-grouping"]')).toBeVisible()

      // Verify grouping-specific controls
      await expect(page.locator('[data-testid="grouping-controls"]')).toBeVisible()
      await expect(page.locator('[data-testid="group-by-select"]')).toBeVisible()
      await expect(page.locator('[data-testid="toggle-hierarchy-button"]')).toBeVisible()
    })

    it('can toggle hierarchy', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/grouping`)
      await page.waitForSelector('[data-testid="vibegrid-test-grouping"]', {
        timeout: 15000,
      })

            // Click toggle hierarchy
      await page.locator('[data-testid="toggle-hierarchy-button"]').click()

      // Verify button text changed
      await expect(page.locator('[data-testid="toggle-hierarchy-button"]')).toContainText(
        'Hierarchy Off',
      )
    })
  })

  describe('Drag & Drop Route', () => {
    it('renders drag-drop route with controls', async () => {
      await page.goto(`${BASE_URL}/debug/vibegrid-test/drag-drop`)
      await page.waitForSelector('[data-testid="vibegrid-test-drag-drop"]', {
        timeout: 15000,
      })

            // Verify main container
      await expect(page.locator('[data-testid="vibegrid-test-drag-drop"]')).toBeVisible()

      // Verify drag-drop controls
      await expect(page.locator('[data-testid="drag-drop-controls"]')).toBeVisible()
      await expect(page.locator('[data-testid="toggle-row-drag"]')).toBeVisible()
      await expect(page.locator('[data-testid="toggle-fill-handle"]')).toBeVisible()
      await expect(page.locator('[data-testid="shuffle-rows-button"]')).toBeVisible()
    })
  })
})
