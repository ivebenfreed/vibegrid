import { log } from '@/logger'
import type { RelationshipContext, RelationshipOptionsProvider } from '../types'

const fileLog = log('components/custom/vibegrid/providers/user-provider.ts')

/**
 * @deprecated This atom-based provider is deprecated.
 * VibeGrid now uses Dexie-based providers configured in useDexieEntityConfig.
 *
 * User Provider
 *
 * Provides all users as options for assignment
 * Sorted by displayName/name
 */
export const userProvider: RelationshipOptionsProvider = async (context: RelationshipContext) => {
  fileLog.warn('⚠️ DEPRECATED: Atom-based user provider called. VibeGrid uses Dexie providers.')
  return []
}
