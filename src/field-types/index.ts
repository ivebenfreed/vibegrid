/**
 * VibeGrid Field Types - Main Index
 *
 * Central export point for the modular field type system.
 *
 * IMPORTANT: Field type implementations are NOT imported at module load time.
 * They are lazily loaded when initializeFieldTypeSystem() or
 * fieldTypeRegistry.ensureInitialized() is called.
 *
 * This prevents the ~45 field type registrations from running at app startup
 * when no VibeGrid is being used.
 */

import { getLogger } from '@/shared/lib/logging'

// Core system exports - these are lightweight and safe to import eagerly
export { FieldTypeRegistry, fieldTypeRegistry } from './FieldTypeRegistry'
export { ModularCellBridge, modularCellBridge } from './ModularCellBridge'

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

// Factory and manager exports
export { CellFactory } from '../factories/CellFactory'
export { RelationshipDataManager } from '../managers/RelationshipDataManager'
export { RollupCalculationManager } from '../managers/RollupCalculationManager'
export { SchemaAdapter } from '../schema/SchemaAdapter'

const fileLog = getLogger(['vibegrid', 'field-types', 'index'])

// Import registry for initialization
import { fieldTypeRegistry } from './FieldTypeRegistry'
import { modularCellBridge } from './ModularCellBridge'

/**
 * Initialize the modular field type system
 *
 * Call this function to ensure all field types are registered and ready to use.
 * This triggers lazy loading of field type implementations.
 *
 * Safe to call multiple times - will only initialize once.
 */
export async function initializeFieldTypeSystem(): Promise<void> {
  try {
    // Trigger lazy loading of all field types
    await fieldTypeRegistry.ensureInitialized()

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

// Field type implementations are loaded lazily via fieldTypeRegistry.ensureInitialized()
// Do NOT add static imports of field type files here - that defeats the lazy loading!
