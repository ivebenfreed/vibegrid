import type { Column } from '../../../types';

/**
 * Fast multi-relationship renderer
 * Optimized for many-to-many relationships with proper badge display
 */
export function relationshipMulti(
  value: any,
  column: Column,
  rowData?: any
): string {
  // First check for pre-resolved value from ViewActor
  if (rowData && rowData[`__resolved_${column.id}`]) {
    const resolvedValue = rowData[`__resolved_${column.id}`];
    if (resolvedValue && Array.isArray(resolvedValue) && resolvedValue.length > 0) {
      // Display as badges with count limit
      const maxDisplay = 3;
      const displayItems = resolvedValue.slice(0, maxDisplay);
      const remaining = resolvedValue.length - maxDisplay;
      
      let html = '<div class="vibegridx-multi-relationship-container">';
      displayItems.forEach(item => {
        html += `<span class="vibegridx-relationship-badge vibegridx-relationship-small">${item}</span>`;
      });
      
      if (remaining > 0) {
        html += `<span class="vibegridx-relationship-badge vibegridx-relationship-count">+${remaining}</span>`;
      }
      
      html += '</div>';
      return html;
    }
  }
  
  // Handle null/undefined/empty with proper empty state
  if (!value || (Array.isArray(value) && value.length === 0)) {
    const placeholder = column.placeholder || 'Select items...';
    return `<div class="vibegridx-cell-empty-state">
      <svg class="h-3 w-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
      </svg>
      <span class="text-xs text-muted-foreground">${placeholder}</span>
    </div>`;
  }
  
  // If we have an array of IDs with no resolved values - show count as fallback
  if (Array.isArray(value)) {
    return `<span class="vibegridx-relationship-badge vibegridx-relationship-count">${value.length} items</span>`;
  }
  
  // Single value treated as array
  return '<span class="vibegridx-relationship-badge vibegridx-relationship-count">1 item</span>';
}