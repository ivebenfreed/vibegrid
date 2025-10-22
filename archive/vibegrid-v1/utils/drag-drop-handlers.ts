/**
 * Drag and Drop Handlers for VibeGrid
 *
 * Simplified implementation following VibeGrid patterns for row drag and drop.
 */

import { log } from '@/logger';
import type { GroupRowOrderConfig } from '../stores/data-state';

const fileLog = log('components/custom/vibegrid/utils/drag-drop-handlers.ts');

// ====================================
// TYPES
// ====================================

export interface DragDropCallbacks {
  onRowMove: (draggedRowId: string, targetGroupId: string, newIndex: number) => boolean;
  onFlatRowMove?: (fromIndex: number, toIndex: number) => boolean;
  onDragStart?: (rowId: string, groupId?: string) => void;
  onDragEnd?: (success: boolean) => void;
  isGroupMode?: () => boolean;
}

// ====================================
// DRAG AND DROP MANAGER
// ====================================

export class DragDropManager {
  private callbacks: DragDropCallbacks;

  constructor(callbacks: DragDropCallbacks) {
    this.callbacks = callbacks;
    fileLog.info('🎯 DragDropManager initialized');
  }

  /**
   * Set container for drag operations (compatibility method)
   */
  setContainer(container: HTMLElement): void {
    // Store container reference if needed for future drag operations
    fileLog.debug('🏗️ Container set for drag operations', { containerClass: container.className });
  }

  /**
   * Setup row for drag and drop (alias for setupRowDragHandlers)
   */
  setupRowForDragDrop(rowElement: HTMLElement, row: any): void {
    const rowType = row.type || 'data';
    const groupId = row.groupId;
    
    this.setupRowDragHandlers(rowElement, row.id, rowType, groupId);
  }

  /**
   * Create drag handle element
   */
  createDragHandle(): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'vibegrid-drag-handle';

    // Handle styling
    Object.assign(handle.style, {
      width: '20px',
      height: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'grab',
      borderRadius: '4px',
      opacity: '0.6',
      transition: 'opacity 0.2s ease'
    });

    // Drag icon (two rows of three dots)
    handle.innerHTML = `
      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
        <circle cx="3" cy="4" r="1.5"/>
        <circle cx="9" cy="4" r="1.5"/>
        <circle cx="3" cy="8" r="1.5"/>
        <circle cx="9" cy="8" r="1.5"/>
        <circle cx="3" cy="12" r="1.5"/>
        <circle cx="9" cy="12" r="1.5"/>
      </svg>
    `;

