/**
 * ClipboardManager - Advanced clipboard operations for VibeGrid
 *
 * Handles column type-aware copy/paste operations, including:
 * - Text fields (direct paste)
 * - Select fields (value validation and mapping)
 * - Relationship fields (ID preservation)
 * - Date fields (format conversion)
 * - Number fields (validation)
 */

import { toast } from 'sonner'
import { getLogger } from '@/shared/lib/logging'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type {
  ClipboardCell,
  PasteValidationResult,
  VibeGridClipboardData,
} from '../types/clipboard-types'

const fileLog = getLogger(['custom', 'vibegrid', 'managers', 'ClipboardManager.ts'])

export interface ClipboardManagerOptions {
  tableCore$: TableCoreStore
  tableInteraction$: InteractionStore
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
}

export interface PasteResult {
  success: boolean
  pastedCount: number
  errorCount: number
  skippedCount: number
  blockedCount: number
  errorMessage?: string
  details: Array<{
    rowId: string
    columnId: string
    status: 'success' | 'error' | 'skipped' | 'blocked'
    originalValue?: any
    newValue?: any
    errorReason?: string
    sourceType?: string
    targetType?: string
  }>
}

export interface TypeCompatibility {
  sourceType: string
  targetType: string
  compatible: boolean
  reason?: string
}

export class ClipboardManager {
  private tableCore$: TableCoreStore
  private tableInteraction$: InteractionStore
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void

  constructor(options: ClipboardManagerOptions) {
    this.tableCore$ = options.tableCore$
    this.tableInteraction$ = options.tableInteraction$
    this.onEntityUpdate = options.onEntityUpdate
  }

