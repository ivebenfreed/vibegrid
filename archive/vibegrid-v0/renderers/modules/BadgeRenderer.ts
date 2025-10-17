/**
 * BadgeRenderer - Handles badge and tag rendering logic for VibeGrid cells
 * Extracted from SimplePassiveRenderer to modularize badge-related functionality
 */

import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/renderers/modules/BadgeRenderer.ts');

export class BadgeRenderer {
  /**
   * Get the appropriate CSS badge color class for a given value and column
   */
  static getBadgeColorClass(value: string, columnId: string): string | null {
    if (!value) return null;
    
    const normalizedValue = value.toLowerCase().trim();
    
    // Status-related mappings
    if (normalizedValue === 'open' || normalizedValue === 'new' || normalizedValue === 'todo' || normalizedValue === 'pending') {
      return 'vibegridx-enum-badge-open';
    }
    if (normalizedValue === 'in-progress' || normalizedValue === 'in_progress' || normalizedValue === 'working' || normalizedValue === 'active') {
      return 'vibegridx-enum-badge-in-progress';
    }
    if (normalizedValue === 'completed' || normalizedValue === 'done' || normalizedValue === 'finished' || normalizedValue === 'closed') {
      return 'vibegridx-enum-badge-completed';
    }
    if (normalizedValue === 'approved') {
      return 'vibegridx-enum-badge-approved';
    }
    if (normalizedValue === 'rejected') {
      return 'vibegridx-enum-badge-rejected';
    }
    
    // Priority-related mappings
    if (normalizedValue === 'low') {
      return 'vibegridx-enum-badge-low';
    }
    if (normalizedValue === 'medium' || normalizedValue === 'med' || normalizedValue === 'normal') {
      return 'vibegridx-enum-badge-medium';
    }
    if (normalizedValue === 'high' || normalizedValue === 'urgent' || normalizedValue === 'critical') {
      return 'vibegridx-enum-badge-high';
    }
    
    // Type/category mappings  
    if (normalizedValue === 'bug' || normalizedValue === 'issue' || normalizedValue === 'error') {
      return 'vibegridx-enum-badge-rejected'; // Red color for bugs/issues
    }
    if (normalizedValue === 'feature' || normalizedValue === 'enhancement' || normalizedValue === 'improvement') {
      return 'vibegridx-enum-badge-open'; // Blue color for features
    }
    if (normalizedValue === 'backend' || normalizedValue === 'api' || normalizedValue === 'server') {
      return 'vibegridx-enum-badge-medium'; // Yellow/orange for backend
    }
    if (normalizedValue === 'frontend' || normalizedValue === 'ui' || normalizedValue === 'client') {
      return 'vibegridx-enum-badge-active'; // Green color for frontend
    }
    if (normalizedValue === 'database' || normalizedValue === 'data' || normalizedValue === 'db') {
      return 'vibegridx-enum-badge-pending'; // Yellow for database
    }
    
    // Default: no specific color class (will use inline styles)
    return null;
  }

  /**
   * Check if a field contains tags (comma-separated values)
   */
  static isTagsField(columnId: string, value: any): boolean {
    if (!value || typeof value !== 'string') return false;
    
    // Check if column ID suggests tags/labels
    const tagsColumns = ['tags', 'labels', 'categories', 'keywords'];
    if (tagsColumns.some(col => columnId.toLowerCase().includes(col))) {
      // Check if value contains comma-separated items
      return value.includes(',');
    }
    
    return false;
  }

  /**
   * Create a tags element with multiple badges
   */
  static createTagsElement(
    value: string, 
    row: any, 
    column: any,
    createElement: (tag: string, className: string) => HTMLElement,
    onEditTags?: (value: string, row: any, column: any) => void
  ): HTMLElement {
    const container = createElement('div', 'vibegridx-tags-container');
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      width: 100%;
      min-height: 24px;
      cursor: pointer;
    `;
    
    const tags = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    tags.forEach(tag => {
      const badge = createElement('span', 'vibegridx-tag-badge');
      badge.textContent = tag;
      
      const colorClass = BadgeRenderer.getBadgeColorClass(tag, column.id);
      if (colorClass) {
        badge.className += ` ${colorClass}`;
      }
      
      badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        ${!colorClass ? `
          background-color: rgb(243, 244, 246);
          color: rgb(75, 85, 99);
          border: 1px solid rgb(209, 213, 219);
        ` : ''}
      `;
      
      container.appendChild(badge);
    });
    
    // Add placeholder if no tags
    if (tags.length === 0) {
      const placeholder = createElement('span', 'vibegridx-tags-placeholder');
      placeholder.textContent = 'Click to add tags';
      placeholder.style.cssText = `
        color: rgb(156, 163, 175);
        font-size: 12px;
        font-style: italic;
      `;
      container.appendChild(placeholder);
    }
    
    // Add click handler for editing
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onEditTags) {
        onEditTags(value, row, column);
      }
    });
    
    // Prevent container click from triggering cell selection
    container.addEventListener('mousedown', (e) => {
      if (e.target === container) {
        e.stopPropagation();
      }
    });
    
    return container;
  }

  /**
   * Create a single badge element for enum/select fields
   */
  static createBadgeElement(
    value: any,
    cellType: string,
    column: any,
    createElement: (tag: string, className: string) => HTMLElement,
    formatCellValue: (value: any, type?: string, column?: any) => string
  ): HTMLElement {
    const badge = createElement('span', 'vibegridx-enum-badge vibegridx-cell-badge-editable');
    const displayValue = formatCellValue(value, cellType, column);
    
    if (displayValue.includes('<span')) {
      badge.innerHTML = displayValue;
    } else {
      badge.textContent = displayValue;
      badge.style.cssText = `
        background-color: rgb(243, 244, 246);
        color: rgb(75, 85, 99);
        border: 1px solid rgb(209, 213, 219);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
      `;
    }
    
    return badge;
  }

  /**
   * Start editing tags field
   */
  static startTagsEdit(
    cellId: string,
    currentValue: string,
    row: any,
    column: any,
    startEdit: (cellId: string, value: string) => void
  ): void {
    fileLog.info('🏷️ Starting tags field edit mode', {
      cellId,
      currentValue,
      rowId: row.id,
      columnId: column.id,
      currentTags: currentValue.split(',').map(t => t.trim()).filter(t => t.length > 0)
    });
    
    // Trigger the standard VibeGrid edit mode
    startEdit(cellId, currentValue);
  }
}