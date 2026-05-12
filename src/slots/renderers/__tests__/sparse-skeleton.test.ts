/**
 * @vitest-environment jsdom
 *
 * GH#2804 B8: SparseSkeletonCell unit test.
 */

import { describe, it, expect } from 'vitest'
import { sparseSkeletonCellRenderer, SPARSE_SKELETON_SLOT_ID } from '../sparse-skeleton'
import type { Column } from '../../../types'
import type { CellRendererContext } from '../../SlotRegistry'
import { GRID_DIMENSIONS } from '../../../constants/grid-dimensions'

function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: 'status',
    name: 'Status',
    cellType: 'text',
    width: 220,
    ...overrides,
  } as unknown as Column
}

const ctx: CellRendererContext = { viewMode: 'table' }

describe('SparseSkeletonCellRenderer', () => {
  it('renders a div with class sparse-skeleton-cell', () => {
    const el = sparseSkeletonCellRenderer.render(undefined, makeColumn(), ctx)
    expect(el.tagName).toBe('DIV')
    expect(el.className).toBe('sparse-skeleton-cell')
  })

  it('stamps data-testid="sparse-skeleton-cell" for verification', () => {
    const el = sparseSkeletonCellRenderer.render(undefined, makeColumn(), ctx)
    expect(el.getAttribute('data-testid')).toBe('sparse-skeleton-cell')
  })

  it('sizes width to the column width', () => {
    const el = sparseSkeletonCellRenderer.render(undefined, makeColumn({ width: 320 }), ctx)
    expect(el.style.width).toBe('320px')
  })

  it('falls back to width 150 when column width is missing', () => {
    const el = sparseSkeletonCellRenderer.render(undefined, makeColumn({ width: undefined }), ctx)
    expect(el.style.width).toBe('150px')
  })

  it('sizes height to GRID_DIMENSIONS.ROW_HEIGHT (canonical constant)', () => {
    const el = sparseSkeletonCellRenderer.render(undefined, makeColumn(), ctx)
    expect(el.style.height).toBe(`${GRID_DIMENSIONS.ROW_HEIGHT}px`)
  })

  it('contains a single .sparse-skeleton-bar child for the pulse animation', () => {
    const el = sparseSkeletonCellRenderer.render(undefined, makeColumn(), ctx)
    const bars = el.querySelectorAll('.sparse-skeleton-bar')
    expect(bars.length).toBe(1)
  })

  it('GH#2934 (p5): bar composes the unified .vibegrid-skeleton-bar class for shared shimmer', () => {
    const el = sparseSkeletonCellRenderer.render(undefined, makeColumn(), ctx)
    const bar = el.querySelector('.sparse-skeleton-bar') as HTMLElement | null
    expect(bar).not.toBeNull()
    expect(bar?.classList.contains('vibegrid-skeleton-bar')).toBe(true)
  })

  it('declares non-interactive affordances (no edit/sort/filter)', () => {
    expect(sparseSkeletonCellRenderer.affordances?.editable).toBe(false)
    expect(sparseSkeletonCellRenderer.affordances?.sortable).toBe(false)
    expect(sparseSkeletonCellRenderer.affordances?.filterable).toBe(false)
  })

  it('has a stable slot id constant', () => {
    expect(SPARSE_SKELETON_SLOT_ID).toBe('__sparse_skeleton__')
  })
})
