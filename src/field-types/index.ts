/**
 * VibeGrid Field Types - Main Index
 *
 * Central export point for the modular field type system.
 * Imports all field type implementations to ensure they are registered.
 */

import { getLogger } from '@/shared/lib/logging'

// Import registry first before any field type implementations
import { fieldTypeRegistry } from './FieldTypeRegistry'
import { modularCellBridge } from './ModularCellBridge'

const fileLog = getLogger(['vibegrid', 'field-types', 'index'])

// Import all field type implementations to register them early
// Basic types
import './implementations/basic/TextFieldType'
import './implementations/basic/EntityNameFieldType' // Special renderer for name/title fields
import './implementations/basic/TextAreaFieldType'
import './implementations/basic/NumberFieldType'
import './implementations/basic/DateFieldType'
import './implementations/basic/BooleanFieldType'
import './implementations/basic/SelectFieldType'
import './implementations/basic/EmailFieldType'
import './implementations/basic/UrlFieldType'
import './implementations/basic/PhoneFieldType'
import './implementations/basic/ColorFieldType'
import './implementations/basic/CurrencyFieldType'
import './implementations/basic/FileFieldType'
import './implementations/basic/RatingFieldType'
import './implementations/basic/SliderFieldType'
import './implementations/basic/ImageFieldType'
import './implementations/basic/MarkdownFieldType'

// Relationship types
import './implementations/relationship/UserReferenceFieldType'
import './implementations/relationship/EntityReferenceFieldType'

// Rollup types
import './implementations/rollup/RollupCountFieldType'
import './implementations/rollup/RollupSumFieldType'
import './implementations/rollup/RollupAverageFieldType'
import './implementations/rollup/RollupConcatFieldType'

// Computed types
import './implementations/computed/ComputedFieldTypes'

export { CellFactory } from '../factories/CellFactory'
// Manager exports
export { RelationshipDataManager } from '../managers/RelationshipDataManager'
export { RollupCalculationManager } from '../managers/RollupCalculationManager'
export { SchemaAdapter } from '../schema/SchemaAdapter'
// Type exports
export type {
  AsyncDataLoader,
  CellEditor,
  CellFormatter,
  CellRenderer,
  CellValidator,
  EnhancedColumn,
  FieldMetadata,
  FormattingContext,
  RelationshipConfig,
  RelationshipData,
  RelationshipOption,
  RollupCalculator,
  RollupConfig,
  ValidationResult,
  VibeGridFieldType,
} from './FieldTypeRegistry'
// Core system exports
export { FieldTypeRegistry, fieldTypeRegistry } from './FieldTypeRegistry'
export { ModularCellBridge, modularCellBridge } from './ModularCellBridge'

// Import all field type implementations to register them
// Basic field types
import './implementations/basic/TextFieldType'
import './implementations/basic/NumberFieldType'
import './implementations/basic/DateFieldType'
import './implementations/basic/BooleanFieldType'
import './implementations/basic/SelectFieldType'
import './implementations/basic/EmailFieldType'
import './implementations/basic/UrlFieldType'
import './implementations/basic/PhoneFieldType'
import './implementations/basic/ColorFieldType'
import './implementations/basic/CurrencyFieldType'
import './implementations/basic/FileFieldType'
import './implementations/basic/ImageFieldType'
import './implementations/basic/RatingFieldType'
import './implementations/basic/SliderFieldType'
import './implementations/basic/TextAreaFieldType'
import './implementations/basic/MarkdownFieldType'

// Relationship field types
import './implementations/relationship/UserReferenceFieldType'
import './implementations/relationship/EntityReferenceFieldType'

// Rollup field types
import './implementations/rollup/RollupCountFieldType'
import './implementations/rollup/RollupSumFieldType'
import './implementations/rollup/RollupAverageFieldType'
import './implementations/rollup/RollupConcatFieldType'

// Computed field types
import './implementations/computed/ComputedFieldTypes'

// Field type implementations that will be added in future phases:
// import './implementations/basic/UrlFieldType';
// import './implementations/basic/PhoneFieldType';
// import './implementations/basic/ColorFieldType';
// import './implementations/basic/FileFieldType';
// import './implementations/basic/CurrencyFieldType';
// import './implementations/relationship/EntityReferenceFieldType';
// import './implementations/rollup/RollupSumFieldType';
// import './implementations/rollup/RollupAverageFieldType';
// import './implementations/rollup/RollupConcatFieldType';

/**
 * Initialize the modular field type system
 *
 * Call this function to ensure all field types are registered and ready to use.
 */
export function initializeFieldTypeSystem(): void {
  try {
    // Field types are automatically registered via imports above
    const stats = fieldTypeRegistry.getRegisteredTypes()

    fileLog.debug('VibeGrid Modular Field Type System Initialized', {
      totalFieldTypes: stats.length,
      basicTypes: fieldTypeRegistry.getTypesByCategory('basic'),
      relationshipTypes: fieldTypeRegistry.getTypesByCategory('relationship'),
      rollupTypes: fieldTypeRegistry.getTypesByCategory('rollup'),
      computedTypes: fieldTypeRegistry.getTypesByCategory('computed'),
    })

    // Clean up expired cache entries
    if (typeof window !== 'undefined') {
      // Set up periodic cache cleanup (every 5 minutes)
      setInterval(
        () => {
          try {
            // Use global reference since modularCellBridge might not be in scope
            const bridge = (globalThis as any).modularCellBridge || modularCellBridge
            bridge?.relationshipDataManager?.cleanupExpiredCache?.()
          } catch (error) {
            fileLog.warn('Cache cleanup failed', { error })
          }
        },
        5 * 60 * 1000,
      )
    }
  } catch (error) {
    fileLog.error('Failed to initialize field type system', { error })
    throw error // FAIL FAST
  }
}

/**
 * Check if the modular system can handle a specific field type
 */
export function canHandleFieldType(fieldType: string): boolean {
  return fieldTypeRegistry.hasFieldType(fieldType)
}

/**
 * Get supported field types by category
 */
export function getSupportedFieldTypes() {
  return {
    basic: fieldTypeRegistry.getTypesByCategory('basic'),
    relationship: fieldTypeRegistry.getTypesByCategory('relationship'),
    rollup: fieldTypeRegistry.getTypesByCategory('rollup'),
    computed: fieldTypeRegistry.getTypesByCategory('computed'),
  }
}

/**
 * Development utility - get system statistics
 */
export function getSystemStats() {
  return modularCellBridge.getStats()
}

// DON'T auto-initialize - will be called explicitly from VibeGrid hydration system
// The fieldTypeRegistry is initialized when the individual field types are imported
