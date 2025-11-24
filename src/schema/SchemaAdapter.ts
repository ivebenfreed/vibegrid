/**
 * Schema Adapter
 *
 * Bridges the gap between frontend column definitions and backend Enhanced Field Handler metadata.
 * Enhances columns with validation, display, editor, capabilities, and accessibility metadata.
 */

import type {
  EnhancedColumn,
  RelationshipConfig,
  RollupConfig,
} from '../field-types/FieldTypeRegistry'
import type { Column } from '../types'

// Backend schema interface (simplified for now, can be expanded as needed)
export interface BackendSchema {
  entities: Record<string, EntitySchema>
}

export interface EntitySchema {
  name: string
  fields: Record<string, FieldSchema>
}

export interface FieldSchema {
  name: string
  type: string
  validation?: any // ValidationMetadata from backend
  display?: any // DisplayMetadata from backend
  editor?: any // EditorMetadata from backend
  capabilities?: any // FieldCapabilities from backend
  accessibility?: any // AccessibilityMetadata from backend

  // Relationship-specific
  relationshipConfig?: RelationshipConfig
  rollupConfig?: RollupConfig
}

/**
 * Schema Adapter for enhancing columns with backend metadata
 */
export class SchemaAdapter {
  /**
   * Enhance columns with backend schema metadata
   */
  static enhanceColumns(
    columns: Column[],
    schema: BackendSchema,
    entityType?: string,
  ): EnhancedColumn[] {
    return columns.map((col) => SchemaAdapter.enhanceColumn(col, schema, entityType))
  }

  /**
   * Enhance a single column with backend metadata
   */
  static enhanceColumn(column: Column, schema: BackendSchema, entityType?: string): EnhancedColumn {
    const enhanced: EnhancedColumn = { ...column }

    // Get field schema from backend if available
    const fieldSchema = SchemaAdapter.getFieldSchema(column, schema, entityType)

    if (fieldSchema) {
      enhanced.validation = fieldSchema.validation
      enhanced.display = fieldSchema.display
      enhanced.editor = fieldSchema.editor
      enhanced.capabilities = fieldSchema.capabilities
      enhanced.accessibility = fieldSchema.accessibility

      // Add relationship configuration for relationship fields
      if (SchemaAdapter.isRelationshipField(column)) {
        enhanced.relationshipConfig =
          fieldSchema.relationshipConfig || SchemaAdapter.inferRelationshipConfig(column)
      }

      // Add rollup configuration for rollup fields
      if (SchemaAdapter.isRollupField(column)) {
        enhanced.rollupConfig = fieldSchema.rollupConfig || SchemaAdapter.inferRollupConfig(column)
      }
    } else {
      // No backend schema available, use defaults based on column type
      enhanced.validation = SchemaAdapter.getDefaultValidation(column)
      enhanced.display = SchemaAdapter.getDefaultDisplay(column)
      enhanced.editor = SchemaAdapter.getDefaultEditor(column)
      enhanced.capabilities = SchemaAdapter.getDefaultCapabilities(column)
      enhanced.accessibility = SchemaAdapter.getDefaultAccessibility(column)
    }

    return enhanced
  }

  /**
   * Get field schema from backend schema
   */
  private static getFieldSchema(
    column: Column,
    schema: BackendSchema,
    entityType?: string,
  ): FieldSchema | null {
    if (!entityType || !schema.entities[entityType]) {
      return null
    }

    const entitySchema = schema.entities[entityType]
    const fieldName = column.field || column.id
    return entitySchema.fields[fieldName] || null
  }

  /**
   * Check if column is a relationship field
   */
  static isRelationshipField(column: Column): boolean {
    const relationshipTypes = [
      'custom_user_reference',
      'custom_entity_reference',
      'user_reference',
      'entity_reference',
      'relationship-single',
      'relationship-multi',
      'reference-select',
      'reference-multi',
    ]
    const type = column.cellType || column.type || ''
    return relationshipTypes.includes(type)
  }

  /**
   * Check if column is a rollup field
   */
  static isRollupField(column: Column): boolean {
    const rollupTypes = ['rollup_count', 'rollup_sum', 'rollup_average', 'rollup_concat']
    const type = column.cellType || column.type || ''
    return rollupTypes.includes(type)
  }

