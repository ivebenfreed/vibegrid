/**
 * IncrementalRowProcessor - Async/Incremental Row Processing for Large Datasets
 *
 * GH#1422: Addresses main thread blocking during sort/filter on 100k+ rows.
 *
 * Strategy:
 * 1. Compute visible rows + buffer SYNCHRONOUSLY (instant render, ~200 rows)
 * 2. Queue remaining rows for BACKGROUND processing via requestIdleCallback
 * 3. Use VERSION TRACKING to cancel stale computations
 * 4. MERGE background results progressively
 *
 * Pattern borrowed from: RowPreRenderBuffer.ts (same rIC + budget approach)
 */

import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'
import { isSearchableType } from '../constants/field-type-categories'
import type { VirtualRow, Column, SortConfig, FilterConfig, GroupConfig } from '../types'
import { compareValues, isEmpty } from '../utils/sort-compare'

const log = getLogger(['vibegrid', 'processors', 'IncrementalRowProcessor'])

// rIC fallback for browsers without support
const scheduleIdle: typeof requestIdleCallback =
  typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : (((cb: IdleRequestCallback) =>
        setTimeout(
          () => cb({ timeRemaining: () => 8, didTimeout: false } as IdleDeadline),
          1,
        )) as unknown as typeof requestIdleCallback)

const cancelIdle: typeof cancelIdleCallback =
  typeof cancelIdleCallback !== 'undefined'
    ? cancelIdleCallback
    : (clearTimeout as unknown as typeof cancelIdleCallback)

// ====================================
// CONFIGURATION
// ====================================

export interface IncrementalProcessorConfig {
  /** Below this row count, use synchronous path (no background processing) */
  SYNC_THRESHOLD: number
  /** Time budget per idle callback in milliseconds */
  IDLE_BUDGET_MS: number
  /** Maximum wait time for idle callback */
  IDLE_TIMEOUT_MS: number
  /** Rows processed per batch in background */
  BATCH_SIZE: number
  /** Rows to compute synchronously for immediate viewport rendering */
  VIEWPORT_BATCH: number
}

export const DEFAULT_CONFIG: IncrementalProcessorConfig = {
  SYNC_THRESHOLD: 1000,
  IDLE_BUDGET_MS: 8,
  IDLE_TIMEOUT_MS: 100,
  BATCH_SIZE: 500,
  VIEWPORT_BATCH: 200,
}

// ====================================
// CALLBACKS
// ====================================

export interface IncrementalProcessorCallbacks {
  /** Called when viewport rows are ready (sync, first render) */
  onViewportReady: (rows: VirtualRow[]) => void
  /** Called after each background batch completes */
  onBatchComplete: (rows: VirtualRow[], startIndex: number, progress: number) => void
  /** Called when all rows are processed */
  onComplete: (rows: VirtualRow[]) => void
}

// ====================================
// PIPELINE CONFIG
// ====================================

export interface PipelineConfig {
  searchText?: string
  filters?: FilterConfig[]
  sortBy?: SortConfig[]
  groupConfig?: GroupConfig | null
  columns: Column[]
  viewportRange?: { start: number; end: number }
  searchableColumns?: string[]
}

// ====================================
// PROCESSOR CLASS
// ====================================

export class IncrementalRowProcessor {
  private config: IncrementalProcessorConfig
  private callbacks: IncrementalProcessorCallbacks

  // State
  private version: number = 0
  private cancelled: boolean = false
  private ricId: number | null = null
  private disposed: boolean = false

  // Processing state
  private rawRows: any[] = []
  private processedRows: VirtualRow[] = []
  private pipelineConfig: PipelineConfig | null = null
  private currentBatchIndex: number = 0

  constructor(
    callbacks: IncrementalProcessorCallbacks,
    config: Partial<IncrementalProcessorConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.callbacks = callbacks
  }

  /**
   * Check if dataset should use incremental processing
   */
  shouldUseIncremental(rowCount: number): boolean {
    return rowCount >= this.config.SYNC_THRESHOLD
  }

