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
}

export const ActionsBar = observer((props: ActionsBarProps) => {
  const {
    rowActions = [],
    onRowAction,
    enableDelete,
    onDelete,
    deleteConfirmation,
    getRowData,
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
  const selectedRowIds = React.useMemo(() => {
    if (selectedCells.size === 0) return []

    const rowCellCounts = new Map<string, { selected: number; total: number }>()
    const visibleColumns = visualStateStore.visibleColumns.filter((col) => col.id !== 'selection')

    // Count selected cells per row
    for (const cellId of selectedCells) {
      const [rowId] = cellId.split(':')
      if (!rowCellCounts.has(rowId)) {
        rowCellCounts.set(rowId, { selected: 0, total: visibleColumns.length })
      }
      const counts = rowCellCounts.get(rowId)!
      counts.selected++
    }

    // Return rows where all cells are selected
    return Array.from(rowCellCounts.entries())
      .filter(([_, counts]) => counts.selected === counts.total)
      .map(([rowId]) => rowId)
  }, [selectedCells, visualStateStore.visibleColumns])

  const selectedRowsData = React.useMemo(
    () => selectedRowIds.map(getRowData).filter(Boolean),
    [selectedRowIds, getRowData],
  )

  const selectedCount = selectedRowIds.length

  const handleActionClick = async (action: RowAction) => {
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

      // Clear selection after successful action
      interactionStore.clearSelection()
    } catch (error) {
      logger.error('Action failed', { error })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteClick = () => {
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

  const handleClearSelection = () => {
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
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto"
        data-testid="vibegrid-actions-bar"
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
              return (
                <Button
                  key={action.id}
                  variant={action.destructive ? 'destructive' : 'secondary'}
                  size="sm"
                  onClick={() => handleActionClick(action)}
                  disabled={isProcessing}
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
