import type React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { rootStore, StoreProvider } from '@/app/stores'
import { queryClient } from '@/shared/data/api/client'
import { getLogger } from '@/shared/lib/logging'
import { isDropdownType as isDropdownCellType } from '../column-types'
import type { CellRef, Column } from '../types'
// Pure Observable architecture - no XState dependencies
import { createEditor } from './editors'
import type { VisualCellPosition } from './OverlayTypes'

const fileLog = getLogger(['vibegrid', 'overlays', 'EditingOverlay'])

/**
 * Wrap editor content with app-level providers (StoreProvider, QueryClientProvider).
 * EditingOverlay creates its own ReactDOM.createRoot which is outside the main React tree,
 * so editors that use hooks like useEntityCollection → useOrganization → useRootStore
 * (e.g., RelationshipEditor) would crash without these providers.
 */
function OverlayProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider store={rootStore}>{children}</StoreProvider>
    </QueryClientProvider>
  )
}

function wrapWithProviders(element: React.ReactElement): React.ReactElement {
  return <OverlayProviders>{element}</OverlayProviders>
}

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
  interactionStore?: any // MobX InteractionStore for state management
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

    fileLog.debug('EditingOverlay: Constructor called', {
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

    fileLog.debug('EditingOverlay: Portal created', {
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

    // CRITICAL: Hide portal IMMEDIATELY to prevent flash at old position
    // This must happen before any other operations when transitioning between cells
    const isTransition =
      this.currentCell &&
      (this.currentCell.rowId !== cell.rowId || this.currentCell.columnId !== cell.columnId)

    if (isTransition) {
      // Hide immediately to prevent flash
      this.portal.style.display = 'none'
      // Clear old React content to prevent stale UI flash
      this.root.render(null)
    }

    // Re-append portal if it's not in DOM (canvas container might have been cleared)
    if (!this.portal.parentElement) {
      fileLog.debug('EditingOverlay: Re-appending portal to container')
      this.container.appendChild(this.portal)
    }

    fileLog.debug('EditingOverlay: Showing editor - VALUE DEBUG', {
      cell: cell,
      cellId: `${cell.rowId}:${cell.columnId}`,
      column: column.id,
      position,
      receivedValue: value,
      valueType: typeof value,
      valueLength: typeof value === 'string' ? value.length : 'N/A',
      firstChars: typeof value === 'string' ? `${value.substring(0, 50)}...` : value,
      mode,
      immediate,
      isTransition,
    })

    // Restore cell content from previous edit (if any) before setting new cell
    if (isTransition) {
      this.restoreCellContent(this.currentCell!)
    }

    // Store current state
    this.currentCell = cell
    this.currentColumn = column
    this.currentValue = value

    // Store cell ID on portal for tracking
    this.portal.setAttribute('data-cell-id', `${cell.rowId}:${cell.columnId}`)

    // Portal is hidden at this point (either from transition above or initial state)
    // Will be shown after positioning AND rendering is complete

    fileLog.debug('EditingOverlay: Portal positioned with absolute coordinates', {
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

    fileLog.debug('EditingOverlay: Editor type detection', {
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

      // NOTE: Portal visibility is set AFTER React render below
    } else if (isDropdownType) {
      // Dropdown editors: Use the position from visual state (single source of truth)
      const columnType = column.cellType || column.type || ''

      // For date pickers, use larger height to avoid scrolling
      const isDateType = [
        'date',
        'datetime',
        'datetime-local',
        'timestamp',
        'timestamptz',
      ].includes(columnType)

      // Only date pickers need a fixed width - other dropdowns auto-size to content
      const dropdownWidth = isDateType ? Math.max(position.width, 300) : 'auto'
      const dropdownHeight = isDateType ? 450 : 300 // Larger for date pickers

      fileLog.debug('EditingOverlay: Using visual state coordinates', {
        position: { x: position.x, y: position.y, width: position.width, height: position.height },
        cellId: `${cell.rowId}:${cell.columnId}`,
        isDateType,
        dropdownHeight,
      })

      // Position dropdown directly below cell using visual state coordinates
      this.portal.style.left = `${position.x}px`
      this.portal.style.top = `${position.y + position.height}px`
      this.portal.style.width =
        typeof dropdownWidth === 'number' ? `${dropdownWidth}px` : dropdownWidth
      this.portal.style.height = 'auto'
      this.portal.style.maxHeight = `${dropdownHeight}px`
      this.portal.style.padding = '4px'
      this.portal.style.boxSizing = 'border-box'
      this.portal.style.backgroundColor = 'hsl(var(--popover))'
      this.portal.style.border = '1px solid hsl(var(--border))'
      this.portal.style.borderRadius = '4px'
      this.portal.style.boxShadow =
        '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
      this.portal.style.zIndex = '1001' // Above everything
      this.portal.style.overflow = 'auto'

      // Add editing indicator to the original cell
      this.addEditingIndicatorToCell(cell, mode)

      // NOTE: Portal visibility is set AFTER React render below
    } else {
      // Default behavior for other editors
      this.portal.style.left = `${position.x}px`
      this.portal.style.top = `${position.y}px`
      this.portal.style.width = `${position.width}px`
      this.portal.style.height = `${position.height}px`
      this.portal.style.padding = '4px'

      // NOTE: Portal visibility is set AFTER React render below
    }

    // Render the editor component using shadcn components
    fileLog.debug('EditingOverlay: About to render editor', {
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

    fileLog.debug('EditingOverlay: Getting current entity', {
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

    // Convert Map<string, string> to string[] for editor props
    const validationErrorsList = validationErrors ? Array.from(validationErrors.values()) : []

    const editorComponent = createEditor({
      cell,
      column,
      initialValue: value,
      onCommit: this.config.tableInteraction$
        ? // Direct commit to observables (new architecture)
          async (value) => {
            fileLog.debug('EditingOverlay direct commit with value', { value })
            // Don't call updateEditValue here - saveEdit should use the passed value directly
            await this.config.tableInteraction$.saveEdit(value)
          }
        : // Fallback to renderer callback (old architecture)
          this.config.onCommit,
      onCancel: this.config.onCancel,
      onUpdate: this.config.tableInteraction$
        ? // Direct update to observables (new architecture)
          (value) => {
            fileLog.debug('EditingOverlay direct onUpdate with value', { value })
            this.config.tableInteraction$.updateEditValue(value)
          }
        : // Fallback to renderer callback (old architecture)
          this.config.onUpdate,
      validationErrors: validationErrorsList,
      relationshipContext: enhancedRelationshipContext,
    })

    fileLog.debug('EditingOverlay: Editor component created', {
      editorComponent,
      componentType:
        typeof editorComponent.type === 'function' ? editorComponent.type.name : 'unknown',
    })

    this.root.render(wrapWithProviders(editorComponent))

    // CRITICAL: Show portal AFTER React has rendered to prevent flash
    // Use queueMicrotask to ensure React's synchronous render has completed,
    // then use requestAnimationFrame to ensure the browser has painted
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (this.portal && this.currentCell) {
          // Only show if we're still editing the same cell
          const currentCellId = `${this.currentCell.rowId}:${this.currentCell.columnId}`
          const portalCellId = this.portal.getAttribute('data-cell-id')

          if (currentCellId === portalCellId) {
            this.portal.style.display = 'block'

            // Smooth scroll for dropdowns (after portal is visible)
            if (isDropdownType) {
              this.portal.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest',
              })
            }

            fileLog.debug('EditingOverlay: Portal shown after render', {
              cellId: currentCellId,
              portalChildCount: this.portal.childNodes.length,
            })
          }
        }
      })
    })
  }

  public updateValue(value: any): void {
    this.currentValue = value
    // Don't re-render - the TextEditor component manages its own state
    // This prevents unnecessary re-renders on every keypress
  }

  public updateValidationErrors(_errors: Map<string, string>): void {
    // Re-render with validation errors
    if (this.currentCell && this.currentColumn && this.currentValue !== null && this.root) {
      this.root.render(
        wrapWithProviders(
          createEditor({
            cell: this.currentCell,
            column: this.currentColumn,
            initialValue: this.currentValue,
            onCommit: this.config.onCommit,
            onCancel: this.config.onCancel,
            onUpdate: this.config.onUpdate,
            relationshipContext: this.config.relationshipContext,
          }),
        ),
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

  private addEditingIndicatorToCell(cell: CellRef, _mode?: string): void {
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

    fileLog.debug('EditingOverlay: Hiding editor')

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
