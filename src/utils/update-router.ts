/**
 * Update Router - Determines granular update strategy
 *
 * Uses change metadata to route updates to the most efficient path:
 * - Cell-level: innerHTML updates for individual cells (fast)
 * - Row-level: Re-render affected rows (medium)
 * - Full-render: Complete table recomputation (fallback)
 *
 * Thresholds are tunable based on performance profiling.
 */

import type { ChangeMetadata } from './change-classification'
import { ChangeType } from './change-classification'

/**
 * Update strategy types
 */
export type UpdateStrategy = 'cell-level' | 'row-level' | 'full-render'

/**
 * Tunable thresholds for update routing
 */
export const UPDATE_THRESHOLDS = {
  // Cell-level: Small number of individual cell changes
  CELL_LEVEL_MAX: 10,

  // Row-level: Medium number of cells across fewer rows
  ROW_LEVEL_MAX: 50,

  // Above this: Full render
} as const

/**
 * Determine the most efficient update strategy based on change metadata
 *
 * Decision tree:
 * 1. STRUCTURAL or NONE → full-render (no granular update needed)
 * 2. ≤10 cells → cell-level (innerHTML updates)
 * 3. ≤50 cells → row-level (re-render affected rows)
 * 4. >50 cells → full-render (too many changes)
 *
 * Note: Sort/filter field changes are already classified as STRUCTURAL
 * by the change classification system, so they'll always full-render.
 *
 * @param metadata Change metadata from TableCoreStore
 * @returns Update strategy to use
 */
export function determineUpdateStrategy(metadata: ChangeMetadata | null): UpdateStrategy {
  // No metadata or no-op → full render (safe fallback)
  if (!metadata || metadata.type === ChangeType.NONE) {
    return 'full-render'
  }

  // Structural changes always full render
  // (includes sort/filter changes, add/remove rows)
  if (metadata.type === ChangeType.STRUCTURAL) {
    return 'full-render'
  }

  const cellCount = metadata.estimatedCellCount

  // Small changes: update individual cells via innerHTML
  // Fast path - no row re-render needed
  if (cellCount <= UPDATE_THRESHOLDS.CELL_LEVEL_MAX) {
    return 'cell-level'
  }

  // Medium changes: update affected rows
  // Balance between granularity and performance
  if (cellCount <= UPDATE_THRESHOLDS.ROW_LEVEL_MAX) {
    return 'row-level'
  }

  // Large changes: fall back to full render
  // At this scale, full recomputation is more efficient
  return 'full-render'
}

/**
 * Check if a change requires full render based on change type
 * Helper for quick decisions without computing strategy
 */
export function requiresFullRender(metadata: ChangeMetadata | null): boolean {
  if (!metadata) return true
  return metadata.type === ChangeType.STRUCTURAL || metadata.type === ChangeType.NONE
}