    return handle;
  }

  /**
   * Setup row drag handlers (following VibeGrid pattern)
   */
  setupRowDragHandlers(
    rowElement: HTMLElement,
    rowId: string,
    rowType: 'data' | 'group' | 'summary',
    groupId?: string
  ): void {
    fileLog.info('🎯 setupRowDragHandlers called', {
      rowId,
      rowType,
      groupId,
      hasRowElement: !!rowElement,
      dataGroupId: rowElement?.dataset?.groupId
    });

    // Only data rows are draggable
    if (rowType !== 'data') {
      fileLog.debug('⏭️ Skipping non-data row', { rowId, rowType });
      return;
    }

    const isGroupMode = this.callbacks.isGroupMode?.() ?? true;
    fileLog.info('🔍 Group mode check', { isGroupMode, groupId, hasGroupId: !!groupId });

    if (isGroupMode && !groupId) {
      fileLog.error('❌ Cannot setup drag handlers: no group ID provided for grouped mode', {
        rowId,
        isGroupMode,
        groupId,
        dataGroupId: rowElement?.dataset?.groupId,
        allDataAttributes: Object.assign({}, rowElement?.dataset)
      });
      return;
    }

    // Note: HTML5 drag events are no longer used - MouseController handles row dragging
    // This is kept for compatibility but no longer sets up event listeners
    fileLog.debug('🎯 Row drag handlers setup (MouseController mode)', { rowId, groupId, isGroupMode });
  }


  /**
   * Get the index of a row within its group
   */
  private getRowIndexInGroup(rowElement: HTMLElement, groupId: string): number {
    const container = document.querySelector(`[data-group-id="${groupId}"]`)?.parentElement;
    if (!container) return -1;

    const dataRows = Array.from(container.querySelectorAll('.vibegridx-row:not(.vibegridx-group-header)'));
    return dataRows.indexOf(rowElement);
  }

  /**
   * Get the index of a row in flat mode
   */
  private getRowIndexFlat(rowElement: HTMLElement): number {
    const container = rowElement.closest('.vibegridx-container');
    if (!container) return -1;

    const dataRows = Array.from(container.querySelectorAll('.vibegridx-row:not(.vibegridx-group-header)'));
    return dataRows.indexOf(rowElement);
  }


  /**
   * Create a clean drag preview showing all visible row content
   */
  private createDragPreview(rowElement: HTMLElement): HTMLElement {
    const preview = document.createElement('div');
    preview.className = 'vibegrid-drag-preview';

    // Clone the row content but only visible parts
    const viewportWidth = window.innerWidth;
    const cells = rowElement.querySelectorAll('.vibegridx-cell');

    // Collect all visible cells
    const visibleCells = Array.from(cells).filter(cell => {
      const cellRect = cell.getBoundingClientRect();
      return cellRect.right > 0 && cellRect.left < viewportWidth;
    });

    if (visibleCells.length > 0) {
      // Create a mini table-like structure for the preview
      preview.style.display = 'flex';
      preview.style.alignItems = 'center';
      preview.style.gap = '12px';

      visibleCells.forEach((cell, index) => {
        if (index >= 4) return; // Limit to first 4 visible cells to avoid too wide preview

        const cellPreview = document.createElement('div');
        const cellText = cell.textContent?.trim() || '';

        if (cellText) {
          cellPreview.textContent = cellText.length > 20 ? cellText.substring(0, 20) + '...' : cellText;
          cellPreview.style.cssText = `
            flex: 0 0 auto;
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
            color: #374151;
          `;

          // Add separator between cells (except last)
          if (index > 0) {
            const separator = document.createElement('div');
            separator.textContent = '•';
            separator.style.cssText = `
              color: #9ca3af;
              font-size: 12px;
              flex: 0 0 auto;
            `;
            preview.appendChild(separator);
          }

          preview.appendChild(cellPreview);
        }
      });

      // If no visible content found, show fallback
      if (preview.children.length === 0) {
        preview.textContent = 'Moving row...';
        preview.style.display = 'block';
      }
    } else {
      preview.textContent = 'Moving row...';
    }

    // Style the preview container
    Object.assign(preview.style, {
      position: 'fixed',
      top: '-200px',
      left: '50px',
      background: '#ffffff',
      border: '2px solid #3b82f6',
      borderRadius: '6px',
      padding: '10px 14px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#1f2937',
      boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
      zIndex: '9999',
      maxWidth: '500px',
      minWidth: '150px',
      whiteSpace: 'nowrap',
      overflow: 'hidden'
    });

    document.body.appendChild(preview);
    return preview;
  }

  /**
   * Show drop indicator at target position
   */
  private showDropIndicator(targetElement: HTMLElement, e: DragEvent): void {
    this.removeDropIndicators();

    const rect = targetElement.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;

    const indicator = document.createElement('div');
    indicator.className = 'vibegrid-drop-indicator';

    Object.assign(indicator.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      height: '3px',
      backgroundColor: '#3b82f6',
      borderRadius: '1.5px',
      zIndex: '1000',
      boxShadow: '0 0 6px rgba(59, 130, 246, 0.4)',
      pointerEvents: 'none'
    });

    // Position the indicator
    const container = targetElement.closest('.vibegridx-container');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();

      if (insertBefore) {
        indicator.style.top = `${targetRect.top - containerRect.top - 1.5}px`;
      } else {
        indicator.style.top = `${targetRect.bottom - containerRect.top - 1.5}px`;
      }

      container.appendChild(indicator);
    }
  }

  /**
   * Remove all drop indicators
   */
  private removeDropIndicators(): void {
    const indicators = document.querySelectorAll('.vibegrid-drop-indicator');
    indicators.forEach(indicator => indicator.remove());
  }

  /**
   * Destroy the drag drop manager
   */
  destroy(): void {
    this.removeDropIndicators();
    fileLog.info('🧹 DragDropManager destroyed');
  }
}

// ====================================
// UTILITY FUNCTIONS
// ====================================

/**
 * Apply custom row ordering to a group's data rows
 */
export function applyGroupRowOrdering(
  dataRows: any[],
  groupId: string,
  groupRowOrders: Record<string, GroupRowOrderConfig>
): any[] {
  const orderConfig = groupRowOrders[groupId];

  if (!orderConfig || !orderConfig.rowIds.length) {
    // No custom ordering, return as-is
    return dataRows;
  }

  const orderedRows: any[] = [];
  const rowsById = new Map(dataRows.map(row => [row.id, row]));

  // Add rows in specified order
  orderConfig.rowIds.forEach(rowId => {
    const row = rowsById.get(rowId);
    if (row) {
      orderedRows.push(row);
      rowsById.delete(rowId);
    }
  });

  // Add any remaining rows that weren't in the order config
  rowsById.forEach(row => orderedRows.push(row));

  fileLog.debug('✅ Applied group row ordering', {
    groupId,
    originalCount: dataRows.length,
    orderedCount: orderedRows.length,
    customOrder: orderConfig.rowIds.length
  });

  return orderedRows;
}

/**
 * Initialize group row order from current data
 */
export function initializeGroupRowOrder(
  groupId: string,
  dataRows: any[],
  setGroupRowOrder: (groupId: string, rowIds: string[]) => void
): void {
  const rowIds = dataRows.map(row => row.id);
  setGroupRowOrder(groupId, rowIds);

  fileLog.info('🔧 Initialized group row order', {
    groupId,
    rowCount: rowIds.length
  });
}