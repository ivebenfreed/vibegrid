import React from 'react'
import ReactDOM from 'react-dom/client'
import { isDropdownType as isDropdownCellType } from '../column-types'
import type { CellRef, Column } from '../types'
// Pure Observable architecture - no XState dependencies
import { createEditor, type EditorProps } from './editors'
import type { VisualCellPosition } from './OverlayTypes'

// ====================================
// EDITING OVERLAY - React Portal for Cell Editing
// ====================================

interface EditingOverlayConfig {
  onUpdate?: (value: any) => void // Made optional to prevent re-renders
  onCommit: (value: any) => void
  onCancel: () => void
  zIndex?: number
  // Direct access to table interactions for self-contained commits
  tableInteraction$?: any
  // Relationship context for dropdown editors
  relationshipContext?: {
    relationshipResolvers?: Record<string, (id: string | string[]) => string>
  }
  // Function to get current row data by row ID
  getRowData?: (rowId: string) => any
}

export class EditingOverlay {
  public container: HTMLElement // Made public for container change detection
  private portal: HTMLDivElement | null = null
  private root: ReactDOM.Root | null = null
  private config: EditingOverlayConfig
  private currentCell: CellRef | null = null
  private currentColumn: Column | null = null
  private currentValue: any = null

  constructor(container: HTMLElement, config: EditingOverlayConfig) {
    // Find the viewport container which is where cells are positioned
    const viewportContainer =
      (container.querySelector('.vibegridx-viewport') as HTMLElement) || container
    this.container = viewportContainer
    this.config = config

    console.log('🔧 EditingOverlay: Constructor called', {
      originalContainer: container,
      actualContainer: this.container,
      containerClass: this.container.className,
      usingViewport: this.container !== container,
      containerInDOM: document.contains(this.container),
      containerVisible: this.container.offsetWidth > 0 && this.container.offsetHeight > 0,
      containerBounds: this.container.getBoundingClientRect(),
    })

    this.createPortal()
  }

  private createPortal(): void {
    // Create portal container
    this.portal = document.createElement('div')
    this.portal.className = 'vibegridx-editing-portal'
    this.portal.style.cssText = `
      position: absolute;
      z-index: ${this.config.zIndex || 1000};
      pointer-events: auto;
      box-sizing: border-box;
    `

    // Ensure the portal can receive focus events
    this.portal.setAttribute('tabindex', '-1')

    // Initially hidden
    this.portal.style.display = 'none'

    // Append to container
    this.container.appendChild(this.portal)

    // Create React root
    this.root = ReactDOM.createRoot(this.portal)

    console.log('🔧 EditingOverlay: Portal created', {
      portal: this.portal,
      container: this.container,
      containerClass: this.container.className,
      zIndex: this.config.zIndex || 1000,
      portalInDOM: document.contains(this.portal),
      portalParent: this.portal.parentElement,
      containerChildCount: this.container.childNodes.length,
      portalAppended: this.container.contains(this.portal),
    })
  }

