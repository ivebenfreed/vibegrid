/**
 * VibeGrid Field Type Definitions
 *
 * Type definitions preserved from the legacy FieldTypeRegistry.
 * These types are used by AffordanceResolver, SchemaAdapter, and other consumers.
 */

import type { FieldTypeAffordance } from '../affordances/types'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'

// Re-export backend metadata types
export type {
  AccessibilityMetadata,
  DisplayMetadata,
  EditorMetadata,
  FieldCapabilities,
  ValidationMetadata,
} from '@/shared/types/field-metadata'

export interface FieldMetadata {
  supportsSorting: boolean
  supportsFiltering: boolean
  supportsGrouping?: boolean
  supportsAggregation?: boolean
  requiresSpecialEditor?: boolean
  hasRichDisplay: boolean
  supportsValidation?: boolean
  supportsFormatting?: boolean
  isCalculatedField?: boolean
  isReadOnly?: boolean
  requiresAsyncData?: boolean
}

export interface RelationshipConfig {
  targetEntityType: string
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many'
  displayField: string
  searchFields: string[]
  relationshipTable?: string
  relationshipType?: string
}

export interface RollupConfig {
  calculationType: 'count' | 'sum' | 'average' | 'concat'
  sourceRelationship: string
  sourceEntityType: string
  sourceField?: string
  conditions?: Record<string, any>
  realTimeUpdates: boolean
  precision?: number
  separator?: string
}

export interface RelationshipData {
  [tableName: string]: {
    [id: string]: {
      id: string
      name?: string
      title?: string
      displayName?: string
      email?: string
      [key: string]: any
    }
  }
}

export interface RelationshipOption {
  value: string
  label: string
  metadata?: Record<string, any>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  transformedValue?: any
}

export interface FormattingContext {
  locale?: string
  timezone?: string
  currency?: string
  [key: string]: any
}

/**
 * Field Interaction Policy
 *
 * Defines how a field type responds to user interactions.
 */
export interface FieldInteractionPolicy {
  defaultAction: 'navigate' | 'edit' | 'custom' | 'none'
  editTrigger: 'content-click' | 'click' | 'f2' | 'icon' | 'none'
  blurPolicy: 'commit' | 'cancel' | 'keep-open'
}

export interface CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement
  update(element: HTMLElement, value: any, column: EnhancedColumn): void
  canHandle(column: EnhancedColumn): boolean
  supportsAsyncData?(): boolean
  loadAsyncData?(value: any, column: EnhancedColumn): Promise<any>
}

export interface CellEditor {
  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement
  getValue(element: HTMLElement): any
  setValue(element: HTMLElement, value: any): void
  validate(value: any, column: EnhancedColumn): ValidationResult
  destroy(element: HTMLElement): void
  supportsInlineEditing?(): boolean
  supportsModalEditing?(): boolean
  requiresAsyncOptions?(): boolean
}

export interface CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string
  parse(text: string, column: EnhancedColumn): any
  formatForDisplay?(value: any, column: EnhancedColumn, relationshipData?: any): string
  formatForExport?(value: any, column: EnhancedColumn): string
}

export interface CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult
  getConstraints(column: EnhancedColumn): Record<string, any>
}

export interface AsyncDataLoader {
  loadRelationshipData(column: EnhancedColumn, rowIds: string[], tableCore$: TableCoreStore): Promise<RelationshipData>

  resolveDisplayValue(value: any, column: EnhancedColumn, relationshipData: RelationshipData): string

  getSearchSuggestions(query: string, column: EnhancedColumn, limit?: number): Promise<RelationshipOption[]>

  getCacheKey(column: EnhancedColumn, value: any): string
  invalidateCache(column: EnhancedColumn): void
}

export interface RollupCalculator {
  calculate(rollupConfig: RollupConfig, sourceData: any[], currentRowId: string): any
  getSourceData(rollupConfig: RollupConfig, currentRowId: string, tableCore$: TableCoreStore): any[]
  shouldRecalculate(changeEvent: any): boolean
  getDependencies(): string[]
}

// Enhanced column interface with backend metadata
export interface EnhancedColumn extends Column {
  validation?: any
  display?: any
  editor?: any
  capabilities?: any
  accessibility?: any
  relationshipConfig?: RelationshipConfig
  rollupConfig?: RollupConfig
  targetEntityType?: string
  asyncDataState?: {
    isLoading: boolean
    lastLoaded?: Date
    error?: string
  }
}

// Main field type definition
export interface VibeGridFieldType {
  type: string
  category: 'basic' | 'relationship' | 'rollup' | 'computed'
  renderer: CellRenderer
  editor: CellEditor
  formatter: CellFormatter
  validator?: CellValidator
  metadata: FieldMetadata
  getFormatter?(): (value: any, rowData?: any, column?: any) => string
  getEditor?(): any
  getStyles?(value: any, column: any): Record<string, string>
  interactionPolicy?: FieldInteractionPolicy
  handleClick?(context: any): void
  affordance?: FieldTypeAffordance
  relationshipConfig?: RelationshipConfig
  rollupConfig?: RollupConfig
  asyncDataLoader?: AsyncDataLoader
  rollupCalculator?: RollupCalculator
}

// Utility functions
export function isRelationshipField(column: EnhancedColumn): boolean {
  const relationshipTypes = ['badge-list-live']
  const type = column.cellType || column.type || ''
  return relationshipTypes.includes(type)
}

export function isRollupField(column: EnhancedColumn): boolean {
  const rollupTypes = ['rollup_count', 'rollup_sum', 'rollup_average', 'rollup_concat']
  const type = column.cellType || column.type || ''
  return rollupTypes.includes(type)
}

export function isComputedField(column: EnhancedColumn): boolean {
  const computedTypes = ['computed_expression', 'computed_formula', 'computed_decision_table']
  const type = column.cellType || column.type || ''
  return computedTypes.includes(type)
}

export function requiresAsyncData(column: EnhancedColumn): boolean {
  return isRelationshipField(column)
}

export function isReadOnlyField(column: EnhancedColumn): boolean {
  return isRollupField(column) || isComputedField(column)
}