  /**
   * Handle copy operation with rich metadata
   */
  async handleCopy(): Promise<boolean> {
    fileLog.debug('📋 ClipboardManager: Copy action triggered')

    const selectedCells = this.tableInteraction$.selectedCells
    if (selectedCells.size === 0) {
      toast.warning('No cells selected', {
        description: 'Select cells to copy first',
        duration: 3000,
      })
      return false
    }

    try {
      const clipboardData = this.extractRichClipboardData(selectedCells)
      await this.copyToSystemClipboard(clipboardData)

      // Organize cells into proper 2D array [rows][columns]
      const rowMap = new Map<string, any[]>()
      const uniqueRowIds: string[] = []

      // Group cells by row and maintain column order
      clipboardData.cells.forEach((cell) => {
        if (!rowMap.has(cell.rowId)) {
          rowMap.set(cell.rowId, [])
          uniqueRowIds.push(cell.rowId)
        }
      })

      // Sort cells by row and column indices to build proper 2D structure
      const sortedCells = [...clipboardData.cells].sort((a, b) => {
        if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex
        return a.columnIndex - b.columnIndex
      })

      // Build 2D array organized by rows and columns
      const data: any[][] = []
      let currentRow: any[] = []
      let lastRowId: string | null = null

      sortedCells.forEach((cell) => {
        if (lastRowId !== null && cell.rowId !== lastRowId) {
          // New row - push the completed row and start a new one
          data.push(currentRow)
          currentRow = []
        }
        currentRow.push(cell.value)
        lastRowId = cell.rowId
      })

      // Push the last row
      if (currentRow.length > 0) {
        data.push(currentRow)
      }

      // Store in internal clipboard with metadata and type information
      this.tableInteraction$.setClipboard({
        data,
        operation: 'copy',
        richData: clipboardData, // Store full rich clipboard data for paste validation
      })

      toast.success('Copied to clipboard', {
        description: `${selectedCells.size} cells copied`,
        duration: 2000,
      })

      fileLog.debug('📋 Copy completed with metadata', { cellCount: selectedCells.size })
      return true
    } catch (error) {
      fileLog.error('📋 Copy failed', { error })
      toast.error('Copy failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 4000,
      })
      return false
    }
  }

  /**
   * Handle paste operation with column type awareness
   */
  async handlePaste(): Promise<PasteResult> {
    fileLog.debug('📋 ClipboardManager: Paste action triggered')

    const clipboard = this.tableInteraction$.clipboard
    if (!clipboard || !clipboard.data) {
      fileLog.warn('📋 No clipboard data available')
      toast.warning('No clipboard data', {
        description: 'Copy some cells first before pasting',
        duration: 3000,
      })
      return {
        success: false,
        pastedCount: 0,
        errorCount: 1,
        skippedCount: 0,
        blockedCount: 0,
        errorMessage: 'No clipboard data available',
        details: [],
      }
    }

    const selectedCells = this.tableInteraction$.selectedCells
    if (selectedCells.size === 0) {
      fileLog.warn('📋 No target cells selected')
      toast.warning('No cells selected', {
        description: 'Select target cells before pasting',
        duration: 3000,
      })
      return {
        success: false,
        pastedCount: 0,
        errorCount: 1,
        skippedCount: 0,
        blockedCount: 0,
        errorMessage: 'No target cells selected',
        details: [],
      }
    }

    // Log clipboard data state
    fileLog.info('📋 Starting paste operation', {
      clipboardData: {
        operation: clipboard.operation,
        dataRows: clipboard.data.length,
        dataCols: clipboard.data[0]?.length || 0,
        firstRowSample: clipboard.data[0],
      },
      targetCellsCount: selectedCells.size,
      firstFewTargetCells: Array.from(selectedCells).slice(0, 3),
    })

    // Validate origin column matching for multi-cell paste
    // Only validate if multiple cells are selected AND rich data exists
    // If single cell selected, it will auto-expand from that cell
    const richClipboard = clipboard.richData

    // Check if this is a single-cell copy being pasted to multiple cells
    const isSingleCellCopy = richClipboard && richClipboard.cells.length === 1
    const isMultiCellPaste = selectedCells.size > 1

    // For single-cell copy -> multi-cell paste, skip origin column validation
    // and use type validation instead (handled in performColumnAwarePaste)
    if (isSingleCellCopy && isMultiCellPaste) {
      fileLog.info('📋 Single-cell broadcast paste detected', {
        sourceCellCount: richClipboard.cells.length,
        targetCellCount: selectedCells.size,
        sourceColumn: richClipboard.columnIds[0],
        sourceType: richClipboard.columnTypes[richClipboard.columnIds[0]],
      })

      // Skip origin column validation - type validation will be done per-cell
      // Continue to paste operation
    } else if (
      richClipboard &&
      richClipboard.columnIds &&
      richClipboard.columnIds.length > 1 &&
      selectedCells.size > 1
    ) {
      const sourceOriginColumnId = richClipboard.columnIds[0]

      // Find the leftmost column in target selection
      const allColumns = this.tableCore$.columns
      const targetColumnIds = new Set<string>()
      selectedCells.forEach((cellId) => {
        const [, columnId] = cellId.split(':')
        targetColumnIds.add(columnId)
      })

      // Sort target columns by their position in the grid
      const sortedTargetColumns = Array.from(targetColumnIds).sort((a, b) => {
        const indexA = allColumns.findIndex((col: any) => col.id === a)
        const indexB = allColumns.findIndex((col: any) => col.id === b)
        return indexA - indexB
      })

      const targetOriginColumnId = sortedTargetColumns[0]

      fileLog.debug('📋 Validating origin columns', {
        sourceOrigin: sourceOriginColumnId,
        targetOrigin: targetOriginColumnId,
        sourceColumns: richClipboard.columnIds,
        targetColumns: sortedTargetColumns,
      })

      if (sourceOriginColumnId !== targetOriginColumnId) {
        const errorMessage = `Cannot paste: origin column mismatch. Copied from "${sourceOriginColumnId}" but trying to paste to "${targetOriginColumnId}". Please select cells starting from the same column.`

        fileLog.warn('📋 Paste blocked - origin column mismatch', {
          sourceOrigin: sourceOriginColumnId,
          targetOrigin: targetOriginColumnId,
        })

        toast.error('Paste blocked - column mismatch', {
          description: errorMessage,
          duration: 5000,
        })

        return {
          success: false,
          pastedCount: 0,
          errorCount: 0,
          skippedCount: 0,
          blockedCount: selectedCells.size,
          errorMessage,
          details: [],
        }
      }
    } else if (selectedCells.size === 1 && richClipboard && !isSingleCellCopy) {
      // Single cell selected - validate the single cell's column matches the source origin
      // (only for multi-cell source copy)
      const singleCellId = Array.from(selectedCells)[0]
      const [, singleColumnId] = singleCellId.split(':')
      const sourceOriginColumnId = richClipboard.columnIds[0]

      if (singleColumnId !== sourceOriginColumnId) {
        const errorMessage = `Cannot paste: column mismatch. Copied from column "${sourceOriginColumnId}" but trying to paste starting at column "${singleColumnId}". Select a cell in column "${sourceOriginColumnId}" to paste.`

        fileLog.warn('📋 Paste blocked - single cell column mismatch', {
          targetColumn: singleColumnId,
          sourceOrigin: sourceOriginColumnId,
        })

        toast.error('Paste blocked - column mismatch', {
          description: errorMessage,
          duration: 5000,
        })

        return {
          success: false,
          pastedCount: 0,
          errorCount: 0,
          skippedCount: 0,
          blockedCount: 1,
          errorMessage,
          details: [],
        }
      }
    }

    // Auto-expand selection to match clipboard size when needed OR
    // handle single-cell broadcast paste to multiple cells
    let expandedCells = selectedCells
    const pasteData = clipboard.data

    if (isSingleCellCopy && isMultiCellPaste) {
      // Single-cell broadcast: paste same value to all selected cells
      // Keep expandedCells as is (the user's selection)
      // But modify pasteData to broadcast the single value
      fileLog.info('📋 Preparing single-cell broadcast paste', {
        singleValue: clipboard.data[0]?.[0],
        targetCellCount: selectedCells.size,
      })

      // Keep the original selection (don't auto-expand)
      // The performColumnAwarePaste will handle type validation per cell
      expandedCells = selectedCells

      // Data stays as-is (single cell value) - performColumnAwarePaste will broadcast it
    } else if (richClipboard && selectedCells.size === 1 && !isSingleCellCopy) {
      // Multi-cell copy to single cell: auto-expand
      const [singleRowId, _singleColumnId] = Array.from(selectedCells)[0].split(':')

      // Get row index for starting point
      const allRows = this.tableCore$.processedRows
      const startRowIdx = allRows.findIndex((r: any) => r.id === singleRowId)

      if (startRowIdx !== -1) {
        const rowCount = richClipboard.bounds.rowCount
        const columnIds = richClipboard.columnIds // Use actual copied column IDs

        // Create expanded cell set using the actual copied column IDs
        const expanded = new Set<string>()
        for (let r = 0; r < rowCount && startRowIdx + r < allRows.length; r++) {
          const rowId = allRows[startRowIdx + r].id
          for (const columnId of columnIds) {
            if (columnId !== 'selection') {
              expanded.add(`${rowId}:${columnId}`)
            }
          }
        }

        expandedCells = expanded
      }
    }

    try {
      const result = await this.performColumnAwarePaste(pasteData, expandedCells, isSingleCellCopy)

      // LOG FULL RESULT DETAILS
      fileLog.info('📋 Paste operation completed', {
        success: result.success,
        pastedCount: result.pastedCount,
        errorCount: result.errorCount,
        skippedCount: result.skippedCount,
        blockedCount: result.blockedCount,
        errorMessage: result.errorMessage,
        detailsCount: result.details.length,
      })

      // Clear copy overlay on successful paste
      if (result.success && result.pastedCount > 0) {
        this.tableInteraction$.clearClipboard()
        fileLog.debug('📋 Clipboard cleared after successful paste')
      }

      // Show appropriate toast based on results
      if (result.errorCount === 0 && result.skippedCount === 0 && result.blockedCount === 0) {
        fileLog.info('📋 Paste successful - all cells updated')
        toast.success('Data pasted successfully', {
          description: `${result.pastedCount} cells updated`,
          duration: 2000,
        })
      } else if (result.pastedCount > 0) {
        const issueDetails = []
        if (result.errorCount > 0) issueDetails.push(`${result.errorCount} failed`)
        if (result.skippedCount > 0) issueDetails.push(`${result.skippedCount} skipped`)
        if (result.blockedCount > 0)
          issueDetails.push(`${result.blockedCount} blocked (incompatible types)`)

        fileLog.warn('📋 Paste completed with issues', {
          pastedCount: result.pastedCount,
          issues: issueDetails,
          errorDetails: result.details.filter((d) => d.status !== 'success'),
        })

        toast.warning('Paste completed with issues', {
          description: `${result.pastedCount} updated, ${issueDetails.join(', ')}`,
          duration: 5000,
        })
      } else {
        // Show specific error for blocked types
        const blockedDetails = result.details.filter((d) => d.status === 'blocked')
        if (blockedDetails.length > 0) {
          const firstBlocked = blockedDetails[0]

          fileLog.error('📋 Paste blocked - Incompatible types', {
            blockedCount: blockedDetails.length,
            firstError: {
              rowId: firstBlocked.rowId,
              columnId: firstBlocked.columnId,
              sourceType: firstBlocked.sourceType,
              targetType: firstBlocked.targetType,
              reason: firstBlocked.errorReason,
            },
            allBlockedDetails: blockedDetails,
          })

          toast.error('Paste blocked - Incompatible types', {
            description:
              firstBlocked.errorReason || 'Cannot paste between incompatible column types',
            duration: 5000,
          })
        } else {
          fileLog.error('📋 Paste failed - no cells updated', {
            errorMessage: result.errorMessage,
            errorCount: result.errorCount,
            skippedCount: result.skippedCount,
            allDetails: result.details,
          })

          toast.error('Paste failed', {
            description: result.errorMessage || 'All paste operations failed',
            duration: 4000,
          })
        }
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      const errorStack = error instanceof Error ? error.stack : undefined

      fileLog.error('📋 Paste operation threw exception', {
        errorMessage,
        errorStack,
        error,
      })

      toast.error('Paste operation failed', {
        description: errorMessage,
        duration: 4000,
      })

      return {
        success: false,
        pastedCount: 0,
        errorCount: 1,
        skippedCount: 0,
        blockedCount: 0,
        errorMessage,
        details: [],
      }
    }
  }

  /**
   * Check if source and target column types are compatible
   */
  private checkTypeCompatibility(
    sourceType: string,
    targetType: string,
    sourceValue: any,
  ): TypeCompatibility {
    // Normalize types
    const normalizeType = (type: string) => {
      switch (type) {
        case 'single-select':
        case 'select':
          return 'select'
        case 'multi-select':
          return 'multi-select'
        case 'textarea':
          return 'text'
        case 'datetime':
          return 'date'
        default:
          return type
      }
    }

    const normSource = normalizeType(sourceType)
    const normTarget = normalizeType(targetType)

    // Same type is always compatible
    if (normSource === normTarget) {
      return { sourceType, targetType, compatible: true }
    }

    // Define compatibility rules
    const compatibilityMatrix: Record<string, string[]> = {
      // Text can accept most simple types (but not complex ones)
      text: ['number', 'currency', 'phone', 'email', 'url', 'date', 'boolean'],

      // Numbers can accept text that looks numeric
      number: ['text', 'currency'],
      currency: ['text', 'number'],

      // Dates can accept text that looks like dates
      date: ['text'],

      // Booleans can accept text that looks boolean
      boolean: ['text'],

      // Email/URL/Phone can accept text
      email: ['text'],
      url: ['text'],
      phone: ['text'],

      // Select types have special rules
      select: [], // Select should NOT accept arbitrary text
      'multi-select': [], // Multi-select should NOT accept arbitrary text
    }

    // Check if target can accept source
    const allowedSources = compatibilityMatrix[normTarget] || []
    const isCompatible = allowedSources.includes(normSource)

    // Special cases with detailed reasons
    if (!isCompatible) {
      if (normSource === 'select' && normTarget === 'text') {
        return {
          sourceType,
          targetType,
          compatible: false,
          reason: `Cannot paste select option "${sourceValue}" into text field. Use the display text instead.`,
        }
      }

      if (normSource === 'text' && normTarget === 'select') {
        return {
          sourceType,
          targetType,
          compatible: false,
          reason: `Cannot paste arbitrary text "${sourceValue}" into select field. Must match available options.`,
        }
      }

      if (normSource === 'multi-select' && normTarget === 'text') {
        return {
          sourceType,
          targetType,
          compatible: false,
          reason: `Cannot paste multi-select values "${sourceValue}" into text field. Use comma-separated text instead.`,
        }
      }

      if (normSource === 'date' && normTarget === 'number') {
        return {
          sourceType,
          targetType,
          compatible: false,
          reason: `Cannot paste date "${sourceValue}" into number field.`,
        }
      }

      return {
        sourceType,
        targetType,
        compatible: false,
        reason: `Incompatible types: cannot paste ${normSource} data into ${normTarget} field.`,
      }
    }

    return { sourceType, targetType, compatible: true }
  }

  /**
   * Extract rich clipboard data with column metadata
   */
  private extractRichClipboardData(selectedCells: Set<string>): VibeGridClipboardData {
    fileLog.info('📋 extractRichClipboardData called', {
      selectedCellsCount: selectedCells.size,
      selectedCellsArray: Array.from(selectedCells),
    })

    const rows = this.tableCore$.processedRows
    const columns = this.tableCore$.columns

    fileLog.info('📋 Got table data', {
      rowCount: rows.length,
      columnCount: columns.length,
      firstRowSample: rows[0] ? { id: rows[0].id, keys: Object.keys(rows[0]).slice(0, 15) } : null,
    })

    const cells: ClipboardCell[] = []
    const columnTypes: Record<string, string> = {}
    const columnIds: string[] = []

    // Extract cell data with metadata
    selectedCells.forEach((cellId) => {
      const [rowId, columnId] = cellId.split(':')
      const row = rows.find((r) => r.id === rowId)
      const column = columns.find((c) => c.id === columnId)

      if (!row || !column) {
        fileLog.warn('📋 Cell not found during copy', {
          cellId,
          hasRow: !!row,
          hasColumn: !!column,
        })
        return
      }

      // Extract value - handle both direct and nested data structures
      const value = (row as any).data ? (row as any).data[columnId] : row[columnId]

      fileLog.info('📋 Extracting cell value', {
        cellId,
        columnId,
        columnType: column.type,
        hasNestedData: !!(row as any).data,
        extractedValue: value,
        valueType: typeof value,
        isUndefined: value === undefined,
        isNull: value === null,
        rowId: row.id,
      })

      const displayValue = this.getDisplayValue(value, column)

      cells.push({
        rowId,
        columnId,
        value,
        displayValue,
        rowIndex: rows.indexOf(row),
        columnIndex: columns.indexOf(column),
        field: columnId,
      })

      columnTypes[columnId] = column.type || 'text'
      if (!columnIds.includes(columnId)) {
        columnIds.push(columnId)
      }
    })

    // Calculate bounds
    const rowIndices = cells.map((c) => c.rowIndex)
    const colIndices = cells.map((c) => c.columnIndex)

    // Get actual counts of unique rows and columns (not index range)
    const uniqueRowIds = new Set(cells.map((c) => c.rowId))

    return {
      cells,
      bounds: {
        startRow: Math.min(...rowIndices),
        startCol: Math.min(...colIndices),
        endRow: Math.max(...rowIndices),
        endCol: Math.max(...colIndices),
        rowCount: uniqueRowIds.size, // Use actual count, not index range
        colCount: columnIds.length, // Use actual count, not index range
      },
      columnIds,
      columnTypes,
      timestamp: Date.now(),
      isCut: false,
    }
  }

  /**
   * Get display value for different column types
   */
  private getDisplayValue(value: any, column: any): string | undefined {
    if (value === null || value === undefined) return undefined

    switch (column.type) {
      case 'select':
      case 'single-select':
        // For select fields, preserve the option label if available
        return column.options?.find((opt: any) => opt.value === value)?.label || String(value)
      case 'multi-select':
        if (Array.isArray(value)) {
          return value
            .map((v) => column.options?.find((opt: any) => opt.value === v)?.label || String(v))
            .join(', ')
        }
        return String(value)
      case 'date':
      case 'datetime':
        return value instanceof Date ? value.toISOString() : String(value)
      case 'currency':
        return typeof value === 'number' ? value.toString() : String(value)
      default:
        return String(value)
    }
  }

  /**
   * Perform column-aware paste operation
   */
  private async performColumnAwarePaste(
    data: any[][],
    targetCells: Set<string>,
    isSingleCellBroadcast: boolean = false,
  ): Promise<PasteResult> {
    const processedRows = this.tableCore$.processedRows
    const allColumns = this.tableCore$.columns

    if (processedRows.length === 0 || allColumns.length === 0) {
      return {
        success: false,
        pastedCount: 0,
        errorCount: 1,
        skippedCount: 0,
        blockedCount: 0,
        errorMessage: 'Grid data not ready for paste operation',
        details: [],
      }
    }

    // Get source column metadata from clipboard for type checking
    const clipboard = this.tableInteraction$.clipboard
    const richClipboard = clipboard?.richData

    // For single-cell broadcast, extract the source type
    let singleCellSourceType: string | undefined
    let singleCellValue: any

    if (isSingleCellBroadcast && richClipboard && richClipboard.cells.length === 1) {
      const sourceCell = richClipboard.cells[0]
      singleCellSourceType = richClipboard.columnTypes[sourceCell.columnId] || 'text'
      singleCellValue = data[0]?.[0]

      fileLog.info('📋 Broadcasting single cell', {
        sourceType: singleCellSourceType,
        sourceColumnId: sourceCell.columnId,
        value: singleCellValue,
        targetCellCount: targetCells.size,
      })

      // Broadcast: paste same value to all target cells with type validation
      let pastedCount = 0
      let errorCount = 0
      let skippedCount = 0
      let blockedCount = 0
      const details: PasteResult['details'] = []

      // Group updates by row to minimize rerenders
      const updatesByRow = new Map<string, Record<string, any>>()
      const cellMetadata = new Map<
        string,
        { column: any; targetType: string; originalValue: any }
      >()

      // First pass: validate and prepare all updates
      for (const cellId of targetCells) {
        const [rowId, columnId] = cellId.split(':')
        const column = allColumns.find((c) => c.id === columnId)

        if (!column || columnId === 'selection') {
          skippedCount++
          details.push({
            rowId,
            columnId,
            status: 'skipped',
            errorReason: 'Invalid column or selection column',
          })
          continue
        }

        const targetType = column.type || 'text'

        // Check type compatibility
        const compatibility = this.checkTypeCompatibility(
          singleCellSourceType,
          targetType,
          singleCellValue,
        )

        if (!compatibility.compatible) {
          blockedCount++
          details.push({
            rowId,
            columnId,
            status: 'blocked',
            errorReason: compatibility.reason,
            sourceType: singleCellSourceType,
            targetType,
          })

          fileLog.warn('📋 Broadcast paste blocked - incompatible type', {
            rowId,
            columnId,
            sourceType: singleCellSourceType,
            targetType,
            value: singleCellValue,
            reason: compatibility.reason,
          })
          continue
        }

        try {
          const processedValue = this.processValueForColumn(singleCellValue, column)
          const originalValue = processedRows.find((r: any) => r.id === rowId)?.[columnId]

          // Group by row
          if (!updatesByRow.has(rowId)) {
            updatesByRow.set(rowId, {})
          }
          updatesByRow.get(rowId)![columnId] = processedValue

          // Store metadata for later
          cellMetadata.set(cellId, { column, targetType, originalValue })
        } catch (error) {
          errorCount++
          const errorReason = error instanceof Error ? error.message : 'Unknown error'

          details.push({
            rowId,
            columnId,
            status: 'error',
            errorReason,
            sourceType: singleCellSourceType,
            targetType,
          })

          fileLog.error('📋 Failed to process value for broadcast', {
            rowId,
            columnId,
            sourceType: singleCellSourceType,
            targetType,
            value: singleCellValue,
            error: errorReason,
          })
        }
      }

      // Second pass: apply all updates (batched by row to minimize rerenders)
      if (this.onEntityUpdate && updatesByRow.size > 0) {
        for (const [rowId, updates] of updatesByRow) {
          try {
            await this.onEntityUpdate(rowId, updates)

            // Record success for each cell in this row
            for (const [columnId, processedValue] of Object.entries(updates)) {
              const cellId = `${rowId}:${columnId}`
              const metadata = cellMetadata.get(cellId)

              if (metadata) {
                pastedCount++
                details.push({
                  rowId,
                  columnId,
                  status: 'success',
                  originalValue: metadata.originalValue,
                  newValue: processedValue,
                  sourceType: singleCellSourceType,
                  targetType: metadata.targetType,
                })

                fileLog.debug('📋 Successfully broadcast to cell', {
                  rowId,
                  columnId,
                  sourceType: singleCellSourceType,
                  targetType: metadata.targetType,
                  processedValue,
                })
              }
            }
          } catch (error) {
            const errorReason = error instanceof Error ? error.message : 'Unknown error'

            // Record error for each cell in this row
            for (const columnId of Object.keys(updates)) {
              errorCount++
              const metadata = cellMetadata.get(`${rowId}:${columnId}`)

              details.push({
                rowId,
                columnId,
                status: 'error',
                errorReason,
                sourceType: singleCellSourceType,
                targetType: metadata?.targetType || 'text',
              })

              fileLog.error('📋 Failed to broadcast to cell', {
                rowId,
                columnId,
                sourceType: singleCellSourceType,
                targetType: metadata?.targetType,
                value: singleCellValue,
                error: errorReason,
              })
            }
          }
        }
      } else if (!this.onEntityUpdate) {
        // No update callback - mark all as errors
        for (const cellId of cellMetadata.keys()) {
          const [rowId, columnId] = cellId.split(':')
          errorCount++
          details.push({
            rowId,
            columnId,
            status: 'error',
            errorReason: 'No update callback available',
            sourceType: singleCellSourceType,
            targetType: cellMetadata.get(cellId)?.targetType || 'text',
          })
        }
      }

      fileLog.debug('📋 Broadcast paste operation completed', {
        pastedCount,
        errorCount,
        skippedCount,
        blockedCount,
        totalAttempted: targetCells.size,
      })

      return {
        success: pastedCount > 0,
        pastedCount,
        errorCount,
        skippedCount,
        blockedCount,
        errorMessage: errorCount > 0 ? `${errorCount} cells failed to paste` : undefined,
        details,
      }
    }

    // Normal multi-cell paste (existing logic)
    // Group cells by row and sort for consistent pasting
    const targetCellArray = Array.from(targetCells)
    const cellsByRow = new Map<string, string[]>()

    targetCellArray.forEach((cellId) => {
      const [rowId, columnId] = cellId.split(':')
      if (!cellsByRow.has(rowId)) {
        cellsByRow.set(rowId, [])
      }
      cellsByRow.get(rowId)!.push(columnId)
    })

    const sortedRows = Array.from(cellsByRow.keys()).sort((a, b) => {
      const indexA = processedRows.findIndex((row: any) => row.id === a)
      const indexB = processedRows.findIndex((row: any) => row.id === b)
      return indexA - indexB
    })

    let pastedCount = 0
    let errorCount = 0
    let skippedCount = 0
    let blockedCount = 0
    const details: PasteResult['details'] = []

    const sourceColumns = new Map<number, any>() // Map column index to source column info

    // Populate source columns from rich clipboard data
    if (richClipboard && richClipboard.columnIds) {
      richClipboard.columnIds.forEach((columnId, index) => {
        const columnType = richClipboard.columnTypes?.[columnId] || 'text'
        sourceColumns.set(index, {
          id: columnId,
          type: columnType,
        })
      })
    }

    fileLog.debug('📋 Starting column-aware paste operation', {
      dataRows: data.length,
      dataCols: data[0]?.length || 0,
      targetRowsCount: sortedRows.length,
      targetCellsTotal: targetCells.size,
    })

    // Paste data row by row with column type awareness
    for (
      let dataRowIdx = 0;
      dataRowIdx < data.length && dataRowIdx < sortedRows.length;
      dataRowIdx++
    ) {
      const rowId = sortedRows[dataRowIdx]
      const columnsInRow = cellsByRow.get(rowId) || []

      // Sort columns by their position
      const sortedColumnsInRow = columnsInRow.sort((a, b) => {
        const indexA = allColumns.findIndex((col) => col.id === a)
        const indexB = allColumns.findIndex((col) => col.id === b)
        return indexA - indexB
      })

      for (
        let dataColIdx = 0;
        dataColIdx < data[dataRowIdx].length && dataColIdx < sortedColumnsInRow.length;
        dataColIdx++
      ) {
        const columnId = sortedColumnsInRow[dataColIdx]
        const rawValue = data[dataRowIdx][dataColIdx]
        const column = allColumns.find((c) => c.id === columnId)

        if (!column || columnId === 'selection') {
          skippedCount++
          details.push({
            rowId,
            columnId,
            status: 'skipped',
            errorReason: 'Invalid column or selection column',
          })
          continue
        }

        // CHECK TYPE COMPATIBILITY BEFORE PROCESSING
        const sourceColumn = sourceColumns.get(dataColIdx)
        const sourceType = sourceColumn?.type || 'text' // Default to text if unknown
        const targetType = column.type || 'text'

        const compatibility = this.checkTypeCompatibility(sourceType, targetType, rawValue)

        if (!compatibility.compatible) {
          blockedCount++
          details.push({
            rowId,
            columnId,
            status: 'blocked',
            errorReason: compatibility.reason,
            sourceType,
            targetType,
          })

          fileLog.warn('📋 Cross-type paste blocked', {
            rowId,
            columnId,
            sourceType,
            targetType,
            value: rawValue,
            reason: compatibility.reason,
          })
          continue
        }

        try {
          const processedValue = this.processValueForColumn(rawValue, column)
          const originalValue = processedRows.find((r: any) => r.id === rowId)?.[columnId]

          if (this.onEntityUpdate) {
            await this.onEntityUpdate(rowId, { [columnId]: processedValue })
            pastedCount++

            details.push({
              rowId,
              columnId,
              status: 'success',
              originalValue,
              newValue: processedValue,
              sourceType,
              targetType,
            })

            fileLog.debug('📋 Successfully pasted to column-aware cell', {
              rowId,
              columnId,
              sourceType,
              targetType,
              originalValue,
              processedValue,
            })
          } else {
            errorCount++
            details.push({
              rowId,
              columnId,
              status: 'error',
              errorReason: 'No update callback available',
              sourceType,
              targetType,
            })
          }
        } catch (error) {
          errorCount++
          const errorReason = error instanceof Error ? error.message : 'Unknown error'

          details.push({
            rowId,
            columnId,
            status: 'error',
            errorReason,
            sourceType,
            targetType,
          })

          fileLog.error('📋 Failed to paste to column-aware cell', {
            rowId,
            columnId,
            sourceType,
            targetType,
            value: rawValue,
            error: errorReason,
          })
        }
      }
    }

    fileLog.debug('📋 Column-aware paste operation completed', {
      pastedCount,
      errorCount,
      skippedCount,
      blockedCount,
      totalAttempted: Math.min(data.length, sortedRows.length) * (data[0]?.length || 0),
    })

    return {
      success: pastedCount > 0,
      pastedCount,
      errorCount,
      skippedCount,
      blockedCount,
      errorMessage: errorCount > 0 ? `${errorCount} cells failed to paste` : undefined,
      details,
    }
  }

  /**
   * Process value based on column type
   */
  private processValueForColumn(rawValue: any, column: any): any {
    const columnType = column.type || 'text'

    // Handle null/undefined/empty values based on column type
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      // For text fields, preserve empty string to avoid violating NOT NULL constraints
      if (columnType === 'text' || columnType === 'textarea') {
        return ''
      }
      // For other types, return null
      return null
    }

    const stringValue = String(rawValue).trim()

    switch (columnType) {
      case 'select':
      case 'single-select':
        return this.processSelectValue(stringValue, column)

      case 'multi-select':
        return this.processMultiSelectValue(stringValue, column)

      case 'number':
        return this.processNumberValue(stringValue)

      case 'currency':
        return this.processCurrencyValue(stringValue)

      case 'date':
        return this.processDateValue(stringValue)

      case 'datetime':
        return this.processDateTimeValue(stringValue)

      case 'boolean':
        return this.processBooleanValue(stringValue)

      case 'email':
        return this.processEmailValue(stringValue)

      case 'url':
        return this.processUrlValue(stringValue)

      case 'phone':
        return this.processPhoneValue(stringValue)
      default:
        return stringValue
    }
  }

  /**
   * Process select field values
   */
  private processSelectValue(value: string, column: any): string | null {
    const options = column.options || []

    // First try exact match by label
    const exactMatch = options.find((opt: any) => opt.label === value)
    if (exactMatch) return exactMatch.value

    // Try exact match by value
    const valueMatch = options.find((opt: any) => opt.value === value)
    if (valueMatch) return valueMatch.value

    // Try case-insensitive match
    const caseInsensitiveMatch = options.find(
      (opt: any) =>
        opt.label?.toLowerCase() === value.toLowerCase() ||
        opt.value?.toLowerCase() === value.toLowerCase(),
    )
    if (caseInsensitiveMatch) return caseInsensitiveMatch.value

    // If no match found, return null and log warning
    fileLog.warn('📋 Select value not found in options', {
      value,
      availableOptions: options.map((opt: any) => ({ label: opt.label, value: opt.value })),
    })

    throw new Error(
      `Invalid option "${value}" for select field. Available options: ${options.map((opt: any) => opt.label).join(', ')}`,
    )
  }

  /**
   * Process multi-select field values
   */
  private processMultiSelectValue(value: string, column: any): string[] | null {
    const _options = column.options || []

    // Split by common delimiters
    const values = value
      .split(/[,;|]/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
    const processedValues: string[] = []

    for (const val of values) {
      try {
        const processed = this.processSelectValue(val, column)
        if (processed) processedValues.push(processed)
      } catch (error) {
        fileLog.warn('📋 Skipping invalid multi-select value', { value: val, error })
      }
    }

    return processedValues.length > 0 ? processedValues : null
  }

  /**
   * Process number field values
   */
  private processNumberValue(value: string): number | null {
    // Remove common formatting
    const cleaned = value.replace(/[$,\s]/g, '')
    const parsed = parseFloat(cleaned)

    if (Number.isNaN(parsed)) {
      throw new Error(`"${value}" is not a valid number`)
    }

    return parsed
  }

  /**
   * Process currency field values
   */
  private processCurrencyValue(value: string): number | null {
    // Remove currency symbols and formatting
    const cleaned = value.replace(/[$€£¥,\s]/g, '')
    const parsed = parseFloat(cleaned)

    if (Number.isNaN(parsed)) {
      throw new Error(`"${value}" is not a valid currency amount`)
    }

    return parsed
  }

  /**
   * Process date field values
   */
  private processDateValue(value: string): string | null {
    try {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) {
        throw new Error(`"${value}" is not a valid date`)
      }
      return date.toISOString().split('T')[0] // Return YYYY-MM-DD format
    } catch (_error) {
      throw new Error(`"${value}" is not a valid date format`)
    }
  }

  /**
   * Process datetime field values
   */
  private processDateTimeValue(value: string): string | null {
    try {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) {
        throw new Error(`"${value}" is not a valid date/time`)
      }
      return date.toISOString()
    } catch (_error) {
      throw new Error(`"${value}" is not a valid date/time format`)
    }
  }

  /**
   * Process boolean field values
   */
  private processBooleanValue(value: string): boolean | null {
    const lower = value.toLowerCase()

    if (['true', 'yes', '1', 'on', 'checked', '✓'].includes(lower)) {
      return true
    }

    if (['false', 'no', '0', 'off', 'unchecked', '✗'].includes(lower)) {
      return false
    }

    throw new Error(`"${value}" is not a valid boolean value (use true/false, yes/no, 1/0)`)
  }

  /**
   * Process email field values
   */
  private processEmailValue(value: string): string | null {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(value)) {
      throw new Error(`"${value}" is not a valid email address`)
    }

    return value.toLowerCase()
  }

  /**
   * Process URL field values
   */
  private processUrlValue(value: string): string | null {
    try {
      // Add protocol if missing
      const urlToTest = value.startsWith('http') ? value : `https://${value}`
      new URL(urlToTest)
      return urlToTest
    } catch (_error) {
      throw new Error(`"${value}" is not a valid URL`)
    }
  }

  /**
   * Process phone field values
   */
  private processPhoneValue(value: string): string | null {
    // Remove common phone formatting
    const cleaned = value.replace(/[\s\-()+]/g, '')

    // Basic validation - should be mostly digits
    if (!/^\d{10,15}$/.test(cleaned)) {
      throw new Error(`"${value}" is not a valid phone number`)
    }

    return cleaned
  }

  /**
   * Copy rich clipboard data to system clipboard
   */
  private async copyToSystemClipboard(clipboardData: VibeGridClipboardData): Promise<void> {
    try {
      // Convert to simple 2D array for system clipboard
      const textData = this.convertToTextFormat(clipboardData)
      const text = textData.map((row) => row.join('\t')).join('\n')

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = text
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
    } catch (error) {
      fileLog.error('📋 Failed to copy to system clipboard', { error })
      throw error
    }
  }

  /**
   * Convert rich clipboard data to simple text format
   */
  private convertToTextFormat(clipboardData: VibeGridClipboardData): string[][] {
    const { bounds, cells } = clipboardData
    const grid: string[][] = []

    // Initialize grid
    for (let row = 0; row < bounds.rowCount; row++) {
      grid[row] = new Array(bounds.colCount).fill('')
    }

    // Fill grid with cell data
    cells.forEach((cell) => {
      const relativeRow = cell.rowIndex - bounds.startRow
      const relativeCol = cell.columnIndex - bounds.startCol

      if (
        relativeRow >= 0 &&
        relativeRow < bounds.rowCount &&
        relativeCol >= 0 &&
        relativeCol < bounds.colCount
      ) {
        grid[relativeRow][relativeCol] = cell.displayValue || String(cell.value || '')
      }
    })

    return grid
  }

  /**
   * Validate paste operation before execution
   */
  validatePaste(
    clipboardData: VibeGridClipboardData,
    targetCells: Set<string>,
  ): PasteValidationResult {
    const targetCellArray = Array.from(targetCells)

    if (targetCellArray.length === 0) {
      return {
        isValid: false,
        reason: 'No target cells selected',
      }
    }

    const columns = this.tableCore$.columns
    const targetCellOperations: PasteValidationResult['targetCells'] = []

    // Validate each target cell
    targetCellArray.forEach((cellId) => {
      const [rowId, columnId] = cellId.split(':')
      const column = columns.find((c) => c.id === columnId)

      if (!column) {
        return
      }

      // Find corresponding source cell
      const sourceCell = clipboardData.cells.find(
        (c) => c.rowIndex === 0 && c.columnIndex === 0, // Simplified for now
      )

      if (sourceCell) {
        targetCellOperations!.push({
          rowId,
          columnId,
          sourceValue: sourceCell.value,
        })
      }
    })

    return {
      isValid: true,
      targetCells: targetCellOperations,
    }
  }
}
