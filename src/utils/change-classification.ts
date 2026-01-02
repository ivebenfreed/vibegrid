export enum ChangeType {
  NONE = 'none',
  CELLS = 'cells',
  ROWS = 'rows',
  STRUCTURAL = 'structural',
}

export interface ChangeMetadata {
  type: ChangeType
  affectedRows: Set<string>
  affectedCells: Map<string, Set<string>>
  sortingSensitive: boolean
  structuralChange: boolean
  estimatedCellCount: number
}

export const CHANGE_THRESHOLDS = {
  MAX_CELL_GRANULAR: 20,
  MAX_CELLS_PER_ROW: 3,
}

export function classifyChanges(
  changedCells: Map<string, Set<string>>,
  sortingSensitive: boolean,
  structuralChange: boolean,
): ChangeMetadata {
  const totalCells = Array.from(changedCells.values()).reduce((sum, cols) => sum + cols.size, 0)

  const affectedRows = new Set(changedCells.keys())

  // Priority 1: Structural or sorting-sensitive (MUST CHECK FIRST!)
  // This fixes the initial load bug where totalCells=0 but it's structural
  if (structuralChange || sortingSensitive) {
    return {
      type: ChangeType.STRUCTURAL,
      affectedRows,
      affectedCells: changedCells,
      sortingSensitive,
      structuralChange,
      estimatedCellCount: totalCells,
    }
  }

  // Priority 2: No changes
  if (totalCells === 0) {
    return {
      type: ChangeType.NONE,
      affectedRows: new Set(),
      affectedCells: new Map(),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 0,
    }
  }

  // Priority 3: Check thresholds for granular vs batch
  if (totalCells <= CHANGE_THRESHOLDS.MAX_CELL_GRANULAR) {
    const maxCellsPerRow = Math.max(...Array.from(changedCells.values()).map((cols) => cols.size))

    if (maxCellsPerRow <= CHANGE_THRESHOLDS.MAX_CELLS_PER_ROW) {
      return {
        type: ChangeType.CELLS,
        affectedRows,
        affectedCells: changedCells,
        sortingSensitive: false,
        structuralChange: false,
        estimatedCellCount: totalCells,
      }
    }

    return {
      type: ChangeType.ROWS,
      affectedRows,
      affectedCells: changedCells,
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: totalCells,
    }
  }

  // Priority 4: Large batch - full render
  return {
    type: ChangeType.STRUCTURAL,
    affectedRows,
    affectedCells: changedCells,
    sortingSensitive: false,
    structuralChange: false,
    estimatedCellCount: totalCells,
  }
}
