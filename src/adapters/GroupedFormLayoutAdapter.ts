/**
 * GroupedFormLayoutAdapter - Grouped/Sectioned Form Layout
 *
 * Implements grouped form layout with collapsible sections:
 * - Fields organized into named groups
 * - Collapsible section headers
 * - Up/Down navigation within groups
 * - Tab navigation between groups
 *
 * Layout Pattern:
 * ┌─────────────────────────────────────┐
 * │ ▼ Basic Info                        │
 * │ ┌─────────────┬─────────────┐      │
 * │ │ Name        │ Status      │      │
 * │ └─────────────┴─────────────┘      │
 * ├─────────────────────────────────────┤
 * │ ▼ Details                           │
 * │ ┌─────────────────────────────┐    │
 * │ │ Description                  │    │
 * │ └─────────────────────────────┘    │
 * ├─────────────────────────────────────┤
 * │ ▶ Advanced (collapsed)              │
 * └─────────────────────────────────────┘
 */

import type { CellLayoutAdapter, CellPosition, FieldNeighbors } from '../types/layout-types'
import type { Column } from '../types'
import type { CSSProperties } from 'react'

/**
 * Group definition for organizing fields
 */
export interface FieldGroup {
  /** Unique group identifier */
  id: string
  /** Display label for the group header */
  label: string
  /** Field IDs that belong to this group */
  fieldIds: string[]
  /** Whether the group is collapsed by default */
  defaultCollapsed?: boolean
  /** Number of columns within the group (1 or 2) */
  columns?: 1 | 2
}

export interface GroupedFormLayoutAdapterOptions {
  /** Array of visible columns (field definitions) */
  columns: Column[]
  /** Group definitions */
  groups: FieldGroup[]
  /** Gap between groups (CSS value) */
  groupGap?: string
  /** Gap between fields within a group (CSS value) */
  fieldGap?: string
}

interface FieldLocation {
  groupIndex: number
  fieldIndexInGroup: number
  globalIndex: number
}

export class GroupedFormLayoutAdapter implements CellLayoutAdapter {
  private columns: Column[]
  private groups: FieldGroup[]
  private groupGap: string
  private fieldGap: string
  private fieldIdToLocation: Map<string, FieldLocation>
  private collapsedGroups: Set<string>

  constructor(options: GroupedFormLayoutAdapterOptions) {
    this.columns = options.columns
    this.groups = options.groups
    this.groupGap = options.groupGap ?? '1.5rem'
    this.fieldGap = options.fieldGap ?? '1rem'
    this.collapsedGroups = new Set()

    // Initialize collapsed groups
    for (const group of this.groups) {
      if (group.defaultCollapsed) {
        this.collapsedGroups.add(group.id)
      }
    }

    // Build field ID to location mapping
    this.fieldIdToLocation = new Map()
    this.rebuildFieldLocationMap()
  }

  private rebuildFieldLocationMap(): void {
    this.fieldIdToLocation.clear()
    let globalIndex = 0

    for (let groupIndex = 0; groupIndex < this.groups.length; groupIndex++) {
      const group = this.groups[groupIndex]
      for (
        let fieldIndexInGroup = 0;
        fieldIndexInGroup < group.fieldIds.length;
        fieldIndexInGroup++
      ) {
        const fieldId = group.fieldIds[fieldIndexInGroup]
        this.fieldIdToLocation.set(fieldId, {
          groupIndex,
          fieldIndexInGroup,
          globalIndex,
        })
        globalIndex++
      }
    }
  }

  // ==================== Group Management ====================

  /**
   * Toggle group collapsed state
   */
  toggleGroup(groupId: string): boolean {
    if (this.collapsedGroups.has(groupId)) {
      this.collapsedGroups.delete(groupId)
      return false // Now expanded
    } else {
      this.collapsedGroups.add(groupId)
      return true // Now collapsed
    }
  }

  /**
   * Check if a group is collapsed
   */
  isGroupCollapsed(groupId: string): boolean {
    return this.collapsedGroups.has(groupId)
  }

  /**
   * Get all groups
   */
  getGroups(): FieldGroup[] {
    return this.groups
  }

  /**
   * Get visible fields (excluding collapsed groups)
   */
  getVisibleFields(): string[] {
    const visible: string[] = []
    for (const group of this.groups) {
      if (!this.collapsedGroups.has(group.id)) {
        visible.push(...group.fieldIds)
      }
    }
    return visible
  }

  // ==================== Navigation ====================

