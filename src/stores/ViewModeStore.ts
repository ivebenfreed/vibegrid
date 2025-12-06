/**
 * ViewModeStore - Manages view mode state (table vs gantt)
 *
 * Simple store for toggling between table and gantt view modes.
 * Gantt mode enables the split pane layout with timeline rendering.
 */

import { makeAutoObservable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'stores', 'ViewModeStore'])

// ====================================
// TYPES
// ====================================

export type ViewMode = 'table' | 'gantt'

// ====================================
// STORE
// ====================================

export class ViewModeStore implements IStore {
  mode: ViewMode
  cutoffWidth = 400
  readonly minCutoffWidth = 200
  readonly maxCutoffWidthPercent = 0.7
  private readonly defaultMode: ViewMode

  constructor(defaultMode: ViewMode = 'table') {
    this.defaultMode = defaultMode
    this.mode = defaultMode
    makeAutoObservable(this)
    logger.info('ViewModeStore initialized', { defaultMode })
  }

  get isGanttMode(): boolean {
    return this.mode === 'gantt'
  }

  get isTableMode(): boolean {
    return this.mode === 'table'
  }

  setMode(mode: ViewMode): void {
    if (this.mode === mode) return
    logger.info('View mode changed', { from: this.mode, to: mode })
    this.mode = mode
  }

  toggleMode(): void {
    this.setMode(this.mode === 'table' ? 'gantt' : 'table')
  }

  setCutoffWidth(width: number): void {
    const clampedWidth = Math.max(width, this.minCutoffWidth)
    if (this.cutoffWidth === clampedWidth) return
    logger.debug('Cutoff width changed', { from: this.cutoffWidth, to: clampedWidth })
    this.cutoffWidth = clampedWidth
  }

  resetCutoffWidth(): void {
    this.cutoffWidth = 400
    logger.debug('Cutoff width reset to default', { width: this.cutoffWidth })
  }

  init(): void {
    logger.info('ViewModeStore init called')
  }

  reset(): void {
    logger.info('ViewModeStore reset')
    this.mode = this.defaultMode
    this.cutoffWidth = 400
  }

  dispose(): void {
    logger.info('ViewModeStore disposed')
  }
}
