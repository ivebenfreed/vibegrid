/**
 * Unified Column Generation for VibeGrid
 *
 * Generates VibeGrid columns from entity schema using the same field type processing
 * as cell renderers for consistent behavior.
 */

import { createLogger } from '@/shared/lib/logging'
import { COLUMN_DEFAULTS } from '../column-defaults'
import type { CellType } from '../column-types'
import type { Column } from '../types'
// IMPORTANT: Import field-types index to trigger all field type registrations
import '../field-types'
import type { SchemaRegistryStore } from '@/app/stores/domain/SchemaRegistryStore'
import { fieldTypeRegistry } from '../field-types/FieldTypeRegistry'

const fileLog = createLogger('components/custom/vibegrid/stores/column-generation')

/**
 * Fallback function that returns basic columns when schema is not available
 */
function getBasicColumns<T = any>(): Column<T>[] {
  fileLog.warn('Using fallback basic columns - schema not available')
  return []
}

function deriveTargetEntityFromField(fieldName: string | undefined): string | null {
  if (!fieldName) return null
  const base = fieldName
    .replace(/_id$/i, '')
    .replace(/Id$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()

  if (!base) return null

  return base
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

interface EntityField {
  name: string
  type: string
  required?: boolean
  editor?: {
    options?: Array<{
      value: string
      label: string
      color?: string
      backgroundColor?: string
      icon?: string
      description?: string
    }>
  }
  validation?: {
    enum?: string[]
  }
  syncable?: boolean

  // Unique identifier
  id?: string

  // Relationship properties
  relationshipTable?: string
  targetEntityType?: string
  referenceEntity?: string
  relationshipDisplayField?: string
  displayField?: string
  relationshipSearchFields?: string[]
  searchFields?: string[]
  relationshipType?: 'many-to-one' | 'one-to-many' | 'many-to-many'
}

/**
 * Generate VibeGrid columns from entity schema using SchemaRegistryStore
 */
export async function generateColumnsFromEntitySchema<T = any>(
  entityType: string,
  schemaRegistry: SchemaRegistryStore,
): Promise<Column<T>[]> {
  fileLog.debug('🎯 Generating columns from entity schema', { entityType })

  // Check if schema registry is ready
  if (schemaRegistry.isBootstrapping) {
    fileLog.debug('⏳ Schema registry still loading', { entityType })
    throw new Error(`Schema registry still loading for entity: ${entityType}`)
  }

  // Get schemas from MobX store
  const schemas = schemaRegistry.schemas
  if (!schemas) {
    fileLog.warn('❌ Schema registry not available', { entityType })
    throw new Error(`Schema registry not available for entity: ${entityType}`)
  }

  // Look up entity schema by name using the byName index
  const entitySchema = schemas.byName[entityType]

  if (!entitySchema) {
    fileLog.error('❌ Entity not found in schema registry - FAIL FAST', {
      entityType,
      availableEntities: Object.keys(schemas.byName),
    })
    throw new Error(
      `Entity ${entityType} not found in schema registry. Available: ${Object.keys(schemas.byName).join(', ')}`,
    )
  }

  fileLog.debug('✅ Found entity schema', {
    entityType,
    fieldCount: entitySchema.fields?.length || 0,
  })

  return generateColumnsFromEntity(entitySchema, entityType)
}

/**
 * Generate columns from entity schema object
 */
function generateColumnsFromEntity<T = any>(entitySchema: any, entityType: string): Column<T>[] {
  if (!entitySchema) {
    fileLog.warn('❌ No schema provided for column generation', { entityType })
    return getBasicColumns<T>()
  }

  // Extract fields from schema - Universe schema uses 'allFields' as an object, not array
  let schemaFields = entitySchema.allFields || entitySchema.fields || []

  // Convert allFields object to array if needed
  if (schemaFields && typeof schemaFields === 'object' && !Array.isArray(schemaFields)) {
    schemaFields = Object.values(schemaFields)
  }

  // DEBUG: Log the actual entity schema structure to understand the issue
  fileLog.debug('🔍 [SCHEMA-DEBUG] Entity schema fields found', {
    entityType,
    hasAllFields: !!entitySchema.allFields,
    allFieldsLength: entitySchema.allFields?.length,
    hasFields: !!entitySchema.fields,
    fieldsLength: entitySchema.fields?.length,
    usingAllFields: !!entitySchema.allFields,
    schemaFieldsLength: schemaFields?.length,
    allSchemaKeys: Object.keys(entitySchema || {}),
  })

  if (!Array.isArray(schemaFields) || schemaFields.length === 0) {
    // ENHANCED DEBUG: Show what we actually got
    fileLog.warn('❌ No fields found in entity schema - Enhanced Debug', {
      entityType,
      schemaFields,
      schemaFieldsType: typeof schemaFields,
      schemaFieldsIsArray: Array.isArray(schemaFields),
      schemaFieldsLength: schemaFields?.length,
      entitySchemaKeys: Object.keys(entitySchema || {}),
      allFieldsRaw: entitySchema.allFields,
      allFieldsType: typeof entitySchema.allFields,
      allFieldsKeys: entitySchema.allFields ? Object.keys(entitySchema.allFields) : 'no allFields',
    })
    return getBasicColumns<T>()
  }

  // Generate columns from schema fields - Synchronous approach with lazy color loading
  const allColumns = schemaFields
    .map((fieldDef: any) => {
      // FieldDefinition uses "fieldName" property (from @/types/dataforge)
      const fieldName = fieldDef?.fieldName || fieldDef?.name
      if (!fieldName) {
        fileLog.warn('⚠️ Field missing fieldName/name property, skipping', { fieldDef })
        return null
      }

      const safeFieldDef: EntityField =
        fieldDef && typeof fieldDef === 'object'
          ? { ...fieldDef, name: fieldName }
          : { name: fieldName, type: 'text' }
      const fieldType = String(safeFieldDef.type || 'text').toLowerCase()

      // Map DataForge field types to VibeGrid cell types
      const cellType = mapFieldTypeToVibeGridCellType(fieldType, fieldName)

      let relationshipMetadata: {
        targetEntityType: string | null
        displayField: string
        searchFields: string[]
      } | null = null

      if (cellType.includes('entity_reference')) {
        const targetEntityType =
          safeFieldDef.relationshipTable ||
          safeFieldDef.targetEntityType ||
          safeFieldDef.referenceEntity ||
          deriveTargetEntityFromField(fieldName) ||
          null
        const displayField =
          safeFieldDef.relationshipDisplayField || safeFieldDef.displayField || 'name'
        const searchFields = safeFieldDef.relationshipSearchFields ||
          safeFieldDef.searchFields || ['name', 'title']

        relationshipMetadata = {
          targetEntityType,
          displayField,
          searchFields,
        }

        fileLog.debug('[COLUMN-GEN] Entity reference field detected', {
          entityType,
          fieldName,
          fieldType,
          relationshipType: safeFieldDef.relationshipType,
          relationshipTable: safeFieldDef.relationshipTable,
          relationshipDisplayField: safeFieldDef.relationshipDisplayField,
          targetEntityType,
          rawField: safeFieldDef,
        })
      }

      // Get width from centralized defaults
      const defaults = COLUMN_DEFAULTS[cellType as CellType] || COLUMN_DEFAULTS.text
      const width = defaults.width

      // Determine if field should be editable
      const isEditable =
        !['id', 'created_at', 'updated_at'].includes(fieldName) && safeFieldDef.syncable !== false

      // Use options from schema (backend already provides colored options)
      const options = safeFieldDef.editor?.options || []

      // 🚀 PERFORMANCE: Pre-compute field type and formatter ONCE during column generation
      let fieldTypeInstance: any
      let formatter: any
      let editor: any

      try {
        // Create mock enhanced column for field type resolution
        const mockColumn = {
          id: fieldName,
          field: fieldName,
          cellType: cellType,
          type: fieldType,
          options: options,
          hasOptions: options.length > 0,
        } as any

        fieldTypeInstance = fieldTypeRegistry.getFieldType(mockColumn)
        formatter = fieldTypeInstance.formatter?.format?.bind(fieldTypeInstance.formatter)
        editor = fieldTypeInstance.editor

        fileLog.debug('🚀 [FIELD-PRECOMPUTE] Pre-computed field type and formatter', {
          fieldName,
          fieldType,
          cellType,
          hasFormatter: !!formatter,
          hasEditor: !!editor,
          fieldTypeCategory: fieldTypeInstance.category,
        })
      } catch (error) {
        fileLog.warn('⚠️ [FIELD-PRECOMPUTE] Failed to pre-compute field type, will use fallback', {
          fieldName,
          fieldType,
          cellType,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      // PERFORMANCE: Store field type config for optimized cell creation
      const fieldTypeConfig = {
        columnId: fieldName,
        fieldType: fieldType,
        cellType: cellType,
        type: fieldType,
        hasOptions: options.length > 0,
        options: options,
        // 🚀 NEW: Pre-computed field type metadata
        fieldTypeInstance: fieldTypeInstance,
        precomputedFormatter: formatter,
        precomputedEditor: editor,
      }

      const column: Column<T> = {
        id: fieldName,
        field: fieldName as keyof T & string,
        name: formatFieldName(fieldName),
        cellType: cellType as any,
        type: fieldType,
        width,
        editable: isEditable,
        // Enhanced options with colors
        options: options,
        editor: safeFieldDef.editor || null,
        validation: safeFieldDef.validation || null,

        // 🚀 NEW: Pre-computed field type metadata for instant cell rendering
        fieldType: fieldTypeInstance,
        formatter: formatter,
        editorInstance: editor,
        fieldId: safeFieldDef.id || fieldName, // For reactive options lookup

        // PERFORMANCE: Pre-computed field config for fast cell creation
        _cachedRenderer: {
          fieldTypeConfig: fieldTypeConfig,
          resolvedAt: performance.now(),
        },
      }

      if (relationshipMetadata) {
        ;(column as any).relationshipTargetEntity = relationshipMetadata.targetEntityType
        ;(column as any).relationshipDisplayField = relationshipMetadata.displayField
        ;(column as any).relationshipSearchFields = relationshipMetadata.searchFields
        if (relationshipMetadata.targetEntityType) {
          ;(column as any).relationshipConfig = {
            targetEntityType: relationshipMetadata.targetEntityType,
            cardinality: 'many-to-one',
            displayField: relationshipMetadata.displayField,
            searchFields: relationshipMetadata.searchFields,
          }
        }
      }

      fileLog.debug('🔧 Generated column', {
        fieldName,
        fieldType,
        cellType,
        hasOptions: !!options?.length,
        optionsCount: options?.length || 0,
        hasColoredOptions: options?.some((opt: any) => opt.color),
      })

      return column
    })
    .filter((col): col is Column<T> => col !== null) // Remove any null entries from skipped fields

  // Separate business fields from system fields
  const businessFields = allColumns.filter((col) => !['created_at', 'updated_at'].includes(col.id))
  const systemFields = allColumns.filter((col) => ['created_at', 'updated_at'].includes(col.id))

  // Return business fields first, then system fields
  const orderedColumns = [...businessFields, ...systemFields]

  fileLog.debug('✅ Generated columns from schema', {
    entityType,
    totalColumns: orderedColumns.length,
    businessFields: businessFields.length,
    systemFields: systemFields.length,
  })

  return orderedColumns
}

/**
 * Unified field type mapping with enhanced logic for colored fields
 */
function mapFieldTypeToVibeGridCellType(fieldType: string, fieldName?: string): string {
  // Check for fields with options that should use select renderer
  if (
    fieldName &&
    (fieldName.toLowerCase().includes('priority') ||
      fieldName.toLowerCase().includes('status') ||
      fieldName.toLowerCase().includes('category'))
  ) {
    return 'select'
  }
  switch (fieldType.toLowerCase()) {
    // Date types
    case 'timestamp':
    case 'date':
      return 'date'
    case 'datetime':
      return 'datetime'

    // Number types
    case 'number':
    case 'float':
      return 'number'
    case 'integer':
      return 'integer'
    case 'decimal':
      return 'decimal'

    // Text types
    case 'text':
      return 'text'
    case 'longtext':
      return 'longtext'
    case 'rich-text':
    case 'rich_text':
      return 'rich-text'

    // Boolean types
    case 'boolean':
    case 'bool':
      return 'boolean'

    // Communication types
    case 'email':
      return 'email'
    case 'url':
      return 'url'
    case 'phone':
      return 'phone'

    // Rich data types
    case 'file':
      return 'file'
    case 'currency':
      return 'currency'
    case 'color':
      return 'color'

    // Selection types - UNIFIED MAPPING
    case 'single-select':
    case 'single_select':
      return 'single-select'
    case 'multi-select':
    case 'multi_select':
      return 'multi-select'
    case 'custom_option_reference': // ← KEY FIX: Map to select for badges
      return 'select'

    // Reference types (stored as relationships)
    case 'user_reference':
      return 'user_reference'
    case 'entity_reference':
      return 'entity_reference'
    case 'custom_user_reference':
      return 'custom_user_reference'
    case 'custom_entity_reference':
      return 'custom_entity_reference'

    // Rollup types
    case 'rollup_count':
      return 'rollup_count'
    case 'rollup_sum':
      return 'rollup_sum'
    case 'rollup_average':
      return 'rollup_average'
    case 'rollup_concat':
      return 'rollup_concat'

    // Computed types
    case 'computed_expression':
      return 'computed_expression'
    case 'computed_formula':
      return 'computed_formula'

    // Status and selection types
    case 'status':
    case 'status_set':
      return 'select'
    case 'select':
      return 'select'
    case 'reference-select':
    case 'reference_select':
      return 'reference-select'

    default:
      return 'text'
  }
}

// Note: Column width logic moved to centralized COLUMN_DEFAULTS

/**
 * Format field name for display
 */
function formatFieldName(fieldName: string): string {
  let formatted = fieldName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

  // Remove "Id" suffix from relationship field names for better UX
  if (formatted.endsWith(' Id')) {
    formatted = formatted.slice(0, -3)
  }

  return formatted
}

// Note: Fallback columns removed - schema must provide entity definitions

// Note: Hardcoded option loading removed - backend schema provides colored options
