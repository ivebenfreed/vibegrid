// ====================================
// OVERLAY UTILITIES
// ====================================

/**
 * Generate all cell keys in a rectangular range between two cells
 */
export function getCellsInRange(
  startRow: number, 
  startCol: number, 
  endRow: number, 
  endCol: number,
  getCellKey: (row: number, col: number) => string | null
): Set<string> {
  const cells = new Set<string>();
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cellKey = getCellKey(row, col);
      if (cellKey) {
        cells.add(cellKey);
      }
    }
  }
  
  return cells;
}

/**
 * Parse a cell key into row and column IDs
 * @param cellKey Format: "rowId:columnId"
 * @returns Parsed components or null if invalid
 */
export function parseCellKey(cellKey: string): { rowId: string; columnId: string } | null {
  const parts = cellKey.split(':');
  if (parts.length !== 2) {
    return null;
  }
  return { rowId: parts[0], columnId: parts[1] };
}

/**
 * Create a cell key from row and column IDs
 */
export function createCellKey(rowId: string, columnId: string): string {
  return `${rowId}:${columnId}`;
}

/**
 * Calculate the bounds of a selection in terms of row/column indices
 */
export function getSelectionBounds(
  selectedCells: Set<string>,
  parseKey: (cellKey: string) => { row: number; column: number } | null
): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
  if (selectedCells.size === 0) {
    return null;
  }
  
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  
  for (const cellKey of selectedCells) {
    const parsed = parseKey(cellKey);
    if (parsed) {
      minRow = Math.min(minRow, parsed.row);
      maxRow = Math.max(maxRow, parsed.row);
      minCol = Math.min(minCol, parsed.column);
      maxCol = Math.max(maxCol, parsed.column);
    }
  }
  
  if (minRow === Infinity) {
    return null;
  }
  
  return { minRow, maxRow, minCol, maxCol };
}

/**
 * Check if two sets of strings are equal
 */
export function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Calculate fill preview cells based on drag direction
 */
export function calculateFillCells(
  selectedBounds: { minRow: number; maxRow: number; minCol: number; maxCol: number },
  dragRow: number,
  dragCol: number,
  getCellKey: (row: number, col: number) => string | null
): Set<string> {
  const fillCells = new Set<string>();
  
  // Determine fill direction
  const fillDown = dragRow > selectedBounds.maxRow;
  const fillUp = dragRow < selectedBounds.minRow;
  const fillRight = dragCol > selectedBounds.maxCol;
  const fillLeft = dragCol < selectedBounds.minCol;
  
  if (fillDown) {
    for (let row = selectedBounds.maxRow + 1; row <= dragRow; row++) {
      for (let col = selectedBounds.minCol; col <= selectedBounds.maxCol; col++) {
        const key = getCellKey(row, col);
        if (key) fillCells.add(key);
      }
    }
  } else if (fillUp) {
    for (let row = dragRow; row < selectedBounds.minRow; row++) {
      for (let col = selectedBounds.minCol; col <= selectedBounds.maxCol; col++) {
        const key = getCellKey(row, col);
        if (key) fillCells.add(key);
      }
    }
  } else if (fillRight) {
    for (let row = selectedBounds.minRow; row <= selectedBounds.maxRow; row++) {
      for (let col = selectedBounds.maxCol + 1; col <= dragCol; col++) {
        const key = getCellKey(row, col);
        if (key) fillCells.add(key);
      }
    }
  } else if (fillLeft) {
    for (let row = selectedBounds.minRow; row <= selectedBounds.maxRow; row++) {
      for (let col = dragCol; col < selectedBounds.minCol; col++) {
        const key = getCellKey(row, col);
        if (key) fillCells.add(key);
      }
    }
  }
  
  return fillCells;
}