  public showAt(
    position: VisualCellPosition,
    cell: CellRef,
    column: Column,
    value: any,
    validationErrors?: Map<string, string>,
    mode?: 'single-click' | 'double-click' | 'keyboard',
    immediate?: boolean,
  ): void {
    if (!this.portal || !this.root) return

    // Re-append portal if it's not in DOM (canvas container might have been cleared)
    if (!this.portal.parentElement) {
      console.log('🔧 EditingOverlay: Re-appending portal to container')
      this.container.appendChild(this.portal)
    }

    console.log('🔍 EditingOverlay: Showing editor - VALUE DEBUG', {
      cell: cell,
      cellId: `${cell.rowId}:${cell.columnId}`,
      column: column.id,
      position,
      receivedValue: value,
      valueType: typeof value,
      valueLength: typeof value === 'string' ? value.length : 'N/A',
      firstChars: typeof value === 'string' ? value.substring(0, 50) + '...' : value,
      mode,
      immediate,
    })

    // Store current state
    this.currentCell = cell
    this.currentColumn = column
    this.currentValue = value

    // Store cell ID on portal for tracking
    this.portal.setAttribute('data-cell-id', `${cell.rowId}:${cell.columnId}`)

    // Position the portal
    this.portal.style.display = 'block'

    console.log('🔧 EditingOverlay: Portal positioned with absolute coordinates', {
      position,
      portalDisplay: this.portal.style.display,
      portalVisible: this.portal.offsetWidth > 0 && this.portal.offsetHeight > 0,
      portalBounds: this.portal.getBoundingClientRect(),
      portalInDOM: document.contains(this.portal),
      portalParent: this.portal.parentElement,
      containerInDOM: document.contains(this.container),
      containerVisible: this.container.offsetWidth > 0 && this.container.offsetHeight > 0,
      containerBounds: this.container.getBoundingClientRect(),
      note: 'Position should now match cell coordinates exactly - no scroll compensation applied',
    })

    // Check editor type to determine positioning strategy
    const isTextType = [
      'text',
      'string',
      'email',
      'url',
      'textarea',
      'longtext',
      'number',
      'integer',
      'float',
    ].includes(column.cellType || column.type || 'text')
    const isDropdownType =
      [
        'boolean',
        'relationship',
        'relationship-single',
        'relationship-multi',
        'relationship-collection',
        'date',
        'datetime',
        'timestamp',
        'select',
        'single-select',
        'enum',
        'select-multi',
        'priority_option',
        'status_option',
        'category_option',
        'task_type_option',
        'user_reference',
        'custom_user_reference',
        'entity_reference',
        'custom_entity_reference',
        'reference-select',
      ].includes(column.cellType || column.type || 'text') ||
      isDropdownCellType(column.cellType || column.type || 'text')

    console.log('🔧 EditingOverlay: Editor type detection', {
      columnType: column.cellType || column.type || 'text',
      isTextType,
      isDropdownType,
      columnOptions: column.options,
      columnEnumOptions: column.enumOptions,
    })

    if (isTextType) {
      // Text editors: Position exactly over the cell and hide cell content
      this.portal.style.left = `${position.x}px`
      this.portal.style.top = `${position.y}px`
      this.portal.style.width = `${position.width}px`
      this.portal.style.height = `${position.height}px`
      this.portal.style.padding = '0'
      this.portal.style.boxSizing = 'border-box'
      this.portal.style.fontSize = '13px'
      this.portal.style.overflow = 'hidden'
      this.portal.style.backgroundColor = 'transparent' // Avoid white flash

      // Hide the cell content by adding a class to the cell
      this.hideCellContent(cell)

      // No outline needed - canvas overlay handles the border
    } else if (isDropdownType) {
      // Dropdown editors: Use the position from visual state (single source of truth)
      const dropdownWidth = Math.max(position.width, 300)
      const dropdownHeight = 300 // Max height

      console.log('🔧 EditingOverlay: Using visual state coordinates', {
        position: { x: position.x, y: position.y, width: position.width, height: position.height },
        cellId: `${cell.rowId}:${cell.columnId}`,
      })

      // Position dropdown directly below cell using visual state coordinates
      this.portal.style.left = `${position.x}px`
      this.portal.style.top = `${position.y + position.height}px`
      this.portal.style.width = `${dropdownWidth}px`
      this.portal.style.height = 'auto'
      this.portal.style.maxHeight = `${dropdownHeight}px`
      this.portal.style.padding = '4px'
      this.portal.style.boxSizing = 'border-box'
      this.portal.style.backgroundColor = 'white'
      this.portal.style.border = '1px solid var(--border)'
      this.portal.style.borderRadius = '4px'
      this.portal.style.boxShadow =
        '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
      this.portal.style.zIndex = '1001' // Above everything
      this.portal.style.overflow = 'auto'

      // Check if dropdown would be cut off and adjust viewport if needed
      const containerRect = this.container.getBoundingClientRect()
      const dropdownBottom = position.y + position.height + dropdownHeight
      const dropdownRight = position.x + dropdownWidth

      // Shift viewport to accommodate dropdown (unless at scroll edge)
      const viewport = this.container.querySelector('.vibegridx-viewport') as HTMLElement
      if (viewport) {
        if (dropdownBottom > containerRect.height) {
          const scrollDown = Math.min(
            dropdownBottom - containerRect.height + 20,
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
          )
          if (scrollDown > 0) {
            viewport.scrollTop += scrollDown
          }
        }

        if (dropdownRight > containerRect.width) {
          const scrollRight = Math.min(
            dropdownRight - containerRect.width + 20,
            viewport.scrollWidth - viewport.scrollLeft - viewport.clientWidth,
          )
          if (scrollRight > 0) {
            viewport.scrollLeft += scrollRight
          }
        }
      }

      // Add editing indicator to the original cell
      this.addEditingIndicatorToCell(cell, mode)
    } else {
      // Default behavior for other editors
      this.portal.style.left = `${position.x}px`
      this.portal.style.top = `${position.y}px`
      this.portal.style.width = `${position.width}px`
      this.portal.style.height = `${position.height}px`
      this.portal.style.padding = '4px'

      // No outline needed - canvas overlay handles the border
    }

    // Render the editor component using shadcn components
    console.log('🔧 EditingOverlay: About to render editor', {
      hasRoot: !!this.root,
      hasPortal: !!this.portal,
      column: column.id,
      columnType: column.cellType || column.type,
      value,
      hasCallbacks: {
        onCommit: !!this.config.onCommit,
        onCancel: !!this.config.onCancel,
        onUpdate: !!this.config.onUpdate,
      },
      hasTableInteraction: !!this.config.tableInteraction$,
      useDirectCommit: !!this.config.tableInteraction$,
    })

    // Get current row data for relationship context
    const currentEntity = this.config.getRowData ? this.config.getRowData(cell.rowId) : null

    console.log('🔧 EditingOverlay: Getting current entity', {
      rowId: cell.rowId,
      hasGetRowData: !!this.config.getRowData,
      currentEntity,
      hasRelationshipContext: !!this.config.relationshipContext,
    })

    // Create enhanced relationship context with current entity
    const enhancedRelationshipContext = this.config.relationshipContext
      ? {
          ...this.config.relationshipContext,
          currentEntity,
        }
      : undefined

    const editorComponent = createEditor({
      cell,
      column,
      initialValue: value,
      onCommit: this.config.tableInteraction$
        ? // Direct commit to observables (new architecture)
          async (value) => {
            console.log('🔍 EditingOverlay direct commit with value:', value)
            // Don't call updateEditValue here - saveEdit should use the passed value directly
            await this.config.tableInteraction$.saveEdit(value)
          }
        : // Fallback to renderer callback (old architecture)
          this.config.onCommit,
      onCancel: this.config.onCancel,
      onUpdate: this.config.tableInteraction$
        ? // Direct update to observables (new architecture)
          (value) => {
            console.log('🔍 EditingOverlay direct onUpdate with value:', value)
            this.config.tableInteraction$.updateEditValue(value)
          }
        : // Fallback to renderer callback (old architecture)
          this.config.onUpdate,
      relationshipContext: enhancedRelationshipContext,
    })

    console.log('🔧 EditingOverlay: Editor component created', {
      editorComponent,
      componentType: editorComponent.type?.name || 'unknown',
    })

    this.root.render(editorComponent)

    // Force a synchronous flush to ensure content renders immediately
    // This is necessary because React 18's concurrent features can delay renders
    ;(this.root as any)._internalRoot?.containerInfo?.dispatchEvent?.(new Event('load'))

    // Use setTimeout to check portal contents after React has rendered
    setTimeout(() => {
      console.log('🔧 EditingOverlay: Portal contents after render (delayed check)', {
        portalChildCount: this.portal?.childNodes.length || 0,
        portalVisible: this.portal?.offsetWidth > 0 && this.portal?.offsetHeight > 0,
        portalHTML: this.portal?.innerHTML?.substring(0, 100) || 'empty',
        hasFirstChild: !!this.portal?.firstChild,
        firstChildType: this.portal?.firstChild?.nodeType,
        firstChildTag: (this.portal?.firstChild as any)?.tagName,
      })
    }, 0)
  }