  /**
   * Start incremental processing with new data
   *
   * @param rawRows - Raw entity rows to process
   * @param pipelineConfig - Configuration for the processing pipeline
   * @returns The version number for this processing run
   */
  start(rawRows: any[], pipelineConfig: PipelineConfig): number {
    // Cancel any existing processing
    this.cancel()

    // Increment version for this run
    this.version++
    this.cancelled = false
    this.rawRows = rawRows
    this.pipelineConfig = pipelineConfig
    this.processedRows = []
    this.currentBatchIndex = 0

    const currentVersion = this.version

    log.info('Starting incremental processing', {
      version: currentVersion,
      rowCount: rawRows.length,
      threshold: this.config.SYNC_THRESHOLD,
      useIncremental: this.shouldUseIncremental(rawRows.length),
    })

    // For small datasets, process synchronously
    if (!this.shouldUseIncremental(rawRows.length)) {
      const allRows = this.processAllRowsSync(rawRows, pipelineConfig)
      this.processedRows = allRows
      this.currentBatchIndex = rawRows.length // Mark as complete
      this.callbacks.onViewportReady(allRows)
      this.callbacks.onComplete(allRows)
      return currentVersion
    }

    // For large datasets: sort ALL rows upfront (O(n log n) is <5ms for ~3k rows),
    // then slice sorted results into batches. This ensures every batch is globally
    // sorted so appending maintains correct order while scrolling.
    let sortedRows = rawRows
    if (pipelineConfig.sortBy && pipelineConfig.sortBy.length > 0) {
      sortedRows = this.applySorting(rawRows, pipelineConfig.sortBy)
    }
    this.rawRows = sortedRows

    // Step 1: Process first batch (viewport) synchronously for instant render
    const viewportBatchSize = Math.min(this.config.VIEWPORT_BATCH, sortedRows.length)
    let viewportRows = sortedRows.slice(0, viewportBatchSize)

    // Apply search/filter to viewport batch
    if (pipelineConfig.searchText?.trim()) {
      viewportRows = this.applyTextSearch(
        viewportRows,
        pipelineConfig.searchText,
        pipelineConfig.columns,
        pipelineConfig.searchableColumns,
      )
    }
    if (pipelineConfig.filters && pipelineConfig.filters.length > 0) {
      viewportRows = this.applyFilters(viewportRows, pipelineConfig.filters)
    }

    this.processedRows = this.wrapInVirtualRows(viewportRows)
    this.currentBatchIndex = viewportBatchSize

    log.info('Viewport rows ready', {
      version: currentVersion,
      viewportRowCount: this.processedRows.length,
      remainingRows: sortedRows.length - viewportBatchSize,
    })

    this.callbacks.onViewportReady(this.processedRows)

    // Step 2: Queue remaining rows for background processing (filter/search only, already sorted)
    this.scheduleBackgroundProcessing(currentVersion)

    return currentVersion
  }

  /**
   * Cancel current processing
   */
  cancel(): void {
    this.cancelled = true
    if (this.ricId !== null) {
      cancelIdle(this.ricId)
      this.ricId = null
    }
    log.debug('Processing cancelled', { version: this.version })
  }

  /**
   * Dispose processor and clean up resources
   */
  dispose(): void {
    this.cancel()
    this.disposed = true
    this.rawRows = []
    this.processedRows = []
    this.pipelineConfig = null
  }

  /**
   * Get current version number
   */
  getVersion(): number {
    return this.version
  }

  /**
   * Get current processed rows (may be partial if still processing)
   */
  getProcessedRows(): VirtualRow[] {
    return this.processedRows
  }

  /**
   * Check if processing is complete
   */
  isComplete(): boolean {
    return this.currentBatchIndex >= this.rawRows.length
  }

