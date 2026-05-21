/**
 * ViewPicker - Saved View Selection Dropdown (GH#1570)
 *
 * Popover-based picker that lists saved views organized by section:
 * - Pinned views (starred)
 * - My Views (personal + unsaved)
 * - Shared Views (shared/locked)
 *
 * Also provides per-view context menu for rename, duplicate, delete, etc.
 */

import {
  ChevronDown,
  Copy,
  GanttChart,
  Kanban,
  LayoutList,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Shield,
  Star,
  Trash2,
} from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { orpcClient } from '@/shared/data/orpc/client'
import { loadViews, refreshViews } from '@/shared/data/orpc/domains/views-fetch'
import { viewsStore } from '@/shared/data/stores/ViewsStore'
import { getLogger } from '@/shared/lib/logging'
import { cn } from '@/shared/lib/utils'
import type { ViewMode } from '../stores/ViewModeStore'

const logger = getLogger(['vibegrid', 'components', 'ViewPicker'])

// ====================================
// TYPES
// ====================================

/** Entity view row shape matching oRPC client response */
export interface EntityViewRow {
  id: string
  organization_id: string
  entity_type: string
  name: string
  icon: string | null
  color: string | null
  created_by: string
  visibility: 'personal' | 'shared' | 'locked'
  is_default: boolean
  config: Record<string, unknown>
  config_version: number
  created_at: string
  updated_at: string
}

/** Entity view pin row shape matching oRPC client response */
export interface EntityViewPinRow {
  id: string
  organization_id: string
  user_id: string
  view_id: string
  pin_order: number
  created_at: string
}

export interface ViewPickerProps {
  entityType: string
  orgId: string
  activeViewId: string | null
  /**
   * Display name for the active view, resolved by the parent
   * (`useViewUrlSync`) from the same `views.list` fetch it already runs
   * at mount. Used as a fallback for the trigger label so the active
   * view's name shows immediately — without this prop the local `views`
   * state is empty until the popover is first opened, so the trigger
   * would show "Views" instead of the active view's name on cold load.
   */
  activeViewName?: string | null
  hasUnsavedChanges: boolean
  currentViewMode: ViewMode
  onViewSelect: (view: EntityViewRow) => void
  onSaveView: () => void
  onUnsavedSelect: () => void
  onDuplicateView?: (view: EntityViewRow) => void
  userId: string
  userRole: string
}

// ====================================
// VIEW MODE ICON HELPER
// ====================================

function ViewModeIcon({ mode, className }: { mode: ViewMode; className?: string }): React.ReactElement {
  switch (mode) {
    case 'gantt':
      return <GanttChart className={className} />
    case 'kanban':
      return <Kanban className={className} />
    default:
      return <LayoutList className={className} />
  }
}

/** Derive view mode from a view config object */
function deriveViewMode(config: Record<string, unknown>): ViewMode {
  if (config.viewMode && typeof config.viewMode === 'string') {
    const vm = config.viewMode as string
    if (vm === 'gantt' || vm === 'kanban' || vm === 'table') return vm
  }
  // Legacy: check if gantt config is present
  if (config.gantt && typeof config.gantt === 'object') return 'gantt'
  return 'table'
}

// ====================================
// COMPONENT
// ====================================

