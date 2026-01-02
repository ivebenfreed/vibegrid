/**
 * Vibegrid Affordance System
 *
 * Declarative system for cell interaction behaviors.
 * Provides reusable affordance groups that control cursor, hover, and click behaviors.
 *
 * Usage:
 * 1. Field types declare their affordance group in their definition
 * 2. AffordanceResolver resolves the group based on editability
 * 3. Data attributes are applied to DOM elements
 * 4. CSS handles all visual states via affordances.css
 *
 * @example
 * // In a field type definition:
 * const TextFieldType: VibeGridFieldType = {
 *   // ... other properties ...
 *   affordance: {
 *     group: 'editable-content',
 *     whenNotEditable: 'readonly-display',
 *   },
 * }
 *
 * @see planning/04-improvements/vibegrid-cell-interaction/DESIGN.md
 */

// Types
export type {
  AffordanceAction,
  AffordanceCursor,
  AffordanceElement,
  AffordanceGroup,
  AffordanceHover,
  AffordanceRole,
  CellDataAttributes,
  FieldTypeAffordance,
  ResolvedAffordance,
} from './types'

// Affordance groups
export { AFFORDANCE_GROUPS, getAffordanceGroup, hasAffordanceGroup } from './AffordanceGroups'

// Resolver
export { AffordanceResolver, affordanceResolver } from './AffordanceResolver'
