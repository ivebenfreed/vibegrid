// Enhanced relationship renderer supporting all DataForge relationship types

import type { Column } from '../../../column-types'
import {
  type RelationshipData,
  type RelationshipMetadata,
  renderRelationshipField,
} from './relationship-handler'

// Re-export types for compatibility
export type { RelationshipData, RelationshipMetadata }

/**
 * Main relationship renderer function
 * Supports all DataForge relationship field types including:
 * - user_reference, custom_user_reference
 * - entity_reference, custom_entity_reference
 * - relationship-single, relationship-multi
 * - rollup relationship fields
 * - smart reference displays
 */
export function relationship(
  value: any,
  column: Column,
  relationshipData?: RelationshipData,
  rowData?: any,
  relationshipMetadata?: RelationshipMetadata,
): string {
  return renderRelationshipField(value, column, relationshipData, rowData, relationshipMetadata)
}
