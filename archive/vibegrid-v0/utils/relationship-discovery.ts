/**
 * Relationship Discovery Utilities
 * 
 * Dynamically discovers relationship configurations from column definitions
 * to avoid hardcoding specific entity relationships
 */

import type { Column } from '../types';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/utils/relationship-discovery.ts');

export interface RelationshipConfig {
  fieldName: string;           // e.g., 'projectId', 'assigneeId', 'tags'
  columnId: string;            // e.g., 'project', 'assignee', 'tags'
  relationshipTable: string;   // e.g., 'projects', 'users', 'tags'
  displayField: string;        // e.g., 'name', 'displayName'
  resolvedFieldName: string;   // e.g., '__resolved_project'
  // For many-to-many relationships
  junctionTable?: string;      // e.g., 'task_tags'
  junctionSourceField?: string; // e.g., 'task_id'
  junctionTargetField?: string; // e.g., 'tag_id'
  isMultiple?: boolean;        // true for relationship-multi
}

/**
 * Discovers all relationship configurations from column definitions
 */
export function discoverRelationships(columns: Column[]): RelationshipConfig[] {
  const relationships: RelationshipConfig[] = [];
  
  columns.forEach(column => {
    const cellType = column.cellType || column.type;
    
    // Check if this is a relationship column
    if (cellType?.startsWith('relationship') && column.relationshipTable) {
      const fieldName = column.field || column.id;
      
      relationships.push({
        fieldName,
        columnId: column.id,
        relationshipTable: column.relationshipTable,
        displayField: column.relationshipDisplayField || 'name',
        resolvedFieldName: `__resolved_${column.id}`,
        // Add junction table info if present
        junctionTable: (column as any).junctionTable,
        junctionSourceField: (column as any).junctionSourceField,
        junctionTargetField: (column as any).junctionTargetField,
        isMultiple: cellType === 'relationship-multi'
      });
    }
  });
  
  return relationships;
}

/**
 * Gets unique relationship tables from columns
 */
export function getUniqueRelationshipTables(columns: Column[]): string[] {
  const relationships = discoverRelationships(columns);
  const tables = new Set(relationships.map(r => r.relationshipTable));
  return Array.from(tables);
}

/**
 * Gets unique junction tables from columns
 */
export function getUniqueJunctionTables(columns: Column[]): string[] {
  const relationships = discoverRelationships(columns);
  const junctionTables = relationships
    .filter(r => r.junctionTable)
    .map(r => r.junctionTable!);
  return Array.from(new Set(junctionTables));
}

/**
 * Creates a map of field names to their relationship configs
 */
export function createRelationshipMap(columns: Column[]): Map<string, RelationshipConfig> {
  const relationships = discoverRelationships(columns);
  const map = new Map<string, RelationshipConfig>();
  
  relationships.forEach(config => {
    map.set(config.fieldName, config);
  });
  
  return map;
}

/**
 * Extracts relationship IDs from entities for a specific relationship
 */
export function extractRelationshipIds(
  entities: any[],
  relationshipConfig: RelationshipConfig
): Set<string> {
  const ids = new Set<string>();
  
  entities.forEach(entity => {
    const value = entity[relationshipConfig.fieldName];
    if (value) {
      if (Array.isArray(value)) {
        value.forEach(id => ids.add(id));
      } else {
        ids.add(value);
      }
    }
  });
  
  return ids;
}

/**
 * Resolves entity relationships dynamically based on column configuration
 */
export function resolveEntityRelationships(
  entity: any,
  relationships: Map<string, any>,
  relationshipConfigs: RelationshipConfig[]
): any {
  const resolved = { ...entity };
  
  relationshipConfigs.forEach(config => {
    const relationshipValue = entity[config.fieldName];
    
    // Minimal logging for debugging - only for first few entities
    if (config.fieldName === 'tags' && relationshipValue && relationshipValue.length > 0 && Math.random() < 0.05) {
      fileLog.info(`🔍 Relationship Discovery: Processing ${relationshipValue.length} tags for entity ${entity.id}`);
    }
    
    if (relationshipValue && relationships[config.relationshipTable]) {
      // Handle many-to-many relationships (arrays) and single relationships
      if (Array.isArray(relationshipValue)) {
        // Many-to-many relationship
        const resolvedNames = relationshipValue
          .map(id => {
            const relatedEntity = relationships[config.relationshipTable][id];
            return relatedEntity ? (
              relatedEntity[config.displayField] || 
              relatedEntity.name || 
              relatedEntity.displayName || 
              relatedEntity.title || 
              id
            ) : null;
          })
          .filter(name => name !== null);
        
        resolved[config.resolvedFieldName] = resolvedNames;
        
        // Minimal logging for debugging - only sample entities
        if (config.fieldName === 'tags' && resolvedNames.length > 0 && Math.random() < 0.05) {
          fileLog.info(`🔍 Relationship Discovery: Resolved ${resolvedNames.length} tag names for entity ${entity.id}:`, resolvedNames);
        }
      } else {
        // Single relationship
        const relatedEntity = relationships[config.relationshipTable][relationshipValue];
        if (relatedEntity) {
          resolved[config.resolvedFieldName] = 
            relatedEntity[config.displayField] || 
            relatedEntity.name || 
            relatedEntity.displayName || 
            relatedEntity.title || 
            relationshipValue;
        } else {
          resolved[config.resolvedFieldName] = '';
        }
      }
    } else {
      resolved[config.resolvedFieldName] = Array.isArray(relationshipValue) ? [] : '';
    }
  });
  
  return resolved;
}