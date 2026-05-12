/**
 * GH#2804 B8: SparseSkeletonCell — pulse-animation placeholder for unloaded
 * sparse rows.
 *
 * Used by BodyRenderer when `row.__sparse === true` (cursor-bounded substrate
 * mode); short-circuits the normal column-type → renderer dispatch and renders
 * a width-correct skeleton bar while the SharedWorker fetches the real row.
 *
 * Spec: docs/planning/specs/2804-smart-100k-row-system.md §B8
 *
 * UI Layer:
 *   <div class="sparse-skeleton-cell" style="width: {colWidth}px; height: 34px">
 *     <div class="sparse-skeleton-bar"/>
 *   </div>
 *
 * Animation: 1.5s pulse, opacity 0.3 ↔ 0.7, GPU-composited via `will-change`.
 * CSS lives in `apps/web/src/systems/vibegrid/vibegridx-cells.css`.
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'

// GH#2804 round-2 review fix (Suggestion 9): use the canonical grid row
// height constant instead of a hand-coded literal so skeleton heights track
// any future change to GRID_DIMENSIONS.ROW_HEIGHT (avoiding a visual jump
// when skeletons resolve into real rows).
const ROW_HEIGHT_PX = GRID_DIMENSIONS.ROW_HEIGHT

class SparseSkeletonCellRenderer implements CellRenderer {
  render(_value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    el.className = 'sparse-skeleton-cell'
    el.setAttribute('data-testid', 'sparse-skeleton-cell')
    // Width comes from column width; the cell wrapper (vibegridx-cell) also
    // sets width but we set it here so isolated unit tests still see it.
    const width = typeof column.width === 'number' ? column.width : 150
    el.style.width = `${width}px`
    el.style.height = `${ROW_HEIGHT_PX}px`

    // GH#2934 (p5): compose `vibegrid-skeleton-bar` (animation/color) with
    // `sparse-skeleton-bar` (sizing) so this renderer shares its shimmer with
    // the React TableSkeleton overlay.
    const bar = document.createElement('div')
    bar.className = 'vibegrid-skeleton-bar sparse-skeleton-bar'
    el.appendChild(bar)

    return el
  }

  format(_value: unknown, _column: Column, _context: CellRendererContext): string {
    return ''
  }

  affordances = {
    sortable: false,
    filterable: false,
    editable: false,
    resizable: false,
    reorderable: false,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'cancel' as const,
  }

  metadata = {
    category: 'basic' as const,
    description: 'Sparse-row skeleton placeholder (GH#2804 B8)',
  }
}

export const sparseSkeletonCellRenderer = new SparseSkeletonCellRenderer()

/**
 * Slot id used by BodyRenderer to retrieve the skeleton renderer when it
 * detects a sparse placeholder row. Not matched by any cellType; the slot is
 * reachable via direct id lookup, not by SlotRegistry.resolve().
 */
export const SPARSE_SKELETON_SLOT_ID = '__sparse_skeleton__'
