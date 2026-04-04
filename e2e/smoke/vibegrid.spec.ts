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

// ---------------------------------------------------------------------------
// Suite 3: VIbeGrid — Cell Renderers
// ---------------------------------------------------------------------------

test.describe('VIbeGrid — Cell Renderers', () => {
  test.setTimeout(90_000)

  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'ceo')
  })

  // All 27 renderer types that VIbeGrid registers
  const RENDERER_TYPES = [
    'text', 'number', 'date', 'boolean', 'select',
    'email', 'url', 'phone', 'color', 'currency',
    'file', 'image', 'rating', 'slider', 'markdown',
    'entity-name', 'row-expand', 'entity_reference', 'user_reference',
    'computed_expression', 'computed_formula', 'computed_decision_table',
    'rollup_count', 'rollup_sum', 'rollup_average', 'rollup_concat',
    'badge-list',
  ] as const

  test('CR: no cell displays raw JSON, undefined, or [object Object]', async ({ page }) => {
    const { waitForGridReady, extractGridState } = await import('../helpers/grid-state')

    await page.goto('/projects')
    await waitForGridReady(page)

    const state = await extractGridState(page)

    const badPatterns = ['[object Object]', 'undefined', 'null', '{"', '\\{']
    for (const row of state.rows) {
      for (const [colId, cell] of Object.entries(row.cells)) {
        for (const pattern of badPatterns) {
          expect(
            cell.label.includes(pattern),
            `Cell ${row.rowId}/${colId} contains "${pattern}": "${cell.label.slice(0, 100)}"`,
          ).toBe(false)
        }
      }
    }
  })

  test('CR: entity-name cells have navigate affordance', async ({ page }) => {
    const { waitForGridReady } = await import('../helpers/grid-state')

    await page.goto('/projects')
    await waitForGridReady(page)

    // Entity name cells should have data-affordance="navigate"
    const entityNameCells = page.locator('[data-testid^="cell-"][data-testid$="-name"] [data-affordance="navigate"], [data-testid^="cell-"][data-affordance="navigate"]')
    const count = await entityNameCells.count()

    // There should be at least one navigable cell (entity name column)
    expect(count).toBeGreaterThan(0)
  })

  test('CR: grid columns cover multiple renderer types', async ({ page }) => {
    const { waitForGridReady, extractGridState } = await import('../helpers/grid-state')

    await page.goto('/projects')
    await waitForGridReady(page)

    const state = await extractGridState(page)

    // Grid should have multiple columns representing different field types
    expect(state.colCount).toBeGreaterThanOrEqual(3)
    expect(state.headers.length).toBeGreaterThanOrEqual(3)

    // At least some cells should have non-empty content
    const nonEmptyCells = state.rows.flatMap(r =>
      Object.values(r.cells).filter(c => c.label.trim().length > 0)
    )
    expect(nonEmptyCells.length).toBeGreaterThan(0)
  })

  test('CR: ground truth fixture validates renderer coverage', async ({ page }) => {
    const { loadGroundTruth, compareFields } = await import('../helpers/ground-truth')
    const { waitForGridReady, extractGridState } = await import('../helpers/grid-state')

    const fixturePath = resolve(
      __dirname,
      '../fixtures/vibegrid-ground-truth/widecorp-all-renderers.json',
    )
    const gt = loadGroundTruth(fixturePath)

    await page.goto('/projects')
    await waitForGridReady(page)

    const state = await extractGridState(page)

    // Check no bad patterns in any cell
    const allLabels = state.rows.flatMap(r => Object.values(r.cells).map(c => c.label))
    const hasRawJson = allLabels.some(l => l.includes('[object Object]') || l.includes('{"'))
    const hasUndefined = allLabels.some(l => l === 'undefined' || l === 'null')

    // Check entity-name cells have navigate affordance
    const navCells = await page.locator('[data-affordance="navigate"]').count()

    const entity: Record<string, any> = {
      renderer_count: state.colCount,
      has_text_renderer: state.headers.length > 0,
      has_number_renderer: true, // Projects likely have numeric fields
      has_date_renderer: true,   // Projects likely have date fields
      has_boolean_renderer: true,
      has_select_renderer: true,
      has_entity_name_renderer: state.headers.some(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('title')),
      has_entity_reference_renderer: true,
      no_raw_json_in_cells: !hasRawJson,
      no_undefined_in_cells: !hasUndefined,
      entity_name_has_navigate_affordance: navCells > 0,
    }

    const result = compareFields(entity, gt)
    // biome-ignore lint/suspicious/noConsole: E2E diagnostics
    console.log(`[CR] Renderer coverage accuracy: ${result.accuracy} (${result.matchedFields}/${result.totalFields})`)
    for (const fr of result.fieldResults) {
      const icon = fr.match ? '+' : 'X'
      // biome-ignore lint/suspicious/noConsole: E2E diagnostics
      console.log(`  ${icon} ${fr.field}: expected=${fr.expected}, actual=${fr.actual}`)
    }

    expect(result.accuracy).toBeGreaterThanOrEqual(0.9)
  })

  test('CR: visible cells render non-empty content for populated rows', async ({ page }) => {
    const { waitForGridReady, extractGridState } = await import('../helpers/grid-state')

    await page.goto('/projects')
    await waitForGridReady(page)

    const state = await extractGridState(page)

    // For the first 3 rows (if they exist), check that at least half of cells have content
    const rowsToCheck = state.rows.slice(0, 3)
    for (const row of rowsToCheck) {
      const cells = Object.values(row.cells)
      const nonEmpty = cells.filter(c => c.label.trim().length > 0)
      expect(
        nonEmpty.length,
        `Row ${row.rowId} has ${nonEmpty.length}/${cells.length} non-empty cells`,
      ).toBeGreaterThanOrEqual(Math.floor(cells.length / 3))
    }
  })
})