export const ViewPicker = observer(function ViewPicker({
  entityType,
  orgId: _orgId,
  activeViewId,
  activeViewName,
  hasUnsavedChanges,
  currentViewMode,
  onViewSelect,
  onSaveView,
  onUnsavedSelect,
  onDuplicateView,
  userId,
  userRole,
}: ViewPickerProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read from the cache synchronously on every render so the picker paints
  // last-known views instantly. The MobX `observer` wrap re-renders on
  // `viewsStore.set(entityType, ...)`.
  const cached = viewsStore.get(entityType)
  const views: EntityViewRow[] = cached?.views ?? []
  const pins: EntityViewPinRow[] = cached?.pins ?? []

  // Fetch views when popover opens. The cache (`viewsStore`) is the source
  // of truth for the rendered list; this call refreshes that cache. We
  // only show the loading skeleton on a cold open (no cached entry yet) —
  // the stale-while-revalidate contract means subsequent opens repaint
  // instantly from the cache and quietly refresh in the background.
  const fetchViews = useCallback(async () => {
    const hadCache = viewsStore.get(entityType) !== undefined
    if (!hadCache) setIsLoading(true)
    setError(null)
    try {
      const entry = await loadViews(entityType)
      logger.info('Fetched views', {
        entityType,
        viewCount: entry.views.length,
        pinCount: entry.pins.length,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load views'
      setError(msg)
      logger.error('Failed to fetch views', { entityType, error: msg })
    } finally {
      setIsLoading(false)
    }
  }, [entityType])

  useEffect(() => {
    if (open) {
      fetchViews()
    }
  }, [open, fetchViews])

  // Categorize views
  const pinnedViewIds = new Set(pins.map((p) => p.view_id))
  const pinnedViews = views.filter((v) => pinnedViewIds.has(v.id))
  const myViews = views.filter((v) => v.created_by === userId && !pinnedViewIds.has(v.id))
  const sharedViews = views.filter(
    (v) =>
      v.created_by !== userId && (v.visibility === 'shared' || v.visibility === 'locked') && !pinnedViewIds.has(v.id),
  )

  // Find active view name for trigger label.
  // Prefer the locally-loaded `views` entry (carries the freshest name in
  // case it was renamed), fall back to the parent-supplied `activeViewName`
  // so the label shows immediately on cold load before the picker's own
  // lazy `views.list` fetch fires (it only runs when the popover opens).
  const activeView = activeViewId ? views.find((v) => v.id === activeViewId) : null
  const triggerLabel = activeView?.name ?? activeViewName ?? 'Views'

  // Context menu handlers — all mutations re-prime the cache via
  // `refreshViews` so the MobX-observed view list re-renders.
  const handleDelete = useCallback(
    async (viewId: string) => {
      try {
        await orpcClient.dataforge.views.delete({ view_id: viewId })
        toast.success('View deleted')
        await refreshViews(entityType)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete view'
        toast.error(msg)
      }
    },
    [entityType],
  )

  const handlePin = useCallback(
    async (viewId: string) => {
      try {
        await orpcClient.dataforge.views.pin({ view_id: viewId })
        toast.success('View pinned')
        await refreshViews(entityType)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to pin view'
        toast.error(msg)
      }
    },
    [entityType],
  )

  const handleUnpin = useCallback(
    async (viewId: string) => {
      try {
        await orpcClient.dataforge.views.unpin({ view_id: viewId })
        toast.success('View unpinned')
        await refreshViews(entityType)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to unpin view'
        toast.error(msg)
      }
    },
    [entityType],
  )

  const handleSetDefault = useCallback(
    async (viewId: string) => {
      try {
        await orpcClient.dataforge.views.setDefault({ view_id: viewId, entityName: entityType })
        toast.success('Default view updated')
        await refreshViews(entityType)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to set default'
        toast.error(msg)
      }
    },
    [entityType],
  )

  const handleDuplicate = useCallback(
    async (view: EntityViewRow) => {
      if (onDuplicateView) {
        onDuplicateView(view)
      } else {
        // Default: create a personal copy via API
        try {
          await orpcClient.dataforge.views.create({
            entityName: view.entity_type,
            name: `${view.name} (copy)`,
            visibility: 'personal',
            config: view.config as Record<string, unknown>,
          })
          toast.success('View duplicated to My Views')
          await refreshViews(entityType)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to duplicate view'
          toast.error(msg)
        }
      }
      setOpen(false)
    },
    [onDuplicateView, entityType],
  )

  const handleReorderPins = useCallback(
    async (viewId: string, direction: 'up' | 'down') => {
      const sortedPinnedIds = [...pins].sort((a, b) => a.pin_order - b.pin_order).map((p) => p.view_id)

      const currentIndex = sortedPinnedIds.indexOf(viewId)
      if (currentIndex === -1) return

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (newIndex < 0 || newIndex >= sortedPinnedIds.length) return

      // Swap
      const newOrder = [...sortedPinnedIds]
      ;[newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]]

      // Optimistic update: write a re-ordered pins array straight into the
      // store. Cell renderers (observer-wrapped) repaint on this same tick.
      // Snapshot the cached entry first so we can roll back on API failure.
      const cachedEntry = viewsStore.get(entityType)
      const prevPins = cachedEntry ? [...cachedEntry.pins] : pins
      if (cachedEntry) {
        viewsStore.set(entityType, {
          views: cachedEntry.views,
          pins: cachedEntry.pins.map((p) => ({
            ...p,
            pin_order: newOrder.indexOf(p.view_id),
          })),
          defaultViewConfig: cachedEntry.defaultViewConfig,
        })
      }

      try {
        await orpcClient.dataforge.views.reorderPins({ view_ids: newOrder })
        // Re-prime with server truth so we land on canonical row IDs.
        await refreshViews(entityType)
      } catch (err) {
        // Roll back to the snapshot. Mirrors the legacy `setPins(prevPins)`
        // local-state rollback by writing the prior pins back to the store.
        const current = viewsStore.get(entityType)
        if (current) {
          viewsStore.set(entityType, {
            views: current.views,
            pins: prevPins,
            defaultViewConfig: current.defaultViewConfig,
          })
        }
        const msg = err instanceof Error ? err.message : 'Failed to reorder'
        toast.error(msg)
      }
    },
    [entityType, pins],
  )

  const isAdmin = userRole === 'admin' || userRole === 'owner'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5" data-testid="view-picker-trigger" />}
      >
        <ViewModeIcon mode={currentViewMode} className="size-4" />
        <span className="max-w-[120px] truncate">{triggerLabel}</span>
        {hasUnsavedChanges && <span className="size-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" data-testid="view-picker-content">
        {isLoading ? (
          <div className="space-y-2 p-3" data-testid="view-picker-loading">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="p-3 text-sm text-destructive" data-testid="view-picker-error">
            {error}
          </div>
        ) : views.length === 0 && !hasUnsavedChanges ? (
          <div className="p-3" data-testid="view-picker-empty">
            <p className="text-sm text-muted-foreground mb-3">No saved views yet</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => {
                setOpen(false)
                onSaveView()
              }}
              data-testid="view-picker-save-empty"
            >
              <Plus className="size-3.5" />
              Save Current View
            </Button>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {/* Pinned Section */}
            {pinnedViews.length > 0 && (
              <ViewSection title="Pinned">
                {pinnedViews.map((view) => (
                  <ViewItem
                    key={view.id}
                    view={view}
                    isActive={view.id === activeViewId}
                    isPinned={true}
                    isOwner={view.created_by === userId}
                    isAdmin={isAdmin}
                    hasUnsavedChanges={view.id === activeViewId && hasUnsavedChanges}
                    onSelect={() => {
                      onViewSelect(view)
                      setOpen(false)
                    }}
                    onDelete={() => handleDelete(view.id)}
                    onPin={() => handlePin(view.id)}
                    onUnpin={() => handleUnpin(view.id)}
                    onSetDefault={() => handleSetDefault(view.id)}
                    onRename={() => {
                      setOpen(false)
                    }}
                    onDuplicate={() => handleDuplicate(view)}
                    onReorder={(direction) => handleReorderPins(view.id, direction)}
                  />
                ))}
              </ViewSection>
            )}

            {/* My Views Section */}
            <ViewSection title="My Views">
              {/* Unsaved item - always shown first */}
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                  !activeViewId && 'bg-accent text-accent-foreground',
                )}
                onClick={() => {
                  onUnsavedSelect()
                  setOpen(false)
                }}
                data-testid="view-picker-unsaved"
              >
                <span className="size-4" /> {/* spacer for alignment */}
                <span className="flex-1 text-left italic text-muted-foreground">(Unsaved)</span>
                <ViewModeBadge mode={currentViewMode} />
              </button>

              {myViews.map((view) => (
                <ViewItem
                  key={view.id}
                  view={view}
                  isActive={view.id === activeViewId}
                  isPinned={false}
                  isOwner={true}
                  isAdmin={isAdmin}
                  hasUnsavedChanges={view.id === activeViewId && hasUnsavedChanges}
                  onSelect={() => {
                    onViewSelect(view)
                    setOpen(false)
                  }}
                  onDelete={() => handleDelete(view.id)}
                  onPin={() => handlePin(view.id)}
                  onUnpin={() => handleUnpin(view.id)}
                  onSetDefault={() => handleSetDefault(view.id)}
                  onRename={() => {
                    setOpen(false)
                  }}
                  onDuplicate={() => handleDuplicate(view)}
                />
              ))}
            </ViewSection>

            {/* Shared Views Section */}
            {sharedViews.length > 0 && (
              <ViewSection title="Shared Views">
                {sharedViews.map((view) => (
                  <ViewItem
                    key={view.id}
                    view={view}
                    isActive={view.id === activeViewId}
                    isPinned={false}
                    isOwner={view.created_by === userId}
                    isAdmin={isAdmin}
                    hasUnsavedChanges={view.id === activeViewId && hasUnsavedChanges}
                    onSelect={() => {
                      onViewSelect(view)
                      setOpen(false)
                    }}
                    onDelete={() => handleDelete(view.id)}
                    onPin={() => handlePin(view.id)}
                    onUnpin={() => handleUnpin(view.id)}
                    onSetDefault={() => handleSetDefault(view.id)}
                    onRename={() => {
                      setOpen(false)
                    }}
                    onDuplicate={() => handleDuplicate(view)}
                  />
                ))}
              </ViewSection>
            )}

            {/* Save Current View button at bottom */}
            <div className="border-t p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setOpen(false)
                  onSaveView()
                }}
                data-testid="view-picker-save-button"
              >
                <Plus className="size-3.5" />
                Save Current View
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
})

