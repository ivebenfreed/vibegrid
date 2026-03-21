import { MoreVertical } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useVibeGridStores } from '../stores/context'

/**
 * RowActionButton - Three-dots button for opening row action menu
 *
 * Appears on row hover and triggers the FloatingActionsMenu
 * Follows same pattern as ContextMenu for Portal-based rendering
 */

interface RowActionButtonProps {
  rowId: string
  rowData: any
  className?: string
}

export const RowActionButton = observer((props: RowActionButtonProps) => {
  const { rowId, className = '' } = props
  const { menuStateStore } = useVibeGridStores()

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation() // Prevent row click from firing
    event.preventDefault()

    // Get button position for menu positioning
    const buttonRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const position = {
      x: buttonRect.right - 8, // Align menu to right edge of button
      y: buttonRect.bottom + 4, // Position below button
    }

    // Open row action menu via store
    menuStateStore.openRowActionMenu(rowId, position)
  }

  return (
    <button
      type="button"
      className={`vibegridx-row-action-button ${className}`}
      onClick={handleClick}
      aria-label="Row actions"
      data-row-id={rowId}
    >
      <MoreVertical className="vibegridx-row-action-icon" size={16} />
    </button>
  )
})

RowActionButton.displayName = 'RowActionButton'
