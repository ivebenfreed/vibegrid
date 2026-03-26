/**
 * Affordance Resolver
 *
 * Resolves which affordance group to use based on field type and editability.
 * This is the bridge between field type declarations and DOM attributes.
 *
 * @see DESIGN.md in planning/04-improvements/vibegrid-cell-interaction/
 */

import { getLogger } from '@/shared/lib/logging'
import type { EnhancedColumn, VibeGridFieldType } from '../field-types/types'
import { AFFORDANCE_GROUPS, hasAffordanceGroup } from './AffordanceGroups'
import type {
  AffordanceAction,
  AffordanceElement,
  AffordanceGroup,
  CellDataAttributes,
  FieldTypeAffordance,
  ResolvedAffordance,
} from './types'

const fileLog = getLogger(['vibegrid', 'affordances', 'AffordanceResolver'])

/**
 * Resolves affordance groups for cells based on field type and column configuration
 */
export class AffordanceResolver {
  /**
   * Resolve which affordance group to use for a cell
   *
   * Priority:
   * 1. If editable, use the field type's declared group
   * 2. If not editable, use the field type's whenNotEditable override
   * 3. Fall back to defaults if no declaration
   */
  resolve(fieldType: VibeGridFieldType, column: EnhancedColumn): ResolvedAffordance {
    const isEditable = column.editable !== false
    const declaration = (fieldType as VibeGridFieldType & { affordance?: FieldTypeAffordance }).affordance

    // Fallback for field types without affordance declaration
    if (!declaration) {
      fileLog.debug('No affordance declaration, using default', {
        fieldType: fieldType.type,
        isEditable,
      })
      return this.getDefaultAffordance(isEditable)
    }

    if (isEditable) {
      if (!hasAffordanceGroup(declaration.group)) {
        fileLog.warn('Unknown affordance group, using default', {
          group: declaration.group,
          fieldType: fieldType.type,
        })
        return this.getDefaultAffordance(true)
      }
      return {
        groupName: declaration.group,
        group: AFFORDANCE_GROUPS[declaration.group],
        isEditable,
      }
    }

    // Handle whenNotEditable
    return this.resolveNotEditable(declaration, fieldType.type)
  }

  /**
   * Get data attributes to apply to cell elements
   *
   * Returns attributes for both the container and child elements.
   * These attributes are read by CSS for styling and by CellActionRouter for routing.
   */
  getDataAttributes(resolved: ResolvedAffordance): CellDataAttributes {
    return {
      container: {
        'data-affordance-group': resolved.groupName,
        'data-affordance': 'select',
        'data-editable': resolved.isEditable ? 'true' : 'false',
      },
      elements: resolved.group.elements.map((el) => ({
        role: el.role,
        attributes: {
          'data-affordance': el.affordance,
          'data-affordance-role': el.role,
        },
      })),
    }
  }

  /**
   * Resolve affordance for non-editable columns
   */
  private resolveNotEditable(declaration: FieldTypeAffordance, fieldType: string): ResolvedAffordance {
    const override = declaration.whenNotEditable

    // String: use different group entirely
    if (typeof override === 'string') {
      if (!hasAffordanceGroup(override)) {
        fileLog.warn('Unknown not-editable affordance group', {
          group: override,
          fieldType,
        })
        return this.getDefaultAffordance(false)
      }
      return {
        groupName: override,
        group: AFFORDANCE_GROUPS[override],
        isEditable: false,
      }
    }

    // { remove: [...] }: remove specific affordances from current group
    if ('remove' in override) {
      const baseGroup = AFFORDANCE_GROUPS[declaration.group]
      if (!baseGroup) {
        return this.getDefaultAffordance(false)
      }
      return {
        groupName: `${declaration.group}-modified`,
        group: this.removeAffordances(baseGroup, override.remove),
        isEditable: false,
      }
    }

    // { override: [...] }: override specific elements
    if ('override' in override) {
      const baseGroup = AFFORDANCE_GROUPS[declaration.group]
      if (!baseGroup) {
        return this.getDefaultAffordance(false)
      }
      return {
        groupName: `${declaration.group}-modified`,
        group: this.overrideElements(baseGroup, override.override),
        isEditable: false,
      }
    }

    return this.getDefaultAffordance(false)
  }

  /**
   * Get default affordance based on editability
   */
  private getDefaultAffordance(isEditable: boolean): ResolvedAffordance {
    const groupName = isEditable ? 'editable-content' : 'readonly-display'
    return {
      groupName,
      group: AFFORDANCE_GROUPS[groupName],
      isEditable,
    }
  }

  /**
   * Create a modified group with specific affordances removed
   */
  private removeAffordances(baseGroup: AffordanceGroup, toRemove: AffordanceAction[]): AffordanceGroup {
    return {
      ...baseGroup,
      elements: baseGroup.elements.filter((el) => !toRemove.includes(el.affordance)),
    }
  }

  /**
   * Create a modified group with specific elements overridden
   */
  private overrideElements(baseGroup: AffordanceGroup, overrides: Partial<AffordanceElement>[]): AffordanceGroup {
    return {
      ...baseGroup,
      elements: baseGroup.elements.map((el) => {
        const override = overrides.find((o) => o.role === el.role)
        if (override) {
          return {
            ...el,
            ...override,
            // Ensure role stays as the original type
            role: el.role,
          }
        }
        return el
      }),
    }
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const affordanceResolver = new AffordanceResolver()
