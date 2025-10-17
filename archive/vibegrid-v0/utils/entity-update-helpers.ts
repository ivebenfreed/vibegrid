// Import Legend State entity operations
import { entityOperations } from '@/legend-state';
import type { VibeGridXEntityType } from '../hooks/useDexieEntityConfig';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/utils/entity-update-helpers.ts');

/**
 * Get the appropriate update function for an entity type using Legend State
 * These functions handle both local updates and sync tracking
 */
export function getUpdateFunction(entityType: VibeGridXEntityType | null) {
  return async (id: string, updates: Record<string, any>) => {
    fileLog.info('[getUpdateFunction] onEntityUpdate called with Legend State', { id, updates, entityType });
    
    if (!entityType) {
      fileLog.warn('[getUpdateFunction] No entity type provided');
      return;
    }
    
    try {
      // Convert entity type to proper case for Legend State entity names
      const entityName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
      await entityOperations.updateEntity(entityName, id, updates);
      fileLog.info(`[getUpdateFunction] Successfully updated ${entityName}:${id}`);
    } catch (error) {
      fileLog.error(`[getUpdateFunction] Failed to update ${entityType}:${id}:`, error);
      throw error;
    }
  };
}