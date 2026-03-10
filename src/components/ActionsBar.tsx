import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import type { RowAction } from '../VibeGrid'
import { useVibeGridStores } from '../stores/context'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Button } from '@/shared/components/ui/button'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'ActionsBar'])

/**
 * ActionsBar - Fixed action bar at bottom of table
 *
 * Appears when rows are selected, shows available actions
 * Pinned to bottom of visible table viewport
 * Similar to Gmail/Google Sheets selection pattern
 */

interface ActionsBarProps {
  rowActions?: RowAction[]
  onRowAction?: (actionId: string, rowIds: string[], rowsData: any[]) => void | Promise<void>
  enableDelete?: boolean
  onDelete?: (rowIds: string[], rowsData: any[]) => Promise<void>
  deleteConfirmation?: (rowsData: any[]) => string | React.ReactNode
  getRowData: (rowId: string) => any
  /** When true, export-csv action is disabled (B9 incremental processing guard) */
  isExportDisabled?: boolean
}

export const ActionsBar = observer((props: ActionsBarProps) => {
  const {
    rowActions = [],
    onRowAction,
    enableDelete,
    onDelete,
    deleteConfirmation,
    getRowData,
    isExportDisabled,
  } = props

  const { interactionStore, visualStateStore } = useVibeGridStores()
  const { selectedCells } = interactionStore

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ rowIds: string[]; rowsData: any[] } | null>(
    null,
  )
  const [isProcessing, setIsProcessing] = useState(false)

  // Derive selected rows from selected cells
  // A row is considered selected if all its visible cells are selected
  // NOTE: Not using useMemo here - observer() tracks selectedCells via MobX,
  // and useMemo's dependency comparison doesn't work reliably with MobX observables.
  // This caused a race condition where clicking Delete captured stale selectedRowIds.
  const selectedRowIds = (() => {
    if (selectedCells.size === 0) return []

    const rowCellCounts = new Map<string, { selected: number; total: number }>()
    // Deduplicate by column ID — columnOrder can contain duplicate IDs (e.g. COI schema),
    // but selectedCells is a Set keyed by `rowId:columnId` so duplicates collapse.
    // Without deduplication, total > selected and rows are never "fully selected".
    const seenColumnIds = new Set<string>()
    const uniqueVisibleColumns = visualStateStore.visibleColumns.filter((col) => {
      if (col.id === 'selection' || seenColumnIds.has(col.id)) return false
      seenColumnIds.add(col.id)
      return true
    })

    // Count selected cells per row
    for (const cellId of selectedCells) {
      const [rowId] = cellId.split(':')
      if (!rowCellCounts.has(rowId)) {
        rowCellCounts.set(rowId, { selected: 0, total: uniqueVisibleColumns.length })
      }
      const counts = rowCellCounts.get(rowId)!
      counts.selected++
    }

    // Return rows where all cells are selected
    return Array.from(rowCellCounts.entries())
      .filter(([_, counts]) => counts.selected === counts.total)
      .map(([rowId]) => rowId)
  })()

  // Also compute fresh - same reason as selectedRowIds above
  const selectedRowsData = selectedRowIds.map(getRowData).filter(Boolean)

  const selectedCount = selectedRowIds.length

  const handleActionClick = async (action: RowAction, e?: React.MouseEvent) => {
    // Stop propagation to prevent MouseController's global click handler from interfering
    e?.stopPropagation()

    if (isProcessing) return

    if (action.destructive) {
      // Show confirmation dialog for destructive actions
      setPendingDelete({ rowIds: selectedRowIds, rowsData: selectedRowsData })
      setDeleteDialogOpen(true)
      return
    }

    // Execute action immediately
    setIsProcessing(true)
    try {
      if (action.onClick) {
        // Call action for each row
        await Promise.all(selectedRowsData.map((rowData) => action.onClick!(rowData)))
      } else if (onRowAction) {
        await onRowAction(action.id, selectedRowIds, selectedRowsData)
      }

      // Clear selection after successful action (unless action preserves it)
      if (!action.preserveSelection) {
        interactionStore.clearSelection()
      }
    } catch (error) {
      logger.error('Action failed', { error })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    // Stop propagation to prevent MouseController's global click handler from interfering
    // The global handler can cause MobX reactions that interfere with React state updates
    e.stopPropagation()
    setPendingDelete({ rowIds: selectedRowIds, rowsData: selectedRowsData })
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !onDelete) return

    setIsProcessing(true)
    try {
      await onDelete(pendingDelete.rowIds, pendingDelete.rowsData)

      // Clear selection after successful delete
      interactionStore.clearSelection()
    } catch (error) {
      logger.error('Delete failed', { error })
    } finally {
      setIsProcessing(false)
      setDeleteDialogOpen(false)
      setPendingDelete(null)
    }
  }

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setPendingDelete(null)
  }

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    interactionStore.clearSelection()
  }

  const deleteMessage = React.useMemo(() => {
    if (!pendingDelete) return `Are you sure you want to delete ${selectedCount} item(s)?`
    if (deleteConfirmation) {
      const msg = deleteConfirmation(pendingDelete.rowsData)
      if (typeof msg === 'string') return msg
      return msg
    }
    return `Are you sure you want to delete ${selectedCount} item(s)? This action cannot be undone.`
  }, [pendingDelete, deleteConfirmation, selectedCount])

  // Filter out hidden actions
  const visibleActions = rowActions.filter((action) => {
    // If action has hidden function, check all selected rows
    if (action.hidden) {
      // Show action only if it's visible for ALL selected rows
      return selectedRowsData.every((rowData) => !action.hidden!(rowData))
    }
    return true
  })

  // Don't show if no rows selected (check AFTER all hooks)
  if (selectedCount === 0) {
    return null
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Event propagation barrier for MouseController */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Event propagation barrier only */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto"
        data-testid="vibegrid-actions-bar"
        // Stop mousedown propagation to prevent MouseController's global handlers from interfering
        // with React state updates in this component
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-popover border border-border rounded-lg shadow-xl min-w-[320px]">
          {/* Selection count */}
          <div className="flex items-center gap-2 pr-3 border-r border-border">
            <span className="text-sm font-medium" data-testid="selection-count">
              {selectedCount} {selectedCount === 1 ? 'row' : 'rows'} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="h-6 w-6 p-0"
              disabled={isProcessing}
              data-testid="clear-selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {visibleActions.map((action) => {
              const Icon = action.icon
              const isExportAction = action.id === 'export-csv'
              const disabled = isProcessing || (isExportAction && isExportDisabled)
              return (
                <Button
                  key={action.id}
                  variant={action.destructive ? 'destructive' : 'secondary'}
                  size="sm"
                  onClick={(e) => handleActionClick(action, e)}
                  disabled={disabled}
                  title={isExportAction && isExportDisabled ? 'Processing data...' : undefined}
                  data-testid={`action-${action.id}`}
                >
                  {Icon && <Icon className="h-4 w-4 mr-2" />}
                  {action.label}
                </Button>
              )
            })}

            {enableDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteClick}
                disabled={isProcessing}
                data-testid="action-delete"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              {typeof deleteMessage === 'string' ? deleteMessage : deleteMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete} disabled={isProcessing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

ActionsBar.displayName = 'ActionsBar'
