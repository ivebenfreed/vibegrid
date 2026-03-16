/**
 * VibeGrid Field Types - Main Index
 *
 * Type definitions and utility functions for the field type system.
 * Cell rendering is handled exclusively by SlotRegistry (see slots/SlotRegistry.ts).
 */

// All types re-exported from the types module
export type {
  AccessibilityMetadata,
  AsyncDataLoader,
  CellEditor,
  CellFormatter,
  CellRenderer,
  CellValidator,
  DisplayMetadata,
  EditorMetadata,
  EnhancedColumn,
  FieldCapabilities,
  FieldInteractionPolicy,
  FieldMetadata,
  FormattingContext,
  RelationshipConfig,
  RelationshipData,
  RelationshipOption,
  RollupCalculator,
  RollupConfig,
  ValidationMetadata,
  ValidationResult,
  VibeGridFieldType,
} from './types'

// Utility function re-exports
export {
  isComputedField,
  isReadOnlyField,
  isRelationshipField,
  isRollupField,
  requiresAsyncData,
} from './types'

// Schema adapter (still used for column enhancement)
export { SchemaAdapter } from '../schema/SchemaAdapter'
