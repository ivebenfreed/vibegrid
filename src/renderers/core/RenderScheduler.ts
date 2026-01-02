/**
 * RenderScheduler - Owns version-based update routing
 *
 * Watches dataVersion/configVersion/structureVersion and invokes
 * appropriate render callbacks based on change type.
 *
 * Extracted from SimplePassiveRenderer.initFocusedObservers()
 *
 * Benefits:
 * - Focused responsibility for render scheduling logic
 * - Easier to test render logic in isolation
 * - Clear separation from DOM manipulation
 * - Better performance tracking
 */

import { reaction, runInAction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import type { InitStore } from '../../stores/InitStore'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import { determineUpdateStrategy } from '../../utils/update-router'

const fileLog = getLogger(['vibegrid', 'renderers', 'RenderScheduler'])

/**
 * Callbacks that RenderScheduler can invoke based on change type
 */
export interface RenderCallbacks {
  /**
   * Full re-render of entire body (structural/config changes)
   */
  renderFull: () => void

  /**
   * Granular update of specific cells (data changes)
   * @param changedCells Map of rowId -> Set of columnIds
   */
  renderCells: (changedCells: Map<string, Set<string>>) => void

  /**
   * Re-render header only (column changes)
   */
  renderHeader: () => void
}

/**
 * RenderScheduler - Routes data changes to appropriate render strategy
 */
export class RenderScheduler {
  private disposers: (() => void)[] = []
  private lastDataVersion: number = 0
  private lastConfigVersion: number = 0
  private lastStructureVersion: number = 0
  private enabled: boolean = false

  constructor(
    private tableCoreStore: TableCoreStore,
    private initStore: InitStore,
    private callbacks: RenderCallbacks,
  ) {}

  /**
   * Enable the scheduler (call after initialization complete)
   */
  enable(): void {
    this.enabled = true
    fileLog.debug('RenderScheduler enabled')
  }

  /**
   * Disable the scheduler
   */
  disable(): void {
    this.enabled = false
    fileLog.debug('RenderScheduler disabled')
  }

  /**
   * Initialize version-based data observer
   */
  init(): void {
    fileLog.info('Initializing version-based data observer')

    // VERSION-BASED DATA OBSERVER
    // React to version changes instead of processedRows to avoid unnecessary recomputation
    // Versions increment in TableCoreStore.setRows() based on change classification
    const dataDisposer = reaction(
      () => {
        return {
          dataVersion: this.tableCoreStore.dataVersion,
          configVersion: this.tableCoreStore.configVersion,
          structureVersion: this.tableCoreStore.structureVersion,
          lastChangeMetadata: this.tableCoreStore.lastChangeMetadata,
        }
      },
      ({ dataVersion, configVersion, structureVersion, lastChangeMetadata }) => {
        fileLog.debug('VERSION CHANGE DETECTED', {
          enabled: this.enabled,
          dataVersion,
          configVersion,
          structureVersion,
          changeType: lastChangeMetadata?.type,
          estimatedCells: lastChangeMetadata?.estimatedCellCount,
        })

        // GUARD: Skip if not enabled yet
        if (!this.enabled) {
          fileLog.debug('Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        if (!this.initStore.isFullyHydrated) {
          fileLog.debug('Skipping render during initialization')
          return
        }

        // GUARD: Skip if no version change (initial reaction)
        if (
          dataVersion === this.lastDataVersion &&
          configVersion === this.lastConfigVersion &&
          structureVersion === this.lastStructureVersion
        ) {
          fileLog.debug('No version change detected, skipping')
          return
        }

        // Update tracked versions
        this.lastDataVersion = dataVersion
        this.lastConfigVersion = configVersion
        this.lastStructureVersion = structureVersion

        // Determine update strategy using the update router
        const strategy = determineUpdateStrategy(lastChangeMetadata)

        fileLog.info('Routing update based on strategy', {
          strategy,
          changeType: lastChangeMetadata?.type,
          estimatedCells: lastChangeMetadata?.estimatedCellCount,
        })

        // Route based on strategy
        if (strategy === 'full-render') {
          // FULL RE-RENDER PATH (structural/config changes or large updates)
          // This will trigger processedRows recomputation via MobX

          fileLog.info('Full render triggered', {
            reason: lastChangeMetadata?.type || 'structural/config change',
            dataVersion,
            configVersion,
            structureVersion,
          })

          this.callbacks.renderFull()
          return
        }

        // GRANULAR UPDATE PATHS (cell-level or row-level)
        // These skip processedRows recomputation for performance

        const changedCells = this.tableCoreStore.lastChangedCells

        if (!changedCells || changedCells.size === 0) {
          fileLog.warn(
            'Granular update strategy but no changed cells found, falling back to full render',
          )
          this.callbacks.renderFull()
          return
        }

        if (strategy === 'cell-level') {
          // CELL-LEVEL UPDATE PATH (≤10 cells)
          // Update individual cell innerHTML - fastest path

          const totalCells = Array.from(changedCells.values()).reduce(
            (sum, cols) => sum + cols.size,
            0,
          )

          fileLog.info('Cell-level update (fast path)', {
            rowsAffected: changedCells.size,
            cellsChanged: totalCells,
            skipProcessedRowsRecompute: true,
          })

          this.callbacks.renderCells(changedCells)

          // Clear the changed cells map AND stats for next update
          runInAction(() => {
            this.tableCoreStore.lastChangedCells.clear()
            this.tableCoreStore.lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 }
          })

          return // ✅ Exit early - no processedRows recomputation!
        }

        if (strategy === 'row-level') {
          // ROW-LEVEL UPDATE PATH (≤50 cells)
          // For MVP, treat same as cell-level (can optimize later to re-render rows)

          fileLog.info('Row-level update (treating as cell-level for MVP)', {
            rowsAffected: changedCells.size,
            skipProcessedRowsRecompute: true,
          })

          this.callbacks.renderCells(changedCells)

          // Clear the changed cells map AND stats for next update
          runInAction(() => {
            this.tableCoreStore.lastChangedCells.clear()
            this.tableCoreStore.lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 }
          })

          return // ✅ Exit early - no processedRows recomputation!
        }
      },
    )

    this.disposers.push(dataDisposer)

    fileLog.info('Version-based data observer initialized')
  }

  /**
   * Dispose all observers
   */
  dispose(): void {
    fileLog.debug('Disposing RenderScheduler')
    this.disposers.forEach((d) => d())
    this.disposers = []
  }
}
