/**
 * Cell Dependency System Types
 *
 * Defines the dependency requirements for different cell types
 * to ensure consistent rendering and prevent premature display
 */

export interface CellRenderDependencies {
  /** Basic schema and column configuration must be loaded */
  schema: boolean

  /** Row data must be available */
  data: boolean

  /** List of relationship field IDs that must be resolved */
  relationships: string[]

  /** List of computed field IDs that must have calculated values */
  computed: string[]

  /** Display formatters must be ready for proper formatting */
  formatting: boolean
}

export interface CellReadinessStatus {
  /** True when all dependencies are satisfied and cell can render */
  isReady: boolean

  /** List of dependency names that are not yet satisfied */
  missingDependencies: string[]

  /** Timestamp when readiness was last checked */
  lastChecked: number

  /** Optional context about why dependencies are missing */
  context?: {
    schemaStatus?: 'loading' | 'error' | 'ready'
    relationshipStatus?: 'pending' | 'resolving' | 'ready' | 'error'
    formatterStatus?: 'loading' | 'ready' | 'error'
  }
}

/**
 * Cell type dependency configurations
 * Maps cell types to their specific dependency requirements
 */
export const CELL_TYPE_DEPENDENCIES: Record<string, Partial<CellRenderDependencies>> = {
  // Basic cells - minimal dependencies
  text: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: false,
  },

  number: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true, // Needs formatters for number display
  },

  boolean: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: false,
  },

  date: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true, // Needs formatters for date display
  },

  // Relationship cells - require resolved relationship data
  'relationship-single': {
    schema: true,
    data: true,
    relationships: [], // Will be populated dynamically based on column
    computed: [],
    formatting: true,
  },

  'relationship-multi': {
    schema: true,
    data: true,
    relationships: [], // Will be populated dynamically based on column
    computed: [],
    formatting: true,
  },

  // Enum/select cells - require formatting for proper badge styling
  enum: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true,
  },

  select: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true,
  },

  // Rollup cells - require computed values and may need relationship data
  rollup_count: {
    schema: true,
    data: true,
    relationships: [], // Will be populated based on rollup config
    computed: [], // Will be populated dynamically
    formatting: true,
  },

  rollup_sum: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true,
  },

  rollup_average: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true,
  },

  rollup_concat: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true,
  },

  // Computed cells - require computed values
  computed_expression: {
    schema: true,
    data: true,
    relationships: [],
    computed: [], // Will be populated based on expression dependencies
    formatting: true,
  },

  computed_formula: {
    schema: true,
    data: true,
    relationships: [],
    computed: [],
    formatting: true,
  },
}

/**
 * Dependency error types for better debugging
 */
export type DependencyError = {
  type: 'schema' | 'data' | 'relationship' | 'computed' | 'formatting'
  message: string
  details?: any
  retryable: boolean
}

/**
 * Context information passed to dependency checkers
 */
export interface DependencyContext {
  /** Whether schema loading is complete */
  schemaLoaded: boolean

  /** Map of resolved relationship values */
  relationshipResolver: Map<string, any>

  /** Whether display formatters are ready */
  formattersReady: boolean

  /** Current data loading stage */
  loadingStage: string

  /** Any errors that have occurred */
  errors: DependencyError[]

  /** Timestamp when context was created */
  contextCreated: number
}
