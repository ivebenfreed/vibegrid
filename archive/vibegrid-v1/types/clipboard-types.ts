// ====================================
// CLIPBOARD TYPES
// ====================================

/**
 * Rich clipboard data for internal copy/paste operations
 * Preserves full cell metadata for column validation and smart paste
 */
export interface VibeGridClipboardData {
  /**
   * Array of copied cells with full metadata
   */
  cells: ClipboardCell[]

  /**
   * Bounds of the copied selection
   */
  bounds: ClipboardBounds

  /**
   * Column IDs in order - used for paste validation
   */
  columnIds: string[]

  /**
   * Column types for compatibility checking
   */
  columnTypes: Record<string, string>

  /**
   * Timestamp of copy operation
   */
  timestamp: number

  /**
   * Whether this is a cut operation (vs copy)
   */
  isCut: boolean
}

/**
 * Individual cell data in clipboard
 */
export interface ClipboardCell {
  rowId: string
  columnId: string
  value: any
  displayValue?: string // For relationship/enum columns
  rowIndex: number
  columnIndex: number
  field: string // The actual data field name
}

/**
 * Selection bounds for paste validation
 */
export interface ClipboardBounds {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  rowCount: number
  colCount: number
}

/**
 * Paste validation result
 */
export interface PasteValidationResult {
  isValid: boolean
  reason?: string
  targetCells?: Array<{
    rowId: string
    columnId: string
    sourceValue: any
  }>
}

/**
 * Fill pattern types for drag fill
 */
export type FillPatternType = 'sequence' | 'date' | 'text-pattern' | 'copy'

/**
 * Fill pattern detection result
 */
export interface FillPattern {
  type: FillPatternType

  // For numeric sequences
  increment?: number
  startValue?: number

  // For date sequences
  dateInterval?: 'day' | 'week' | 'month' | 'year'
  dateStartValue?: Date

  // For text patterns
  textPattern?: RegExp
  textPrefix?: string
  textSuffix?: string
  textNumberStart?: number

  // Confidence score (0-1)
  confidence: number
}

/**
 * Options for paste operations
 */
export interface PasteOptions {
  /**
   * How to handle dimension mismatch
   */
  expandMode?: 'none' | 'fill' | 'tile'

  /**
   * Whether to skip non-editable cells
   */
  skipReadOnly?: boolean

  /**
   * Whether to validate column types
   */
  validateColumns?: boolean
}

/**
 * Column compatibility check
 */
export interface ColumnCompatibility {
  sourceColumnId: string
  targetColumnId: string
  isCompatible: boolean
  reason?: string
}
