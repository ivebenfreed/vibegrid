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
  /**
   * The active saved view's display name (if any). Exposed separately
   * from `activeViewId` so consumers (e.g. ViewPicker's trigger label)
   * can render the active view's name without waiting for the picker's
   * own lazy-loaded views list. Resolved during the same `views.list`
   * fetch this hook already runs at mount.
   */
  activeViewName: string | null
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
  const [activeViewName, setActiveViewName] = useState<string | null>(null)
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
      setActiveViewName(view.name)
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

      // Update URL with view= AND the view's full layered state (sort/filter/
      // group/mode/q). Without serializing the full state, the URL→Store
      // effect re-fires when `?view=` changes, sees no `?sort=` / `?filter=`
      // / etc. in the URL, and symmetric-clears the store back to empty —
      // wiping out the view config the runInAction just wrote. Writing the
      // full state means URL→Store re-applies the same values (no-op clobber),
      // and "Copy link to current view" captures the full visible state.
      const sortByArr =
        Array.isArray(config.sortBy)
          ? (config.sortBy as Array<{ field: string; direction: 'asc' | 'desc' }>)
          : []
      const filtersArr =
        Array.isArray(config.filters) ? (config.filters as FilterConfig[]) : []
      const groupFieldName =
        config.groupConfig &&
        typeof config.groupConfig === 'object' &&
        Array.isArray((config.groupConfig as { fields?: unknown }).fields)
          ? ((config.groupConfig as { fields: Array<{ field?: string }> }).fields[0]
              ?.field ?? null)
          : null
      const groupParam =
        typeof groupFieldName === 'string' ? groupFieldName : undefined
      const modeParam =
        config.viewMode === 'gantt' || config.viewMode === 'kanban'
          ? (config.viewMode as 'gantt' | 'kanban')
          : undefined
      const qParam =
        typeof config.globalSearchText === 'string' &&
        config.globalSearchText.trim().length > 0
          ? config.globalSearchText
          : undefined

      ;(navigate as any)({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          view: view.id,
          sort: serializeSort(sortByArr),
          filter: serializeFilters(filtersArr),
          group: groupParam,
          mode: modeParam,
          q: qParam,
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
    setActiveViewName(null)
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

    // Read from the CURRENT search params, not `initialSearchRef.current`. The
    // effect must re-fire when in-place navigations change the URL search
    // (e.g. sidebar scope sub-nav click landing on the same `/entities/<X>`
    // route with a new `?filter=`), otherwise the previously-applied default
    // view's filter wins and the URL filter is silently ignored.
    suppressUrlUpdateRef.current = true

    logger.info('Applying URL search params to stores', {
      entityType,
      search,
    })

    runInAction(() => {
      // Apply sort from URL — clear when the URL drops the param so an
      // in-place nav back to the bare route returns to the unsorted state
      // instead of inheriting whatever the previous URL applied.
      const sortConfig = deserializeSort(search.sort)
      visualStateStore.sortBy = sortConfig ?? []

      // Apply filters from URL — same symmetric clear (the original
      // asymmetric "apply if present" left a project-scope filter in place
      // when the user navigated back to "All Certificates of Insurance",
      // making the bare URL look unfiltered while the grid was still
      // scoped to the previous project).
      const filterConfig = deserializeFilters(search.filter)
      visualStateStore.filters = filterConfig ?? []

      // Apply group from URL (clear when absent)
      if (search.group) {
        visualStateStore.setGroupConfig({
          fields: [{ field: search.group, displayName: search.group }],
          sortBy: 'name',
          sortDirection: 'asc',
          aggregations: [],
          expandedGroups: new Set(),
        })
      } else {
        visualStateStore.setGroupConfig(null)
      }

      // Apply view mode from URL (default to 'table' when absent — matches
      // selectView's fallback at the saved-view apply path)
      if (search.mode === 'table' || search.mode === 'gantt' || search.mode === 'kanban') {
        viewModeStore.setMode(search.mode)
      } else {
        viewModeStore.setMode('table')
      }

      // Apply search query from URL (clear when absent)
      visualStateStore.setGlobalSearchText(search.q ?? '')

      // Track active view ID (clear when URL drops `?view=` — otherwise the
      // view-picker keeps highlighting a stale view after the user navs
      // back to the bare route).
      setActiveViewId(search.view ?? null)
    })

    // Allow Store->URL reactions after a tick
    requestAnimationFrame(() => {
      suppressUrlUpdateRef.current = false
      setIsLoading(false)
    })
  }, [
    isEnabled,
    entityType,
    stores,
    // Re-apply whenever any layered search param changes. Without these, an
    // in-place nav like clicking a project sub-nav link from the unfiltered
    // grid leaves the store on the previously-loaded default view.
    search.filter,
    search.sort,
    search.group,
    search.mode,
    search.q,
    search.view,
  ])

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
            setActiveViewName((activeView as { name: string }).name)

            // GH#3016 4th fix: write the saved view's filter/sort/group into
            // visualStateStore on cold-nav so the substrate's sort/filter
            // reaction (fireImmediately: false, in use-substrate-grid-rows.ts)
            // actually fires. Without this write, the URL→Store effect above
            // leaves filters/sortBy empty (no `?filter=` in URL to apply), the
            // reaction never observes a reactive change, and the substrate's
            // query.shape.filter stays `undefined` — so the grid renders the
            // unfiltered result set despite the saved view's filter being
            // configured.
            //
            // Skip per-dimension when the URL carries an explicit override
            // (`?sort=`, `?filter=`, `?group=`), so we don't clobber layered
            // deep-linked state — preserves the original contract documented
            // in the comment block at :337–350.
            const config = activeView.config as Record<string, unknown> | null
            if (config) {
              const initialSearch = initialSearchRef.current
              const { visualStateStore } = stores
              // Suppress Store→URL sync while we apply view config, since the
              // URL already encodes this via `?view=<id>`.
              suppressUrlUpdateRef.current = true
              runInAction(() => {
                if (!initialSearch.filter && Array.isArray(config.filters)) {
                  visualStateStore.filters = config.filters as FilterConfig[]
                }
                if (!initialSearch.sort && Array.isArray(config.sortBy)) {
                  visualStateStore.sortBy = config.sortBy as Array<{
                    field: string
                    direction: 'asc' | 'desc'
                  }>
                }
                if (
                  !initialSearch.group &&
                  config.groupConfig &&
                  typeof config.groupConfig === 'object'
                ) {
                  const gc = config.groupConfig as Record<string, unknown>
                  if (Array.isArray(gc.fields) && gc.fields.length > 0) {
                    visualStateStore.setGroupConfig({
                      fields: gc.fields as Array<{
                        field: string
                        displayName: string
                      }>,
                      sortBy:
                        (gc.sortBy as 'name' | 'count' | 'custom') || 'name',
                      sortDirection:
                        (gc.sortDirection as 'asc' | 'desc') || 'asc',
                      aggregations:
                        (gc.aggregations as AggregationConfig[]) || [],
                      expandedGroups: new Set(),
                    })
                  }
                }
              })
              requestAnimationFrame(() => {
                suppressUrlUpdateRef.current = false
              })
            }
          }
          return
        }

        // No ?view= in URL — resolve the default view's config so widgets +
        // extra tabs still render, but only call selectView (which clobbers
        // sort/filter/group/mode/search to the view's config) when the URL
        // carries no layered state. Otherwise selectView would silently
        // overwrite the user's deep-linked `?sort=` / `?filter=` / `?group=`
        // / `?mode=` / `?q=` with the default view's defaults (typically
        // empty), and the Store→URL reaction would then strip those params
        // out of the URL — making deep-linked search look like the search
        // bar is broken and causing two back-to-back loading-skeleton
        // flashes (URL→Store and the selectView clobber each fire a
        // separate substrate sort/filter reaction, each clobbers the
        // loaded window before its query.patch round-trip resolves).
        const defaultView = result.views.find(
          (v: { is_default: boolean }) => v.is_default,
        )
        const resolvedView = defaultView ?? result.views[0] ?? null
        setDefaultViewConfig(resolvedView?.config ?? null)

        const urlHasLayeredState =
          !!initialSearchRef.current.sort ||
          !!initialSearchRef.current.filter ||
          !!initialSearchRef.current.group ||
          !!initialSearchRef.current.mode ||
          initialSearchRef.current.q !== undefined

        if (defaultView && !cancelled && !urlHasLayeredState) {
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
      activeViewName: null,
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
    activeViewName,
    isLoading,
    hasUnsavedChanges,
    copyLink,
    selectView,
    clearView,
    defaultViewConfig,
  }
}
