/**
 * Relationship Entity Record Utilities
 *
 * Data mutation helpers for relationship archetype entities.
 * Extracted from EntityReferenceFieldType during SlotRegistry migration (GH#1743).
 *
 * These functions handle create/delete of relationship entity records
 * via the standard data.create/delete API when the target entity type
 * has archetype='relationship'.
 */

import { rootStore } from '@/app/stores'
import { orpcClient } from '@/shared/data/orpc/client'

/**
 * Look up schema metadata for an entity type from the SchemaRegistryStore.
 * Returns archetype and relationship metadata if available.
 */
function getRelationshipSchemaMetadata(entityTypeName: string): {
  archetype: string
  relationship?: {
    sourceEntity: string
    targetEntity: string
    semantic: string
    cardinality: string
  }
} | null {
  const schemas = rootStore.experience.schemaRegistry.schemas
  if (!schemas) return null

  const schema = schemas.byName[entityTypeName]
  if (!schema) return null

  return {
    archetype: schema.archetype || 'record',
    relationship: schema.businessMetadata?.relationship as
      | {
          sourceEntity: string
          targetEntity: string
          semantic: string
          cardinality: string
        }
      | undefined,
  }
}

/**
 * Create a relationship entity record via the standard data.create API.
 * Used when the target entity type has archetype='relationship'.
 */
export async function createRelationshipEntityRecord(
  relationshipEntityName: string,
  sourceEntityId: string,
  targetEntityId: string,
): Promise<any> {
  const meta = getRelationshipSchemaMetadata(relationshipEntityName)
  if (!meta?.relationship) {
    throw new Error(`Schema metadata not found for relationship entity: ${relationshipEntityName}`)
  }

  const { sourceEntity, targetEntity, semantic } = meta.relationship
  const result = await orpcClient.dataforge.data.create({
    entityName: relationshipEntityName,
    data: {
      source_entity_type: sourceEntity,
      source_entity_id: sourceEntityId,
      target_entity_type: targetEntity,
      target_entity_id: targetEntityId,
      semantic,
    },
  })
  return result
}

/**
 * Soft-delete a relationship entity record via the standard data.delete API.
 * Used when the target entity type has archetype='relationship'.
 */
export async function deleteRelationshipEntityRecord(
  relationshipEntityName: string,
  recordId: string,
): Promise<any> {
  const result = await orpcClient.dataforge.data.delete({
    entityName: relationshipEntityName,
    recordId,
  })
  return result
}
