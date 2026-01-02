/**
 * Unified Coordinate Types for VibeGrid
 *
 * These types replace the 4+ different coordinate interfaces
 * scattered across the old coordinate systems.
 */

// Basic position and dimensions
export interface Position {
  x: number
  y: number
}

export interface Dimensions {
  width: number
  height: number
}

export interface Bounds extends Position, Dimensions {}

// Grid-specific coordinates
export interface GridPosition {
  rowIndex: number
  columnIndex: number
}

export interface CellCoordinates extends Bounds {
  // Additional metadata
  source: 'dom' | 'virtual'
  isVisible: boolean
  timestamp: number
}

// Layout information for columns and rows
export interface ColumnLayout {
  id: string
  index: number
  width: number
  offset: number // x position from left edge
  visible: boolean
}

export interface RowLayout {
  id: string
  index: number
  height: number
  offset: number // y position from top
  type: 'data' | 'group' | 'header'
}

// Viewport and scrolling
export interface ViewportBounds {
  scrollLeft: number
  scrollTop: number
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
}

export interface VisibleRange {
  columns: { start: number; end: number }
  rows: { start: number; end: number }
}

// Cell identification
export interface CellRef {
  rowId: string
  columnId: string
}

export interface CellKey extends CellRef {
  key: string // "rowId:columnId"
}

// Position tracking for overlays
export interface TrackedPosition extends CellCoordinates {
  cellRef: CellRef
  lastUpdated: number
}

// Virtual scrolling types
export interface VirtualBounds {
  rowHeight: number
  columnWidths: number[]
  totalRows: number
  totalColumns: number
}

export interface VirtualViewport {
  scrollTop: number
  scrollLeft: number
  viewportWidth: number
  viewportHeight: number
}

export interface VirtualRange {
  rows: { start: number; end: number }
  columns: { start: number; end: number }
  totalHeight: number
  totalWidth: number
}

// Event types for position changes
export interface PositionChangeEvent {
  type: 'resize' | 'scroll' | 'visibility' | 'layout'
  cellKey: string
  oldPosition?: CellCoordinates
  newPosition: CellCoordinates
  timestamp: number
}

// Utility types
export type CellPositionMap = Map<string, CellCoordinates>
export type PositionUpdateHandler = (event: PositionChangeEvent) => void

// Helper functions for coordinate calculations
export const CoordinateUtils = {
  /**
   * Create cell key from row and column IDs
   */
  createCellKey(rowId: string, columnId: string): string {
    return `${rowId}:${columnId}`
  },

  /**
   * Parse cell key into row and column IDs
   */
  parseCellKey(cellKey: string): CellRef | null {
    const parts = cellKey.split(':')
    if (parts.length !== 2) return null
    return { rowId: parts[0], columnId: parts[1] }
  },

  /**
   * Check if position is within bounds
   */
  isPositionInBounds(position: Position, bounds: Bounds): boolean {
    return (
      position.x >= bounds.x &&
      position.x <= bounds.x + bounds.width &&
      position.y >= bounds.y &&
      position.y <= bounds.y + bounds.height
    )
  },

  /**
   * Calculate distance between two positions
   */
  getDistance(pos1: Position, pos2: Position): number {
    const dx = pos2.x - pos1.x
    const dy = pos2.y - pos1.y
    return Math.sqrt(dx * dx + dy * dy)
  },

  /**
   * Check if two bounds overlap
   */
  boundsOverlap(bounds1: Bounds, bounds2: Bounds): boolean {
    return !(
      bounds1.x + bounds1.width < bounds2.x ||
      bounds2.x + bounds2.width < bounds1.x ||
      bounds1.y + bounds1.height < bounds2.y ||
      bounds2.y + bounds2.height < bounds1.y
    )
  },

  /**
   * Get the intersection of two bounds
   */
  getIntersection(bounds1: Bounds, bounds2: Bounds): Bounds | null {
    if (!this.boundsOverlap(bounds1, bounds2)) return null

    const x = Math.max(bounds1.x, bounds2.x)
    const y = Math.max(bounds1.y, bounds2.y)
    const width = Math.min(bounds1.x + bounds1.width, bounds2.x + bounds2.width) - x
    const height = Math.min(bounds1.y + bounds1.height, bounds2.y + bounds2.height) - y

    return { x, y, width, height }
  },
}

// Type guards
export const CoordinateTypeGuards = {
  isCellRef(obj: any): obj is CellRef {
    return obj && typeof obj.rowId === 'string' && typeof obj.columnId === 'string'
  },

  isCellCoordinates(obj: any): obj is CellCoordinates {
    return (
      obj &&
      typeof obj.x === 'number' &&
      typeof obj.y === 'number' &&
      typeof obj.width === 'number' &&
      typeof obj.height === 'number' &&
      (obj.source === 'dom' || obj.source === 'virtual') &&
      typeof obj.isVisible === 'boolean'
    )
  },

  isPosition(obj: any): obj is Position {
    return obj && typeof obj.x === 'number' && typeof obj.y === 'number'
  },

  isBounds(obj: any): obj is Bounds {
    return (
      obj &&
      typeof obj.x === 'number' &&
      typeof obj.y === 'number' &&
      typeof obj.width === 'number' &&
      typeof obj.height === 'number'
    )
  },
}
