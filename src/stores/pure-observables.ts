/**
 * pure-observables.ts - Legacy Compatibility Stub
 *
 * ⚠️ This file is a stub for backward compatibility.
 * All Legend State stores have been migrated to MobX.
 *
 * Original stores deleted:
 * - data-state.ts → TableCoreStore.ts (MobX)
 * - visual-state.ts → VisualStateStore.ts (MobX)
 * - interaction-state.ts → InteractionStore.ts (MobX)
 *
 * This file only provides type exports for files that haven't been updated yet.
 */

// Legacy type exports for backward compatibility
export type TableCore$ = any
export type TableCoreSync$ = any
export type TableInteraction$ = any
export type TableViewport$ = any
export type TableViewportState = any
export type PersistedTableState = any
export type TableCoreState = any
export type TableInteractionState = any

// Stub exports - these should not be used
export function createPureObservables(config: any): any {
  throw new Error('createPureObservables has been removed - use MobX stores instead')
}

export function createTableCore$(config: any): any {
  throw new Error('createTableCore$ has been removed - use TableCoreStore instead')
}

export function createTableCoreSync$(config: any): any {
  throw new Error('createTableCoreSync$ has been removed - use TableCoreStore instead')
}

export function createTableInteraction$(config: any): any {
  throw new Error('createTableInteraction$ has been removed - use InteractionStore instead')
}

export function createVibeGridVisualState(): any {
  throw new Error('createVibeGridVisualState has been removed - use VisualStateStore instead')
}

// Type re-exports (empty for now)
export type ColumnLayout = any
export type ViewportGeometry = any
export type VisualState = any

export interface PureObservables {
  tableCore$: any
  tableCoreSync$: any
  tableInteraction$: any
  visualInputs$: any
  visualState$: any
  visualOperations: any
}
