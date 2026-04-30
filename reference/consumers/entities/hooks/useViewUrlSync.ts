/**
 * useViewUrlSync - Bidirectional URL <-> VibeGrid Store Sync (GH#1570)
 *
 * Provides URL state persistence for entity list views so that
 * sort, filter, group, mode, and search state are reflected in the URL
 * and can be shared via copy-link.
 *
 * Sync direction rules:
 * 1. URL -> Store on page load (URL params win over defaults)
 * 2. Store -> URL on user interaction (debounced, replace: true)
 * 3. Guard against infinite loops via suppressUrlUpdate ref
 */

import { useNavigate, useSearch } from '@tanstack/react-router'
import { reaction, runInAction } from 'mobx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useFeatureFlags } from '@/app/stores'
import { orpcClient } from '@/shared/data/orpc/client'
import { getLogger } from '@/shared/lib/logging'
import type { EntityViewRow } from '@/systems/vibegrid/components/ViewPicker'
import type { VibeGridStores } from '@/systems/vibegrid/stores/context'
import type { AggregationConfig, FilterConfig } from '@/systems/vibegrid/types'

const logger = getLogger(['entities', 'hooks', 'useViewUrlSync'])

// ====================================
// TYPES
// ====================================

export interface UseViewUrlSyncOptions {
  entityType: string
  /** Organization ID (reserved for future saved-view API calls) */
  orgId: string
  stores: VibeGridStores
}

export interface UseViewUrlSyncResult {
  /** The active saved view ID from URL (if any) */
  activeViewId: string | null
  /** Whether URL state is still being applied to stores */
  isLoading: boolean
  /** Whether the store state differs from the active view's config */
  hasUnsavedChanges: boolean
  /** Copy the current URL (with view state) to clipboard */
  copyLink: () => void
  /** Select a saved view and apply its config to stores (GH#1570 P2.3) */
  selectView: (view: EntityViewRow) => void
  /** Clear active view, reverting to unsaved localStorage state (GH#1570 P2.3) */
  clearView: () => void
  /** Default view config from the views.list response (for widget rendering, GH#2641) */
  defaultViewConfig: Record<string, unknown> | null
}

// ====================================
// SERIALIZATION HELPERS
// ====================================

/**
 * Serialize sort config to URL param: "field:direction"
 */
export function serializeSort(sortBy: Array<{ field: string; direction: 'asc' | 'desc' }>): string | undefined {
  if (!sortBy || sortBy.length === 0) return undefined
  // Only serialize first sort for URL (multi-sort not supported in URL yet)
  const first = sortBy[0]
  return `${first.field}:${first.direction}`
}

/**
 * Deserialize sort URL param to SortConfig[]
 */
export function deserializeSort(sort: string | undefined): Array<{ field: string; direction: 'asc' | 'desc' }> | null {
  if (!sort) return null
  const parts = sort.split(':')
  if (parts.length !== 2) return null
  const [field, direction] = parts
  if (direction !== 'asc' && direction !== 'desc') return null
  return [{ field, direction }]
}

/**
 * Serialize filters to URL param (JSON-encoded FilterConfig[])
 */
export function serializeFilters(filters: FilterConfig[]): string | undefined {
  if (!filters || filters.length === 0) return undefined
  try {
    return JSON.stringify(filters)
  } catch {
    return undefined
  }
}

/**
 * Deserialize filter URL param from JSON string
 */
export function deserializeFilters(filter: string | undefined): FilterConfig[] | null {
  if (!filter) return null
  try {
    const parsed = JSON.parse(filter)
    if (!Array.isArray(parsed)) return null
    return parsed as FilterConfig[]
  } catch {
    return null
  }
}

/**
 * Serialize group config to URL param (field name of first group field)
 */
export function serializeGroup(groupConfig: { fields: Array<{ field: string }> } | null): string | undefined {
  if (!groupConfig?.fields || groupConfig.fields.length === 0) return undefined
  return groupConfig.fields[0].field
}

