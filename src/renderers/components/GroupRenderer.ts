/**
 * GroupRenderer - Specialized renderer for VibeGrid group headers and group management
 * Handles group row creation, expansion/collapse, and visual styling
 */

import { getLogger } from '@/shared/lib/logging'
import type { DOMElementFactory } from '../factories/DOMElementFactory'

import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'components', 'GroupRenderer.ts'])

const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

export interface GroupRendererOptions {
  domFactory: DOMElementFactory
  createElement: (tag: string, className: string) => HTMLElement
  visualState?: any // Legacy visual state - not used in current implementation
}

export class GroupRenderer {
  private domFactory: DOMElementFactory
  private createElement: (tag: string, className: string) => HTMLElement
  private visualState?: any // Legacy visual state - not used in current implementation

  constructor(options: GroupRendererOptions) {
    this.domFactory = options.domFactory
    this.createElement = options.createElement
    this.visualState = options.visualState

    fileLog.debug('🏗️ GroupRenderer initialized')
  }

  /**
   * Create group header element with expand/collapse functionality
   * Moved from SimplePassiveRenderer for better modularization
   */
  createGroupHeaderElement(groupRow: any, rowIndex: number): HTMLElement {
    const groupData = groupRow.data
    const level = groupRow.level || 0
    const isExpanded = groupRow.isExpanded

    const rowElement = this.createElement('div', 'vibegridx-row vibegridx-group-header')
    rowElement.dataset.rowId = groupRow.id
    rowElement.dataset.groupId = groupRow.id
    // PERF: Use transform for GPU-accelerated positioning
    rowElement.style.transform = `translateY(${rowIndex * ROW_HEIGHT}px)`
    rowElement.style.paddingLeft = `${level * 20 + 12}px`
    // PERF (GH#2848): background, border-bottom, font-weight, z-index, and
    // hover state moved to CSS (.vibegridx-group-header in vibegridx.css).
    // Inline-style+JS-listener hover thrashed layout on every mousemove and
    // leaked mouseenter/mouseleave listeners across every renderBody() pass.

    // Create expand/collapse button
    const expandButton = this.createElement('div', 'vibegridx-group-expand')
    expandButton.style.cssText = `
      width: 20px;
      height: 20px;
      margin-right: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      transition: background 0.2s ease;
    `
    // Background + :hover handled by .vibegridx-group-expand CSS rules
    // (no per-row addEventListener -- avoids listener accumulation).

    // Triangle icon for expand/collapse
    const triangle = this.createElement('span', 'triangle-icon')
    triangle.style.cssText = `
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 6px solid #666;
      transform: ${isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
      transition: transform 0.2s ease;
    `
    expandButton.appendChild(triangle)

    // Group label with count
    const groupLabel = this.createElement('div', 'vibegridx-group-label')
    groupLabel.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: #333;
      user-select: none;
    `

    // Build group label text with proper display values
    const displayValue = groupData.displayValue || groupData.value || 'Unknown'
    const rowCount = groupData.rowCount || groupData.count || 0
    // Use column display name instead of raw field name (e.g., "Owner" instead of "owner_id")
    const rawField = groupData.field || 'Group'
    const column = this.visualState.columns?.find((c: any) => c.field === rawField || c.id === rawField)
    const fieldName = column?.name || rawField.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

    groupLabel.textContent = `${fieldName}: ${displayValue} (${rowCount} items)`

    // Click handler for expand/collapse
    const handleToggle = () => {
      this.visualState.visualOperations.toggleGroupExpansion(groupRow.id)
      fileLog.debug('🔄 Group toggled', {
        groupId: groupRow.id,
        wasExpanded: isExpanded,
        field: fieldName,
        value: displayValue,
      })
    }

    expandButton.addEventListener('click', handleToggle)

    // Also allow clicking the entire group header to expand/collapse
    rowElement.addEventListener('click', (e) => {
      // Don't toggle if clicking on specific interactive elements
      if (e.target === expandButton || e.target === triangle) {
        return
      }
      handleToggle()
    })

    // Hover background handled by CSS (.vibegridx-row.vibegridx-group-header:hover)

    // Assemble the group header
    rowElement.appendChild(expandButton)
    rowElement.appendChild(groupLabel)

    fileLog.debug('🏷️ Group header created', {
      groupId: groupRow.id,
      level,
      isExpanded,
      field: fieldName,
      displayValue,
      rowCount,
    })

    return rowElement
  }

  /**
   * Update group expansion state for existing group headers
   */
  updateGroupExpansionState(groupId: string, isExpanded: boolean): void {
    const groupElements = document.querySelectorAll(`[data-group-id="${groupId}"]`)

    groupElements.forEach((element) => {
      const triangle = element.querySelector('.triangle-icon') as HTMLElement
      if (triangle) {
        triangle.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
      }
    })

    fileLog.debug('🔄 Group expansion state updated', { groupId, isExpanded })
  }

  /**
   * Clean up group renderer resources
   */
  destroy(): void {
    fileLog.debug('🧹 GroupRenderer cleanup')
    // No specific cleanup needed for now, but method available for future use
  }
}
