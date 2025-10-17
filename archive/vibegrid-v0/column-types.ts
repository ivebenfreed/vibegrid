/**
 * Type-safe column definitions with compile-time field type validation
 */

// Map entity field types to allowed cell types
type FieldTypeToCellType<T> = 
  T extends string | null | undefined ? 'text' | 'select' :
  T extends number | null | undefined ? 'number' :
  T extends boolean | null | undefined ? 'boolean' :
  T extends Date | null | undefined ? 'date' :
  T extends Array<any> ? 'select-multi' :
  'text';

// Type-safe column that validates cellType matches field type
export interface Column<T, K extends keyof T = keyof T> {
  id: string;
  field: K & string;
  name: string;
  cellType: K extends keyof T ? FieldTypeToCellType<T[K]> : never;
  
  // Optional properties
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  editable?: boolean;
  
  // For relationships
  relationshipTable?: string;
  relationshipDisplayField?: string;
  
  // For enums and selects
  options?: Array<{ value: string; label: string; color?: string; group?: string }>;
  
  // For system/custom references
  referenceType?: 'system' | 'custom';
  systemOptionType?: string; // e.g., 'priority', 'status'
  systemArchetype?: string;  // e.g., 'project', 'task'
  customOptionSet?: string;
}

// Helper type to make column creation easier
export type ColumnDef<T> = {
  [K in keyof T]: Column<T, K>;
}[keyof T];

// Export cell type union for use elsewhere - aligned with DataForge field types
export type CellType = 
  // Basic types
  | 'text' 
  | 'longtext'
  | 'rich-text'
  | 'number'
  | 'integer'
  | 'decimal'
  | 'boolean' 
  | 'date'
  | 'datetime'
  // Selection types
  | 'select'
  | 'single-select'
  | 'select-multi'
  | 'multi-select'
  // Communication types
  | 'email'
  | 'url'
  | 'phone'
  // Rich data types
  | 'file'
  | 'currency'
  | 'color'
  // Reference types
  | 'reference-select'
  | 'custom_user_reference'
  | 'custom_entity_reference'
  // Computed/rollup types
  | 'rollup_count'
  | 'rollup_sum'
  | 'rollup_average'
  | 'rollup_concat'
  | 'computed_expression'
  | 'computed_formula';