// ====================================
// HOOK
// ====================================

export function useViewUrlSync(options: UseViewUrlSyncOptions): UseViewUrlSyncResult {
  const { entityType, stores } = options
  const featureFlagsStore = useFeatureFlags()
  const isEnabled = featureFlagsStore.isEnabled('feature.entity-views.enabled')

  const navigate = useNavigate()

  // Always call useSearch unconditionally (React hooks rule)
  // The route has validateSearch defined, so this will return typed search params
  const search = useSearch({ from: '/_authenticated/entities/$entityName/' })

  const [isLoading, setIsLoading] = useState(true)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [defaultViewConfig, setDefaultViewConfig] = useState<Record<string, unknown> | null>(null)

  // Ref to suppress URL updates when we're applying URL -> Store
  const suppressUrlUpdateRef = useRef(false)

  // Debounce timer ref for Store -> URL sync
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Capture initial search params in a ref so the URL->Store effect only runs on mount
  const initialSearchRef = useRef(search)

  // Copy link handler
  const copyLink = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).then(
        () => toast.success('Link copied!'),
        () => toast.error('Failed to copy link'),
      )
    }
  }, [])

  // Select a saved view: apply its config to VibeGrid stores and set view= in URL
  const selectView = useCallback(
    (view: EntityViewRow) => {
      if (!isEnabled) return

      const { visualStateStore, viewModeStore } = stores
      const config = view.config as Record<string, unknown>

      logger.info('Selecting saved view', { viewId: view.id, viewName: view.name })

      suppressUrlUpdateRef.current = true
      setActiveViewId(view.id)
      setHasUnsavedChanges(false)

      runInAction(() => {
        // Apply sort from config
        if (Array.isArray(config.sortBy)) {
          visualStateStore.sortBy = config.sortBy as Array<{
            field: string
            direction: 'asc' | 'desc'
          }>
        } else {
          visualStateStore.sortBy = []
        }

        // Apply filters from config
        if (Array.isArray(config.filters)) {
          visualStateStore.filters = config.filters as FilterConfig[]
        } else {
          visualStateStore.filters = []
        }

        // Apply group from config
        if (config.groupConfig && typeof config.groupConfig === 'object') {
          const gc = config.groupConfig as Record<string, unknown>
          if (Array.isArray(gc.fields) && gc.fields.length > 0) {
            visualStateStore.setGroupConfig({
              fields: gc.fields as Array<{ field: string; displayName: string }>,
              sortBy: (gc.sortBy as 'name' | 'count' | 'custom') || 'name',
              sortDirection: (gc.sortDirection as 'asc' | 'desc') || 'asc',
              aggregations: (gc.aggregations as AggregationConfig[]) || [],
              expandedGroups: new Set(),
            })
          } else {
            visualStateStore.setGroupConfig(null)
          }
        } else {
          visualStateStore.setGroupConfig(null)
        }

        // Apply view mode from config
        const viewMode = config.viewMode as string | undefined
        if (viewMode === 'table' || viewMode === 'gantt' || viewMode === 'kanban') {
          viewModeStore.setMode(viewMode)
        } else {
          viewModeStore.setMode('table')
        }

        // Apply search from config
        if (typeof config.globalSearchText === 'string') {
          visualStateStore.setGlobalSearchText(config.globalSearchText)
        } else {
          visualStateStore.setGlobalSearchText('')
        }

        // Apply column visibility from config
        if (config.columnVisibility && typeof config.columnVisibility === 'object') {
          const vis = config.columnVisibility as Record<string, boolean>
          for (const [colId, visible] of Object.entries(vis)) {
            visualStateStore.columnVisibility[colId] = visible
          }
        }
      })

      // Update URL with view= param
      ;(navigate as any)({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          view: view.id,
        }),
        replace: true,
      })

      requestAnimationFrame(() => {
        suppressUrlUpdateRef.current = false
      })
    },
    [isEnabled, stores, navigate],
  )

  // Clear active view, revert to unsaved state
  const clearView = useCallback(() => {
    logger.info('Clearing active view, reverting to unsaved state')
    setActiveViewId(null)
    setHasUnsavedChanges(false)

    // Remove view= from URL
    ;(navigate as any)({
      search: (prev: Record<string, unknown>) => {
        const { view: _, ...rest } = prev
        return rest
      },
      replace: true,
    })
  }, [navigate])

  // ====================================
  // URL -> STORE (on page load)
  // ====================================

  useEffect(() => {
    if (!isEnabled) {
      setIsLoading(false)
      return
    }

    const { visualStateStore, viewModeStore } = stores
    const initialSearch = initialSearchRef.current

    // Track that we're applying URL state so Store->URL reaction doesn't fire
    suppressUrlUpdateRef.current = true

    logger.info('Applying URL search params to stores', {
      entityType,
      search: initialSearch,
    })

    runInAction(() => {
      // Apply sort from URL
      const sortConfig = deserializeSort(initialSearch.sort)
      if (sortConfig) {
        visualStateStore.sortBy = sortConfig
      }

      // Apply filters from URL
      const filterConfig = deserializeFilters(initialSearch.filter)
      if (filterConfig) {
        visualStateStore.filters = filterConfig
      }

      // Apply group from URL
      if (initialSearch.group) {
        visualStateStore.setGroupConfig({
          fields: [{ field: initialSearch.group, displayName: initialSearch.group }],
          sortBy: 'name',
          sortDirection: 'asc',
          aggregations: [],
          expandedGroups: new Set(),
        })
      }

      // Apply view mode from URL
      if (initialSearch.mode === 'table' || initialSearch.mode === 'gantt' || initialSearch.mode === 'kanban') {
        viewModeStore.setMode(initialSearch.mode)
      }

      // Apply search query from URL
      if (initialSearch.q !== undefined) {
        visualStateStore.setGlobalSearchText(initialSearch.q)
      }

      // Track active view ID
      if (initialSearch.view) {
        setActiveViewId(initialSearch.view)
      }
    })

    // Allow Store->URL reactions after a tick
    requestAnimationFrame(() => {
      suppressUrlUpdateRef.current = false
      setIsLoading(false)
    })
  }, [isEnabled, entityType, stores])

  // ====================================
  // ACTIVE VIEW CONFIG LOADING (on mount)
  //
  // Always fetch the views list so we can populate `defaultViewConfig`
  // (consumed as `activeViewConfig` for `listWidgets` GH#2641 and
  // `listExtraTabs` GH#2689 B7 — the rendering surfaces depend on the
  // resolved view's config, not on whether the URL named one).
  //
  // Two cases:
  //   - URL has `?view=<id>` (deep-link or post-refresh): resolve config
  //     from that view, but DO NOT call `selectView` — the URL→Store
  //     effect above has already applied any layered sort/filter/group
  //     overrides from the URL, and re-applying the saved view would
  //     clobber them. Track activeViewId via setActiveViewId so the
  //     unsaved-changes reaction can wire up.
  //   - URL has no `?view=`: pick the default view, expose its config,
  //     and call selectView to apply it (the original behavior).
  //
  // Bug fix (GH#2689 B7 partial-state): the previous early-return when
  // `?view=` was present left `defaultViewConfig` permanently null, so
  // the list-view tab strip ("Grid" + "Scan Runs") disappeared on
  // browser refresh — the URL had been mutated by the first nav's
  // selectView() call, and the loader skipped on subsequent mounts.
  // ====================================

  useEffect(() => {
    if (!isEnabled) return

    let cancelled = false

    const loadViews = async (): Promise<void> => {
      try {
        const result = await orpcClient.dataforge.views.list({ entityName: entityType })
        if (cancelled) return

        const initialViewId = initialSearchRef.current.view

        if (initialViewId) {
          // URL named a view — resolve config from it without re-applying.
          const activeView = result.views.find(
            (v: { id: string }) => v.id === initialViewId,
          )
          const resolved =
            activeView ??
            result.views.find((v: { is_default: boolean }) => v.is_default) ??
            result.views[0] ??
            null
          setDefaultViewConfig(resolved?.config ?? null)
          if (activeView) {
            // Ensure activeViewId state matches the URL even if the
            // URL→Store effect already set it; harmless re-set.
            setActiveViewId(activeView.id)
          }
          return
        }

        // No ?view= in URL — load default and apply it.
        const defaultView = result.views.find(
          (v: { is_default: boolean }) => v.is_default,
        )
        const resolvedView = defaultView ?? result.views[0] ?? null
        setDefaultViewConfig(resolvedView?.config ?? null)

        if (defaultView && !cancelled) {
          logger.info('Loading default view', {
            viewId: defaultView.id,
            viewName: defaultView.name,
          })
          selectView(defaultView as EntityViewRow)
        }
      } catch (err) {
        logger.warn('Failed to load views', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    loadViews()
    return () => {
      cancelled = true
    }
  }, [isEnabled, entityType, selectView])

  // ====================================
  // STORE -> URL (on user interaction)
  // ====================================

  useEffect(() => {
    if (!isEnabled) return

    const { visualStateStore, viewModeStore } = stores

    const dispose = reaction(
      () => ({
        sortBy: visualStateStore.sortBy.slice(),
        filters: visualStateStore.filters.slice(),
        groupConfig: visualStateStore.groupConfig,
        viewMode: viewModeStore.mode,
        globalSearchText: visualStateStore.globalSearchText,
      }),
      (data) => {
        // Skip if we're applying URL -> Store
        if (suppressUrlUpdateRef.current) return

        // Clear existing debounce timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }

        // Debounce at 300ms
        debounceTimerRef.current = setTimeout(() => {
          const sort = serializeSort(data.sortBy)
          const filter = serializeFilters(data.filters)
          const group = serializeGroup(data.groupConfig)
          const mode = data.viewMode !== 'table' ? (data.viewMode as 'gantt' | 'kanban') : undefined
          const q = data.globalSearchText.trim() || undefined

          logger.debug('Syncing store state to URL', {
            sort,
            filter: filter ? `${filter.length} chars` : undefined,
            group,
            mode,
            q,
          })

          ;(navigate as any)({
            search: (prev: Record<string, unknown>) => ({
              ...prev,
              sort,
              filter,
              group,
              mode,
              q,
            }),
            replace: true,
          })
        }, 300)
      },
      {
        name: 'useViewUrlSync.storeToUrl',
      },
    )

    return () => {
      dispose()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [isEnabled, stores, navigate])

  // ====================================
  // UNSAVED CHANGES TRACKING
  // ====================================

  useEffect(() => {
    if (!isEnabled || !activeViewId) return

    const { visualStateStore, viewModeStore } = stores

    // When user modifies the grid while a view is active, mark as unsaved
    const dispose = reaction(
      () => ({
        sortBy: visualStateStore.sortBy.slice(),
        filters: visualStateStore.filters.slice(),
        groupConfig: visualStateStore.groupConfig,
        viewMode: viewModeStore.mode,
        globalSearchText: visualStateStore.globalSearchText,
      }),
      () => {
        if (!suppressUrlUpdateRef.current) {
          setHasUnsavedChanges(true)
        }
      },
      {
        name: 'useViewUrlSync.unsavedChanges',
      },
    )

    return () => dispose()
  }, [isEnabled, activeViewId, stores])

  if (!isEnabled) {
    return {
      activeViewId: null,
      isLoading: false,
      hasUnsavedChanges: false,
      copyLink,
      selectView,
      clearView,
      defaultViewConfig: null,
    }
  }

  return {
    activeViewId,
    isLoading,
    hasUnsavedChanges,
    copyLink,
    selectView,
    clearView,
    defaultViewConfig,
  }
}
