import type { RelationshipOptionsProvider, RelationshipContext } from '../types';
// import type { StatusDefinition } from '@repo/dataforge/client-entities'; // DEPRECATED - no longer needed
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/providers/status-definition-provider.ts');

/**
 * @deprecated This atom-based provider is deprecated.
 * VibeGrid now uses Dexie-based providers configured in useDexieEntityConfig.
 * 
 * Status Definition Provider
 * 
 * Filters StatusDefinition options based on:
 * - StatusSet with entityType 'task' 
 * - Active status definitions only
 * - Sorted by sortOrder
 */
export const statusDefinitionProvider: RelationshipOptionsProvider = async (context: RelationshipContext) => {
  fileLog.warn('⚠️ DEPRECATED: Atom-based status definition provider called. VibeGrid uses Dexie providers.');
  return [];
};