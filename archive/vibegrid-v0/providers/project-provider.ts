import type { RelationshipOptionsProvider, RelationshipContext } from '../types';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/providers/project-provider.ts');

/**
 * @deprecated This atom-based provider is deprecated.
 * VibeGrid now uses Dexie-based providers configured in useDexieEntityConfig.
 * 
 * Project Provider
 * 
 * Provides all active projects as options
 * Sorted by name
 */
export const projectProvider: RelationshipOptionsProvider = async (context: RelationshipContext) => {
  fileLog.warn('⚠️ DEPRECATED: Atom-based project provider called. VibeGrid uses Dexie providers.');
  return [];
};