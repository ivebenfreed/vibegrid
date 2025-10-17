/**
 * Advanced Relationship Renderer
 * 
 * Handles rendering for all relationship field types including custom user/entity references,
 * relationship fields with complex data structures, and rollup relationship fields.
 */

import type { Column } from '../../../column-types';

export interface RelationshipData {
  [tableName: string]: {
    [id: string]: {
      id: string;
      name?: string;
      title?: string;
      displayName?: string;
      email?: string;
      [key: string]: any;
    };
  };
}

export interface RelationshipMetadata {
  relationshipType: string;
  targetEntityType: string;
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  properties?: Record<string, any>;
}

/**
 * Enhanced relationship renderer supporting all DataForge relationship types
 */
export function renderRelationshipField(
  value: any,
  column: Column,
  relationshipData?: RelationshipData,
  rowData?: any,
  relationshipMetadata?: RelationshipMetadata
): string {
  // Check if we have a pre-resolved value from the backend
  if (rowData && rowData[`__resolved_${column.id}`]) {
    return rowData[`__resolved_${column.id}`];
  }
  
  // Handle null/undefined values
  if (value == null || value === '') {
    return column.placeholder || '';
  }

  const cellType = column.cellType || column.type || 'relationship-single';
  
  // Determine rendering strategy based on cell type
  switch (cellType) {
    case 'user_reference':
    case 'custom_user_reference':
      return renderUserReference(value, column, relationshipData, relationshipMetadata);
    
    case 'entity_reference':
    case 'custom_entity_reference':
      return renderEntityReference(value, column, relationshipData, relationshipMetadata);
    
    case 'relationship-single':
      return renderSingleRelationship(value, column, relationshipData);
    
    case 'relationship-multi':
    case 'relationship-collection':
      return renderMultiRelationship(value, column, relationshipData);
    
    case 'rollup_count_related':
    case 'rollup_sum_related':
    case 'rollup_average_related':
    case 'rollup_list_related':
      return renderRollupRelationship(value, column, relationshipMetadata);
    
    case 'smart_reference_display':
      return renderSmartReference(value, column, relationshipData, relationshipMetadata);
    
    case 'related_status_indicator':
      return renderStatusIndicator(value, column, relationshipData, relationshipMetadata);
    
    default:
      return String(value);
  }
}

/**
 * Render user reference relationships
 */
function renderUserReference(
  value: any,
  column: Column,
  relationshipData?: RelationshipData,
  metadata?: RelationshipMetadata
): string {
  const userTable = relationshipData?.['users'] || relationshipData?.['User'];
  if (!userTable) {
    return String(value); // No user data available
  }

  if (Array.isArray(value)) {
    // Multi-user reference
    return renderUserList(value, userTable, column);
  } else {
    // Single user reference
    const user = userTable[value];
    if (!user) return String(value);
    
    // Priority: displayName > name > email > id
    return user.displayName || user.name || user.email || user.id;
  }
}

/**
 * Render entity reference relationships
 */
function renderEntityReference(
  value: any,
  column: Column,
  relationshipData?: RelationshipData,
  metadata?: RelationshipMetadata
): string {
  const targetType = metadata?.targetEntityType || column.relationshipTable;
  const entityTable = relationshipData?.[targetType];
  
  if (!entityTable) {
    return String(value); // No entity data available
  }

  if (Array.isArray(value)) {
    // Multi-entity reference
    return renderEntityList(value, entityTable, column);
  } else {
    // Single entity reference
    const entity = entityTable[value];
    if (!entity) return String(value);
    
    // Use column display field or defaults
    const displayField = column.relationshipDisplayField || 'name';
    return entity[displayField] || entity.title || entity.name || entity.id;
  }
}

/**
 * Render single relationship (legacy format)
 */
function renderSingleRelationship(
  value: any,
  column: Column,
  relationshipData?: RelationshipData
): string {
  const relationshipTable = column.relationshipTable;
  if (!relationshipTable || !relationshipData) {
    return String(value);
  }

  const tableData = relationshipData[relationshipTable];
  if (!tableData) {
    return String(value);
  }

  const relatedEntity = tableData[value];
  if (!relatedEntity) {
    return String(value);
  }

  const displayField = column.relationshipDisplayField || 'name';
  return relatedEntity[displayField] || relatedEntity.title || relatedEntity.name || relatedEntity.id;
}

/**
 * Render multi relationship (legacy format)
 */
