/**
 * Unified Column Generation for VibeGrid
 *
 * Generates VibeGrid columns from entity schema using the same field type processing
 * as cell renderers for consistent behavior.
 */

import { getLogger } from '@/shared/lib/logging'
import { COLUMN_DEFAULTS } from '../column-defaults'
import type { CellType } from '../column-types'
import type { Column } from '../types'
import type { SchemaRegistryStore } from '@/app/stores/domain/SchemaRegistryStore'

const fileLog = getLogger(['custom', 'vibegrid', 'stores', 'column-generation'])

/**
 * Fallback function that returns basic columns when schema is not available
 */
function getBasicColumns<T = any>(): Column<T>[] {
  fileLog.warn('Using fallback basic columns - schema not available')
  return []
}

/**
 * Enrich columns with pre-computed field types and formatters.
 *
 * Since D2 (SlotRegistry migration), cell rendering is handled by SlotRegistry
 * at render time. This function is now a pass-through kept for call-site compatibility.
 */
export function enrichColumnsWithFieldTypes<T = any>(columns: Column<T>[]): Column<T>[] {
  return columns
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
    type?: string
    options?: Array<{
      value: string
      label: string
      color?: string
      backgroundColor?: string
      icon?: string
      description?: string
    }>
    [key: string]: any // Allow additional editor properties
  }
  validation?: {
    enum?: string[]
    required?: boolean
    [key: string]: any // Allow additional validation properties
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

  // Enhanced field metadata from backend (from EnhancedFieldHandler)
  display?: {
    width?: number
    minWidth?: number
    maxWidth?: number
    label?: string
    sortable?: boolean
    filterable?: boolean
    resizable?: boolean
    format?: string
    prefix?: string
    suffix?: string
    placeholder?: string
    textAlign?: 'left' | 'center' | 'right'
    fontWeight?: 'normal' | 'bold'
    precision?: number
    showColorPreview?: boolean
    showFilePreview?: boolean
    truncateAt?: number
    showTooltip?: boolean
    tooltipContent?: string
    showCalculationIndicator?: boolean
    isReadOnly?: boolean
    [key: string]: any
  }
  capabilities?: {
    supportsSorting?: boolean
    supportsFiltering?: boolean
    supportsGrouping?: boolean
    supportsAggregation?: boolean
    requiresSpecialEditor?: boolean
    hasRichDisplay?: boolean
    supportsValidation?: boolean
    supportsFormatting?: boolean
    isCalculatedField?: boolean
    isRollupField?: boolean
    isRelationshipField?: boolean
    isStatus?: boolean
    hasWorkflowLogic?: boolean
    supportsTransitions?: boolean
    requiresStatusSet?: boolean
    isOptionReference?: boolean
    requiresCustomOptions?: boolean
  }
  accessibility?: {
    ariaLabel?: string
    ariaDescription?: string
    ariaRequired?: boolean
    ariaInvalid?: boolean
    ariaValueMin?: number
    ariaValueMax?: number
    ariaValueNow?: number
    ariaValueText?: string
    ariaLive?: 'polite' | 'assertive' | 'off'
    ariaOrientation?: 'horizontal' | 'vertical'
    ariaMultiline?: boolean
    ariaHasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
    tabIndex?: number
    role?: string
  }
  statusSet?: any // Status set metadata for status fields
  collaborativeMetadata?: any // Collaborative editing metadata
}

/**
 * Generate VibeGrid columns from entity schema using SchemaRegistryStore
 */
