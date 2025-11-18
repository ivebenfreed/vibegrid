// ====================================
// GROUP PROCESSOR
// ====================================
// Processes raw entity data into grouped virtual rows
// Handles hierarchical grouping and aggregations

import type {
  TableRow,
  Column,
  CellType,
  GroupNode,
  GroupConfig,
  GroupField,
  GroupAggregation,
  AggregationConfig,
  VirtualRow,
  VirtualRowType
} from '../types';
import type { GroupRowOrderConfig } from '../stores/TableCoreStore';
import { createLogger } from '@/shared/lib/logging';

const fileLog = createLogger('GroupProcessor');

// ====================================
// CONSTANTS
// ====================================

const DATA_ROW_HEIGHT = 40;
const GROUP_ROW_HEIGHT = 44;
const SUMMARY_ROW_HEIGHT = 36;

// ====================================
// GROUP TREE STRUCTURE
// ====================================

interface GroupTree {
  groups: GroupNode[];
  virtualRows: VirtualRow[];
  totalHeight: number;
  groupCount: number;
}

// ====================================
// GROUP PROCESSOR CLASS
// ====================================

export class GroupProcessor {
  
  // ====================================
  // MAIN PROCESSING METHOD
  // ====================================
  
  static processData(
    rows: TableRow[],
    columns: Column[],
    config: GroupConfig,
    groupRowOrders?: Record<string, GroupRowOrderConfig>
  ): GroupTree {
    fileLog.debug('GroupProcessor: processData called', {
      rowCount: rows.length,
      columnCount: columns.length,
      groupFieldCount: config.fields.length,
      hasAggregations: config.aggregations.length > 0
    });
    
    if (config.fields.length === 0) {
      // No grouping - return flat virtual rows
      return this.createFlatVirtualRows(rows);
    }
    
    // Build group hierarchy
    const groupTree = this.buildGroupHierarchy(rows, columns, config, groupRowOrders);

    // Calculate aggregations
    this.calculateAggregations(groupTree.groups, rows, columns, config);
    
    // Generate virtual rows from group tree
    const virtualRows = this.flattenGroupTree(groupTree.groups, config.expandedGroups);
    
    // Calculate total height
    const totalHeight = virtualRows.reduce((sum, row) => sum + row.height, 0);
    
    const result: GroupTree = {
      groups: groupTree.groups,
      virtualRows,
      totalHeight,
      groupCount: this.countGroups(groupTree.groups)
    };
    
    fileLog.debug('GroupProcessor: processData completed', {
      originalRows: rows.length,
      virtualRows: virtualRows.length,
      groupCount: result.groupCount,
      totalHeight
    });
    
    return result;
  }
  
  // ====================================
  // GROUP HIERARCHY BUILDING
  // ====================================
  
  private static buildGroupHierarchy(
    rows: TableRow[],
    columns: Column[],
    config: GroupConfig,
    groupRowOrders?: Record<string, GroupRowOrderConfig>
  ): { groups: GroupNode[] } {

    if (config.fields.length === 1) {
      return { groups: this.buildSingleLevelGroups(rows, columns, config, groupRowOrders) };
    } else {
      return { groups: this.buildMultiLevelGroups(rows, columns, config, groupRowOrders) };
    }
  }
  
  private static buildSingleLevelGroups(
    rows: TableRow[],
    columns: Column[],
    config: GroupConfig,
    groupRowOrders?: Record<string, GroupRowOrderConfig>
  ): GroupNode[] {
    const groupField = config.fields[0];
    const fieldName = groupField.field;

    // Find the column definition for this field to get possible options
    const column = columns.find(col => col.id === fieldName);

    // Group rows by field value
    const groupMap = new Map<string, TableRow[]>();

    // First, if the column has predefined options, create empty groups for all possible values
    if (column && column.options && Array.isArray(column.options) && column.options.length > 0) {
      column.options.forEach(option => {
        let optionValue: string;
        if (typeof option === 'string') {
          optionValue = option;
        } else if (option && typeof option === 'object' && 'value' in option) {
          optionValue = option.value;
        } else {
          fileLog.warn('GroupProcessor: Invalid option format', { option, fieldName });
          return;
        }

        const groupKey = this.getGroupKey(optionValue);
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, []); // Create empty group
        }
      });