function renderMultiRelationship(
  value: any,
  column: Column,
  relationshipData?: RelationshipData
): string {
  const relationshipTable = column.relationshipTable;
  if (!relationshipTable || !relationshipData) {
    return String(value);
  }

  const tableData = relationshipData[relationshipTable];
  if (!tableData) {
    return String(value);
  }

  const ids = Array.isArray(value) ? value : [];
  if (ids.length === 0) {
    return column.placeholder || '';
  }

  const displayValues = ids
    .map(id => {
      const relatedEntity = tableData[id];
      if (!relatedEntity) return null;
      
      const displayField = column.relationshipDisplayField || 'name';
      return relatedEntity[displayField] || relatedEntity.title || relatedEntity.name || relatedEntity.id;
    })
    .filter(Boolean);

  return formatMultipleValues(displayValues);
}

/**
 * Render rollup relationship fields
 */
function renderRollupRelationship(
  value: any,
  column: Column,
  metadata?: RelationshipMetadata
): string {
  if (value == null || value === '') return '0';

  const rollupType = column.cellType?.replace('rollup_', '').replace('_related', '');
  
  switch (rollupType) {
    case 'count':
      return Number(value).toString();
    case 'sum':
      const sum = Number(value);
      return sum % 1 === 0 ? sum.toString() : sum.toFixed(2);
    case 'average':
      return Number(value).toFixed(2);
    case 'list':
      return Array.isArray(value) ? value.join(', ') : String(value);
    default:
      return String(value);
  }
}

/**
 * Render smart reference with contextual display
 */
function renderSmartReference(
  value: any,
  column: Column,
  relationshipData?: RelationshipData,
  metadata?: RelationshipMetadata
): string {
  // Smart reference shows different info based on context
  const relationshipType = metadata?.relationshipType;
  
  switch (relationshipType) {
    case 'assigned_to':
      return `👤 ${renderUserReference(value, column, relationshipData, metadata)}`;
    case 'owned_by':
      return `👑 ${renderUserReference(value, column, relationshipData, metadata)}`;
    case 'created_by':
      return `✨ ${renderUserReference(value, column, relationshipData, metadata)}`;
    case 'belongs_to':
      return `📂 ${renderEntityReference(value, column, relationshipData, metadata)}`;
    case 'depends_on':
      return `🔗 ${renderEntityReference(value, column, relationshipData, metadata)}`;
    default:
      return renderSingleRelationship(value, column, relationshipData);
  }
}

/**
 * Render status indicator for related entities
 */
function renderStatusIndicator(
  value: any,
  column: Column,
  relationshipData?: RelationshipData,
  metadata?: RelationshipMetadata
): string {
  // Status indicators show visual status from related entities
  if (!relationshipData || !metadata?.targetEntityType) {
    return String(value);
  }

  const targetTable = relationshipData[metadata.targetEntityType];
  if (!targetTable) return String(value);

  const relatedEntity = targetTable[value];
  if (!relatedEntity) return String(value);

  const status = relatedEntity.status || 'unknown';
  
  // Return status with emoji indicator
  const statusIcons = {
    active: '🟢',
    inactive: '🔴',
    pending: '🟡',
    completed: '✅',
    cancelled: '❌',
    draft: '📝',
    review: '👀',
    published: '🌐'
  };

  const icon = statusIcons[status.toLowerCase()] || '⚪';
  return `${icon} ${status}`;
}

/**
 * Helper: Render list of users
 */
function renderUserList(userIds: string[], userTable: any, column: Column): string {
  const users = userIds
    .map(id => userTable[id])
    .filter(Boolean)
    .map(user => user.displayName || user.name || user.email || user.id);

  return formatMultipleValues(users);
}

/**
 * Helper: Render list of entities
 */
function renderEntityList(entityIds: string[], entityTable: any, column: Column): string {
  const displayField = column.relationshipDisplayField || 'name';
  const entities = entityIds
    .map(id => entityTable[id])
    .filter(Boolean)
    .map(entity => entity[displayField] || entity.title || entity.name || entity.id);

  return formatMultipleValues(entities);
}

/**
 * Helper: Format multiple values with proper grammar
 */
function formatMultipleValues(values: string[]): string {
  if (values.length === 0) {
    return '';
  } else if (values.length === 1) {
    return values[0];
  } else if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  } else {
    return `${values[0]} and ${values.length - 1} more`;
  }
}