// ====================================
// SUB-COMPONENTS
// ====================================

function ViewSection({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="border-b last:border-b-0">
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</div>
      <div className="pb-1">{children}</div>
    </div>
  )
}

function ViewModeBadge({ mode }: { mode: ViewMode }): React.ReactElement {
  return (
    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal">
      {mode}
    </Badge>
  )
}

interface ViewItemProps {
  view: EntityViewRow
  isActive: boolean
  isPinned: boolean
  isOwner: boolean
  isAdmin: boolean
  hasUnsavedChanges: boolean
  onSelect: () => void
  onDelete: () => void
  onPin: () => void
  onUnpin: () => void
  onSetDefault: () => void
  onRename: () => void
  onDuplicate: () => void
  onReorder?: (direction: 'up' | 'down') => void
}

function ViewItem({
  view,
  isActive,
  isPinned,
  isOwner,
  isAdmin,
  hasUnsavedChanges: _hasUnsavedChanges,
  onSelect,
  onDelete,
  onPin,
  onUnpin,
  onSetDefault,
  onRename,
  onDuplicate,
  onReorder,
}: ViewItemProps): React.ReactElement {
  const viewMode = deriveViewMode(view.config)
  const isLocked = view.visibility === 'locked'

  // Permission rules:
  // - Rename: owner can rename, but locked views only admin can rename
  const canRename = isLocked ? isAdmin : isOwner
  // - Delete: owner or admin can delete
  const canDelete = isOwner || isAdmin
  // - Set as Default: admin only, on shared/locked views
  const canSetDefault = isAdmin && (view.visibility === 'shared' || isLocked)

  return (
    <div
      className={cn(
        'group flex items-center gap-1 px-1 mx-1 rounded-sm',
        isActive && 'bg-accent text-accent-foreground',
      )}
    >
      {/* Pin indicator */}
      <button
        type="button"
        className="shrink-0 p-0.5 hover:text-amber-500 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          if (isPinned) {
            onUnpin()
          } else {
            onPin()
          }
        }}
        title={isPinned ? 'Unpin view' : 'Pin view'}
      >
        <Star className={cn('size-3.5', isPinned ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40')} />
      </button>

      {/* View name (clickable, Alt+Arrow for reorder) */}
      <button
        type="button"
        className="flex flex-1 items-center gap-2 py-1.5 text-sm text-left min-w-0 hover:text-accent-foreground transition-colors"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onReorder && e.altKey) {
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              onReorder('up')
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              onReorder('down')
            }
          }
        }}
        data-testid={`view-picker-item-${view.id}`}
      >
        <span className="flex-1 truncate">{view.name}</span>
        {isLocked && (
          <Lock className="size-3 text-muted-foreground shrink-0" data-testid={`view-picker-lock-${view.id}`} />
        )}
        {view.is_default && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 font-normal shrink-0">
            default
          </Badge>
        )}
        <ViewModeBadge mode={viewMode} />
      </button>

      {/* Context menu */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-accent rounded"
              data-testid={`view-picker-menu-${view.id}`}
            />
          }
        >
          <MoreHorizontal className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canRename && (
            <DropdownMenuItem onClick={onRename} data-testid={`view-picker-rename-${view.id}`}>
              <Pencil className="size-3.5" />
              Rename
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDuplicate} data-testid={`view-picker-duplicate-${view.id}`}>
            <Copy className="size-3.5" />
            Duplicate to My Views
          </DropdownMenuItem>
          {canSetDefault && (
            <DropdownMenuItem onClick={onSetDefault} data-testid={`view-picker-set-default-${view.id}`}>
              <Shield className="size-3.5" />
              Set as Default
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                data-testid={`view-picker-delete-${view.id}`}
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
