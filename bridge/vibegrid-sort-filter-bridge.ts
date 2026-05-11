/**
 * GH#2804 B11: bridge VibeGrid sort/filter UI state into QueryShape sort/filter.
 *
 * VibeGrid's existing JS sort/filter shapes (`SortConfig`, `FilterConfig`,
 * `FilterGroup`) are kept untouched — this module is the one-way translator
 * from VibeGrid → SharedWorker SQL pushdown.
 *
 * Operator mapping (VibeGrid FilterOperator → QueryShape FilterOperator):
 *
 *   equals           → eq
 *   not_equals       → neq
 *   contains         → contains
 *   not_contains     → not_contains   (GH#2848 B5: native `NOT LIKE %v%`)
 *   starts_with      → starts_with
 *   ends_with        → ends_with      (GH#2848 B5: native `LIKE %v`)
 *   greater_than     → gt
 *   less_than        → lt
 *   between          → between (range = [a, b])
 *   is_empty         → is_null
 *   is_not_empty     → is_not_null
 *   in               → in
 *   not_in           → not_in
 *   regex            → regex          (GH#2848 B5: REGEXP-availability-gated;
 *                                      pushes down when wa-sqlite exposes
 *                                      REGEXP, otherwise the worker applies
 *                                      a JS post-filter to parsed rows)
 *   decision_status  → (still unsupported on SQL path)
 *
 * Filters with unsupported operators fall through and are dropped from the
 * SQL pushdown — the substrate path's caller MUST gate the JS-side
 * `applyAllFilters` for substrate-owned entities. If a substrate-owned
 * entity uses an unsupported operator, the user sees the unfiltered set.
 * That's a known caveat; production rollout will only enable substrate for
 * entities whose filter UX uses supported ops (RFI / Project today).
 */

import type { FilterExpression, FilterOperator } from './types'

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

/** VibeGrid SortConfig shape (mirrors `apps/web/src/systems/vibegrid/types.ts`). */
export interface VibeGridSortConfig {
  field: string
  direction: 'asc' | 'desc'
}

/** VibeGrid FilterCondition shape (mirrors filter-types.ts). */
export interface VibeGridFilterCondition {
  id?: string
  field: string
  operator: string
  value: unknown
  caseSensitive?: boolean
  negate?: boolean
}

/** VibeGrid FilterGroup shape (mirrors filter-types.ts). */
export interface VibeGridFilterGroup {
  logic: 'AND' | 'OR'
  conditions: Array<VibeGridFilterCondition | VibeGridFilterGroup>
}

// ---------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------

/**
 * Translate a VibeGrid sortBy array into QueryShape sort. The shapes are
 * already aligned (both `{field, direction}`); this is a defensive copy +
 * narrowing to the specific direction literal.
 */
export function convertVibeGridSortToQueryShape(
  sort: readonly VibeGridSortConfig[] | null | undefined,
): Array<{ field: string; direction: 'asc' | 'desc' }> {
  if (!sort || sort.length === 0) return []
  return sort.map((s) => ({
    field: s.field,
    direction: s.direction === 'desc' ? 'desc' : 'asc',
  }))
}

// ---------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------

/** Map a VibeGrid filter operator to a QueryShape FilterOperator (or null if unsupported). */
function mapOperator(op: string): FilterOperator | null {
  switch (op) {
    case 'equals':
      return 'eq'
    case 'not_equals':
      return 'neq'
    case 'contains':
      return 'contains'
    case 'starts_with':
      return 'starts_with'
    case 'greater_than':
      return 'gt'
    case 'less_than':
      return 'lt'
    case 'between':
      return 'between'
    case 'is_empty':
      return 'is_null'
    case 'is_not_empty':
      return 'is_not_null'
    case 'in':
      return 'in'
    case 'not_in':
      return 'not_in'
    // GH#2848 B5: now SQL-pushdown-supported. `not_contains` and `ends_with`
    // emit native `NOT LIKE %v%` / `LIKE %v`. `regex` either pushes down to
    // native REGEXP when available, or falls back to a worker-side JS
    // post-filter — both branches are handled by query-maintenance, so
    // the bridge can map regex through unconditionally.
    case 'not_contains':
      return 'not_contains'
    case 'ends_with':
      return 'ends_with'
    case 'regex':
      return 'regex'
    // Still unsupported on the SQL path — caller's JS fallback (or no-op
    // for substrate). `decision_status` requires cross-table joins that
    // the worker substrate doesn't model yet.
    case 'decision_status':
      return null
    default:
      return null
  }
}

function isFilterGroup(
  node: VibeGridFilterCondition | VibeGridFilterGroup,
): node is VibeGridFilterGroup {
  return (node as VibeGridFilterGroup).logic !== undefined
}

/**
 * Translate a single VibeGrid FilterCondition into a leaf FilterExpression.
 * Returns `null` for unsupported operators or invalid shapes.
 */
