/* @vitest-environment node */

/**
 * Tests for useViewUrlSync serialization helpers (GH#1570)
 *
 * Pure-function + source-text analysis tests — no DOM needed, so we
 * run in the node environment to keep node:fs / node:path imports
 * usable (the default would inherit jsdom and externalize node
 * built-ins for browser compatibility).
 *
 * Pure serialization/deserialization functions that convert
 * between URL search params and VibeGrid store state.
 *
 * Also includes source-code analysis tests for:
 * - P2.5: Default view loading when no ?view= in URL
 * - GH#2689 B7: Active view config loading when ?view= IS in URL
 *   (regression test for partial-state bug where the list-view tab
 *   strip disappeared on browser refresh because the loader early-
 *   returned and never populated `defaultViewConfig`)
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, vi } from 'vitest'

// Mock `@/app/stores` BEFORE importing the hook module — importing
// useViewUrlSync transitively pulls in RootStore which constructs
// FocusAwareUndoRouter and touches `document` at module-eval time.
// We don't exercise the hook here (only its pure helpers and source
// text), so we replace the store module with no-op stubs.
vi.mock('@/app/stores', () => ({
  useFeatureFlags: () => ({ isEnabled: () => false }),
}))

import {
  serializeSort,
  deserializeSort,
  serializeFilters,
  deserializeFilters,
  serializeGroup,
  applySavedColumnState,
} from '../useViewUrlSync'
import { VisualStateStore } from '@/systems/vibegrid/stores/VisualStateStore'
import type { Column } from '@/systems/vibegrid/types'

const HOOK_PATH = join(__dirname, '../useViewUrlSync.ts')

// ====================================
// serializeSort
// ====================================

describe('serializeSort', () => {
  it('returns undefined for empty array', () => {
    expect(serializeSort([])).toBeUndefined()
  })

  it('returns undefined for null/undefined input', () => {
    expect(serializeSort(null as any)).toBeUndefined()
    expect(serializeSort(undefined as any)).toBeUndefined()
  })

  it('serializes single sort config to "field:direction"', () => {
    expect(serializeSort([{ field: 'due_date', direction: 'desc' }])).toBe('due_date:desc')
    expect(serializeSort([{ field: 'name', direction: 'asc' }])).toBe('name:asc')
  })

  it('only serializes first sort config (multi-sort not supported in URL)', () => {
    const result = serializeSort([
      { field: 'status', direction: 'asc' },
      { field: 'name', direction: 'desc' },
    ])
    expect(result).toBe('status:asc')
  })
})

// ====================================
// deserializeSort
// ====================================

describe('deserializeSort', () => {
  it('returns null for undefined input', () => {
    expect(deserializeSort(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(deserializeSort('')).toBeNull()
  })

  it('returns null for invalid format (no colon)', () => {
    expect(deserializeSort('nameonly')).toBeNull()
  })

  it('returns null for invalid direction', () => {
    expect(deserializeSort('name:invalid')).toBeNull()
    expect(deserializeSort('name:ASC')).toBeNull()
  })

  it('deserializes valid sort param', () => {
    expect(deserializeSort('due_date:desc')).toEqual([{ field: 'due_date', direction: 'desc' }])
    expect(deserializeSort('name:asc')).toEqual([{ field: 'name', direction: 'asc' }])
  })

  it('returns null for too many colons', () => {
    expect(deserializeSort('a:b:c')).toBeNull()
  })
})

// ====================================
// serializeSort <-> deserializeSort roundtrip
// ====================================

describe('sort roundtrip', () => {
  it('roundtrips single sort config', () => {
    const original = [{ field: 'created_at', direction: 'desc' as const }]
    const serialized = serializeSort(original)
    const deserialized = deserializeSort(serialized)
    expect(deserialized).toEqual(original)
  })
})

// ====================================
// serializeFilters
// ====================================

describe('serializeFilters', () => {
  it('returns undefined for empty array', () => {
    expect(serializeFilters([])).toBeUndefined()
  })

  it('returns undefined for null/undefined input', () => {
    expect(serializeFilters(null as any)).toBeUndefined()
    expect(serializeFilters(undefined as any)).toBeUndefined()
  })

  it('serializes filters to JSON string', () => {
    const filters = [{ field: 'status', operator: 'equals' as const, value: 'active' }]
    const result = serializeFilters(filters)
    expect(result).toBe(JSON.stringify(filters))
  })

  it('handles complex filter arrays', () => {
    const filters = [
      { field: 'status', operator: 'equals' as const, value: 'active' },
      { field: 'priority', operator: 'greater_than' as const, value: 5 },
    ]
    const result = serializeFilters(filters)
    expect(result).toBeDefined()
    expect(JSON.parse(result!)).toEqual(filters)
  })
})

// ====================================
// deserializeFilters
// ====================================

describe('deserializeFilters', () => {
  it('returns null for undefined input', () => {
    expect(deserializeFilters(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(deserializeFilters('')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(deserializeFilters('not-json')).toBeNull()
  })

  it('returns null for non-array JSON', () => {
    expect(deserializeFilters('{"key": "value"}')).toBeNull()
    expect(deserializeFilters('"string"')).toBeNull()
    expect(deserializeFilters('42')).toBeNull()
  })

  it('deserializes valid filter JSON array', () => {
    const filters = [{ field: 'status', operator: 'equals', value: 'active' }]
    const result = deserializeFilters(JSON.stringify(filters))
    expect(result).toEqual(filters)
  })
})

// ====================================
// filters roundtrip
// ====================================

describe('filters roundtrip', () => {
  it('roundtrips filter configs', () => {
    const original = [
      { field: 'status', operator: 'equals' as const, value: 'active' },
      { field: 'name', operator: 'contains' as const, value: 'test' },
    ]
    const serialized = serializeFilters(original)
    const deserialized = deserializeFilters(serialized)
    expect(deserialized).toEqual(original)
  })
})

// ====================================
// serializeGroup
// ====================================

describe('serializeGroup', () => {
  it('returns undefined for null config', () => {
    expect(serializeGroup(null)).toBeUndefined()
  })

  it('returns undefined for config with empty fields', () => {
    expect(serializeGroup({ fields: [] })).toBeUndefined()
  })

  it('returns field name of first group field', () => {
    expect(serializeGroup({ fields: [{ field: 'status' }] })).toBe('status')
  })

  it('only returns first field name (multi-group not supported in URL)', () => {
    const result = serializeGroup({
      fields: [{ field: 'status' }, { field: 'priority' }],
    })
    expect(result).toBe('status')
  })

  it('returns undefined when fields property is missing', () => {
    expect(serializeGroup({ fields: undefined as any })).toBeUndefined()
  })
})

// ====================================
// P2.5: DEFAULT VIEW LOADING (source analysis)
// ====================================

describe('useViewUrlSync default view loading (P2.5)', () => {
  let source: string

  beforeEach(() => {
    if (!existsSync(HOOK_PATH)) {
      throw new Error('useViewUrlSync.ts does not exist')
    }
    source = readFileSync(HOOK_PATH, 'utf-8')
  })

  it('should import loadViews + viewsStore for default view fetching (PR #3175)', () => {
    // The fetch was migrated off the bare orpcClient call to the
    // stale-while-revalidate helper pair: `loadViews` is the awaiting fetch,
    // `viewsStore` is the in-memory cache that drives synchronous first-paint
    // resolution before the network round-trip lands.
    expect(source).toContain("from '@/shared/data/orpc/domains/views-fetch'")
    expect(source).toContain("from '@/shared/data/stores/ViewsStore'")
    expect(source).toContain('loadViews')
    expect(source).toContain('viewsStore')
  })

  it('should call loadViews(entityType) to fetch the default view (PR #3175)', () => {
    // Replaces the previous direct `orpcClient.dataforge.views.list` call.
    expect(source).toContain('loadViews(entityType)')
  })

  it('should check initialSearchRef.current.view before loading default', () => {
    // When URL already has a view ID, skip default loading
    expect(source).toContain('initialSearchRef.current.view')
  })

  it('should find the view with is_default flag', () => {
    expect(source).toContain('is_default')
    expect(source).toMatch(/\.find\(/)
  })

  it('should call selectView when default view is found', () => {
    expect(source).toContain('selectView(defaultView')
  })

  it('should NOT call selectView when URL has ?view= param', () => {
    // Regression: the prior implementation early-returned the entire
    // effect when `?view=` was set, which dropped `defaultViewConfig`
    // population on the floor (GH#2689 B7). The fix still loads the
    // views list when `?view=` is set, but skips the selectView call
    // — re-applying the saved view's config would clobber any
    // URL-layered sort/filter/group overrides applied by the
    // URL→Store effect.
    //
    // Assert the new control-flow shape: when initialViewId is set,
    // we set defaultViewConfig from the matched view and `return`
    // BEFORE the selectView branch.
    expect(source).toMatch(/if\s*\(\s*initialViewId\s*\)/)
    expect(source).toMatch(/setDefaultViewConfig\(\s*resolved\?\.config[^)]*\)\s*[;\n][^]*?\breturn\b/)
  })

  it('should handle cancellation with cleanup function', () => {
    expect(source).toContain('let cancelled = false')
    expect(source).toContain('cancelled = true')
  })

  it('should log when loading default view', () => {
    expect(source).toContain('Loading default view')
  })

  it('should warn on failure to load views', () => {
    // Renamed message to reflect the loader's broader scope (loads
    // views regardless of whether `?view=` is in the URL).
    expect(source).toContain('Failed to load views')
  })

  it('should include selectView in useEffect dependencies', () => {
    // The view-loading useEffect should depend on selectView. PR #3175
    // added `stores` to the same deps array (cached-apply now reads
    // `stores.visualStateStore`), so anchor on the comma-separated form.
    expect(source).toMatch(/\[isEnabled, entityType, selectView(?:,|\])/)
  })
})

// ====================================
// GH#2689 B7 regression: active view config must populate even when
// ?view= is in the URL (e.g., after browser refresh)
// ====================================

// ====================================
// selectView regression: selecting a saved view must serialize the view's
// full state (sort/filter/group/mode/q) into the URL alongside `?view=<id>`.
//
// Bug shape (pre-fix): selectView wrote the view's config into the
// VibeGrid stores via runInAction, then called navigate with ONLY
// `?view=<id>` (no `?sort=` / `?filter=` / etc). Because the URL→Store
// effect's deps array includes `search.view`, the effect re-fired when
// `view=<id>` landed in the URL, then symmetric-cleared the store back
// to empty (deserializeSort(undefined) → null → []; same for filters,
// group, etc), wiping out the view config that runInAction had just
// written.
//
// Fix shape: navigate now also serializes sort/filter/group/mode/q from
// `view.config`. URL→Store re-fire applies the SAME values it just saw
// — a no-op clobber — and the view's filter/sort survive.
//
// Asserted via source-text analysis (consistent with the GH#2689 B7
// regression block below). Behavioral tests via renderHook would
// require mocking the full VibeGrid store surface + TanStack Router
// + orpcClient; the source-text approach is the established pattern
// in this file.
// ====================================

describe('useViewUrlSync selectView URL serialization regression', () => {
  let source: string

  beforeEach(() => {
    if (!existsSync(HOOK_PATH)) {
      throw new Error('useViewUrlSync.ts does not exist')
    }
    source = readFileSync(HOOK_PATH, 'utf-8')
  })

  // Extract the body of the `selectView` useCallback so all assertions
  // run against the same scope. The useCallback's first arg is an arrow
  // function `(view: EntityViewRow) => { ... }`. We slice from
  // `const selectView = useCallback(` to the closing `, [` of the
  // deps array.
  function selectViewBody(): string {
    const match = source.match(
      /const selectView = useCallback\(\s*\(\s*view\s*:\s*EntityViewRow\s*\)\s*=>\s*\{([\s\S]*?)\n\s+\},\s*\[/,
    )
    if (!match) {
      throw new Error('selectView useCallback not found in useViewUrlSync.ts')
    }
    return match[1]
  }

  it('selectView navigates with view= AND sort= derived from view.config.sortBy', () => {
    const body = selectViewBody()
    // The navigate object literal must include `sort: serializeSort(...)`.
    expect(body).toMatch(/sort:\s*serializeSort\(/)
    // And the sort source must trace back to `config.sortBy` (typed via
    // Array.isArray-guarded local).
    expect(body).toMatch(/Array\.isArray\(config\.sortBy\)/)
  })

  it('selectView navigates with view= AND filter= derived from view.config.filters', () => {
    const body = selectViewBody()
    expect(body).toMatch(/filter:\s*serializeFilters\(/)
    expect(body).toMatch(/Array\.isArray\(config\.filters\)/)
  })

  it('selectView navigates with group= derived from view.config.groupConfig.fields[0].field', () => {
    const body = selectViewBody()
    // The serialized group param threads through a local that reads
    // groupConfig.fields[0].field with null-safety.
    expect(body).toMatch(/group:\s*groupParam/)
    expect(body).toMatch(/config\.groupConfig/)
    expect(body).toMatch(/\.fields\[0\]/)
  })

  it('selectView navigates with mode= ONLY when viewMode is gantt or kanban', () => {
    const body = selectViewBody()
    // The mode param must be undefined when viewMode is 'table' (the
    // default), otherwise the Store→URL reaction would never strip the
    // param after the user switches back to table view from a saved
    // gantt view.
    expect(body).toMatch(/mode:\s*modeParam/)
    expect(body).toMatch(
      /config\.viewMode === 'gantt'[\s\S]*?config\.viewMode === 'kanban'/,
    )
  })

  it('selectView navigates with q= ONLY when globalSearchText is non-empty after trim', () => {
    const body = selectViewBody()
    expect(body).toMatch(/q:\s*qParam/)
    expect(body).toMatch(/config\.globalSearchText[\s\S]*?trim\(\)\.length > 0/)
  })

  it('selectView preserves the spread-prev pattern in the search builder', () => {
    // The navigate call must still spread prev so unrelated search
    // params (e.g. ?project=<id> for project-scoped views) survive
    // the view switch. Pre-fix shape kept this; the fix must too.
    const body = selectViewBody()
    expect(body).toMatch(/search:\s*\(\s*prev\s*:[\s\S]*?\)\s*=>\s*\(\s*\{[\s\S]*?\.\.\.prev/)
  })

  it('selectView still sets view= to the selected view id', () => {
    const body = selectViewBody()
    expect(body).toMatch(/view:\s*view\.id/)
  })
})

// ====================================
// selectView regression: column visibility must be a TRUE REPLACE on view
// switch, not an additive merge. Pre-fix shape looped only the keys in the
// saved config and assigned each into the existing
// visualStateStore.columnVisibility object — keys absent from the saved
// config (manual hides made between switches, or columns added to the
// schema after the view was saved) silently survived the switch, so
// "switch view" felt half-applied. Fix shape: rebuild a fresh map keyed by
// the current schema columns, fall back to !col.hidden for columns absent
// from the saved snapshot, and assign the whole object so MobX sees a
// single reactive update.
// ====================================

describe('useViewUrlSync selectView column visibility replace regression', () => {
  let source: string

  beforeEach(() => {
    if (!existsSync(HOOK_PATH)) {
      throw new Error('useViewUrlSync.ts does not exist')
    }
    source = readFileSync(HOOK_PATH, 'utf-8')
  })

  // Reuse the same body-slicer pattern the sibling describe block uses so
  // the assertions are scoped to selectView and don't accidentally match
  // unrelated code elsewhere in the hook.
  function selectViewBody(): string {
    const match = source.match(
      /const selectView = useCallback\(\s*\(\s*view\s*:\s*EntityViewRow\s*\)\s*=>\s*\{([\s\S]*?)\n\s+\},\s*\[/,
    )
    if (!match) {
      throw new Error('selectView useCallback not found in useViewUrlSync.ts')
    }
    return match[1]
  }

  // GH#3180 follow-up: the TRUE-REPLACE logic was extracted into the
  // file-local `applySavedColumnState` helper (used by both the hot-apply
  // selectView path AND the cold-apply `?view=<id>` path). Detailed
  // assertions about the rebuild now run against the helper body; the
  // invocation assertion runs against selectView's body.
  function applySavedColumnStateBody(): string {
    const match = source.match(
      /export function applySavedColumnState\([\s\S]*?\)\s*:\s*void\s*\{([\s\S]*?)\n\}\n/,
    )
    if (!match) {
      throw new Error(
        'applySavedColumnState helper not found in useViewUrlSync.ts',
      )
    }
    return match[1]
  }

  it('selectView invokes the applySavedColumnState helper', () => {
    // The hot-apply path delegates to the helper rather than inlining the
    // rebuild logic. This guards against re-inlining the body (which would
    // diverge from the cold-load apply path).
    const body = selectViewBody()
    expect(body).toContain('applySavedColumnState(visualStateStore, config)')
  })

  it('builds a fresh column-visibility map (does not mutate in-place)', () => {
    const body = applySavedColumnStateBody()
    expect(body).toContain('const next: Record<string, boolean> = {}')
  })

  it('iterates the schema columns (visualStateStore.columns), not just saved-config keys', () => {
    const body = applySavedColumnStateBody()
    expect(body).toContain('for (const col of visualStateStore.columns)')
  })

  it('falls back to !col.hidden for columns absent from the saved snapshot', () => {
    const body = applySavedColumnStateBody()
    expect(body).toContain('next[col.id] = col.id in vis ? !!vis[col.id] : !col.hidden')
  })

  it('replaces columnVisibility wholesale (single reactive assignment)', () => {
    const body = applySavedColumnStateBody()
    expect(body).toContain('visualStateStore.columnVisibility = next')
  })

  it('no longer writes per-key into the existing columnVisibility object', () => {
    // This is the key regression guard: the old per-key loop assignment
    // must be gone. If anyone reintroduces it (e.g. via a "merge instead
    // of replace" revert), this test fires.
    const body = applySavedColumnStateBody()
    expect(body).not.toContain('visualStateStore.columnVisibility[colId] = visible')
  })
})

describe('useViewUrlSync active view config loading (GH#2689 B7)', () => {
  let source: string

  beforeEach(() => {
    if (!existsSync(HOOK_PATH)) {
      throw new Error('useViewUrlSync.ts does not exist')
    }
    source = readFileSync(HOOK_PATH, 'utf-8')
  })

  it('should NOT have a top-level early return when initialSearchRef.current.view is set', () => {
    // The pre-fix shape was:
    //   if (!isEnabled) return
    //   if (initialSearchRef.current.view) return // URL already has a view
    //
    // That second guard caused the bug: when the URL named a view
    // (e.g., right after a hard refresh, since the prior selectView
    // call had mutated the URL via `replace: true`), the loader
    // never ran, so `defaultViewConfig` stayed null and consumers
    // like `listExtraTabs` and `listWidgets` rendered nothing.
    expect(source).not.toMatch(
      /if\s*\(\s*initialSearchRef\.current\.view\s*\)\s*return\s*\/\/\s*URL already has a view/,
    )
  })

  it('should resolve activeViewId from URL when ?view= is set', () => {
    // The fix branches on `initialViewId` and finds the matching
    // view by id so `defaultViewConfig` (consumed as
    // `activeViewConfig` for tab-strip + widget rendering) is
    // populated from the correct view.
    expect(source).toMatch(/const initialViewId = initialSearchRef\.current\.view/)
    expect(source).toMatch(/result\.views\.find\([\s\S]*?v\.id === initialViewId/)
  })

  it('should call setDefaultViewConfig in the ?view= branch', () => {
    // This is the concrete bug fix: previously this assignment never
    // ran when the URL had a view id, so `listExtraTabs` resolved to
    // an empty array and the tab strip disappeared on refresh.
    // Match: inside the `if (initialViewId) { ... }` block, we call
    // setDefaultViewConfig before returning.
    // Match the `if (initialViewId) { ... }` block.
    // Indent-tolerant: the spec restructure flattened the inner indentation
    // by one level (no `try/catch` wrapper); accept any indent on the
    // closing brace. Pair the brace with the trailing blank line to anchor
    // to the right `}` (the inner `if (activeView) {` blocks are nested).
    const block = source.match(/if \(initialViewId\)\s*\{([\s\S]*?)\n\s*\}\n\n/)
    expect(block).not.toBeNull()
    expect(block![1]).toContain('setDefaultViewConfig(')
  })

  it('should NOT call selectView when URL already has ?view=', () => {
    // selectView would clobber URL-layered sort/filter overrides on
    // a deep-link, since the URL→Store effect has already applied
    // them. Only call selectView in the default-view branch.
    // Match the `if (initialViewId) { ... }` block.
    // Indent-tolerant: the spec restructure flattened the inner indentation
    // by one level (no `try/catch` wrapper); accept any indent on the
    // closing brace. Pair the brace with the trailing blank line to anchor
    // to the right `}` (the inner `if (activeView) {` blocks are nested).
    const block = source.match(/if \(initialViewId\)\s*\{([\s\S]*?)\n\s*\}\n\n/)
    expect(block).not.toBeNull()
    expect(block![1]).not.toContain('selectView(')
  })

  it('should still call selectView in the no-?view= default branch', () => {
    // The default-view path is unchanged — pick is_default, set
    // config, apply via selectView (which mutates the URL to add
    // `?view=<id>`).
    expect(source).toContain('selectView(defaultView')
  })

  it('should handle missing matched view gracefully (no orphan selectView)', () => {
    // If the URL names a view that no longer exists (deleted, stale
    // bookmark), fall back to the default view's config so widgets
    // and tabs still render. The fix uses chained `??` to fall back
    // through (matched view → default view → first view → null).
    expect(source).toMatch(/activeView\s*\?\?[\s\S]*?is_default[\s\S]*?\?\?[\s\S]*?result\.views\[0\]/)
  })
})

// ====================================
// GH#3119 follow-up: filterGroup must round-trip through selectView,
// URL→Store, and the cold-load 4th fix. Pre-fix shape only touched the
// legacy `filters[]` array — filters added via the FilterBuilder UI
// (which writes to `filterGroup` and clears `filters[]`) were lost on
// save and/or bled across view switches.
//
// Assertions are source-text only (consistent with the rest of this
// file). Behavioral renderHook coverage would require mocking the full
// VibeGrid store surface + TanStack Router + orpcClient.
// ====================================

describe('useViewUrlSync filterGroup round-trip (GH#3119 follow-up)', () => {
  let source: string

  beforeEach(() => {
    if (!existsSync(HOOK_PATH)) {
      throw new Error('useViewUrlSync.ts does not exist')
    }
    source = readFileSync(HOOK_PATH, 'utf-8')
  })

  // Reuse the selectView body slicer from sibling describe blocks.
  function selectViewBody(): string {
    const match = source.match(
      /const selectView = useCallback\(\s*\(\s*view\s*:\s*EntityViewRow\s*\)\s*=>\s*\{([\s\S]*?)\n\s+\},\s*\[/,
    )
    if (!match) {
      throw new Error('selectView useCallback not found in useViewUrlSync.ts')
    }
    return match[1]
  }

  it('imports FilterGroup type for filterGroup casts', () => {
    // The hook needs the FilterGroup type to cast config.filterGroup
    // before handing it to applyFilterGroup. Import lives on its own
    // line since the existing `from '@/systems/vibegrid/types'` line
    // exports FilterConfig but not FilterGroup.
    expect(source).toContain(
      "import type { FilterGroup } from '@/systems/vibegrid/types/filter-types'",
    )
  })

  it('selectView calls visualStateStore.applyFilterGroup when config.filterGroup is set', () => {
    const body = selectViewBody()
    expect(body).toContain(
      'visualStateStore.applyFilterGroup(config.filterGroup as FilterGroup)',
    )
  })

  it('selectView calls visualStateStore.clearFilterGroup when config.filterGroup is absent', () => {
    const body = selectViewBody()
    // The else branch of the filterGroup guard MUST clear, otherwise
    // filterGroup bleeds across view switches.
    expect(body).toContain('visualStateStore.clearFilterGroup()')
  })

  it('URL→Store effect clears filterGroup when ?filter= is present', () => {
    // Inside the URL→Store effect, after deserializing search.filter,
    // we clear filterGroup only when the URL actually carried a
    // legacy `?filter=`. When absent, we leave filterGroup alone —
    // the saved-view apply path owns that dimension.
    expect(source).toMatch(
      /const filterConfig = deserializeFilters\(search\.filter\)[\s\S]*?if \(filterConfig\) \{[\s\S]*?visualStateStore\.clearFilterGroup\(\)/,
    )
  })

  it('cold-load 4th fix applies filterGroup from saved view config', () => {
    // The cold-load path (URL has ?view=<id>, no ?filter=) must
    // apply the saved view's filterGroup so the user's UI-applied
    // filter survives hard refresh.
    expect(source).toMatch(
      /if \(!initialSearch\.filter\) \{[\s\S]*?visualStateStore\.applyFilterGroup\(config\.filterGroup as FilterGroup\)[\s\S]*?\} else \{[\s\S]*?visualStateStore\.clearFilterGroup\(\)/,
    )
  })

  it('cold-load 4th fix references both applyFilterGroup and clearFilterGroup', () => {
    // Belt-and-suspenders presence check — both branches must exist.
    expect(source).toContain('applyFilterGroup')
    expect(source).toContain('clearFilterGroup')
  })
})

// ====================================
// Bug B (PR#10 follow-up): saved-view state must not leak across entity
// routes. Root cause was React state held by `useViewUrlSync`
// (activeViewName, defaultViewConfig, initialSearchRef) surviving in-place
// rerenders of `EntityListViewUrlSync` when `entityName` changed via
// sidebar nav between entity routes (e.g. RFI → Photo). The hook itself is
// correct — the fix is to make the consumer remount on entity change by
// keying `<EntityListViewUrlSync>` on `entityName`.
//
// The actual code change lives in
// `apps/web/src/features/entities/components/EntityListView.tsx`, so the
// regression guard is asserted via source-text against that file (matches
// the pattern used by sibling tests in this file + EntityListView-save-view
// .test.ts). Behavioral coverage via renderHook would require mocking the
// full VibeGrid store surface + TanStack Router + orpcClient; the
// source-text approach pins the literal fix that prevents the leak.
//
// This test must FAIL without the fix (key prop absent) and PASS with it.
// ====================================

describe('EntityListView remounts EntityListViewUrlSync on entityName change (Bug B)', () => {
  const ENTITY_LIST_VIEW_PATH = join(
    __dirname,
    '../../components/EntityListView.tsx',
  )

  let entityListViewSource: string

  beforeEach(() => {
    if (!existsSync(ENTITY_LIST_VIEW_PATH)) {
      throw new Error('EntityListView.tsx does not exist')
    }
    entityListViewSource = readFileSync(ENTITY_LIST_VIEW_PATH, 'utf-8')
  })

  it('passes key={entityName} to <EntityListViewUrlSync> so it remounts on entity nav', () => {
    // Match the opening JSX of <EntityListViewUrlSync> and assert that
    // `key={entityName}` appears among its attributes. Without the key,
    // the hook's React state (activeViewName, defaultViewConfig, the
    // initialSearchRef captured at mount) survives the entity change and
    // bleeds RFI's "open1" saved-view label / config into the Photo
    // entity grid.
    //
    // Match the opening tag (everything up to the first `>` that's not
    // inside an attribute). The `\s*key=\{entityName\}` clause must
    // appear before the closing `>` of the opening tag.
    const openingTag = entityListViewSource.match(
      /<EntityListViewUrlSync\b([\s\S]*?)\/?>/,
    )
    expect(openingTag).not.toBeNull()
    expect(openingTag![1]).toMatch(/\bkey=\{entityName\}/)
  })

  it('the key prop is the FIRST attribute (idiomatic placement)', () => {
    // Keep the key prop adjacent to the component name so a future reader
    // sees the remount intent immediately. This also prevents accidental
    // reordering that would buryit deep in the prop list.
    expect(entityListViewSource).toMatch(
      /<EntityListViewUrlSync\s*\n?\s*key=\{entityName\}/,
    )
  })

  it('has a one-sentence comment naming the leak class above the JSX element', () => {
    // The spec asks for an inline rationale so future readers do not
    // remove the key thinking it's redundant. The comment must mention
    // both the hook (useViewUrlSync) and at least one of the three
    // leaking state values so a grep on the leak class lands here.
    //
    // Match a `{/* ... */}` JSX comment in the few lines preceding the
    // opening tag.
    const blockMatch = entityListViewSource.match(
      /(\{\/\*[\s\S]*?\*\/\})\s*\n\s*<EntityListViewUrlSync\b/,
    )
    expect(blockMatch).not.toBeNull()
    const comment = blockMatch![1]
    // Naming the hook anchors the comment to the actual leak source.
    expect(comment).toContain('useViewUrlSync')
    // Naming at least one of the leaking values (activeViewName /
    // defaultViewConfig / initialSearchRef) documents what would leak
    // without the key.
    expect(comment).toMatch(/activeViewName|defaultViewConfig|initialSearchRef/)
  })
})

// ====================================
// GH#3180: column-state save+restore (Bug C)
//
// The user-observed bug had two failure modes:
//   (A) Cold-load (`?view=<id>` on mount) NEVER applied columnVisibility or
//       columnOrder — only filters/filterGroup/sortBy/groupConfig. So after
//       a hard refresh the grid always showed schema-default columns,
//       regardless of what the saved view recorded.
//   (B) Hot apply (`selectView`) had H1 race: when selectView fires before
//       TableCoreStore.init() has hydrated VisualStateStore.columns
//       (the cached `applyLoadedViews` synchronous path is the trigger),
//       the merge loop writes `next = {}`, then `initializeColumns`'s
//       `Object.keys(columnVisibility).length === 0` guard refills with
//       all-visible defaults — silently clobbering the saved hides.
//
// P1 investigation attribution:
//   - H1 (race): CONFIRMED. The cached `applyLoadedViews` path in
//     useViewUrlSync.ts:597-599 fires synchronously on mount; schema load
//     in TableCoreStore.init() is fully async. Default-view selectView()
//     fires before columns are hydrated.
//   - H2 (MobX spread): RULED OUT. `@observable columnVisibility:
//     Record<string, boolean>` is a plain object proxy that spreads
//     correctly in MobX 6. The B2 audit-fix (Object.fromEntries keyed by
//     live columns) was applied as defense-in-depth anyway.
//   - H3 (PersistenceStore clobber): RULED OUT in steady state; subsumed
//     by H1 fast-path. With selectView writing a non-empty record into
//     columnVisibility, the init guard at VisualStateStore.ts:585-587 no
//     longer fires, so PS-load timing relative to selectView no longer
//     determines the outcome.
//
// Tests below assert the source-text shape that fixes both failure modes,
// consistent with the existing source-text-driven test pattern in this
// file. Behavioral coverage via renderHook would require mocking the full
// VibeGrid store surface + TanStack Router + orpcClient + ViewsStore +
// PersistenceStore (the same stack the sibling test blocks above sidestep).
// ====================================

