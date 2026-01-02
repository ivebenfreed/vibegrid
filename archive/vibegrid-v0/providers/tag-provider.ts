import { log } from '@/logger'
import type { RelationshipContext, RelationshipOptionsProvider } from '../types'

const fileLog = log('components/custom/vibegrid/providers/tag-provider.ts')

/**
 * @deprecated This atom-based provider is deprecated.
 * VibeGrid now uses Dexie-based providers configured in useDexieEntityConfig.
 *
 * Tag Provider
 *
 * Filters Tag options based on:
 * - Associated TagSets for the current project (if available)
 * - Active tags only
 * - Sorted by sortOrder
 */
export const tagProvider: RelationshipOptionsProvider = async (context: RelationshipContext) => {
  fileLog.warn('⚠️ DEPRECATED: Atom-based tag provider called. VibeGrid uses Dexie providers.')
  return []
}