function convertCondition(c: VibeGridFilterCondition): FilterExpression | null {
  const op = mapOperator(c.operator)
  if (!op) return null

  if (op === 'is_null' || op === 'is_not_null') {
    return { op, field: c.field }
  }

  if (op === 'in' || op === 'not_in') {
    const values = Array.isArray(c.value) ? c.value : []
    return { op, field: c.field, values }
  }

  if (op === 'between') {
    if (Array.isArray(c.value) && c.value.length >= 2) {
      return { op, field: c.field, range: [c.value[0], c.value[1]] }
    }
    return null
  }

  // Single-value operators
  return { op, field: c.field, value: c.value }
}

/**
 * Translate a VibeGrid FilterGroup into a compound FilterExpression. Empty
 * groups return `null` so the caller can omit the filter entirely.
 */
function convertGroup(group: VibeGridFilterGroup): FilterExpression | null {
  if (!group.conditions || group.conditions.length === 0) return null
  const filters: FilterExpression[] = []
  for (const node of group.conditions) {
    const child = isFilterGroup(node) ? convertGroup(node) : convertCondition(node)
    if (child) filters.push(child)
  }
  if (filters.length === 0) return null
  if (filters.length === 1) return filters[0]!
  return { op: group.logic === 'OR' ? 'or' : 'and', filters }
}

/**
 * Translate VibeGrid filters into a single QueryShape FilterExpression.
 *
 * Accepts either:
 *   - `FilterConfig[]` (legacy flat array — joined as AND)
 *   - `FilterGroup` (advanced builder — preserves logic + nesting)
 *
 * Returns `undefined` when there's no usable filter (empty / all unsupported)
 * so callers can simply pass the result to `query.patch({ filter })` without
 * a defaulting step.
 */
export function convertVibeGridFilterToFilterExpression(
  filters:
    | readonly VibeGridFilterCondition[]
    | VibeGridFilterGroup
    | null
    | undefined,
): FilterExpression | undefined {
  if (!filters) return undefined

  if (Array.isArray(filters)) {
    const arr = filters as readonly VibeGridFilterCondition[]
    if (arr.length === 0) return undefined
    const expressions: FilterExpression[] = []
    for (const c of arr) {
      const expr = convertCondition(c)
      if (expr) expressions.push(expr)
    }
    if (expressions.length === 0) return undefined
    if (expressions.length === 1) return expressions[0]!
    return { op: 'and', filters: expressions }
  }

  // FilterGroup (object form)
  const result = convertGroup(filters as VibeGridFilterGroup)
  return result ?? undefined
}

// ---------------------------------------------------------------------
// Global text search (GH#2949)
// ---------------------------------------------------------------------

/**
 * Translate VibeGrid's global search text into a FilterExpression that runs
 * an OR-group of `contains` predicates across the supplied field names.
 *
 * Returns `undefined` when there is no usable search (empty/whitespace text
 * or no fields) so callers can pass the result directly to
 * `query.patch({ filter })` without a defaulting step.
 *
 * SQL emission for `contains` is `<operand> LIKE ? ESCAPE '\\'` with the
 * value wrapped in `%...%` (see `query-maintenance.ts:818-822`), which is
 * case-insensitive for ASCII under SQLite's default collation — matching the
 * JS-side `String.prototype.includes(text.toLowerCase())` semantics that the
 * dense-mode `applyTextSearch` helper uses. This keeps client and server
 * behavior aligned across the sparse-mode bypass in
 * `TableCoreStore.searchFilteredRows` (GH#2848 D8).
 */
export function convertGlobalSearchToFilterExpression(
  searchText: string | null | undefined,
  searchableFields: readonly string[] | null | undefined,
): FilterExpression | undefined {
  if (!searchText) return undefined
  const trimmed = searchText.trim()
  if (!trimmed) return undefined
  if (!searchableFields || searchableFields.length === 0) return undefined

  // Dedupe fields so a misconfigured column list can't generate an
  // exponential OR expression. Stable order (first-seen) keeps SQL plans
  // deterministic across renders.
  const seen = new Set<string>()
  const leafs: FilterExpression[] = []
  for (const field of searchableFields) {
    if (!field || seen.has(field)) continue
    seen.add(field)
    leafs.push({ op: 'contains', field, value: trimmed })
  }

  if (leafs.length === 0) return undefined
  if (leafs.length === 1) return leafs[0]!
  return { op: 'or', filters: leafs }
}

/**
 * AND-compose two optional FilterExpressions. Used to combine the user's
 * column-filter UI with the global search filter so both predicates must
 * hold on the SQL pushdown path.
 *
 *   composeFiltersAnd(undefined, undefined) → undefined
 *   composeFiltersAnd(a,         undefined) → a
 *   composeFiltersAnd(undefined, b)         → b
 *   composeFiltersAnd(a,         b)         → { op: 'and', filters: [a, b] }
 */
export function composeFiltersAnd(
  a: FilterExpression | undefined,
  b: FilterExpression | undefined,
): FilterExpression | undefined {
  if (!a && !b) return undefined
  if (!a) return b
  if (!b) return a
  return { op: 'and', filters: [a, b] }
}
