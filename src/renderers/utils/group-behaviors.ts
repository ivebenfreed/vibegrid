// ====================================
// GROUP BEHAVIORS UTILITIES
// ====================================
// Group-specific behaviors and rendering utilities

import type { GroupNode } from '../../types';

/**
 * Create expand/collapse toggle button for group headers
 */
export function createGroupToggle(
  groupNode: GroupNode,
  isExpanded: boolean,
  onToggle: (groupId: string) => void
): HTMLElement {
  const toggle = document.createElement('button');
  toggle.className = 'vibegridx-group-toggle';
  toggle.dataset.groupId = groupNode.id;
  
  Object.assign(toggle.style, {
    border: 'none',
    background: 'none',
    padding: '4px',
    marginRight: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '2px',
    width: '20px',
    height: '20px'
  });
  
  // Arrow icon (chevron right/down)
  toggle.innerHTML = isExpanded 
    ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
         <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
       </svg>`
    : `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
         <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" stroke-width="1.5" fill="none"/>
       </svg>`;
  
  // Click handler for expand/collapse
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggle(groupNode.id);
  });
  
  return toggle;
}

/**
 * Create group header content
 */
export function createGroupHeaderContent(
  groupNode: GroupNode,
  isExpanded: boolean,
  onToggle: (groupId: string) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'vibegridx-group-header-content';
  container.style.cssText = `
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0 12px;
    gap: 8px;
  `;
  
  // Expand/collapse toggle
  const toggle = createGroupToggle(groupNode, isExpanded, onToggle);
  container.appendChild(toggle);
  
  // Group title and value
  const title = document.createElement('span');
  title.className = 'vibegridx-group-title';
  title.style.cssText = `
    font-weight: 500;
    font-size: 14px;
  `;
  title.textContent = `${groupNode.field}: ${groupNode.displayValue}`;
  container.appendChild(title);
  
  // Item count badge
  const countBadge = document.createElement('span');
  countBadge.className = 'vibegridx-group-count';
  countBadge.textContent = `(${groupNode.rowCount})`;
  countBadge.style.cssText = `
    margin-left: 8px;
    padding: 2px 6px;
    background: var(--muted);
    border-radius: 4px;
    font-size: 12px;
    color: var(--muted-foreground);
  `;
  container.appendChild(countBadge);
  
  // Aggregations display
  if (groupNode.aggregations && groupNode.aggregations.length > 0) {
    const aggregationsEl = document.createElement('div');
    aggregationsEl.className = 'vibegridx-group-aggregations';
    aggregationsEl.style.cssText = `
      margin-left: auto;
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--muted-foreground);
    `;
    
    groupNode.aggregations.forEach(agg => {
      const aggEl = document.createElement('span');
      aggEl.className = 'vibegridx-group-aggregation';
      aggEl.textContent = `${agg.function}: ${agg.displayValue}`;
      aggregationsEl.appendChild(aggEl);
    });
    
    container.appendChild(aggregationsEl);
  }
  
  return container;
}

/**
 * Group data by field values
 */
export function groupDataByField<T extends Record<string, any>>(
  data: T[],
  field: string
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  
  data.forEach(item => {
    const value = String(item[field] || 'Ungrouped');
    if (!groups.has(value)) {
      groups.set(value, []);
    }
    groups.get(value)!.push(item);
  });
  
  return groups;
}

/**
 * Calculate aggregations for a group
 */
export function calculateGroupAggregations(
  groupData: any[],
  aggregations: Array<{ field: string; function: string }>
): Array<{ field: string; function: string; value: any; displayValue: string }> {
  return aggregations.map(agg => {
    const values = groupData.map(item => item[agg.field]).filter(v => v != null);
    
    let value: any;
    let displayValue: string;
    
    switch (agg.function) {
      case 'sum':
        value = values.reduce((sum, v) => sum + Number(v), 0);
        displayValue = value.toLocaleString();
        break;
      
      case 'avg':
        value = values.length > 0 
          ? values.reduce((sum, v) => sum + Number(v), 0) / values.length 
          : 0;
        displayValue = value.toFixed(2);
        break;
      
      case 'count':
        value = values.length;
        displayValue = value.toString();
        break;
      
      case 'min':
        value = values.length > 0 ? Math.min(...values.map(Number)) : 0;
        displayValue = value.toLocaleString();
        break;
      
      case 'max':
        value = values.length > 0 ? Math.max(...values.map(Number)) : 0;
        displayValue = value.toLocaleString();
        break;
      
      default:
        value = null;
        displayValue = 'N/A';
    }
    
    return {
      field: agg.field,
      function: agg.function,
      value,
      displayValue
    };
  });
}

/**
 * Apply group row styles
 */
export function applyGroupRowStyles(element: HTMLElement): void {
  Object.assign(element.style, {
    backgroundColor: 'var(--muted/50)',
    borderBottom: '1px solid var(--border)',
    fontWeight: '500',
    fontSize: '14px'
  });
}

/**
 * Apply summary row styles
 */
export function applySummaryRowStyles(element: HTMLElement): void {
  Object.assign(element.style, {
    backgroundColor: 'var(--accent/10)',
    borderTop: '1px solid var(--accent)',
    fontWeight: '500',
    fontSize: '13px'
  });
}