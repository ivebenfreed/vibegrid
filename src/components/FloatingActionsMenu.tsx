import { observer } from 'mobx-react-lite'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Trash2 } from 'lucide-react'
import type { RowAction } from '../VibeGrid'
import { useVibeGridStores } from '../stores/context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/shared/components/ui/dropdown-menu'
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

/**
 * FloatingActionsMenu - Portal-based dropdown menu for row actions
 *
 * Renders custom row actions + optional delete action
 * Uses shadcn/ui DropdownMenu with Portal for z-index management
 * Follows ContextMenu pattern for positioning and lifecycle
 */

interface FloatingActionsMenuProps {
  rowActions?: RowAction[]
  onRowAction?: (actionId: string, rowData: any) => void | Promise<void>
  enableDelete?: boolean
  onDelete?: (rowId: string, rowData: any) => Promise<void>
  deleteConfirmation?: (rowData: any) => string | React.ReactNode
  getRowData: (rowId: string) => any // Function to get row data by ID
}

const FloatingActionsMenuContent = observer((props: FloatingActionsMenuProps) => {
  const { rowActions = [], onRowAction, enableDelete, onDelete, deleteConfirmation, getRowData } = props

  const { menuStateStore } = useVibeGridStores()
  const { rowActionMenuState } = menuStateStore

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ rowId: string; rowData: any } | null>(null)

  const deleteMessage = React.useMemo(() => {
    if (!pendingDelete) return 'Are you sure you want to delete this item?'
    if (deleteConfirmation) {
      const msg = deleteConfirmation(pendingDelete.rowData)
      if (typeof msg === 'string') return msg
      return msg
    }
    return 'Are you sure you want to delete this item? This action cannot be undone.'
  }, [pendingDelete, deleteConfirmation])

  // Close menu when ESC is pressed
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && rowActionMenuState.isOpen) {
        menuStateStore.closeRowActionMenu()
      }
    }

    if (rowActionMenuState.isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [rowActionMenuState.isOpen, menuStateStore])

  if (!rowActionMenuState.isOpen || !rowActionMenuState.rowId) {
    return null
  }

  const rowData = getRowData(rowActionMenuState.rowId)
  if (!rowData) {
    return null
  }

  // Filter out hidden actions
  const visibleActions = rowActions.filter((action) => {
    return !action.hidden || !action.hidden(rowData)
  })

  const handleActionClick = async (action: RowAction) => {
    menuStateStore.closeRowActionMenu()

    if (action.destructive) {
      // Show confirmation dialog for destructive actions
      setPendingDelete({ rowId: rowActionMenuState.rowId!, rowData })
      setDeleteDialogOpen(true)
      return
    }

    // Execute action immediately
    if (action.onClick) {
      await action.onClick(rowData)
    } else if (onRowAction) {
      await onRowAction(action.id, rowData)
    }
  }

  const handleDeleteClick = () => {
    setPendingDelete({ rowId: rowActionMenuState.rowId!, rowData })
    setDeleteDialogOpen(true)
    menuStateStore.closeRowActionMenu()
  }

  const handleConfirmDelete = async () => {
    if (pendingDelete && onDelete) {
      await onDelete(pendingDelete.rowId, pendingDelete.rowData)
    }
    setDeleteDialogOpen(false)
    setPendingDelete(null)
  }

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setPendingDelete(null)
  }

  return (
    <>
      <DropdownMenu
        open={rowActionMenuState.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            menuStateStore.closeRowActionMenu()
          }
        }}
      >
        <DropdownMenuContent align="end" sideOffset={4} className="min-w-[160px]">
          {visibleActions.map((action, index) => {
            const Icon = action.icon
            return (
              <React.Fragment key={action.id}>
                <DropdownMenuItem
                  onClick={() => handleActionClick(action)}
                  variant={action.destructive ? 'destructive' : 'default'}
                >
                  {Icon && <Icon className="mr-2 h-4 w-4" />}
                  {action.label}
                </DropdownMenuItem>
                {index < visibleActions.length - 1 && action.destructive && <DropdownMenuSeparator />}
              </React.Fragment>
            )
          })}

          {enableDelete && (
            <>
              {visibleActions.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleDeleteClick} variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

FloatingActionsMenuContent.displayName = 'FloatingActionsMenuContent'

// Export the content component for direct use in VibeGrid component tree
export { FloatingActionsMenuContent as FloatingActionsMenu }
export type { FloatingActionsMenuProps }

/**
 * FloatingActionsMenuManager - Manages Portal lifecycle for menu
 *
 * Follows ContextMenuManager pattern from ContextMenu.tsx
 */
export class FloatingActionsMenuManager {
  public container: HTMLElement
  private portal: HTMLDivElement | null = null
  private root: ReactDOM.Root | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.createPortal()
  }

  private createPortal(): void {
    // Create portal container
    this.portal = document.createElement('div')
    this.portal.style.cssText = `
      position: fixed;
      z-index: 9999;
      pointer-events: auto;
    `
    this.container.appendChild(this.portal)

    // Create React root
    this.root = ReactDOM.createRoot(this.portal)
  }

  public render(props: FloatingActionsMenuProps): void {
    if (this.root) {
      this.root.render(<FloatingActionsMenuContent {...props} />)
    }
  }

  public dispose(): void {
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
    if (this.portal && this.container.contains(this.portal)) {
      this.container.removeChild(this.portal)
      this.portal = null
    }
  }
}
