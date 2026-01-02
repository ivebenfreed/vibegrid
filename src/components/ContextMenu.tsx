import { Clipboard, Copy, Minus, Plus, Scissors } from 'lucide-react'
import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'

// ====================================
// CONTEXT MENU TYPES
// ====================================

export interface ContextMenuPosition {
  x: number
  y: number
  clientX: number
  clientY: number
}

export interface ContextMenuProps {
  isVisible: boolean
  position: ContextMenuPosition | null
  context: {
    type: 'cell' | 'header' | 'general'
    rowId?: string
    columnId?: string
  } | null
  onClose: () => void
  onCopy: () => void
  onPaste: () => void
  onCut?: () => void
  onInsertRow?: () => void
  onDeleteRow?: () => void
  onInsertColumn?: () => void
  onDeleteColumn?: () => void
}

// ====================================
// CONTEXT MENU MANAGER CLASS
// ====================================

export class ContextMenuManager {
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
    this.portal.className = 'vibegridx-context-menu-portal'
    this.portal.style.cssText = `
      position: fixed;
      z-index: 9999;
      pointer-events: auto;
      box-sizing: border-box;
    `

    // Initially hidden
    this.portal.style.display = 'none'

    // Append to container
    this.container.appendChild(this.portal)

    // Create React root
    this.root = ReactDOM.createRoot(this.portal)
  }

  public show(props: ContextMenuProps): void {
    if (!this.portal || !this.root || !props.isVisible || !props.position) return

    // Re-append portal if it's not in DOM (canvas container might have been cleared)
    if (!this.portal.parentElement) {
      this.container.appendChild(this.portal)
    }

    // Calculate menu position to keep it within viewport
    const menuWidth = 200
    const menuHeight = 300 // Estimated max height
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let x = props.position.clientX
    let y = props.position.clientY

    // Adjust X position if menu would overflow right edge
    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 10
    }

    // Adjust Y position if menu would overflow bottom edge
    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 10
    }

    // Position the portal
    this.portal.style.display = 'block'
    this.portal.style.left = `${x}px`
    this.portal.style.top = `${y}px`

    // Render the context menu
    this.root.render(<ContextMenuContent {...props} />)
  }

  public hide(): void {
    if (!this.portal || !this.root) return

    this.portal.style.display = 'none'
    this.root.render(null)
  }

  public destroy(): void {
    this.hide()

    // Defer unmount to avoid React race condition during render
    if (this.root) {
      const rootToUnmount = this.root
      this.root = null

      setTimeout(() => {
        rootToUnmount.unmount()
      }, 0)
    }

    if (this.portal && this.portal.parentNode) {
      const portalToRemove = this.portal
      this.portal = null

      setTimeout(() => {
        if (portalToRemove.parentNode) {
          portalToRemove.parentNode.removeChild(portalToRemove)
        }
      }, 0)
    }
  }
}

// ====================================
// CONTEXT MENU CONTENT COMPONENT
// ====================================

