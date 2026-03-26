/**
 * Affordance System Types
 *
 * Defines the type system for cell interaction affordances.
 * Affordances describe what interactive capabilities a cell element has.
 *
 * @see DESIGN.md in planning/04-improvements/vibegrid-cell-interaction/
 */

/** What action an affordance triggers */
export type AffordanceAction = 'navigate' | 'edit' | 'toggle' | 'open-menu' | 'select' | 'none'

/** Cursor type for the affordance */
export type AffordanceCursor = 'default' | 'pointer' | 'text' | 'grab' | 'help'

/** Hover effect for the affordance */
export type AffordanceHover = 'underline' | 'scale' | 'background' | 'brightness' | 'none'

/** Role of the element within a cell */
export type AffordanceRole = 'content' | 'icon' | 'badge' | 'control' | 'link' | 'container'

/**
 * An affordance element describes an interactive part of a cell
 */
export interface AffordanceElement {
  /** What kind of element this is */
  role: AffordanceRole
  /** What action clicking this element triggers */
  affordance: AffordanceAction
  /** What cursor to show (resolved by CSS, but declared here for documentation) */
  cursor: AffordanceCursor
  /** What hover effect to apply */
  hoverEffect: AffordanceHover
}

/**
 * An affordance group is a reusable pattern of affordances
 * that can be applied to different field types
 */
export interface AffordanceGroup {
  /** Unique name for this group */
  name: string
  /** Human-readable description */
  description: string
  /** Interactive elements in this group */
  elements: AffordanceElement[]
  /** Container (padding area) always has select affordance */
  container: {
    affordance: 'select'
    cursor: 'default'
  }
}

/**
 * Declaration of affordance behavior for a field type
 */
export interface FieldTypeAffordance {
  /** Default affordance group when editable */
  group: string

  /**
   * What to use when column.editable === false
   * - string: Use different group entirely (e.g., 'readonly-display')
   * - { remove: string[] }: Remove specific affordances from current group
   * - { override: Partial<AffordanceElement>[] }: Override specific elements
   */
  whenNotEditable: string | { remove: AffordanceAction[] } | { override: Partial<AffordanceElement>[] }
}

/**
 * Result of resolving affordance for a cell
 */
export interface ResolvedAffordance {
  /** Name of the resolved group */
  groupName: string
  /** The resolved group definition */
  group: AffordanceGroup
  /** Whether the cell is editable */
  isEditable: boolean
}

/**
 * Data attributes to apply to cell elements
 */
export interface CellDataAttributes {
  /** Attributes for the cell container */
  container: Record<string, string>
  /** Attributes for each element within the cell */
  elements: Array<{
    role: AffordanceRole
    attributes: Record<string, string>
  }>
}