  /**
   * Get neighboring fields for keyboard navigation
   * Handles navigation within and between groups
   */
  getFieldNeighbors(fieldId: string): FieldNeighbors {
    const location = this.fieldIdToLocation.get(fieldId)
    if (!location) {
      return {}
    }

    const neighbors: FieldNeighbors = {}
    const group = this.groups[location.groupIndex]
    const numColumns = group.columns ?? 1

    if (numColumns === 2) {
      // Two-column layout within group
      const isLeftColumn = location.fieldIndexInGroup % 2 === 0
      const rowInGroup = Math.floor(location.fieldIndexInGroup / 2)

      // Left/Right navigation
      if (isLeftColumn && location.fieldIndexInGroup + 1 < group.fieldIds.length) {
        neighbors.right = group.fieldIds[location.fieldIndexInGroup + 1]
      } else if (!isLeftColumn) {
        neighbors.left = group.fieldIds[location.fieldIndexInGroup - 1]
      }

      // Up navigation - same column, previous row
      const upIndex = location.fieldIndexInGroup - 2
      if (upIndex >= 0) {
        neighbors.up = group.fieldIds[upIndex]
      } else if (location.groupIndex > 0) {
        // Go to last field of previous non-collapsed group
        neighbors.up = this.getLastFieldOfPreviousGroup(location.groupIndex)
      }

      // Down navigation - same column, next row
      const downIndex = location.fieldIndexInGroup + 2
      if (downIndex < group.fieldIds.length) {
        neighbors.down = group.fieldIds[downIndex]
      } else if (location.groupIndex < this.groups.length - 1) {
        // Go to first field of next non-collapsed group
        neighbors.down = this.getFirstFieldOfNextGroup(location.groupIndex)
      }
    } else {
      // Single-column layout within group
      // Up navigation
      if (location.fieldIndexInGroup > 0) {
        neighbors.up = group.fieldIds[location.fieldIndexInGroup - 1]
      } else if (location.groupIndex > 0) {
        neighbors.up = this.getLastFieldOfPreviousGroup(location.groupIndex)
      }

      // Down navigation
      if (location.fieldIndexInGroup < group.fieldIds.length - 1) {
        neighbors.down = group.fieldIds[location.fieldIndexInGroup + 1]
      } else if (location.groupIndex < this.groups.length - 1) {
        neighbors.down = this.getFirstFieldOfNextGroup(location.groupIndex)
      }
    }

    return neighbors
  }

  private getLastFieldOfPreviousGroup(currentGroupIndex: number): string | undefined {
    for (let i = currentGroupIndex - 1; i >= 0; i--) {
      const group = this.groups[i]
      if (!this.collapsedGroups.has(group.id) && group.fieldIds.length > 0) {
        return group.fieldIds[group.fieldIds.length - 1]
      }
    }
    return undefined
  }

  private getFirstFieldOfNextGroup(currentGroupIndex: number): string | undefined {
    for (let i = currentGroupIndex + 1; i < this.groups.length; i++) {
      const group = this.groups[i]
      if (!this.collapsedGroups.has(group.id) && group.fieldIds.length > 0) {
        return group.fieldIds[0]
      }
    }
    return undefined
  }

  /**
   * Get field's position in layout grid
   */
  getCellPosition(fieldId: string): CellPosition {
    const location = this.fieldIdToLocation.get(fieldId)
    if (!location) {
      throw new Error(`Field not found: ${fieldId}`)
    }

    const group = this.groups[location.groupIndex]
    const numColumns = group.columns ?? 1

    if (numColumns === 2) {
      return {
        row: Math.floor(location.fieldIndexInGroup / 2),
        col: location.fieldIndexInGroup % 2,
      }
    }

    return {
      row: location.fieldIndexInGroup,
      col: 0,
    }
  }

  /**
   * Get field ID at specific position within a group
   */
  getFieldAtPosition(row: number, col: number): string | null {
    // This method doesn't make sense for grouped layout
    // since position is relative to group
    return null
  }

  /**
   * Get field at position within a specific group
   */
  getFieldAtGroupPosition(groupId: string, row: number, col: number): string | null {
    const group = this.groups.find((g) => g.id === groupId)
    if (!group) return null

    const numColumns = group.columns ?? 1
    const index = row * numColumns + col

    if (index < 0 || index >= group.fieldIds.length) {
      return null
    }

    return group.fieldIds[index]
  }

  /**
   * Get tab order for sequential navigation
   * Skips collapsed groups
   */
  getTabOrder(): string[] {
    const order: string[] = []
    for (const group of this.groups) {
      if (!this.collapsedGroups.has(group.id)) {
        order.push(...group.fieldIds)
      }
    }
    return order
  }

  // ==================== Rendering ====================

  /**
   * Get CSS grid template for grouped layout
   */
  getGridTemplate(): string {
    return '1fr'
  }

  /**
   * Get container styles for the layout
   */
  getContainerStyle(): CSSProperties {
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: this.groupGap,
    }
  }

  /**
   * Get group container styles
   */
  getGroupStyle(groupId: string): CSSProperties {
    const group = this.groups.find((g) => g.id === groupId)
    if (!group) return {}

    const numColumns = group.columns ?? 1

    return {
      display: 'grid',
      gridTemplateColumns: numColumns === 2 ? '1fr 1fr' : '1fr',
      gap: this.fieldGap,
    }
  }

  /**
   * Get field-specific CSS styles
   */
  getFieldStyle(fieldId: string): CSSProperties {
    const location = this.fieldIdToLocation.get(fieldId)
    if (!location) return {}

    const group = this.groups[location.groupIndex]
    const numColumns = group.columns ?? 1

    // Check if last field should span full width in 2-column layout
    const isLastField = location.fieldIndexInGroup === group.fieldIds.length - 1
    const isOddCount = group.fieldIds.length % 2 === 1

    if (numColumns === 2 && isLastField && isOddCount) {
      return {
        gridColumn: '1 / -1',
      }
    }

    return {}
  }

  /**
   * Get group header style
   */
  getGroupHeaderStyle(): CSSProperties {
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 0',
      cursor: 'pointer',
      userSelect: 'none',
      fontWeight: 600,
      fontSize: '0.875rem',
      color: 'var(--color-text-primary, #1f2937)',
      borderBottom: '1px solid var(--color-border, #e5e7eb)',
    }
  }

  // ==================== Update Methods ====================

  /**
   * Update columns and rebuild field location map
   */
  updateColumns(columns: Column[]): void {
    this.columns = columns
    this.rebuildFieldLocationMap()
  }

  /**
   * Update groups and rebuild field location map
   */
  updateGroups(groups: FieldGroup[]): void {
    this.groups = groups
    this.rebuildFieldLocationMap()
  }
}