  /**
   * Check if column is a computed field
   */
  static isComputedField(column: Column): boolean {
    const computedTypes = ['computed_expression', 'computed_formula']
    const type = column.cellType || column.type || ''
    return computedTypes.includes(type)
  }

  /**
   * Infer relationship configuration from column properties
   */
  private static inferRelationshipConfig(column: Column): RelationshipConfig | undefined {
    const type = column.cellType || column.type || ''

    if (type.includes('user')) {
      return {
        targetEntityType: 'User',
        cardinality: 'many-to-one',
        displayField: 'name',
        searchFields: ['name', 'email'],
        relationshipType: column.relationshipType || 'assigned_to',
      }
    }

    if (type.includes('entity') && column.relationshipTable) {
      return {
        targetEntityType: column.relationshipTable,
        cardinality: 'many-to-one',
        displayField: column.relationshipDisplayField || 'name',
        searchFields: [column.relationshipDisplayField || 'name', 'title'],
        relationshipType: column.relationshipType || 'belongs_to',
      }
    }

    return undefined
  }

  /**
   * Infer rollup configuration from column properties
   */
  private static inferRollupConfig(column: Column): RollupConfig | undefined {
    const type = column.cellType || column.type || ''

    if (type.startsWith('rollup_')) {
      const calculationType = type.replace('rollup_', '') as 'count' | 'sum' | 'average' | 'concat'

      return {
        calculationType,
        sourceRelationship: column.rollupRelationship || 'belongs_to',
        sourceEntityType: column.rollupSourceEntity || 'unknown',
        sourceField: column.rollupSourceField,
        conditions: column.rollupConditions,
        realTimeUpdates: true,
        precision: calculationType === 'average' || calculationType === 'sum' ? 2 : undefined,
        separator: calculationType === 'concat' ? ', ' : undefined,
      }
    }

    return undefined
  }

  /**
   * Get default validation metadata for column type
   */
  private static getDefaultValidation(column: Column): any {
    const type = column.cellType || column.type || 'text'

    const defaultValidation: any = {
      required: column.required || false,
      messages: {
        required: `${column.name} is required`,
      },
    }

    // Type-specific validation
    switch (type as string) {
      case 'email':
        defaultValidation.emailFormat = true
        defaultValidation.pattern = '^[^@]+@[^@]+\\.[^@]+$'
        defaultValidation.messages.pattern = 'Please enter a valid email address'
        break

      case 'url':
        defaultValidation.urlProtocols = ['http:', 'https:']
        defaultValidation.pattern = '^https?://'
        defaultValidation.messages.pattern = 'Please enter a valid URL'
        break

      case 'phone':
        defaultValidation.phoneFormat = 'international'
        break

      case 'number':
      case 'integer':
      case 'decimal':
        if (column.min !== undefined) defaultValidation.min = column.min
        if (column.max !== undefined) defaultValidation.max = column.max
        break
    }

    return defaultValidation
  }

  /**
   * Get default display metadata for column type
   */
  private static getDefaultDisplay(column: Column): any {
    const type = column.cellType || column.type || 'text'

    const defaultDisplay: any = {
      width: column.width || 200,
      minWidth: column.minWidth || 80,
      maxWidth: column.maxWidth,
      sortable: true,
      filterable: true,
      resizable: true,
      textAlign: 'left',
    }

    // Type-specific display
    switch (type as string) {
      case 'number':
      case 'integer':
      case 'decimal':
      case 'currency':
      case 'percentage':
        defaultDisplay.textAlign = 'right'
        defaultDisplay.width = 120
        break

      case 'boolean':
        defaultDisplay.textAlign = 'center'
        defaultDisplay.width = 80
        break

      case 'date':
      case 'datetime':
        defaultDisplay.width = 140
        break

      case 'color':
        defaultDisplay.showColorPreview = true
        defaultDisplay.width = 100
        break

      case 'file':
      case 'image':
        defaultDisplay.showFilePreview = true
        defaultDisplay.width = 150
        break
    }

    return defaultDisplay
  }

