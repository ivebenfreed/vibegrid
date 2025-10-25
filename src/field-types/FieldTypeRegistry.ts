/**
 * Unified Field Type Registry
 *
 * Central registry for all VibeGrid field types including basic, relationship, rollup, and computed fields.
 * Bridges the gap between frontend rendering and backend Enhanced Field Handler metadata.
 */

import type { Column } from '../types';
import type { TableCoreStore } from '../stores/TableCoreStore';
import { createLogger } from '@/lib/logging';

const fieldLog = createLogger('components/custom/vibegrid/field-types/FieldTypeRegistry.ts');

// Re-export backend metadata types
export type {
  ValidationMetadata,
  DisplayMetadata,
  EditorMetadata,
  FieldCapabilities,
  AccessibilityMetadata
} from '@/server/dataforge/fields/types';

export interface FieldMetadata {
  supportsSorting: boolean;
  supportsFiltering: boolean;
  supportsGrouping: boolean;
  supportsAggregation?: boolean;
  requiresSpecialEditor: boolean;
  hasRichDisplay: boolean;
  supportsValidation?: boolean;
  supportsFormatting?: boolean;

  // Advanced capabilities
  isCalculatedField?: boolean;
  isReadOnly?: boolean;
  requiresAsyncData?: boolean;
}

export interface RelationshipConfig {
  targetEntityType: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  displayField: string;
  searchFields: string[];
  relationshipTable?: string;
  relationshipType?: string;
}

export interface RollupConfig {
  calculationType: 'count' | 'sum' | 'average' | 'concat';
  sourceRelationship: string;
  sourceEntityType: string;
  sourceField?: string;
  conditions?: Record<string, any>;
  realTimeUpdates: boolean;
  precision?: number;
  separator?: string; // for concat type
}

export interface RelationshipData {
  [tableName: string]: {
    [id: string]: {
      id: string;
      name?: string;
      title?: string;
      displayName?: string;
      email?: string;
      [key: string]: any;
    };
  };
}

export interface RelationshipOption {
  value: string;
  label: string;
  metadata?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  transformedValue?: any;
}

export interface FormattingContext {
  locale?: string;
  timezone?: string;
  currency?: string;
  [key: string]: any;
}

// Base interfaces
export interface CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement;
  update(element: HTMLElement, value: any, column: EnhancedColumn): void;
  canHandle(column: EnhancedColumn): boolean;

  // Optional async loading support
  supportsAsyncData?(): boolean;
  loadAsyncData?(value: any, column: EnhancedColumn): Promise<any>;
}

export interface CellEditor {
  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement;
  getValue(element: HTMLElement): any;
  setValue(element: HTMLElement, value: any): void;
  validate(value: any, column: EnhancedColumn): ValidationResult;
  destroy(element: HTMLElement): void;

  // Special editor capabilities
  supportsInlineEditing?(): boolean;
  supportsModalEditing?(): boolean;
  requiresAsyncOptions?(): boolean;
}

export interface CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string;
  parse(text: string, column: EnhancedColumn): any;

  // For relationship and complex fields
  formatForDisplay?(value: any, column: EnhancedColumn, relationshipData?: any): string;
  formatForExport?(value: any, column: EnhancedColumn): string;
}

export interface CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult;
  getConstraints(column: EnhancedColumn): Record<string, any>;
}

export interface AsyncDataLoader {
  loadRelationshipData(
    column: EnhancedColumn,
    rowIds: string[],
    tableCore$: TableCoreStore
  ): Promise<RelationshipData>;

  resolveDisplayValue(
    value: any,
    column: EnhancedColumn,
    relationshipData: RelationshipData
  ): string;

  getSearchSuggestions(
    query: string,
    column: EnhancedColumn,
    limit?: number
  ): Promise<RelationshipOption[]>;

  // Caching support
  getCacheKey(column: EnhancedColumn, value: any): string;
  invalidateCache(column: EnhancedColumn): void;
}

export interface RollupCalculator {
  calculate(
    rollupConfig: RollupConfig,
    sourceData: any[],
    currentRowId: string
  ): any;

  getSourceData(
    rollupConfig: RollupConfig,
    currentRowId: string,
    tableCore$: TableCoreStore
  ): any[];

  // Real-time update support
  shouldRecalculate(changeEvent: any): boolean;
  getDependencies(): string[]; // Field names this rollup depends on
}

// Enhanced column interface with backend metadata
export interface EnhancedColumn extends Column {
  // Backend Enhanced Field Handler metadata
  validation?: any; // ValidationMetadata from backend
  display?: any;    // DisplayMetadata from backend
  editor?: any;     // EditorMetadata from backend
  capabilities?: any; // FieldCapabilities from backend
  accessibility?: any; // AccessibilityMetadata from backend

  // Relationship-specific metadata
  relationshipConfig?: RelationshipConfig;
  rollupConfig?: RollupConfig;

  // Runtime data loading state
  asyncDataState?: {
    isLoading: boolean;
    lastLoaded?: Date;
    error?: string;
  };
}