      fileLog.debug('🔄 GroupProcessor: Created empty groups for all options', {
        fieldName,
        optionCount: column.options.length,
        emptyGroupKeys: Array.from(groupMap.keys())
      });
    }

    // Then populate groups with actual data rows
    rows.forEach((row, index) => {
      // Debug: log the actual data structure to understand the format
      if (index === 0) {
        fileLog.debug('🔍 GroupProcessor: Examining first row structure', {
          row: row,
          hasData: !!(row as any)?.data,
          hasDirectAccess: !!(row as any)?.[fieldName],
          rowKeys: Object.keys(row || {}),
          fieldName,
          fieldValue: (row as any)?.[fieldName] || (row as any)?.data?.[fieldName]
        });
      }

      // Handle different data structures - try both row.data and direct row access
      let value;
      if (row && (row as any).data) {
        // Structured format: row.data.fieldName
        value = (row as any).data[fieldName];
      } else if (row && typeof row === 'object') {
        // Direct format: row.fieldName
        value = (row as any)[fieldName];
      } else {
        fileLog.warn('GroupProcessor: Skipping invalid row', { row, fieldName });
        return;
      }

      const groupKey = this.getGroupKey(value);

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      groupMap.get(groupKey)!.push(row);
    });
    
    // Convert to GroupNode array
    const groups: GroupNode[] = [];
    let sortOrder = 0;
    
    groupMap.forEach((groupRows, groupKey) => {
      const firstRow = groupRows[0];

      // For empty groups, derive the value from the groupKey
      // For non-empty groups, get value from the first row
      let value;
      if (groupRows.length === 0) {
        // Empty group - derive value from groupKey
        // The groupKey is created by getGroupKey() which normalizes the value
        // We need to reverse this process to get the original value
        value = this.getValueFromGroupKey(groupKey);
        fileLog.debug('🔄 GroupProcessor: Using derived value for empty group', {
          groupKey,
          derivedValue: value,
          fieldName
        });
      } else {
        // Non-empty group - get value from first row
        if (firstRow && (firstRow as any).data) {
          // Structured format: row.data.fieldName
          value = (firstRow as any).data[fieldName];
        } else if (firstRow && typeof firstRow === 'object') {
          // Direct format: row.fieldName
          value = (firstRow as any)[fieldName];
        } else {
          fileLog.warn('GroupProcessor: Invalid firstRow in groupMap', { firstRow, fieldName });
          return;
        }
      }

      const groupId = `group_${fieldName}_${groupKey}`;

      // Apply custom row ordering if available (only for non-empty groups)
      let orderedChildren = groupRows;
      if (groupRows.length > 0 && groupRowOrders && groupRowOrders[groupId]) {
        orderedChildren = this.applyCustomRowOrdering(groupRows, groupRowOrders[groupId]);
        fileLog.debug('✅ Applied custom row ordering', {
          groupId,
          originalCount: groupRows.length,
          orderedCount: orderedChildren.length
        });
      }

      const groupNode: GroupNode = {
        id: groupId,
        field: fieldName,
        value: value,
        displayValue: this.formatGroupValue(value, fieldName, columns),
        level: 0,
        rowCount: orderedChildren.length,
        totalCount: orderedChildren.length,
        children: orderedChildren,
        isCollapsed: !config.expandedGroups.has(groupId),
        sortOrder: sortOrder++,
        aggregations: [] // Will be filled by calculateAggregations
      };

      groups.push(groupNode);
    });
    
    // Sort groups
    this.sortGroups(groups, config);
    
    return groups;
  }
  
  private static buildMultiLevelGroups(
    rows: TableRow[],
    columns: Column[],
    config: GroupConfig,
    groupRowOrders?: Record<string, GroupRowOrderConfig>
  ): GroupNode[] {
    
    const buildLevel = (
      remainingRows: TableRow[], 
      fieldIndex: number, 
      parentId?: string
    ): GroupNode[] => {
      
      if (fieldIndex >= config.fields.length) {
        return [];
      }
      
      const groupField = config.fields[fieldIndex];
      const fieldName = groupField.field;
      const isLastLevel = fieldIndex === config.fields.length - 1;
      
      // Group by current field
      const groupMap = new Map<string, TableRow[]>();
      
      remainingRows.forEach(row => {
        // Handle different data structures - try both row.data and direct row access
        let value;
        if (row && row.data) {
          // Structured format: row.data.fieldName
          value = row.data[fieldName];
        } else if (row && typeof row === 'object') {
          // Direct format: row.fieldName
          value = row[fieldName];
        } else {
          fileLog.warn('GroupProcessor: Skipping invalid row in multi-level grouping', { row, fieldName });
          return;
        }

        const groupKey = this.getGroupKey(value);

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, []);
        }
        groupMap.get(groupKey)!.push(row);
      });
      
      // Create groups
      const groups: GroupNode[] = [];
      let sortOrder = 0;
      
      groupMap.forEach((groupRows, groupKey) => {
        const firstRow = groupRows[0];

        // Handle different data structures - try both row.data and direct row access
        let value;
        if (firstRow && firstRow.data) {
          // Structured format: row.data.fieldName
          value = firstRow.data[fieldName];
        } else if (firstRow && typeof firstRow === 'object') {
          // Direct format: row.fieldName
          value = firstRow[fieldName];
        } else {
          fileLog.warn('GroupProcessor: Invalid firstRow in multi-level groupMap', { firstRow, fieldName });
          return;
        }
        const groupId = `group_${fieldName}_${groupKey}${parentId ? `_${parentId}` : ''}`;
        
        const groupNode: GroupNode = {
          id: groupId,
          field: fieldName,
          value: value,
          displayValue: this.formatGroupValue(value, fieldName, columns),
          level: fieldIndex,
          parentId: parentId,
          rowCount: groupRows.length,
          isCollapsed: !config.expandedGroups.has(groupId),
          sortOrder: sortOrder++,
          aggregations: [],
          children: isLastLevel 
            ? groupRows 
            : buildLevel(groupRows, fieldIndex + 1, groupId)
        };
        
        // Calculate totalCount for nested groups
        if (!isLastLevel) {
          groupNode.totalCount = this.calculateTotalCount(groupNode);
        } else {
          groupNode.totalCount = groupRows.length;
        }
        
        groups.push(groupNode);
      });
      
      // Sort groups
      this.sortGroups(groups, config);
      
      return groups;
    };
    
    return buildLevel(rows, 0);
  }
  
  // ====================================
  // AGGREGATION CALCULATIONS
  // ====================================
  
  private static calculateAggregations(
    groups: GroupNode[], 
    allRows: TableRow[], 
    columns: Column[], 
    config: GroupConfig
  ): void {
    
    if (config.aggregations.length === 0) {
      return;
    }
    
    const calculateForGroup = (group: GroupNode): void => {
      const aggregations: GroupAggregation[] = [];
      
      // Get all data rows in this group (recursively)
      const groupRows = this.getGroupDataRows(group);
      
      config.aggregations.forEach(aggConfig => {
        const fieldValues = groupRows
          .map(row => {
            // Handle different data structures - try both row.data and direct row access
            if (row && (row as any).data) {
              return (row as any).data[aggConfig.field];
            } else if (row && typeof row === 'object') {
              return (row as any)[aggConfig.field];
            } else {
              return null;
            }
          })
          .filter(val => val !== null && val !== undefined && val !== '');
        
        if (fieldValues.length === 0) {
          return;
        }
        
        let result: number | string;
        let displayValue: string;
        
        switch (aggConfig.function) {
          case 'count':
            result = fieldValues.length;
            displayValue = result.toString();
            break;
            
          case 'sum':
            result = fieldValues.reduce((sum, val) => sum + (Number(val) || 0), 0);
            displayValue = this.formatNumber(result as number);
            break;
            
          case 'avg':
            const sum = fieldValues.reduce((sum, val) => sum + (Number(val) || 0), 0);
            result = sum / fieldValues.length;
            displayValue = this.formatNumber(result, 2);
            break;
            
          case 'min':
            result = Math.min(...fieldValues.map(v => Number(v) || 0));
            displayValue = this.formatNumber(result);
            break;
            
          case 'max':
            result = Math.max(...fieldValues.map(v => Number(v) || 0));
            displayValue = this.formatNumber(result);
            break;
            
          case 'unique':
            const uniqueValues = new Set(fieldValues);
            result = uniqueValues.size;
            displayValue = `${result} unique`;
            break;
            
          default:
            return;
        }
        
        aggregations.push({
          field: aggConfig.field,
          function: aggConfig.function,
          value: result,
          displayValue: aggConfig.displayName 
            ? `${aggConfig.displayName}: ${displayValue}`
            : `${aggConfig.function}: ${displayValue}`
        });
      });
      
      group.aggregations = aggregations;
      
      // Recursively calculate for child groups
      if (Array.isArray(group.children) && group.children.length > 0) {
        const childGroups = group.children.filter(child => 'field' in child) as GroupNode[];
        childGroups.forEach(calculateForGroup);
      }
    };
    
    groups.forEach(calculateForGroup);
  }
  
  // ====================================
  // VIRTUAL ROW GENERATION
  // ====================================
  
  static flattenGroupTree(
    groups: GroupNode[], 
    expandedGroups: Set<string>
  ): VirtualRow[] {
    
    fileLog.debug('GroupProcessor.flattenGroupTree called', {
      groupCount: groups.length,
      expandedGroups: Array.from(expandedGroups),
      firstGroupId: groups[0]?.id,
      firstGroupChildren: groups[0]?.children?.length || 0
    });
    
    const virtualRows: VirtualRow[] = [];
    let index = 0;
    
    const addGroupAndChildren = (group: GroupNode, level: number): void => {
      // Add group header row
      virtualRows.push({
        type: 'group',
        id: group.id,
        index: index++,
        height: GROUP_ROW_HEIGHT,
        data: group,
        level: level,
        isExpandable: true
      });
      
      fileLog.debug('GroupProcessor: Processing group', {
        groupId: group.id,
        isExpanded: expandedGroups.has(group.id),
        childrenCount: group.children?.length || 0,
        level
      });
      
      // Add children if group is expanded
      if (expandedGroups.has(group.id)) {
        fileLog.debug('GroupProcessor: Group is expanded, adding children', {
          groupId: group.id,
          childrenCount: group.children.length
        });
        
        group.children.forEach(child => {
          if ('field' in child) {
            // Child is a group
            addGroupAndChildren(child as GroupNode, level + 1);
          } else {
            // Child is a data row
            virtualRows.push({
              type: 'data',
              id: child.id,
              index: index++,
              height: DATA_ROW_HEIGHT,
              data: child,
              level: level + 1,
              parentGroupId: group.id,
              groupId: group.id  // Add groupId for drag-drop compatibility
            });
          }
        });
      } else {
        fileLog.debug('GroupProcessor: Group is collapsed, not adding children', {
          groupId: group.id
        });
      }
    };
    
    groups.forEach(group => addGroupAndChildren(group, 0));
    
    fileLog.debug('GroupProcessor.flattenGroupTree result', {
      totalVirtualRows: virtualRows.length,
      groupRows: virtualRows.filter(vr => vr.type === 'group').length,
      dataRows: virtualRows.filter(vr => vr.type === 'data').length
    });
    
    return virtualRows;
  }
  
  private static createFlatVirtualRows(rows: TableRow[]): GroupTree {
    const virtualRows: VirtualRow[] = rows.map((row, index) => ({
      type: 'data' as VirtualRowType,
      id: row.id,
      index,
      height: DATA_ROW_HEIGHT,
      data: row
    }));
    
    return {
      groups: [],
      virtualRows,
      totalHeight: virtualRows.length * DATA_ROW_HEIGHT,
      groupCount: 0
    };
  }
  
  // ====================================
  // UTILITY METHODS
  // ====================================
  
  private static getGroupKey(value: any): string {
    if (value === null || value === undefined) {
      return '__null__';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Reverse operation of getGroupKey - convert groupKey back to original value
   */
  private static getValueFromGroupKey(groupKey: string): any {
    if (groupKey === '__null__') {
      return null;
    }

    // Try to parse as JSON (for object values)
    if (groupKey.startsWith('{') || groupKey.startsWith('[')) {
      try {
        return JSON.parse(groupKey);
      } catch (e) {
        // If JSON parsing fails, treat as string
        return groupKey;
      }
    }

    // Return as string (the most common case)
    return groupKey;
  }
  
  private static formatGroupValue(value: any, fieldName: string, columns: Column[]): string {
    if (value === null || value === undefined) {
      return '(Empty)';
    }
    
    // Find column definition for formatting hints
    const column = columns.find(col => col.field === fieldName || col.id === fieldName);
    
    if (column?.cellType === 'date' && value instanceof Date) {
      return value.toLocaleDateString();
    }
    
    if (column?.cellType === 'boolean') {
      return value ? (column.trueLabel || 'Yes') : (column.falseLabel || 'No');
    }

    // Check for select/enum types that have options
    if (column?.cellType && ['select', 'single-select', 'select-multi', 'multi-select'].includes(column.cellType as string) && column?.enumOptions) {
      const option = column?.enumOptions.find(opt => opt.value === value);
      return option?.label || String(value);
    }

    return String(value);
  }
  
  private static formatNumber(value: number, decimals?: number): string {
    if (decimals !== undefined) {
      return value.toFixed(decimals);
    }
    return value.toLocaleString();
  }
  
  private static sortGroups(groups: GroupNode[], config: GroupConfig): void {
    groups.sort((a, b) => {
      let comparison = 0;
      
      switch (config.sortBy) {
        case 'name':
          comparison = a.displayValue.localeCompare(b.displayValue);
          break;
        case 'count':
          comparison = (b.totalCount || b.rowCount) - (a.totalCount || a.rowCount);
          break;
        case 'custom':
          comparison = (a.sortOrder || 0) - (b.sortOrder || 0);
          break;
      }
      
      return config.sortDirection === 'desc' ? -comparison : comparison;
    });
  }
  
  private static calculateTotalCount(group: GroupNode): number {
    if (Array.isArray(group.children) && group.children.length > 0) {
      return group.children.reduce((total, child) => {
        if ('field' in child) {
          // Child is a group
          return total + this.calculateTotalCount(child as GroupNode);
        } else {
          // Child is a data row
          return total + 1;
        }
      }, 0);
    }
    return group.rowCount;
  }
  
  private static getGroupDataRows(group: GroupNode): TableRow[] {
    const dataRows: TableRow[] = [];
    
    const collectRows = (node: GroupNode): void => {
      if (Array.isArray(node.children)) {
        node.children.forEach(child => {
          if ('field' in child) {
            // Child is a group
            collectRows(child as GroupNode);
          } else {
            // Child is a data row
            dataRows.push(child);
          }
        });
      }
    };
    
    collectRows(group);
    return dataRows;
  }
  
  private static countGroups(groups: GroupNode[]): number {
    let count = groups.length;
    
    groups.forEach(group => {
      if (Array.isArray(group.children)) {
        const childGroups = group.children.filter(child => 'field' in child) as GroupNode[];
        count += this.countGroups(childGroups);
      }
    });
    
    return count;
  }

  /**
   * Apply custom row ordering from GroupRowOrderConfig
   */
  private static applyCustomRowOrdering(
    rows: TableRow[],
    orderConfig: GroupRowOrderConfig
  ): TableRow[] {
    if (!orderConfig.rowIds.length) {
      return rows;
    }

    const orderedRows: TableRow[] = [];
    const rowsById = new Map(rows.map(row => [row.id, row]));

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

    return orderedRows;
  }
}