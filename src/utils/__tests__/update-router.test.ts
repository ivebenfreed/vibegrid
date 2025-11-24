/**
 * Update Router Tests
 */

import { describe, it, expect } from 'vitest'
import { determineUpdateStrategy, requiresFullRender, UPDATE_THRESHOLDS } from '../update-router'
import { ChangeType, type ChangeMetadata } from '../change-classification'

describe('determineUpdateStrategy', () => {
  it('returns full-render for null metadata', () => {
    expect(determineUpdateStrategy(null)).toBe('full-render')
  })

  it('returns full-render for NONE change type', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.NONE,
      affectedRows: new Set(),
      affectedCells: new Map(),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 0
    }
    expect(determineUpdateStrategy(metadata)).toBe('full-render')
  })

  it('returns full-render for STRUCTURAL change type', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.STRUCTURAL,
      affectedRows: new Set(['row1']),
      affectedCells: new Map([['row1', new Set(['col1'])]]),
      sortingSensitive: false,
      structuralChange: true,
      estimatedCellCount: 1
    }
    expect(determineUpdateStrategy(metadata)).toBe('full-render')
  })

  it('returns cell-level for small changes (≤10 cells)', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.CELLS,
      affectedRows: new Set(['row1', 'row2']),
      affectedCells: new Map([
        ['row1', new Set(['col1', 'col2'])],
        ['row2', new Set(['col1'])]
      ]),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 3
    }
    expect(determineUpdateStrategy(metadata)).toBe('cell-level')
  })

  it('returns cell-level for exactly 10 cells (threshold boundary)', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.CELLS,
      affectedRows: new Set(['row1']),
      affectedCells: new Map([['row1', new Set(Array.from({ length: 10 }, (_, i) => `col${i}`))]]),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: UPDATE_THRESHOLDS.CELL_LEVEL_MAX
    }
    expect(determineUpdateStrategy(metadata)).toBe('cell-level')
  })

  it('returns row-level for medium changes (11-50 cells)', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.ROWS,
      affectedRows: new Set(['row1', 'row2']),
      affectedCells: new Map([
        ['row1', new Set(Array.from({ length: 10 }, (_, i) => `col${i}`))],
        ['row2', new Set(Array.from({ length: 5 }, (_, i) => `col${i}`))]
      ]),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 15
    }
    expect(determineUpdateStrategy(metadata)).toBe('row-level')
  })

  it('returns row-level for exactly 50 cells (threshold boundary)', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.ROWS,
      affectedRows: new Set(['row1']),
      affectedCells: new Map([['row1', new Set(Array.from({ length: 50 }, (_, i) => `col${i}`))]]),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: UPDATE_THRESHOLDS.ROW_LEVEL_MAX
    }
    expect(determineUpdateStrategy(metadata)).toBe('row-level')
  })

  it('returns full-render for large changes (>50 cells)', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.STRUCTURAL,
      affectedRows: new Set(Array.from({ length: 100 }, (_, i) => `row${i}`)),
      affectedCells: new Map(
        Array.from({ length: 100 }, (_, i) => [`row${i}`, new Set(['col1'])])
      ),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 100
    }
    expect(determineUpdateStrategy(metadata)).toBe('full-render')
  })

  it('returns full-render for sorting-sensitive changes', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.STRUCTURAL,
      affectedRows: new Set(['row1']),
      affectedCells: new Map([['row1', new Set(['name'])]]),
      sortingSensitive: true,
      structuralChange: false,
      estimatedCellCount: 1
    }
    expect(determineUpdateStrategy(metadata)).toBe('full-render')
  })
})

describe('requiresFullRender', () => {
  it('returns true for null metadata', () => {
    expect(requiresFullRender(null)).toBe(true)
  })

  it('returns true for NONE change type', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.NONE,
      affectedRows: new Set(),
      affectedCells: new Map(),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 0
    }
    expect(requiresFullRender(metadata)).toBe(true)
  })

  it('returns true for STRUCTURAL change type', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.STRUCTURAL,
      affectedRows: new Set(['row1']),
      affectedCells: new Map([['row1', new Set(['col1'])]]),
      sortingSensitive: false,
      structuralChange: true,
      estimatedCellCount: 1
    }
    expect(requiresFullRender(metadata)).toBe(true)
  })

  it('returns false for CELLS change type', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.CELLS,
      affectedRows: new Set(['row1']),
      affectedCells: new Map([['row1', new Set(['col1'])]]),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 1
    }
    expect(requiresFullRender(metadata)).toBe(false)
  })

  it('returns false for ROWS change type', () => {
    const metadata: ChangeMetadata = {
      type: ChangeType.ROWS,
      affectedRows: new Set(['row1']),
      affectedCells: new Map([['row1', new Set(['col1', 'col2', 'col3', 'col4'])]]),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 4
    }
    expect(requiresFullRender(metadata)).toBe(false)
  })
})
