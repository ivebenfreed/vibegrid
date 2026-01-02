/**
 * ObservableCoordinateManager - MobX wrapper for VibeGridXCoordinateManager
 *
 * Wraps the existing coordinate manager with MobX observables to enable
 * reactive updates when coordinates change.
 *
 * Benefits:
 * - Controllers can use reaction() to observe coordinate changes
 * - No manual listener management
 * - Integrates with MobX devtools
 * - Automatic dependency tracking
 *
 * Usage:
 * ```typescript
 * // In controller
 * reaction(
 *   () => coordinateManager.version,  // Tracks changes
 *   () => this.updateOverlay()        // Runs when coordinates change
 * )
 * ```
 */

import { action, makeObservable, observable, runInAction } from 'mobx'
import type { CellRef, Column, TableRow, ViewportInfo } from '../types'
import {
  type CoordinateChangeEvent,
  type CoordinateMapping,
  type CoordinatePosition,
  type ViewportAwarePosition,
  VibeGridXCoordinateManager,
} from './VibeGridXCoordinateManager'

// Type alias for coordinate change listeners
type CoordinateChangeListener = (event: CoordinateChangeEvent) => void

export class ObservableCoordinateManager {
  /**
   * Observable version that increments when coordinates change
   * Controllers can watch this for reactive updates
   */
  @observable version: number = 0

  /**
   * Wrapped coordinate manager instance
   */
  private coordinator: VibeGridXCoordinateManager

  /**
   * Listener disposal function
   */
  private disposeListener: (() => void) | null = null

  constructor(coordinator?: VibeGridXCoordinateManager) {
    this.coordinator = coordinator || new VibeGridXCoordinateManager()
    makeObservable(this)

    // Subscribe to coordinator changes to update observable version
    // Must use runInAction since this callback runs outside of MobX action context
    this.disposeListener = this.coordinator.subscribe((event) => {
      runInAction(() => {
        this.version++
      })
    })

    // Initialize version from coordinator
    // Must use runInAction since this is an observable mutation in constructor
    runInAction(() => {
      this.version = this.coordinator.getVersion()
    })
  }

  // ====================================
  // MUTATING METHODS (with @action)
  // ====================================

  /**
   * Update row mappings from sorted data
   * @action increments observable version
   */
  @action
  updateRows(
    sortedRows: TableRow[],
    sortBy: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
  ): void {
    this.coordinator.updateRows(sortedRows, sortBy)
    // Version updated via listener
  }

  /**
   * Update column mappings
   * @action increments observable version
   */
  @action
  updateColumns(columns: Column[], baseOffset: number = 0): void {
    this.coordinator.updateColumns(columns, baseOffset)
    // Version updated via listener
  }

  /**
   * Clear all mappings
   * @action resets observable version
   */
  @action
  clear(): void {
    this.coordinator.clear()
    this.version = 0
  }

  // ====================================
  // READ-ONLY DELEGATIONS (no @action needed)
  // ====================================

  /**
   * Get cell position by row and column IDs
   */
  getCellPosition(
    rowId: string,
    columnId: string,
  ): { x: number; y: number; row: number; column: number } | null {
    return this.coordinator.getCellPosition(rowId, columnId)
  }

  /**
   * Get cell position with viewport awareness
   */
  getCellPositionWithViewport(
    rowId: string,
    columnId: string,
    viewport: ViewportInfo,
  ): {
    absolute: { x: number; y: number }
    viewport: { x: number; y: number } | null
    isVisible: boolean
  } | null {
    return this.coordinator.getCellPositionWithViewport(rowId, columnId, viewport)
  }

  /**
   * Convert cell reference to coordinate position
   */
  cellRefToPosition(cellRef: CellRef): CoordinatePosition | null {
    return this.coordinator.cellRefToPosition(cellRef)
  }

  /**
   * Convert coordinate position to cell reference
   */
  positionToCellRef(position: CoordinatePosition): CellRef | null {
    return this.coordinator.positionToCellRef(position)
  }

  /**
   * Get column info by ID
   */
  getColumn(columnId: string): { id: string; width: number } | null {
    return this.coordinator.getColumn(columnId)
  }

  /**
   * Get column width by ID
   */
  getColumnWidth(columnId: string): number {
    return this.coordinator.getColumnWidth(columnId)
  }

  /**
   * Get column offset by ID
   */
  getColumnOffset(columnId: string): number {
    return this.coordinator.getColumnOffset(columnId)
  }

  /**
   * Get all column IDs in order
   */
  getColumnIds(): string[] {
    return this.coordinator.getColumnIds()
  }

  /**
   * Get all sorted row IDs
   */
  getSortedRowIds(): string[] {
    return this.coordinator.getSortedRowIds()
  }

  /**
   * Check if row exists in mappings
   */
  hasRow(rowId: string): boolean {
    return this.coordinator.hasRow(rowId)
  }

  /**
   * Check if column exists in mappings
   */
  hasColumn(columnId: string): boolean {
    return this.coordinator.hasColumn(columnId)
  }

  /**
   * Get total row count
   */
  getRowCount(): number {
    return this.coordinator.getRowCount()
  }

  /**
   * Get total column count
   */
  getColumnCount(): number {
    return this.coordinator.getColumnCount()
  }

  /**
   * Check if row is visible in viewport
   */
  isRowVisible(rowId: string, viewport: ViewportInfo): boolean {
    return this.coordinator.isRowVisible(rowId, viewport)
  }

  /**
   * Get all visible cells in viewport
   */
  getVisibleCells(
    selectedCells: Set<string>,
    viewport: ViewportInfo,
  ): Map<string, ViewportAwarePosition> {
    return this.coordinator.getVisibleCells(selectedCells, viewport)
  }

  /**
   * Convert cell keys to position keys
   */
  cellKeysToPositions(cellKeys: Set<string>): Set<string> {
    return this.coordinator.cellKeysToPositions(cellKeys)
  }

  /**
   * Convert position keys to cell keys
   */
  positionsToCellKeys(positionKeys: Set<string>): Set<string> {
    return this.coordinator.positionsToCellKeys(positionKeys)
  }

  /**
   * Calculate logical range between two cells
   */
  calculateLogicalRange(start: CellRef, end: CellRef): CoordinatePosition[] {
    return this.coordinator.calculateLogicalRange(start, end)
  }

  /**
   * Calculate cell range between two cells
   */
  calculateCellRange(start: CellRef, end: CellRef): Set<string> {
    return this.coordinator.calculateCellRange(start, end)
  }

  /**
   * Move cell reference in a direction
   */
  moveCellRef(current: CellRef, direction: 'up' | 'down' | 'left' | 'right'): CellRef | null {
    return this.coordinator.moveCellRef(current, direction)
  }

  /**
   * Get current mapping (readonly)
   */
  getMapping(): Readonly<CoordinateMapping> {
    return this.coordinator.getMapping()
  }

  /**
   * Get current version from wrapped coordinator
   */
  getVersion(): number {
    return this.coordinator.getVersion()
  }

  /**
   * Subscribe to coordinate changes (legacy API)
   * Prefer using MobX reaction() on .version instead
   */
  subscribe(listener: CoordinateChangeListener): () => void {
    return this.coordinator.subscribe(listener)
  }

  /**
   * Debug helper
   */
  debug(): void {
    this.coordinator.debug()
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.disposeListener) {
      this.disposeListener()
      this.disposeListener = null
    }
  }
}
