import type { RelationshipOptionsProvider, RelationshipContext, EnumOption, Column } from '../types';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/providers/generic-relationship-provider-dexie.ts');

/**
 * Creates a generic relationship options provider for Dexie that works with pre-loaded data
 * instead of atoms. Uses column metadata to determine the appropriate
 * filtering and sorting strategy.
 */
export function createGenericRelationshipProvider(
  column: Column,
  relationshipData: Record<string, any>
): RelationshipOptionsProvider {
  return async (context: RelationshipContext) => {
    const { currentEntity } = context;
    
    fileLog.info('🔍 Generic Relationship Provider (Dexie): Loading options', {
      columnId: column.id,
      relationshipTable: column.relationshipTable,
      relationshipEntityType: column.relationshipEntityType,
      currentEntity,
      availableData: Object.keys(relationshipData)
    });
    
    // Get the relationship table key from column metadata
    const relationshipTable = column.relationshipTable;
    if (!relationshipTable) {
      fileLog.warn('Generic provider: No relationshipTable specified for column', column.id);
      return [];
    }
    
    // Find the appropriate data for this relationship
    let targetData: Record<string, any> = {};
    
    // Try various data key naming patterns
    const dataKeys = [
      relationshipTable,
      `${relationshipTable}s`,
      relationshipTable.replace(/s$/, ''),
      `${relationshipTable.replace(/s$/, '')}s`,
      `${relationshipTable}Definitions`,
      `${relationshipTable}Definition`,
      `${relationshipTable}definitions`,
      `${relationshipTable}definition`
    ];
    
    fileLog.info('🔍 Generic Relationship Provider: Looking for data with keys:', {
      relationshipTable,
      dataKeys,
      availableKeys: Object.keys(relationshipData)
    });
    
    for (const key of dataKeys) {
      if (relationshipData[key]) {
        targetData = relationshipData[key];
        fileLog.info('🔍 Generic Relationship Provider: Found target data', {
          key,
          itemCount: Object.keys(targetData).length,
          sampleData: Object.values(targetData).slice(0, 2).map((item: any) => ({
            id: item.id,
            name: item.name,
            displayName: item.displayName
          }))
        });
        break;
      }
    }
    
    if (!targetData || Object.keys(targetData).length === 0) {
      fileLog.warn('Generic provider: No data found for relationship', relationshipTable);
      return [];
    }
    
    // Convert data to options array
    const allOptions: EnumOption[] = Object.values(targetData).map((entity: any) => ({
      value: entity.id,
      label: entity.displayName || entity.name || entity.title || entity.label || entity.id,
      metadata: entity
    }));
    
    // Apply filtering based on column configuration
    let filteredOptions = allOptions;
    
    // Handle entity-specific filtering (e.g., status definitions for a specific task)
    if (column.relationshipFilterField && currentEntity) {
      const filterField = column.relationshipFilterField;
      const filterValue = currentEntity[filterField];
      
      if (filterValue) {
        fileLog.info('🔍 Generic provider: Applying filter', {
          filterField,
          filterValue,
          beforeCount: filteredOptions.length
        });
        
        filteredOptions = filteredOptions.filter(option => {
          const entity = option.metadata;
          
          // Handle various filter patterns
          if (entity[filterField] === filterValue) return true;
          if (entity[`${filterField}Id`] === filterValue) return true;
          if (entity[`${filterField}_id`] === filterValue) return true;
          
          // Handle array filters (e.g., entity belongs to multiple groups)
          if (Array.isArray(entity[filterField]) && entity[filterField].includes(filterValue)) return true;
          
          return false;
        });
        
        fileLog.info('🔍 Generic provider: After filter', {
          afterCount: filteredOptions.length
        });
      }
    }
    
    // Apply custom relationship filtering if specified
    if (column.relationshipEntityType && column.id === 'statusId') {
      // Special handling for status definitions - filter by status set
      if (currentEntity?.statusSetId) {
        filteredOptions = filteredOptions.filter(option => {
          const statusDef = option.metadata;
          return statusDef.statusSetId === currentEntity.statusSetId;
        });
      }
    }
    
    // Sort options alphabetically by label
    filteredOptions.sort((a, b) => a.label.localeCompare(b.label));
    
    fileLog.info('🔍 Generic provider: Final options', {
      count: filteredOptions.length,
      options: filteredOptions.slice(0, 5).map(o => ({ value: o.value, label: o.label }))
    });
    
    return filteredOptions;
  };
}