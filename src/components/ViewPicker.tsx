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
  hasUnsavedChanges: boolean
  currentViewMode: ViewMode
  onViewSelect: (view: EntityViewRow) => void
  onSaveView: () => void
  onUnsavedSelect: () => void
  userId: string
  userRole: string
}

// ====================================
// VIEW MODE ICON HELPER
// ====================================

function ViewModeIcon({
  mode,
  className,
}: {
  mode: ViewMode
  className?: string
}): React.ReactElement {
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
  hasUnsavedChanges,
  currentViewMode,
  onViewSelect,
  onSaveView,
  onUnsavedSelect,
  userId,
  userRole,
}: ViewPickerProps) {
  const [open, setOpen] = useState(false)
  const [views, setViews] = useState<EntityViewRow[]>([])
  const [pins, setPins] = useState<EntityViewPinRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch views when popover opens
  const fetchViews = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await orpcClient.dataforge.views.list({ entity_type: entityType })
      setViews(result.views as EntityViewRow[])
      setPins(result.pins as EntityViewPinRow[])
      logger.info('Fetched views', {
        entityType,
        viewCount: result.views.length,
        pinCount: result.pins.length,
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
      v.created_by !== userId &&
      (v.visibility === 'shared' || v.visibility === 'locked') &&
      !pinnedViewIds.has(v.id),
  )

  // Find active view name for trigger label
  const activeView = activeViewId ? views.find((v) => v.id === activeViewId) : null
  const triggerLabel = activeView ? activeView.name : 'Views'

  // Context menu handlers
  const handleDelete = useCallback(async (viewId: string) => {
    try {
      await orpcClient.dataforge.views.delete({ view_id: viewId })
      toast.success('View deleted')
      setViews((prev) => prev.filter((v) => v.id !== viewId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete view'
      toast.error(msg)
    }
  }, [])

  const handlePin = useCallback(async (viewId: string) => {
    try {
      const pin = await orpcClient.dataforge.views.pin({ view_id: viewId })
      if (pin) {
        setPins((prev) => [...prev, pin as EntityViewPinRow])
        toast.success('View pinned')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pin view'
      toast.error(msg)
    }
  }, [])

  const handleUnpin = useCallback(async (viewId: string) => {
    try {
      await orpcClient.dataforge.views.unpin({ view_id: viewId })
      setPins((prev) => prev.filter((p) => p.view_id !== viewId))
      toast.success('View unpinned')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to unpin view'
      toast.error(msg)
    }
  }, [])

  const handleSetDefault = useCallback(
    async (viewId: string) => {
      try {
        await orpcClient.dataforge.views.setDefault({ view_id: viewId, entity_type: entityType })
        toast.success('Default view updated')
        // Refresh list to get updated is_default flags
        fetchViews()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to set default'
        toast.error(msg)
      }
    },
    [entityType, fetchViews],
  )

  const isAdmin = userRole === 'admin' || userRole === 'owner'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="view-picker-trigger">
          <ViewModeIcon mode={currentViewMode} className="size-4" />
          <span className="max-w-[120px] truncate">{triggerLabel}</span>
          {hasUnsavedChanges && (
            <span className="size-1.5 rounded-full bg-amber-500" title="Unsaved changes" />
          )}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
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
                      // Rename is handled by SaveViewDialog in edit mode via parent
                      // For now, we just close the picker and the parent should handle it
                      setOpen(false)
                    }}
                    onDuplicate={() => {
                      setOpen(false)
                    }}
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
                  onDuplicate={() => {
                    setOpen(false)
                  }}
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
                    onDuplicate={() => {
                      setOpen(false)
                    }}
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

function ViewSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="border-b last:border-b-0">
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </div>
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
  onRename: _onRename,
  onDuplicate: _onDuplicate,
}: ViewItemProps): React.ReactElement {
  const viewMode = deriveViewMode(view.config)
  const canDelete = isOwner || isAdmin
  const canSetDefault = isAdmin && (view.visibility === 'shared' || view.visibility === 'locked')

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
        <Star
          className={cn(
            'size-3.5',
            isPinned ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40',
          )}
        />
      </button>

      {/* View name (clickable) */}
      <button
        type="button"
        className="flex flex-1 items-center gap-2 py-1.5 text-sm text-left min-w-0 hover:text-accent-foreground transition-colors"
        onClick={onSelect}
        data-testid={`view-picker-item-${view.id}`}
      >
        <span className="flex-1 truncate">{view.name}</span>
        {view.is_default && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 font-normal shrink-0">
            default
          </Badge>
        )}
        <ViewModeBadge mode={viewMode} />
      </button>

      {/* Context menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-accent rounded"
            data-testid={`view-picker-menu-${view.id}`}
          >
            <MoreHorizontal className="size-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {isOwner && (
            <DropdownMenuItem onClick={_onRename}>
              <Pencil className="size-3.5" />
              Rename
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={_onDuplicate}>
            <Copy className="size-3.5" />
            Duplicate to My Views
          </DropdownMenuItem>
          {canSetDefault && (
            <DropdownMenuItem onClick={onSetDefault}>
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
