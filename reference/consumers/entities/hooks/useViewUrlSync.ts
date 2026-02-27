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
import { getLogger } from '@/shared/lib/logging'
import type { VibeGridStores } from '@/systems/vibegrid/stores/context'
import type { FilterConfig } from '@/systems/vibegrid/types'

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
  /** Copy the current URL (with view state) to clipboard */
  copyLink: () => void
}

// ====================================
// SERIALIZATION HELPERS
// ====================================

/**
 * Serialize sort config to URL param: "field:direction"
 */
export function serializeSort(
  sortBy: Array<{ field: string; direction: 'asc' | 'desc' }>,
): string | undefined {
  if (!sortBy || sortBy.length === 0) return undefined
  // Only serialize first sort for URL (multi-sort not supported in URL yet)
  const first = sortBy[0]
  return `${first.field}:${first.direction}`
}

/**
 * Deserialize sort URL param to SortConfig[]
 */
export function deserializeSort(
  sort: string | undefined,
): Array<{ field: string; direction: 'asc' | 'desc' }> | null {
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
export function serializeGroup(
  groupConfig: { fields: Array<{ field: string }> } | null,
): string | undefined {
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
      if (
        initialSearch.mode === 'table' ||
        initialSearch.mode === 'gantt' ||
        initialSearch.mode === 'kanban'
      ) {
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

  if (!isEnabled) {
    return {
      activeViewId: null,
      isLoading: false,
      copyLink,
    }
  }

  return {
    activeViewId,
    isLoading,
    copyLink,
  }
}
