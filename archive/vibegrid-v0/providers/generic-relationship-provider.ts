import { log } from '@/logger'
import type { Column, EnumOption, RelationshipContext, RelationshipOptionsProvider } from '../types'

const fileLog = log('components/custom/vibegrid/providers/generic-relationship-provider.ts')

/**
 * Generic relationship provider for VibeGrid components.
 */
export function createGenericRelationshipProvider(
  column: Column,
  relationshipAtoms: Record<string, any>,
): RelationshipOptionsProvider {
  return async (context: RelationshipContext) => {
    fileLog.warn(
      '⚠️ DEPRECATED: Atom-based relationship provider called. Use Dexie-based provider instead.',
      {
        columnId: column.id,
        relationshipTable: column.relationshipTable,
      },
    )

    // This provider is deprecated - return empty array
    return []
  }
}