describe('GH#3180: column-state save+restore (Bug C)', () => {
  let source: string

  beforeEach(() => {
    if (!existsSync(HOOK_PATH)) {
      throw new Error('useViewUrlSync.ts does not exist')
    }
    source = readFileSync(HOOK_PATH, 'utf-8')
  })

  // Reuse the selectView body slicer from sibling describe blocks so the
  // hot-apply assertions are scoped to selectView and don't accidentally
  // match unrelated code elsewhere in the hook.
  function selectViewBody(): string {
    const match = source.match(
      /const selectView = useCallback\(\s*\(\s*view\s*:\s*EntityViewRow\s*\)\s*=>\s*\{([\s\S]*?)\n\s+\},\s*\[/,
    )
    if (!match) {
      throw new Error('selectView useCallback not found in useViewUrlSync.ts')
    }
    return match[1]
  }

  // Slicer for the cold-load apply block. The cold-load path lives inside
  // `applyLoadedViews`'s `if (initialViewId) { ... }` branch. Slice from the
  // anchor (`const initialSearch = initialSearchRef.current`) down to the
  // matching `requestAnimationFrame(...)` call that unsuppresses URL sync —
  // that line is the canonical end-of-runInAction in this branch.
  function coldLoadApplyBody(): string {
    const match = source.match(
      /const initialSearch = initialSearchRef\.current([\s\S]*?)requestAnimationFrame\(\(\) => \{\s*\n\s+suppressUrlUpdateRef\.current = false\s*\n\s+\}\)\s*\n\s+\}\s*\n\s+\}\s*\n\s+return/,
    )
    if (!match) {
      throw new Error('cold-load apply block not found in useViewUrlSync.ts')
    }
    return match[1]
  }

  // GH#3180 follow-up: the apply logic was extracted into the file-local
  // `applySavedColumnState` helper shared by both the hot apply
  // (selectView) and the cold apply (`?view=<id>` resolved on mount).
  // Detailed B3/B4/B6/B7 assertions run against the helper body; the
  // selectView + cold-load slicers above are used only to assert the
  // helper is invoked.
  function applySavedColumnStateBody(): string {
    const match = source.match(
      /export function applySavedColumnState\([\s\S]*?\)\s*:\s*void\s*\{([\s\S]*?)\n\}\n/,
    )
    if (!match) {
      throw new Error(
        'applySavedColumnState helper not found in useViewUrlSync.ts',
      )
    }
    return match[1]
  }

  // ----- Helper invocation (both call sites) -----

  it('selectView invokes applySavedColumnState (hot-apply path)', () => {
    const body = selectViewBody()
    expect(body).toContain('applySavedColumnState(visualStateStore, config)')
  })

  it('cold-load invokes applySavedColumnState (cold-apply path)', () => {
    const body = coldLoadApplyBody()
    expect(body).toContain('applySavedColumnState(visualStateStore, config)')
  })

  // ----- B3 + B7 (apply-column-order: merge + stale-id drop) -----

  it('helper applies config.columnOrder via setColumnOrder', () => {
    const body = applySavedColumnStateBody()
    // The Array.isArray guard MUST be present so absent/null/empty configs
    // leave the live order untouched (preserves localStorage / schema
    // default order on legacy views that never recorded columnOrder).
    expect(body).toMatch(/Array\.isArray\(config\.columnOrder\)/)
    expect(body).toContain('visualStateStore.setColumnOrder')
  })

  it('helper filters saved columnOrder to live column ids (B7: stale-id drop)', () => {
    const body = applySavedColumnStateBody()
    // The filter step is what implements B7 — phantom ids in the saved order
    // (schema field removed since save) are silently dropped before write.
    expect(body).toMatch(
      /const liveIds = new Set\(visualStateStore\.columns\.map\(\(c\)\s*=>\s*c\.id\)\)/,
    )
    expect(body).toMatch(/saved\.filter\(\(id\)\s*=>\s*liveIds\.has\(id\)\)/)
  })

  it('helper appends current-schema columns missing from saved order (B6: new-column merge)', () => {
    const body = applySavedColumnStateBody()
    // The tail-append step is what implements B6 — schema columns added
    // AFTER the view was saved appear at the end of the order, with their
    // schema-default visibility (handled by VisualStateStore on the
    // visibility side).
    expect(body).toMatch(/const inSaved = new Set\(filtered\)/)
    expect(body).toMatch(
      /visualStateStore\.columns\s*\n?\s*\.filter\(\(c\)\s*=>\s*!inSaved\.has\(c\.id\)\)/,
    )
    expect(body).toMatch(/setColumnOrder\(\[\.\.\.filtered,\s*\.\.\.tail\]\)/)
  })

  // ----- B4 (apply-column-visibility-hot, H1 race fix) -----

  it('helper has an H1 fast-path branch when visualStateStore.columns is empty', () => {
    const body = applySavedColumnStateBody()
    // The H1 fast-path: when columns are empty (apply ran before
    // schema hydrated), write the saved record DIRECTLY so the init
    // guard at VisualStateStore.ts:585-587 sees a non-empty record and
    // skips the all-visible refill. The merge code at :594-607 then
    // back-fills defaults for net-new schema columns on its own.
    expect(body).toMatch(/visualStateStore\.columns\.length === 0/)
    // The fast-path must write `vis` (the raw saved record) directly, not
    // a freshly-built `next` map that would be empty.
    expect(body).toMatch(/visualStateStore\.columnVisibility = vis/)
  })

  it('helper preserves the TRUE REPLACE rebuild when columns ARE hydrated', () => {
    const body = applySavedColumnStateBody()
    // The else branch must still rebuild the visibility record keyed by
    // the live schema columns so B6 (new columns: !col.hidden) and
    // B7 (stale ids: dropped) are also satisfied at apply time when
    // columns are hydrated.
    expect(body).toContain('const next: Record<string, boolean> = {}')
    expect(body).toContain('for (const col of visualStateStore.columns)')
    expect(body).toContain(
      'next[col.id] = col.id in vis ? !!vis[col.id] : !col.hidden',
    )
    expect(body).toContain('visualStateStore.columnVisibility = next')
  })

  // ----- B5 (drag/toggle → hasUnsavedChanges) -----

  // Slicer for the unsaved-changes reaction body — anchor on the comment
  // block that opens the reaction so we don't accidentally match the
  // sibling `useViewUrlSync.storeToUrl` reaction (which has the same
  // tracked-observable shape but doesn't gate hasUnsavedChanges).
  function unsavedChangesReactionBody(): string {
    const match = source.match(
      /When user modifies the grid while a view is active([\s\S]*?)name:\s*'useViewUrlSync\.unsavedChanges'/,
    )
    if (!match) {
      throw new Error(
        'unsaved-changes reaction comment not found in useViewUrlSync.ts',
      )
    }
    return match[1]
  }

  it('unsaved-changes reaction tracks columnOrder', () => {
    // The reaction's tracked-snapshot object must include columnOrder so
    // drag-reorder flips the amber dot in the ViewPicker trigger.
    const body = unsavedChangesReactionBody()
    expect(body).toMatch(
      /columnOrder:\s*visualStateStore\.columnOrder\.slice\(\)/,
    )
  })

  it('unsaved-changes reaction tracks columnVisibility', () => {
    // Same for visibility toggle — the Columns dropdown must flip the
    // amber dot too. Snapshot is a plain spread (matches the existing
    // shape for other tracked observables).
    const body = unsavedChangesReactionBody()
    expect(body).toMatch(
      /columnVisibility:\s*\{\s*\.\.\.\s*visualStateStore\.columnVisibility\s*\}/,
    )
  })

  // ----- B8 (cold-load `?view=<id>` apply) -----
  //
  // The detailed B8 shape assertions live on the helper body (above) since
  // the cold-load path delegates to the same helper. These specifically
  // verify the cold-load path doesn't regress to skipping column state.

  it('cold-load apply body references applySavedColumnState (not skipped)', () => {
    // Belt-and-suspenders: the cold-load branch must call the helper, not
    // silently no-op. Without this, hard-refresh would once again show
    // schema-default columns regardless of what the saved view recorded.
    const body = coldLoadApplyBody()
    expect(body).toContain('applySavedColumnState')
  })

  // ----- handleSaveView snapshot (B1 + B2 in EntityListView.tsx) -----
  // EntityListView.tsx is the source of truth for the save snapshot — these
  // assertions live in entity-list-view scope so renaming the snapshot in
  // EntityListView (without updating the apply path) trips both files.

  it('EntityListView.handleSaveView snapshots columnOrder (B1)', () => {
    const entityListViewPath = join(
      __dirname,
      '../../components/EntityListView.tsx',
    )
    const entityListViewSource = readFileSync(entityListViewPath, 'utf-8')
    // The save snapshot at handleSaveView must include a fresh slice() of
    // visualStateStore.columnOrder so the post-save oRPC `views.create`
    // call persists the current drag-reordered column order.
    expect(entityListViewSource).toMatch(
      /columnOrder:\s*visualStateStore\.columnOrder\.slice\(\)/,
    )
  })

  it('EntityListView.handleSaveView builds columnVisibility keyed by live columns (B2 audit-fix)', () => {
    const entityListViewPath = join(
      __dirname,
      '../../components/EntityListView.tsx',
    )
    const entityListViewSource = readFileSync(entityListViewPath, 'utf-8')
    // The B2 audit-fix replaces `{...visualStateStore.columnVisibility}` with
    // an explicit Object.fromEntries keyed by the live schema columns. This
    // is defense-in-depth against any future MobX-observable-shape drift
    // (H2 was ruled out for the current implementation but the safer
    // snapshot shape is forward-compatible).
    expect(entityListViewSource).toMatch(
      /columnVisibility:\s*Object\.fromEntries\(\s*\n?\s*visualStateStore\.columns\.map/,
    )
    // And the snapshot value must be `!== false` (rather than truthy
    // coercion), so explicit `false` entries persist and `undefined` /
    // missing entries default to `true` (the schema-default visible).
    expect(entityListViewSource).toMatch(
      /visualStateStore\.columnVisibility\[c\.id\]\s*!==\s*false/,
    )
  })

  // ====================================
  // GH#3180 B4: H1 fast-path BEHAVIORAL tests
  //
  // These two tests intentionally break this file's source-text-only
  // convention to lock the H1 fast-path RUNTIME behavior. They exercise the
  // extracted `applySavedColumnState` helper against a live
  // VisualStateStore instance — verifying that:
  //
  //   (1) When `visualStateStore.columns` is empty (the H1 race condition —
  //       selectView fires before TableCoreStore.init has hydrated the
  //       schema), the helper writes the saved `columnVisibility` record
  //       DIRECTLY (not a freshly-built `{}` that the init guard at
  //       VisualStateStore.ts:585-587 would then refill with all-visible
  //       defaults, silently clobbering the saved hides).
  //
  //   (2) When `visualStateStore.columns` IS hydrated, the helper rebuilds
  //       the visibility record keyed by the LIVE schema columns — falling
  //       back to `!col.hidden` for columns absent from the saved snapshot
  //       (B6: new schema columns added after save) and dropping ids from
  //       the saved snapshot that no longer exist in the schema (B7).
  //
  // Source-text assertions above pin the literal code shape; these
  // behavioral tests pin the runtime SEMANTICS so a future refactor that
  // changes the code shape but breaks the H1 race fix would fail here too.
  // ====================================
  describe('applySavedColumnState runtime behavior (H1 fast-path)', () => {
    it('H1 fast-path: writes saved columnVisibility DIRECTLY when columns are empty', () => {
      const store = new VisualStateStore()
      expect(store.columns.length).toBe(0)
      expect(Object.keys(store.columnVisibility).length).toBe(0)

      const config = {
        columnVisibility: { a: false, b: true, c: false },
      }
      applySavedColumnState(store, config)

      // The fast-path must produce EXACTLY the saved record — not an empty
      // object (which the init guard at VisualStateStore.ts:585-587 would
      // then refill with all-visible defaults).
      expect(store.columnVisibility).toEqual({ a: false, b: true, c: false })
      // And the record must be non-empty — this is the load-bearing
      // invariant that lets the init guard short-circuit and preserve the
      // saved hides through subsequent column hydration.
      expect(Object.keys(store.columnVisibility).length).toBe(3)
    })

    it('hydrated branch: rebuilds columnVisibility keyed by LIVE columns (B6 + B7)', () => {
      const store = new VisualStateStore()
      // Hydrate the store with three live columns. Two of them have schema
      // defaults (`hidden: false` ⇒ default visible).
      const columns: Column[] = [
        {
          id: 'a',
          label: 'A',
          type: 'text',
          fieldName: 'a',
          fieldType: { type: 'text' },
        } as any,
        {
          id: 'b',
          label: 'B',
          type: 'text',
          fieldName: 'b',
          fieldType: { type: 'text' },
        } as any,
        {
          id: 'd_new',
          label: 'D (new)',
          type: 'text',
          fieldName: 'd_new',
          fieldType: { type: 'text' },
          hidden: false,
        } as any,
      ]
      ;(store as any).columns = columns

      // Saved record predates the schema change: it carries `c` (stale —
      // removed from schema since save) and lacks `d_new` (added since
      // save). `a` is explicitly hidden, `b` is explicitly visible.
      const config = {
        columnVisibility: { a: false, b: true, c: false },
      }
      applySavedColumnState(store, config)

      // B7 (stale-id drop): `c` is silently dropped — not present on
      // visualStateStore.columns, so no entry in the rebuilt record.
      // B6 (new-column merge): `d_new` is back-filled with `!col.hidden`
      // (visible by default since `hidden: false`).
      // Saved hides for live columns are preserved (`a: false`).
      expect(store.columnVisibility).toEqual({
        a: false,
        b: true,
        d_new: true,
      })
      expect('c' in store.columnVisibility).toBe(false)
    })
  })
})