  /**
   * Get processing progress (0-100)
   */
  getProgress(): number {
    if (this.rawRows.length === 0) return 100
    return Math.min(100, Math.round((this.currentBatchIndex / this.rawRows.length) * 100))
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * Process all rows synchronously (for small datasets)
   */
  private processAllRowsSync(rawRows: any[], config: PipelineConfig): VirtualRow[] {
    let rows = rawRows

    // Apply search filter
    if (config.searchText?.trim()) {
      rows = this.applyTextSearch(rows, config.searchText, config.columns, config.searchableColumns)
    }

    // Apply filters
    if (config.filters && config.filters.length > 0) {
      rows = this.applyFilters(rows, config.filters)
    }

    // Apply sorting
    if (config.sortBy && config.sortBy.length > 0) {
      rows = this.applySorting(rows, config.sortBy)
    }

    // Wrap in VirtualRow structure
    return this.wrapInVirtualRows(rows)
  }

  /**
   * Schedule background processing via requestIdleCallback
   */
  private scheduleBackgroundProcessing(version: number): void {
    if (this.disposed || this.cancelled) return

    this.ricId = scheduleIdle(
      (deadline) => {
        this.ricId = null
        this.processBackgroundBatch(deadline, version)
      },
      { timeout: this.config.IDLE_TIMEOUT_MS },
    )
  }

  /**
   * Process a batch of rows during idle time
   */
  private processBackgroundBatch(deadline: IdleDeadline, version: number): void {
    // Version guard - abort if stale
    if (version !== this.version || this.cancelled || this.disposed) {
      log.debug('Aborting stale background processing', {
        currentVersion: this.version,
        processVersion: version,
        cancelled: this.cancelled,
      })
      return
    }

    if (!this.pipelineConfig) return

    const budget = Math.min(deadline.timeRemaining(), this.config.IDLE_BUDGET_MS)
    const start = performance.now()
    let processed = 0

    // Process rows within budget
    while (
      this.currentBatchIndex < this.rawRows.length &&
      performance.now() - start < budget &&
      processed < this.config.BATCH_SIZE
    ) {
      const batchEnd = Math.min(
        this.currentBatchIndex + this.config.BATCH_SIZE - processed,
        this.rawRows.length,
      )

      // Get next batch
      let batchRows = this.rawRows.slice(this.currentBatchIndex, batchEnd)

      // Apply pipeline
      if (this.pipelineConfig.searchText?.trim()) {
        batchRows = this.applyTextSearch(
          batchRows,
          this.pipelineConfig.searchText,
          this.pipelineConfig.columns,
          this.pipelineConfig.searchableColumns,
        )
      }

      if (this.pipelineConfig.filters && this.pipelineConfig.filters.length > 0) {
        batchRows = this.applyFilters(batchRows, this.pipelineConfig.filters)
      }

      // Sorting was already applied to the full dataset before batching,
      // so batches arrive in sorted order — just filter and append.

      // Wrap in VirtualRow structure
      const virtualRows = this.wrapInVirtualRows(batchRows, this.processedRows.length)

      // Merge with existing rows
      this.processedRows = [...this.processedRows, ...virtualRows]

      processed += batchEnd - this.currentBatchIndex
      this.currentBatchIndex = batchEnd
    }

    const progress = this.getProgress()

    log.debug('Background batch complete', {
      version,
      processed,
      progress,
      totalProcessed: this.currentBatchIndex,
      remaining: this.rawRows.length - this.currentBatchIndex,
    })

    // Notify batch complete
    this.callbacks.onBatchComplete(this.processedRows, this.currentBatchIndex - processed, progress)

    // Check if complete
    if (this.currentBatchIndex >= this.rawRows.length) {
      // Re-index all rows to ensure contiguous indices after filter may have removed some
      this.processedRows = this.processedRows.map((row, index) => ({
        ...row,
        index,
        dataIndex: index,
      }))

      log.info('Incremental processing complete', {
        version,
        totalRows: this.processedRows.length,
      })

      this.callbacks.onComplete(this.processedRows)
      return
    }

    // Schedule next batch
    this.scheduleBackgroundProcessing(version)
  }

  // ====================================
  // PIPELINE FUNCTIONS
  // ====================================

  /** Select/option types that should search by resolved label */
  private static SELECT_SEARCH_TYPES = new Set([
    'select',
    'single-select',
    'multi-select',
    'select-multi',
    'status',
    'status_option',
    'priority_option',
    'category_option',
    'task_type_option',
    'custom_select',
    'custom_option_reference',
  ])

  private applyTextSearch(
    rows: any[],
    searchText: string,
    columns: Column[],
    searchableColumns?: string[],
  ): any[] {
    const normalizedSearch = searchText.toLowerCase().trim()
    if (!normalizedSearch) return rows

    // Determine which columns to search — uses shared isSearchableType
    const columnsToSearch = searchableColumns
      ? columns.filter((col) => searchableColumns.includes(col.id))
      : columns.filter((col) => isSearchableType((col.cellType || col.type || '') as string))

    return rows.filter((row) => {
      const data = row.data || row
      for (const col of columnsToSearch) {
        const value = data[col.id] ?? data[col.field ?? col.id]
        if (value !== null && value !== undefined) {
          // For select/option types, resolve to label before matching
          const cellType = (col.cellType || col.type || '') as string
          let searchValue: string
          if (IncrementalRowProcessor.SELECT_SEARCH_TYPES.has(cellType) && col.options?.length) {
            const strValue = String(value)
            let resolved = strValue
            for (const opt of col.options) {
              if (typeof opt === 'string') {
                if (opt === strValue) {
                  resolved = opt
                  break
                }
              } else if ((opt as any).value === strValue) {
                resolved = (opt as any).label ?? strValue
                break
              }
            }
            searchValue = resolved
          } else {
            searchValue = String(value)
          }
          if (searchValue.toLowerCase().includes(normalizedSearch)) {
            return true
          }
        }
      }
      return false
    })
  }

  private applyFilters(rows: any[], filters: FilterConfig[]): any[] {
    if (!filters || filters.length === 0) return rows

    return rows.filter((row) => {
      const data = row.data || row
      return filters.every((filter) => {
        const value = data[filter.field]

        switch (filter.operator) {
          case 'equals':
            return value === filter.value
          case 'not_equals':
            return value !== filter.value
          case 'contains':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase())
          case 'not_contains':
            return !String(value).toLowerCase().includes(String(filter.value).toLowerCase())
          case 'starts_with':
            return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase())
          case 'ends_with':
            return String(value).toLowerCase().endsWith(String(filter.value).toLowerCase())
          case 'greater_than':
            return Number(value) > Number(filter.value)
          case 'less_than':
            return Number(value) < Number(filter.value)
          case 'is_empty':
            return value === null || value === undefined || value === ''
          case 'is_not_empty':
            return value !== null && value !== undefined && value !== ''
          case 'in':
            return Array.isArray(filter.value) && (filter.value as unknown[]).includes(value)
          case 'not_in':
            return Array.isArray(filter.value) && !(filter.value as unknown[]).includes(value)
          case 'regex':
            try {
              const regex = new RegExp(String(filter.value))
              return regex.test(String(value))
            } catch {
              return false
            }
          default:
            return true
        }
      })
    })
  }

  private applySorting(rows: any[], sortBy: SortConfig[]): any[] {
    if (!sortBy || sortBy.length === 0) return rows

    return [...rows].sort((a, b) => {
      const dataA = a.data || a
      const dataB = b.data || b

      for (const sort of sortBy) {
        const aVal = dataA[sort.field]
        const bVal = dataB[sort.field]

        const comparison = compareValues(aVal, bVal)
        if (comparison === 0) continue

        // Nulls always last: don't invert null-vs-value comparisons
        const aEmpty = isEmpty(aVal)
        const bEmpty = isEmpty(bVal)
        if (aEmpty || bEmpty) return comparison

        return sort.direction === 'asc' ? comparison : -comparison
      }
      return 0
    })
  }

  private wrapInVirtualRows(rows: any[], startIndex: number = 0): VirtualRow[] {
    return rows.map((row, index) => ({
      type: 'data' as const,
      id: row.id,
      index: startIndex + index,
      dataIndex: startIndex + index,
      height: row.height || GRID_DIMENSIONS.ROW_HEIGHT,
      data: row,
    }))
  }

  // ====================================
  // DIAGNOSTICS
  // ====================================

  get stats(): {
    version: number
    totalRows: number
    processedCount: number
    progress: number
    isComplete: boolean
    cancelled: boolean
    disposed: boolean
  } {
    return {
      version: this.version,
      totalRows: this.rawRows.length,
      processedCount: this.processedRows.length,
      progress: this.getProgress(),
      isComplete: this.isComplete(),
      cancelled: this.cancelled,
      disposed: this.disposed,
    }
  }
}
