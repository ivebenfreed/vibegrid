/**
 * GroupRenderer - Specialized renderer for VibeGrid group headers and group management
 * Handles group row creation, expansion/collapse, and visual styling
 */

import { getLogger } from '@/shared/lib/logging'
import type { DOMElementFactory } from '../factories/DOMElementFactory'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'components', 'GroupRenderer.ts'])

const ROW_HEIGHT = 40

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
    rowElement.style.cssText = `
      position: absolute;
      top: ${rowIndex * ROW_HEIGHT}px;
      left: 0;
      right: 0;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
      font-weight: 600;
      padding-left: ${level * 20 + 12}px;
      z-index: 1;
    `

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
      background: rgba(0,0,0,0.1);
      transition: background 0.2s ease;
    `

    expandButton.addEventListener('mouseenter', () => {
      expandButton.style.background = 'rgba(0,0,0,0.15)'
    })

    expandButton.addEventListener('mouseleave', () => {
      expandButton.style.background = 'rgba(0,0,0,0.1)'
    })

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
    const fieldName = groupData.field || 'Group'

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

    // Add visual feedback for group header hover
    rowElement.addEventListener('mouseenter', () => {
      if (rowElement.style.background !== '#e9ecef') {
        rowElement.style.background = '#e9ecef'
      }
    })

    rowElement.addEventListener('mouseleave', () => {
      rowElement.style.background = '#f8f9fa'
    })

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