  public updateValue(value: any): void {
    this.currentValue = value
    // Don't re-render - the TextEditor component manages its own state
    // This prevents unnecessary re-renders on every keypress
  }

  public updateValidationErrors(errors: Map<string, string>): void {
    // Re-render with validation errors
    if (this.currentCell && this.currentColumn && this.currentValue !== null && this.root) {
      this.root.render(
        createEditor({
          cell: this.currentCell,
          column: this.currentColumn,
          initialValue: this.currentValue,
          onCommit: this.config.onCommit,
          onCancel: this.config.onCancel,
          onUpdate: this.config.onUpdate,
          relationshipContext: this.config.relationshipContext,
        }),
      )
    }
  }

  private hideCellContent(cell: CellRef): void {
    // Find the cell element and hide its content
    const cellElement = document.querySelector(
      `[data-row-id="${cell.rowId}"][data-column-id="${cell.columnId}"]`,
    ) as HTMLElement
    if (cellElement) {
      cellElement.classList.add('vibegridx-cell-content-hidden')
    }
  }

  private addEditingIndicatorToCell(cell: CellRef, mode?: string): void {
    // Find the cell element and add an editing indicator
    const cellElement = document.querySelector(
      `[data-row-id="${cell.rowId}"][data-column-id="${cell.columnId}"]`,
    ) as HTMLElement
    if (cellElement) {
      cellElement.classList.add('vibegridx-cell-dropdown-editing')
      // No outline needed - canvas overlay handles the border
    }
  }

  private restoreCellContent(cell: CellRef): void {
    // Find the cell element and restore its content
    const cellElement = document.querySelector(
      `[data-row-id="${cell.rowId}"][data-column-id="${cell.columnId}"]`,
    ) as HTMLElement
    if (cellElement) {
      cellElement.classList.remove('vibegridx-cell-content-hidden')
      cellElement.classList.remove('vibegridx-cell-dropdown-editing')
    }
  }

  public hide(): void {
    if (!this.portal) return

    console.log('EditingOverlay: Hiding editor')

    // Restore cell content if it was hidden
    if (this.currentCell) {
      this.restoreCellContent(this.currentCell)
    }

    // Hide portal
    this.portal.style.display = 'none'

    // Reset styles
    this.portal.style.padding = '0'
    this.portal.style.backgroundColor = ''
    this.portal.style.border = ''
    this.portal.style.borderRadius = ''
    this.portal.style.boxShadow = ''

    // Clear React content
    if (this.root) {
      this.root.render(null)
    }

    // Clear state
    this.currentCell = null
    this.currentColumn = null
    this.currentValue = null
  }

  public updatePosition(position: VisualCellPosition): void {
    if (!this.portal) return

    // Update portal position (for scrolling)
    this.portal.style.left = `${position.x}px`
    this.portal.style.top = `${position.y}px`
  }

  public destroy(): void {
    this.hide()

    if (this.root) {
      this.root.unmount()
      this.root = null
    }

    if (this.portal && this.portal.parentNode) {
      this.portal.parentNode.removeChild(this.portal)
      this.portal = null
    }
  }
}
