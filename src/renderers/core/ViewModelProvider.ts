/**
 * ViewModelProvider - Centralized memoized selectors for renderer consumption
 *
 * Replaces inline getters scattered across controllers:
 * - getProcessedRows: () => this.tableCoreStore.processedRows
 * - getVisibleColumns: () => columns.filter(...)
 *
 * Benefits:
 * - Single recomputation when deps change (not per-controller)
 * - Strongly typed
 * - Easy to test
 * - Clear separation of concerns
 */

import { computed, makeObservable } from 'mobx'
import type { EditingStore } from '../../stores/EditingStore'
import type { InteractionStore } from '../../stores/InteractionStore'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import type { VisualStateStore } from '../../stores/VisualStateStore'

export class ViewModelProvider {
  constructor(
    private tableCoreStore: TableCoreStore,
    private visualStateStore: VisualStateStore,
    private interactionStore: InteractionStore,
    private editingStore: EditingStore,
  ) {
    makeObservable(this)
  }

  // ==========================================
  // DATA ACCESS
  // ==========================================

  /**
   * Processed rows (filtered, sorted, grouped)
   * Used by: SelectionController, KeyboardNavigationController, BodyRenderer
   */
  @computed
  get processedRows(): any[] {
    return this.tableCoreStore.processedRows
  }

  /**
   * Row offsets for virtual scrolling
   * Used by: VirtualScrollManager, OverlayManager
   */
  @computed
  get rowOffsets(): number[] {
    return this.tableCoreStore.rowOffsets
  }

  /**
   * All columns from schema
   * Used by: HeaderRenderer, BodyRenderer
   */
  @computed
  get columns(): any[] {
    return this.tableCoreStore.columns
  }

  // ==========================================
  // VISUAL STATE
  // ==========================================

  /**
   * Visible columns (excluding hidden ones)
   * Used by: SelectionController, KeyboardNavigationController, renderers
   */
  @computed
  get visibleColumns(): any[] {
    const columns = this.visualStateStore.columns
    const columnVisibility = this.visualStateStore.columnVisibility
    return columns.filter((col) => columnVisibility[col.id] !== false)
  }

  /**
   * Column order
   * Used by: HeaderRenderer, BodyRenderer
   */
  @computed
  get columnOrder(): string[] {
    return this.visualStateStore.columnOrder
  }

  /**
   * Column widths
   * Used by: HeaderRenderer, BodyRenderer, OverlayManager
   */
  @computed
  get columnWidths(): Record<string, number> {
    return this.visualStateStore.columnWidths
  }

  /**
   * Column visibility map
   * Used by: HeaderRenderer, BodyRenderer
   */
  @computed
  get columnVisibility(): Record<string, boolean> {
    return this.visualStateStore.columnVisibility
  }

  // ==========================================
  // INTERACTION STATE
  // ==========================================

  /**
   * Selected cells
   * Used by: OverlayManager, SelectionController
   */
  @computed
  get selectedCells(): Set<string> {
    return this.interactionStore.selectedCells
  }

  /**
   * Is user currently editing a cell
   * Used by: OverlayManager, EditingOverlayController
   */
  @computed
  get isEditing(): boolean {
    return this.editingStore.isEditing
  }

  /**
   * Currently editing cell ID
   * Used by: OverlayManager, EditingOverlayController
   */
  @computed
  get editingCell(): string | null {
    return this.editingStore.editingCell
  }

  /**
   * Current edit value
   * Used by: EditingOverlayController
   */
  @computed
  get editValue(): any {
    return this.editingStore.editValue
  }

  /**
   * Select all checkbox state
   * Used by: HeaderRenderer
   */
  @computed
  get selectAllCheckboxState(): { checked: boolean; indeterminate: boolean } {
    return this.interactionStore.selectAllCheckboxState
  }

  // ==========================================
  // DERIVED HELPERS
  // ==========================================

  /**
   * Total number of rows
   * Used by: Virtualization, statistics
   */
  @computed
  get rowCount(): number {
    return this.processedRows.length
  }

  /**
   * Total number of visible columns
   * Used by: Layout calculations
   */
  @computed
  get visibleColumnCount(): number {
    return this.visibleColumns.length
  }

  /**
   * Number of selected cells
   * Used by: UI feedback, batch operations
   */
  @computed
  get selectedCellCount(): number {
    return this.selectedCells.size
  }

  /**
   * Is any cell selected
   * Used by: UI state, keyboard shortcuts
   */
  @computed
  get hasSelection(): boolean {
    return this.selectedCells.size > 0
  }

  /**
   * Are all rows selected
   * Used by: Select all checkbox
   */
  @computed
  get isAllRowsSelected(): boolean {
    const totalRows = this.rowCount
    if (totalRows === 0) return false

    // Check if all rows have at least one selected cell
    const selectedRowIds = new Set<string>()
    for (const cellId of this.selectedCells) {
      const [rowId] = cellId.split(':')
      selectedRowIds.add(rowId)
    }

    return selectedRowIds.size === totalRows
  }
}