  /**
   * Get default editor metadata for column type
   */
  private static getDefaultEditor(column: Column): any {
    const type = column.cellType || column.type || 'text'

    const defaultEditor: any = {
      type: SchemaAdapter.mapTypeToEditor(type),
      validateWhileTyping: false,
      showValidationOnBlur: true,
    }

    // Type-specific editor settings
    switch (type as string) {
      case 'longtext':
      case 'textarea':
        defaultEditor.multiline = true
        defaultEditor.rows = 3
        break

      case 'email':
        defaultEditor.type = 'email'
        break

      case 'url':
        defaultEditor.type = 'url'
        break

      case 'phone':
        defaultEditor.type = 'tel'
        break

      case 'number':
      case 'integer':
      case 'decimal':
        defaultEditor.showSpinners = true
        if ((type as string) === 'integer') {
          defaultEditor.step = 1
        } else if ((type as string) === 'decimal') {
          defaultEditor.step = 0.01
        }
        break

      case 'date':
        defaultEditor.dateFormat = 'YYYY-MM-DD'
        break

      case 'datetime':
        defaultEditor.dateFormat = 'YYYY-MM-DD'
        defaultEditor.timeFormat = 'HH:mm'
        defaultEditor.showTime = true
        break
    }

    return defaultEditor
  }

  /**
   * Get default capabilities for column type
   */
  private static getDefaultCapabilities(column: Column): any {
    const type = column.cellType || column.type || 'text'

    return {
      supportsSorting: true,
      supportsFiltering: true,
      supportsGrouping:
        !SchemaAdapter.isRollupField(column) && !SchemaAdapter.isComputedField(column),
      supportsAggregation: ['number', 'integer', 'decimal', 'currency'].includes(type),
      requiresSpecialEditor: SchemaAdapter.isRelationshipField(column),
      hasRichDisplay: ['color', 'file', 'image', 'currency'].includes(type),
      supportsValidation: true,
      supportsFormatting: true,
      isCalculatedField:
        SchemaAdapter.isRollupField(column) || SchemaAdapter.isComputedField(column),
      isReadOnly: SchemaAdapter.isRollupField(column) || SchemaAdapter.isComputedField(column),
    }
  }

  /**
   * Get default accessibility metadata
   */
  private static getDefaultAccessibility(column: Column): any {
    const type = column.cellType || column.type || 'text'

    const defaultAccessibility: any = {
      ariaLabel: `${column.name} ${type} field`,
      tabIndex: 0,
      role: 'gridcell',
    }

    // Type-specific accessibility
    if (SchemaAdapter.isRollupField(column) || SchemaAdapter.isComputedField(column)) {
      defaultAccessibility.ariaDescription =
        'This field is automatically calculated and cannot be edited'
      defaultAccessibility.ariaLive = 'polite' // Announce changes
    }

    return defaultAccessibility
  }

  /**
   * Map field type to editor type
   */
  private static mapTypeToEditor(type: string): string {
    switch (type) {
      case 'number':
      case 'integer':
      case 'decimal':
      case 'currency':
      case 'percentage':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'date':
      case 'datetime':
        return 'date'
      case 'select':
      case 'single-select':
      case 'enum':
        return 'select'
      case 'multi-select':
        return 'multi-select'
      case 'longtext':
      case 'textarea':
      case 'markdown':
        return 'textarea'
      case 'email':
        return 'email'
      case 'url':
        return 'url'
      case 'phone':
        return 'phone'
      case 'color':
        return 'color'
      case 'file':
      case 'image':
        return 'file'
      case 'custom_user_reference':
      case 'custom_entity_reference':
      case 'user_reference':
      case 'entity_reference':
        return 'relationship-select'
      case 'rollup_count':
      case 'rollup_sum':
      case 'rollup_average':
      case 'rollup_concat':
      case 'computed_expression':
      case 'computed_formula':
        return 'computed'
      default:
        return 'text'
    }
  }

  /**
   * Create a mock backend schema for testing
   */
  static createMockSchema(entityType: string, columns: Column[]): BackendSchema {
    const entitySchema: EntitySchema = {
      name: entityType,
      fields: {},
    }

    columns.forEach((column) => {
      const fieldName = column.field || column.id
      entitySchema.fields[fieldName] = {
        name: fieldName,
        type: column.cellType || column.type || 'text',
        validation: SchemaAdapter.getDefaultValidation(column),
        display: SchemaAdapter.getDefaultDisplay(column),
        editor: SchemaAdapter.getDefaultEditor(column),
        capabilities: SchemaAdapter.getDefaultCapabilities(column),
        accessibility: SchemaAdapter.getDefaultAccessibility(column),
      }
    })

    return {
      entities: {
        [entityType]: entitySchema,
      },
    }
  }
}
