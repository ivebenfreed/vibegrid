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
} from '../useViewUrlSync'

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

  it('should import orpcClient for default view fetching', () => {
    expect(source).toContain("from '@/shared/data/orpc/client'")
    expect(source).toContain('orpcClient')
  })

  it('should call orpcClient.dataforge.views.list to fetch default view', () => {
    expect(source).toContain('orpcClient.dataforge.views.list')
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
    // The view-loading useEffect should depend on selectView
    expect(source).toContain('selectView]')
  })
})

// ====================================
// GH#2689 B7 regression: active view config must populate even when
// ?view= is in the URL (e.g., after browser refresh)
// ====================================

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
    const block = source.match(/if \(initialViewId\)\s*\{([\s\S]*?)\n\s{8}\}/)
    expect(block).not.toBeNull()
    expect(block![1]).toContain('setDefaultViewConfig(')
  })

  it('should NOT call selectView when URL already has ?view=', () => {
    // selectView would clobber URL-layered sort/filter overrides on
    // a deep-link, since the URL→Store effect has already applied
    // them. Only call selectView in the default-view branch.
    const block = source.match(/if \(initialViewId\)\s*\{([\s\S]*?)\n\s{8}\}/)
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