function ContextMenuContent({
  isVisible,
  position,
  context,
  onClose,
  onCopy,
  onPaste,
  onCut,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
}: ContextMenuProps) {
  const menuElementRef = useRef<HTMLDivElement | null>(null)

  // Close menu on outside click or escape
  useEffect(() => {
    if (!isVisible) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuElementRef.current && !menuElementRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    // Small delay to prevent immediate closing when right-click opens the menu
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 100)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isVisible, onClose])

  if (!isVisible || !position || !context) {
    return null
  }

  const menuItems = []

  // Copy/Paste actions (always available)
  menuItems.push(
    <button
      type="button"
      key="copy"
      className="context-menu-item"
      onClick={() => {
        onCopy()
        onClose()
      }}
    >
      <Copy size={16} />
      <span>Copy</span>
      <kbd>Ctrl+C</kbd>
    </button>,
  )

  menuItems.push(
    <button
      type="button"
      key="paste"
      className="context-menu-item"
      onClick={() => {
        onPaste()
        onClose()
      }}
    >
      <Clipboard size={16} />
      <span>Paste</span>
      <kbd>Ctrl+V</kbd>
    </button>,
  )

  // Cut action (only for cells)
  if (context.type === 'cell' && onCut) {
    menuItems.push(
      <button
        type="button"
        key="cut"
        className="context-menu-item"
        onClick={() => {
          onCut()
          onClose()
        }}
      >
        <Scissors size={16} />
        <span>Cut</span>
        <kbd>Ctrl+X</kbd>
      </button>,
    )
  }

  // Add separator
  if (menuItems.length > 0) {
    menuItems.push(<div key="separator-1" className="context-menu-separator" />)
  }

  // Row/Column operations based on context
  if (context.type === 'cell') {
    if (onInsertRow) {
      menuItems.push(
        <button
          type="button"
          key="insert-row"
          className="context-menu-item"
          onClick={() => {
            onInsertRow()
            onClose()
          }}
        >
          <Plus size={16} />
          <span>Insert Row</span>
        </button>,
      )
    }

    if (onDeleteRow) {
      menuItems.push(
        <button
          type="button"
          key="delete-row"
          className="context-menu-item context-menu-item-danger"
          onClick={() => {
            onDeleteRow()
            onClose()
          }}
        >
          <Minus size={16} />
          <span>Delete Row</span>
        </button>,
      )
    }
  } else if (context.type === 'header') {
    if (onInsertColumn) {
      menuItems.push(
        <button
          type="button"
          key="insert-column"
          className="context-menu-item"
          onClick={() => {
            onInsertColumn()
            onClose()
          }}
        >
          <Plus size={16} />
          <span>Insert Column</span>
        </button>,
      )
    }

    if (onDeleteColumn) {
      menuItems.push(
        <button
          type="button"
          key="delete-column"
          className="context-menu-item context-menu-item-danger"
          onClick={() => {
            onDeleteColumn()
            onClose()
          }}
        >
          <Minus size={16} />
          <span>Delete Column</span>
        </button>,
      )
    }
  }

  return (
    <div ref={menuElementRef} className="vibegridx-context-menu">
      {menuItems}
    </div>
  )
}

// ====================================
// LEGACY COMPONENT FOR DIRECT USE
// ====================================

export function ContextMenu(props: ContextMenuProps) {
  // For backward compatibility, render nothing - use ContextMenuManager instead
  return null
}

// ====================================
// CONTEXT MENU STYLES
// ====================================

// Add styles - these should be included in the VibeGrid CSS
const contextMenuStyles = `
.vibegridx-context-menu {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  padding: 4px 0;
  min-width: 200px;
  font-size: 14px;
  user-select: none;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.context-menu-item:hover {
  background-color: #f8fafc;
}

.context-menu-item:active {
  background-color: #e2e8f0;
}

.context-menu-item-danger {
  color: #dc2626;
}

.context-menu-item-danger:hover {
  background-color: #fef2f2;
}

.context-menu-item kbd {
  margin-left: auto;
  font-size: 12px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
}

.context-menu-separator {
  height: 1px;
  background-color: #e2e8f0;
  margin: 4px 0;
}

.dark .vibegridx-context-menu {
  background: #1e293b;
  border-color: #374151;
}

.dark .context-menu-item:hover {
  background-color: #334155;
}

.dark .context-menu-item:active {
  background-color: #475569;
}

.dark .context-menu-item-danger {
  color: #f87171;
}

.dark .context-menu-item-danger:hover {
  background-color: #450a0a;
}

.dark .context-menu-separator {
  background-color: #374151;
}

.dark .context-menu-item kbd {
  color: #94a3b8;
}
`

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('vibegrid-context-menu-styles')) {
  const style = document.createElement('style')
  style.id = 'vibegrid-context-menu-styles'
  style.textContent = contextMenuStyles
  document.head.appendChild(style)
}
