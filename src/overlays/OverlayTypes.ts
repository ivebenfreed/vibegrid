import type { CellRef, ViewportInfo } from '../types';

// ====================================
// VISUAL POSITION TYPES
// ====================================

export interface VisualCellPosition {
  cellKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ====================================
// OVERLAY CONFIGURATION
// ====================================

export interface OverlayConfig {
  // Dimension manager removed - use coordinateMapping instead
  // Row dimension manager removed - use coordinateMapping instead
  coordinateManager?: any; // Will be typed as VibeGridXCoordinateManager
  columns?: any[]; // Column array for coordinate calculations
  overlayActor?: any; // Legacy: Overlay machine actor  
  tableMachine?: any; // PREFERRED: Table machine for direct context subscription
  enableSelectionColumn?: boolean; // Enable selection column with checkboxes
  cellWidth: number;
  cellHeight: number;
  borderWidth: number;
  
  // Colors
  selectionColor: string;
  selectionBorderColor: string;
  dragIndicatorColor: string;
  
  // Animation
  enableAnimations: boolean;
  animationDuration: number;
  
  // Performance
  enableLayerCaching: boolean;
  maxSelectableCells: number;
  
  // Portal positioning
  useFixedPositioning?: boolean; // Use fixed positioning for portal-based overlays
  documentViewportOffset?: { top: number; left: number }; // Offset from document viewport
}

export interface OverlayState {
  selectedCells: Set<string>;
  selectionRanges: SelectionRange[];
  draggedItem: any | null;
  dropTarget: any | null;
  viewport: ViewportInfo;
}

export interface SelectionRange {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface CellPosition {
  x: number;
  y: number;
  row: number;
  column: number;
}

export interface DragState {
  isDragging: boolean;
  startPos: { x: number; y: number } | null;
  startCell: { x: number; y: number } | null;
  currentPos: { x: number; y: number } | null;
  currentCell: { x: number; y: number } | null;
}

// Default configuration
export const DEFAULT_CONFIG: OverlayConfig = {
  cellWidth: 120,
  cellHeight: 40,
  borderWidth: 2,
  selectionColor: '#3b82f6',
  selectionBorderColor: '#1d4ed8',
  dragIndicatorColor: '#6366f1',
  enableAnimations: false,
  animationDuration: 200,
  enableLayerCaching: true,
  maxSelectableCells: 1000
};