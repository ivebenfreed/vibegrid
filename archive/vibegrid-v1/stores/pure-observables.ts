/**
 * pure-observables.ts - Compatibility Layer
 *
 * This file provides backward compatibility after Phase 1 consolidation.
 * All functionality has been moved to focused files:
 * - data-state.ts (core data operations)
 * - visual-state.ts (visual display + columns + visual rows)
 * - interaction-state.ts (user interactions)
 * - data-loading-stages.ts (loading states)
 */

// Re-export from the new consolidated files
export { createTableCore$, createTableCoreSync$ } from './data-state';
export { createTableInteraction$ } from './interaction-state';
export { createVibeGridVisualState } from './visual-state';

// Types
export type {
  ColumnLayout,
  ViewportGeometry,
  VisualState
} from './visual-state';

// Main factory function - reconstructed from the split modules
export function createPureObservables(config: any) {
  // This recreates the combined observable structure that components expect
  const tableCore$ = createTableCore$(config);
  const tableCoreSync$ = createTableCoreSync$(config);
  const tableInteraction$ = createTableInteraction$(config);
  const visualState = createVibeGridVisualState();

  return {
    tableCore$,
    tableCoreSync$,
    tableInteraction$,
    // Visual state is now consolidated in visual-state.ts using factory pattern
    visualInputs$: visualState.visualInputs$,
    visualState$: visualState.visualState$,
    visualOperations: visualState.visualOperations
  };
}

// Legacy type exports for backward compatibility
export interface PureObservables {
  tableCore$: any;
  tableCoreSync$: any;
  tableInteraction$: any;
  visualInputs$: any;
  visualState$: any;
  visualOperations: any;
}

export type TableCore$ = any;
export type TableCoreSync$ = any;
export type TableInteraction$ = any;
export type TableViewport$ = any;
export type TableViewportState = any;
export type PersistedTableState = any;
export type TableCoreState = any;
export type TableInteractionState = any;