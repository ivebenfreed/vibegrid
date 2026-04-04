import { test, expect } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * VIbeGrid Eval System — E2E Tests
 *
 * Suite 1: Infrastructure — grid mounts, state helpers work, ground truth engine works
 *
 * Auth: uses dev auth helper (window.__auth) to sign in as WideCorp CEO.
 * Target page: /projects (default WideCorp entity list with VIbeGrid).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Call an oRPC endpoint via authenticated page context */
async function orpc(page: import('@playwright/test').Page, path: string, payload: Record<string, unknown> = {}) {
  const res = await page.request.post(`/api/orpc${path}`, {
    data: { json: payload },
  })
  if (!res.ok()) {
    const text = await res.text()
    throw new Error(`oRPC ${path} failed (${res.status()}): ${text.slice(0, 500)}`)
  }
  const body = await res.json()
  return body.json ?? body
}

/**
 * Sign in as a test user using the dev auth helper (window.__auth).
 * Available on staging and local dev. NOT production.
 */
async function signInAs(page: import('@playwright/test').Page, shorthand: string) {
  await page.goto('/projects')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => !!(window as any).__auth || !!(window as any).n, { timeout: 15_000 })

  const result = await page.evaluate(async (user) => {
    const auth = (window as any).__auth || (window as any).n
    if (!auth) return { ok: false, error: 'dev auth helper not available' }
    try {
      const res = await auth.signIn(user)
      return { ok: true, data: JSON.stringify(res) }
    } catch (err: any) {
      return { ok: false, error: err.message ?? String(err) }
    }
  }, shorthand)

  if (!result.ok) {
    throw new Error(`signInAs(${shorthand}) failed: ${result.error}`)
  }

  await page.goto('/projects')
  await page.waitForLoadState('domcontentloaded')
  // Warm session so gateway populates org context cookie
  await page.request.post('/api/orpc/dataforge/schema/getAll', { data: { json: {} } })
}

// ---------------------------------------------------------------------------
// Suite 1: VIbeGrid — Infrastructure
// ---------------------------------------------------------------------------

test.describe('VIbeGrid — Infrastructure', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'ceo')
  })

  test('INF-1: grid mounts for WideCorp entity type', async ({ page }) => {
    const { waitForGridReady } = await import('../helpers/grid-state')

    await page.goto('/projects')
    await waitForGridReady(page)

    const grid = page.locator('[role=grid]').first()
    await expect(grid).toBeVisible()

    const rowCount = Number(await grid.getAttribute('aria-rowcount'))
    const colCount = Number(await grid.getAttribute('aria-colcount'))

    expect(rowCount).toBeGreaterThan(1) // > 1 means data rows exist (1 = header only)
    expect(colCount).toBeGreaterThan(0)
  })

  test('INF-2: grid state helper extracts correct cell values', async ({ page }) => {
    const { waitForGridReady, extractGridState } = await import('../helpers/grid-state')

    await page.goto('/projects')
    await waitForGridReady(page)

    const state = await extractGridState(page)

    expect(state.rowCount).toBeGreaterThan(0)
    expect(state.colCount).toBeGreaterThan(0)
    expect(state.headers.length).toBeGreaterThan(0)
    expect(state.rows.length).toBeGreaterThan(0)

    // First row should have at least one cell
    const firstRow = state.rows[0]
    expect(Object.keys(firstRow.cells).length).toBeGreaterThan(0)
  })

  test('INF-3: ground truth fixture loads and compareFields engine works', async () => {
    const { loadGroundTruth, compareFields } = await import('../helpers/ground-truth')

    const fixturePath = resolve(
      __dirname,
      '../fixtures/vibegrid-ground-truth/widecorp-projects-default.json',
    )
    const gt = loadGroundTruth(fixturePath)

    // Perfect match: supply exactly what the fixture expects
    const perfectEntity: Record<string, any> = {
      row_count_min: 1,
      col_count_min: 3,
      has_header_row: true,
      has_data_rows: true,
      grid_role: 'grid',
    }
    const perfectResult = compareFields(perfectEntity, gt)
    expect(perfectResult.accuracy).toBe(1)

    // Partial match: mutate one field
    const mutatedEntity = { ...perfectEntity, grid_role: 'table' }
    const mutatedResult = compareFields(mutatedEntity, gt)
    expect(mutatedResult.accuracy).toBeLessThan(1)
  })

  // -------------------------------------------------------------------------
  // Eval Helper Self-Tests
  // -------------------------------------------------------------------------

  test.describe('Eval Helper Self-Tests', () => {
    test('ground truth fixture loads', async () => {
      const { loadGroundTruth } = await import('../helpers/ground-truth')

      const fixturePath = resolve(
        __dirname,
        '../fixtures/vibegrid-ground-truth/widecorp-projects-default.json',
      )
      const gt = loadGroundTruth(fixturePath)

      expect(gt.source_pdf).toBeDefined()
      expect(gt.expected_fields).toBeDefined()
      expect(Object.keys(gt.expected_fields).length).toBeGreaterThanOrEqual(3)
    })

    test('compareFields perfect match returns accuracy 1', async () => {
      const { loadGroundTruth, compareFields } = await import('../helpers/ground-truth')

      const fixturePath = resolve(
        __dirname,
        '../fixtures/vibegrid-ground-truth/widecorp-projects-default.json',
      )
      const gt = loadGroundTruth(fixturePath)

      const entity: Record<string, any> = {
        row_count_min: 1,
        col_count_min: 3,
        has_header_row: true,
        has_data_rows: true,
        grid_role: 'grid',
      }
      const result = compareFields(entity, gt)
      expect(result.accuracy).toBe(1)
    })

    test('compareFields partial match returns accuracy < 1', async () => {
      const { loadGroundTruth, compareFields } = await import('../helpers/ground-truth')

      const fixturePath = resolve(
        __dirname,
        '../fixtures/vibegrid-ground-truth/widecorp-projects-default.json',
      )
      const gt = loadGroundTruth(fixturePath)

      const entity: Record<string, any> = {
        row_count_min: 1,
        col_count_min: 3,
        has_header_row: true,
        has_data_rows: false, // mutated
        grid_role: 'grid',
      }
      const result = compareFields(entity, gt)
      expect(result.accuracy).toBeLessThan(1)
    })

    test('extractGridState returns correct structure', async ({ page }) => {
      const { waitForGridReady, extractGridState } = await import('../helpers/grid-state')

      await page.goto('/projects')
      await waitForGridReady(page)

      const state = await extractGridState(page)

      expect(state).toHaveProperty('rowCount')
      expect(state).toHaveProperty('colCount')
      expect(state).toHaveProperty('headers')
      expect(state).toHaveProperty('rows')
      expect(typeof state.rowCount).toBe('number')
      expect(typeof state.colCount).toBe('number')
      expect(Array.isArray(state.headers)).toBe(true)
      expect(Array.isArray(state.rows)).toBe(true)
    })

    test('waitForGridReady resolves within timeout', async ({ page }) => {
      const { waitForGridReady } = await import('../helpers/grid-state')

      await page.goto('/projects')

      // Should resolve without throwing
      await expect(waitForGridReady(page, '[role=grid]', 15_000)).resolves.toBeUndefined()
    })
  })
})
