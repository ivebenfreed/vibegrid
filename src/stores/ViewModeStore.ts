/**
 * ViewModeStore - Manages view mode state (table vs gantt)
 *
 * Simple store for toggling between table and gantt view modes.
 * Gantt mode enables the split pane layout with timeline rendering.
 */

import { action, computed, makeObservable, observable, reaction } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import type { GanttViewStore } from './GanttViewStore'

const logger = getLogger(['vibegrid', 'stores', 'ViewModeStore'])

// ====================================
// TYPES
// ====================================

export type ViewMode = 'table' | 'gantt' | 'kanban'

// ====================================
// STORE
// ====================================

export class ViewModeStore implements IStore {
  /**
   * Current view mode
   * - 'table': Standard table view (default)
   * - 'gantt': Split pane with timeline on right
   */
  @observable mode: ViewMode = 'table'

  /**
   * Width of the left pane in gantt mode (pixels)
   * User can drag the cutoff resizer to adjust this
   */
  @observable cutoffWidth: number = 400

  /**
   * Minimum width for left pane
   */
  readonly minCutoffWidth: number = 200

  /**
   * Maximum width for left pane (percentage of container)
   */
  readonly maxCutoffWidthPercent: number = 0.7

  /**
   * Reference to GanttViewStore for auto-sort on activation
   */
  private ganttViewStore: GanttViewStore | null = null

  /**
   * Disposer for the auto-sort reaction
   */
  private disposeAutoSortReaction?: () => void

  constructor() {
    makeObservable(this)
    logger.info('ViewModeStore initialized')
  }

  /**
   * Set the GanttViewStore reference for auto-sort on activation
   */
  setGanttViewStore(store: GanttViewStore): void {
    this.ganttViewStore = store

    // Set up reaction to auto-sort when entering Gantt mode
    this.disposeAutoSortReaction?.()
    this.disposeAutoSortReaction = reaction(
      () => this.isGanttMode,
      (isGantt) => {
        if (isGantt && this.ganttViewStore) {
          // Auto-sort by start date ascending when entering Gantt mode
          this.ganttViewStore.setGanttSort('start_date', 'asc')
          logger.info('Auto-sorted Gantt by start_date on activation')
        }
      },
    )

    logger.info('GanttViewStore injected into ViewModeStore')
  }

  // ====================================
  // COMPUTED
  // ====================================

  /**
   * Is currently in gantt mode?
   */
  @computed
  get isGanttMode(): boolean {
    return this.mode === 'gantt'
  }

  /**
   * Is currently in table mode?
   */
  @computed
  get isTableMode(): boolean {
    return this.mode === 'table'
  }

  /**
   * Is currently in kanban mode?
   */
  @computed
  get isKanbanMode(): boolean {
    return this.mode === 'kanban'
  }

  // ====================================
  // ACTIONS
  // ====================================

  /**
   * Set the view mode
   */
  @action
  setMode(mode: ViewMode): void {
    if (this.mode === mode) return

    logger.info('View mode changed', { from: this.mode, to: mode })
    this.mode = mode
  }

  /**
   * Toggle between table and gantt modes
   */
  @action
  toggleMode(): void {
    this.setMode(this.mode === 'table' ? 'gantt' : 'table')
  }

  /**
   * Set the cutoff width (left pane width in gantt mode)
   */
  @action
  setCutoffWidth(width: number): void {
    // Clamp to min width
    const clampedWidth = Math.max(width, this.minCutoffWidth)

    if (this.cutoffWidth === clampedWidth) return

    logger.debug('Cutoff width changed', { from: this.cutoffWidth, to: clampedWidth })
    this.cutoffWidth = clampedWidth
  }

  /**
   * Reset cutoff width to default
   */
  @action
  resetCutoffWidth(): void {
    this.cutoffWidth = 400
    logger.debug('Cutoff width reset to default', { width: this.cutoffWidth })
  }

  // ====================================
  // IStore INTERFACE
  // ====================================

  init(): void {
    logger.info('ViewModeStore init called')
    // No reactions needed - simple state store
  }

  reset(): void {
    logger.info('ViewModeStore reset')
    this.mode = 'table'
    this.cutoffWidth = 400
  }

  dispose(): void {
    this.disposeAutoSortReaction?.()
    logger.info('ViewModeStore disposed')
  }
}
