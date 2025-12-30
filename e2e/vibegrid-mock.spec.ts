/**
 * VibeGrid Mock Routes E2E Tests
 *
 * Tests the mock VibeGrid routes for component testing.
 * Uses data-testid attributes for reliable element selection.
 *
 * @feature GH#415
 */

import { test, expect, BASE_URL } from './fixtures/auth.fixture'

test.describe('VibeGrid Mock Routes', () => {
  test.describe('Basic Route', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/debug/vibegrid-test/basic`)
      await authenticatedPage.waitForSelector('[data-testid="vibegrid-test-basic"]', { timeout: 15000 })
    })

    test('renders basic route with mock data controls', async ({ authenticatedPage }) => {
      const page = authenticatedPage

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

    test('can change scenario via dropdown', async ({ authenticatedPage }) => {
      const page = authenticatedPage

      // Click scenario dropdown
      await page.locator('[data-testid="scenario-select"]').click()

      // Select medium scenario
      await page.locator('[data-testid="scenario-medium"]').click()

      // Verify scenario changed (50 rows for medium)
      // Note: The actual row count depends on mock data generation
      await expect(page.locator('[data-testid="mock-data-controls"]')).toContainText('50 rows')
    })

    test('can add a row', async ({ authenticatedPage }) => {
      const page = authenticatedPage

      // Get initial row count text
      const controlsText = await page.locator('[data-testid="mock-data-controls"]').textContent()
      const initialMatch = controlsText?.match(/(\d+) rows/)
      const initialCount = initialMatch ? parseInt(initialMatch[1]) : 0

      // Click add row button
      await page.locator('[data-testid="add-row-button"]').click()

      // Verify row count increased
      await expect(page.locator('[data-testid="mock-data-controls"]')).toContainText(`${initialCount + 1} rows`)
    })

    test('can clear all rows', async ({ authenticatedPage }) => {
      const page = authenticatedPage

      // Click clear button
      await page.locator('[data-testid="clear-button"]').click()

      // Verify 0 rows
      await expect(page.locator('[data-testid="mock-data-controls"]')).toContainText('0 rows')
    })

    test('vibegrid container is rendered', async ({ authenticatedPage }) => {
      const page = authenticatedPage

      // Verify vibegrid container
      await expect(page.locator('[data-testid="vibegrid-container"]')).toBeVisible()
    })
  })

  test.describe('Gantt Route', () => {
    test('renders gantt route with gantt controls', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/debug/vibegrid-test/gantt`)
      await authenticatedPage.waitForSelector('[data-testid="vibegrid-test-gantt"]', { timeout: 15000 })

      const page = authenticatedPage

      // Verify main container
      await expect(page.locator('[data-testid="vibegrid-test-gantt"]')).toBeVisible()

      // Verify gantt-specific controls
      await expect(page.locator('[data-testid="gantt-controls"]')).toBeVisible()
      await expect(page.locator('[data-testid="generate-dependencies-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="clear-dependencies-button"]')).toBeVisible()
    })

    test('can generate dependencies', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/debug/vibegrid-test/gantt`)
      await authenticatedPage.waitForSelector('[data-testid="vibegrid-test-gantt"]', { timeout: 15000 })

      const page = authenticatedPage

      // Click generate dependencies
      await page.locator('[data-testid="generate-dependencies-button"]').click()

      // Verify dependencies were created (text should show non-zero count)
      await expect(page.locator('[data-testid="gantt-controls"]')).not.toContainText('0 dependencies')
    })
  })

  test.describe('Grouping Route', () => {
    test('renders grouping route with grouping controls', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/debug/vibegrid-test/grouping`)
      await authenticatedPage.waitForSelector('[data-testid="vibegrid-test-grouping"]', { timeout: 15000 })

      const page = authenticatedPage

      // Verify main container
      await expect(page.locator('[data-testid="vibegrid-test-grouping"]')).toBeVisible()

      // Verify grouping-specific controls
      await expect(page.locator('[data-testid="grouping-controls"]')).toBeVisible()
      await expect(page.locator('[data-testid="group-by-select"]')).toBeVisible()
      await expect(page.locator('[data-testid="toggle-hierarchy-button"]')).toBeVisible()
    })

    test('can toggle hierarchy', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/debug/vibegrid-test/grouping`)
      await authenticatedPage.waitForSelector('[data-testid="vibegrid-test-grouping"]', { timeout: 15000 })

      const page = authenticatedPage

      // Click toggle hierarchy
      await page.locator('[data-testid="toggle-hierarchy-button"]').click()

      // Verify button text changed
      await expect(page.locator('[data-testid="toggle-hierarchy-button"]')).toContainText('Hierarchy Off')
    })
  })

  test.describe('Drag & Drop Route', () => {
    test('renders drag-drop route with controls', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`${BASE_URL}/debug/vibegrid-test/drag-drop`)
      await authenticatedPage.waitForSelector('[data-testid="vibegrid-test-drag-drop"]', { timeout: 15000 })

      const page = authenticatedPage

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
