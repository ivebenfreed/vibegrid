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

import { orpcClient } from '@/shared/data/orpc/client'

// ====================================
// RELATIONSHIP ARCHETYPE SCHEMA CACHE
// ====================================

/**
 * Cached schema metadata for relationship archetype detection.
 * Stores the archetype and relationship businessMetadata per entity type name.
 * Populated lazily on first access per entity type, persists for the page session.
 */
const schemaCache = new Map<
  string,
  {
    archetype: string
    relationship?: {
      sourceEntity: string
      targetEntity: string
      semantic: string
      cardinality: string
    }
  } | null
>()

/**
 * Fetch and cache schema metadata for an entity type.
 * Returns cached result on subsequent calls.
 */
async function getRelationshipSchemaMetadata(entityTypeName: string): Promise<{
  archetype: string
  relationship?: {
    sourceEntity: string
    targetEntity: string
    semantic: string
    cardinality: string
  }
} | null> {
  if (schemaCache.has(entityTypeName)) {
    return schemaCache.get(entityTypeName) ?? null
  }

  try {
    const result = (await orpcClient.dataforge.schema.getEntity({
      entityName: entityTypeName,
    })) as any
    const schema = result?.entity ?? result?.schema ?? null
    if (schema) {
      const meta = {
        archetype: schema.archetype || 'record',
        relationship:
          schema.businessMetadata?.relationship ??
          schema.business_metadata?.relationship ??
          undefined,
      }
      schemaCache.set(entityTypeName, meta)
      return meta
    }
    schemaCache.set(entityTypeName, null)
    return null
  } catch {
    schemaCache.set(entityTypeName, null)
    return null
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
  const meta = await getRelationshipSchemaMetadata(relationshipEntityName)
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