export async function generateColumnsFromEntitySchema<T = any>(
  entityType: string,
  schemaRegistry: SchemaRegistryStore,
): Promise<Column<T>[]> {
  fileLog.debug('🎯 Generating columns from entity schema', { entityType })

  // Special case: Platform users (admin-only, not DataForge entities)
  if (entityType === 'PlatformUser') {
    fileLog.debug('🔑 Using platform user schema (system entity)', { entityType })
    const { platformUserColumns } = await import('@/features/admin/schemas/platform-user-schema')
    // Shallow-copy columns so we don't mutate the module-level constant
    const columns = platformUserColumns.map((c) => ({ ...c }))

    // Inject dynamic organization options for multi-select column
    try {
      const response = await fetch('/api/admin/organizations', { credentials: 'include' })
      if (response.ok) {
        const data = (await response.json()) as {
          organizations?: Array<{ id: string; name: string }>
        }
        const orgCol = columns.find((c) => c.id === 'organizations')
        if (orgCol && data.organizations) {
          orgCol.options = data.organizations.map((o) => ({ value: o.id, label: o.name }))
        }
      }
    } catch {
      fileLog.warn('Failed to fetch organizations for column options')
    }

    // Pass through enrichColumnsWithFieldTypes for compatibility
    return enrichColumnsWithFieldTypes(columns) as any
  }

  // Special case: Platform organizations (admin-only, not DataForge entities)
  if (entityType === 'PlatformOrganization') {
    fileLog.debug('🏢 Using platform organization schema (system entity)', { entityType })
    const { platformOrganizationColumns } = await import(
      '@/features/admin/schemas/platform-organization-schema'
    )
    // Pass through enrichColumnsWithFieldTypes for compatibility
    return enrichColumnsWithFieldTypes(platformOrganizationColumns) as any
  }

  // Special case: Email threads (Communications worker, not DataForge entities)
  if (entityType === 'EmailThread') {
    fileLog.debug('📧 Using email thread schema (communications entity)', { entityType })
    const { emailThreadColumns } = await import(
      '@/features/email-inbox/schemas/email-thread-schema'
    )
    // Pass through enrichColumnsWithFieldTypes for compatibility
    return enrichColumnsWithFieldTypes(emailThreadColumns) as any
  }

  // Special case: Command Center items (aggregated from multiple sources, not DataForge entities)
  if (entityType === 'CommandCenterItem') {
    fileLog.debug('📋 Using command center item schema (aggregated entity)', { entityType })
    const { commandCenterItemColumns } = await import(
      '@/features/command-center/schemas/command-center-item-schema'
    )
    // Pass through enrichColumnsWithFieldTypes for compatibility
    return enrichColumnsWithFieldTypes(commandCenterItemColumns) as any
  }

  // TODO: GH#292 - RFI Module schema not yet implemented
  // Special case: RFI Module items (cross-project RFI workspace, not DataForge entities)
  // if (entityType === 'RfiModuleItem') {
  //   fileLog.debug('📋 Using RFI module item schema (cross-project RFI workspace)', { entityType })
  //   const { rfiModuleItemColumns } = await import(
  //     '@/features/rfi-module/schemas/rfi-module-item-schema'
  //   )
  //   // Pass through enrichColumnsWithFieldTypes for compatibility
  //   return enrichColumnsWithFieldTypes(rfiModuleItemColumns) as any
  // }

  // Special case: BidPackage (custom schema with vendor/code counts from relationships)
  if (entityType === 'BidPackage') {
    fileLog.debug('📦 Using bid package schema (GC entity with relationship counts)', {
      entityType,
    })
    const { bidPackageColumns } = await import('@/features/bid-mail/schemas/bid-package-schema')
    // Pass through enrichColumnsWithFieldTypes for compatibility
    return enrichColumnsWithFieldTypes(bidPackageColumns) as any
  }

  // Special case: GlobalBidPackage (global bids view with project name column)
  if (entityType === 'GlobalBidPackage') {
    fileLog.debug('🌐 Using global bid package schema (cross-project view)', {
      entityType,
    })
    const { globalBidPackageColumns } = await import(
      '@/features/bid-mail/schemas/global-bid-package-schema'
    )
    // Pass through enrichColumnsWithFieldTypes for compatibility
    return enrichColumnsWithFieldTypes(globalBidPackageColumns) as any
  }

  // Wait for schema registry to be ready (with timeout)
  // WebSocket bootstrap can take 12+ seconds, so allow 30 seconds
  const maxWaitMs = 30000 // 30 seconds
  const pollIntervalMs = 100
  let waited = 0

  while (schemaRegistry.isBootstrapping || !schemaRegistry.schemas) {
    if (waited >= maxWaitMs) {
      fileLog.error('❌ Schema registry timeout', { entityType, waited })
      throw new Error(`Schema registry timeout waiting for entity: ${entityType}`)
    }
    fileLog.debug('⏳ Waiting for schema registry...', { entityType, waited })
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    waited += pollIntervalMs
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

  // GH#1699: Read only from unified 'fields' key
  let schemaFields = entitySchema.fields || []

  // Handle object format (convert to array if needed)
  if (schemaFields && typeof schemaFields === 'object' && !Array.isArray(schemaFields)) {
    schemaFields = Object.values(schemaFields)
  }

  fileLog.debug('[SCHEMA-DEBUG] Entity schema fields found', {
    entityType,
    hasFields: !!entitySchema.fields,
    fieldsLength: entitySchema.fields?.length,
    schemaFieldsLength: schemaFields?.length,
    allSchemaKeys: Object.keys(entitySchema || {}),
  })

  if (!Array.isArray(schemaFields) || schemaFields.length === 0) {
    fileLog.warn('No fields found in entity schema', {
      entityType,
      schemaFields,
      schemaFieldsType: typeof schemaFields,
      schemaFieldsIsArray: Array.isArray(schemaFields),
      schemaFieldsLength: schemaFields?.length,
      entitySchemaKeys: Object.keys(entitySchema || {}),
    })
    return getBasicColumns<T>()
  }

  // Deduplicate fields by fieldName — migration 20260305000000 introduced duplicate
  // entries in business_metadata.fields by appending customFields onto allFields
  // (which already contained customFields). Keep first occurrence of each field.
  const seenFieldNames = new Set<string>()
  const dedupedFields = schemaFields.filter((fieldDef: any) => {
    const name = fieldDef?.fieldName || fieldDef?.name
    if (!name || seenFieldNames.has(name)) return false
    seenFieldNames.add(name)
    return true
  })

  if (dedupedFields.length < schemaFields.length) {
    fileLog.warn('⚠️ Deduplicated schema fields', {
      entityType,
      before: schemaFields.length,
      after: dedupedFields.length,
      duplicatesRemoved: schemaFields.length - dedupedFields.length,
    })
  }

  // Generate columns from schema fields - Synchronous approach with lazy color loading
  const allColumns = dedupedFields
    .map((fieldDef: any) => {
      // FieldDefinition uses "fieldName" property (from @/types/dataforge)
      const fieldName = fieldDef?.fieldName || fieldDef?.name
      if (!fieldName) {
        fileLog.warn('⚠️ Field missing fieldName/name property, skipping', { fieldDef })
        return null
      }

      // Skip server-only fields — never meant to be user-visible
      if ((fieldDef as any)?.serverOnly === true) {
        fileLog.debug('⏭️ Skipping serverOnly field', { fieldName })
        return null
      }

      // Skip system fields — DB infrastructure, not user-facing entity data
      // Manifests use `system: true`, legacy schemas may use `isSystem: true`
      if ((fieldDef as any)?.isSystem === true || (fieldDef as any)?.system === true) {
        fileLog.debug('⏭️ Skipping system field', { fieldName })
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

      if (fieldType === 'relationship_link') {
        // relationship_link fields carry metadata from the backend injection
        const linkedEntity = (safeFieldDef as any).linkedEntity
        const relationshipEntity = (safeFieldDef as any).relationshipEntity
        const direction = (safeFieldDef as any).direction as 'source' | 'target' | undefined

        relationshipMetadata = {
          targetEntityType: linkedEntity || relationshipEntity || null,
          displayField: 'name',
          searchFields: ['name', 'title'],
        }

        fileLog.debug('[COLUMN-GEN] Relationship link field detected', {
          entityType,
          fieldName,
          relationshipEntity,
          linkedEntity,
          direction,
        })
      } else if (cellType.includes('entity_reference')) {
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

      // Get width from field override OR centralized defaults
      const defaults = COLUMN_DEFAULTS[cellType as CellType] || COLUMN_DEFAULTS.text
      const width = (safeFieldDef as any).display?.width ?? defaults.width

      // Determine if field should be editable
      const isEditable =
        !['id', 'created_at', 'updated_at'].includes(fieldName) && safeFieldDef.syncable !== false

      // Use options from schema (backend already provides colored options)
      const options = safeFieldDef.editor?.options || []

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
        // Enhanced field metadata from backend schema enhancement
        display: safeFieldDef.display || undefined,
        capabilities: safeFieldDef.capabilities || undefined,
        accessibility: safeFieldDef.accessibility || undefined,
        statusSet: safeFieldDef.statusSet || undefined,

        fieldId: safeFieldDef.id || fieldName, // For reactive options lookup
      }

      if (relationshipMetadata) {
        ;(column as any).relationshipTargetEntity = relationshipMetadata.targetEntityType
        ;(column as any).relationshipDisplayField = relationshipMetadata.displayField
        ;(column as any).relationshipSearchFields = relationshipMetadata.searchFields
        if (relationshipMetadata.targetEntityType) {
          if (fieldType === 'relationship_link') {
            // Relationship link fields: configure for relationship archetype data loading
            const relCardinality = (safeFieldDef as any).cardinality || 'many'
            ;(column as any).relationshipConfig = {
              targetEntityType: relationshipMetadata.targetEntityType,
              cardinality: relCardinality === 'one' ? 'many-to-one' : 'many-to-many',
              displayField: relationshipMetadata.displayField,
              searchFields: relationshipMetadata.searchFields,
              relationshipEntity: (safeFieldDef as any).relationshipEntity,
              direction: (safeFieldDef as any).direction,
            }
          } else {
            ;(column as any).relationshipConfig = {
              targetEntityType: relationshipMetadata.targetEntityType,
              cardinality: 'many-to-one',
              displayField: relationshipMetadata.displayField,
              searchFields: relationshipMetadata.searchFields,
            }
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

  fileLog.debug('✅ Generated columns from schema', {
    entityType,
    totalColumns: allColumns.length,
  })

  return allColumns
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
    case 'datetime-local':
    case 'timestamptz':
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
    case 'textarea':
      return 'longtext'
    case 'rich-text':
      return 'rich-text'
    case 'markdown':
      return 'markdown'

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
    case 'image':
      return 'image'
    case 'currency':
      return 'currency'
    case 'color':
      return 'color'
    case 'rating':
      return 'rating'
    case 'slider':
      return 'slider'

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

    // Relationship link fields (auto-injected) → reuse entity reference renderer
    case 'relationship_link':
      return 'entity_reference'

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
    case 'computed_decision_table':
      return 'computed_decision_table'

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