// Main field type definition
export interface VibeGridFieldType {
  type: string;
  category: 'basic' | 'relationship' | 'rollup' | 'computed';
  renderer: CellRenderer;
  editor: CellEditor;
  formatter: CellFormatter;
  validator?: CellValidator;
  metadata: FieldMetadata;

  // 🚀 NEW: Simple formatter interface for pre-computation
  getFormatter(): (value: any, rowData?: any, column?: any) => string;

  // 🚀 NEW: Optional editor interface
  getEditor?(): any;

  // 🚀 NEW: Optional styling
  getStyles?(value: any, column: any): Record<string, string>;

  // Relationship-specific properties
  relationshipConfig?: RelationshipConfig;
  rollupConfig?: RollupConfig;
  asyncDataLoader?: AsyncDataLoader;
  rollupCalculator?: RollupCalculator;
}

/**
 * Central registry for all field types
 */
export class FieldTypeRegistry {
  private types = new Map<string, VibeGridFieldType>();

  /**
   * Register a field type
   */
  register(type: string, definition: VibeGridFieldType): void {
    this.types.set(type, definition);
    fieldLog.info('🔌 [FIELD-REGISTRY] Field type registered', {
      type,
      category: definition.category,
      totalRegistered: this.types.size
    });
  }

  /**
   * Get field type definition for a column
   */
  getFieldType(column: EnhancedColumn): VibeGridFieldType {
    const type = this.resolveFieldType(column);

    // Debug for priority field resolution
    if (column.id === 'priority' || column.field === 'priority') {
      fieldLog.debug('🔎 [FIELD-REGISTRY] Getting field type for priority', {
        resolvedType: type,
        registeredTypes: Array.from(this.types.keys()),
        isSelectRegistered: this.types.has('select'),
        willUseSelect: this.types.has(type)
      });
    }

    const fieldType = this.types.get(type);

    if (!fieldType) {
      fieldLog.error('❌ [FIELD-REGISTRY] Unknown field type - FAIL FAST', {
        unknownType: type,
        columnId: column.id,
        availableTypes: Array.from(this.types.keys())
      });
      throw new Error(`Unknown field type '${type}' for column '${column.id}'. Available types: ${Array.from(this.types.keys()).join(', ')}`);
    }

    fieldLog.debug('✅ [FIELD-REGISTRY] Field type resolved', {
      type,
      category: fieldType.category,
      columnId: column.id
    });

    return fieldType;
  }

  /**
   * Resolve the field type from column definition
   */
  private resolveFieldType(column: EnhancedColumn): string {
    // Priority: cellType > type > 'text'
    const resolvedType = column.cellType || column.type || 'text';

    // Debug logging for priority field
    if (column.id === 'priority' || column.field === 'priority') {
      fieldLog.debug('🔍 [FIELD-REGISTRY] Resolving priority field type', {
        columnId: column.id,
        field: column.field,
        cellType: column.cellType,
        type: column.type,
        resolvedType,
        hasOptions: !!(column.options && column.options.length > 0),
        optionsCount: column.options?.length || 0
      });
    }

    return resolvedType;
  }

  /**
   * Get all registered field types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.types.keys());
  }

  /**
   * Get field types by category
   */
  getTypesByCategory(category: VibeGridFieldType['category']): string[] {
    return Array.from(this.types.entries())
      .filter(([_, definition]) => definition.category === category)
      .map(([type, _]) => type);
  }

  /**
   * Check if a field type is registered
   */
  hasFieldType(type: string): boolean {
    return this.types.has(type);
  }

  /**
   * Clear all registered types (for testing)
   */
  clear(): void {
    this.types.clear();
  }

  /**
   * Create default registry with all standard field types
   * Note: Actual field type implementations will be registered in separate files
   */
  static createDefault(): FieldTypeRegistry {
    const registry = new FieldTypeRegistry();

    // Field types will be registered by their respective implementation files
    // This method exists to create the registry instance
    // Actual registration happens in the implementation files

    return registry;
  }
}

// Global registry instance
export const fieldTypeRegistry = FieldTypeRegistry.createDefault();

// Utility functions
export function isRelationshipField(column: EnhancedColumn): boolean {
  const relationshipTypes = [
    'custom_user_reference', 'custom_entity_reference',
    'user_reference', 'entity_reference',
    'relationship-single', 'relationship-multi',
    'reference-select', 'reference-multi'
  ];
  const type = column.cellType || column.type || '';
  return relationshipTypes.includes(type);
}

export function isRollupField(column: EnhancedColumn): boolean {
  const rollupTypes = ['rollup_count', 'rollup_sum', 'rollup_average', 'rollup_concat'];
  const type = column.cellType || column.type || '';
  return rollupTypes.includes(type);
}

export function isComputedField(column: EnhancedColumn): boolean {
  const computedTypes = ['computed_expression', 'computed_formula'];
  const type = column.cellType || column.type || '';
  return computedTypes.includes(type);
}

export function requiresAsyncData(column: EnhancedColumn): boolean {
  return isRelationshipField(column);
}

export function isReadOnlyField(column: EnhancedColumn): boolean {
  return isRollupField(column) || isComputedField(column);
}