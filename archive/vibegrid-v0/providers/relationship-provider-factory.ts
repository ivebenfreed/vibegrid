/**
 * Relationship Provider Factory
 *
 * Creates relationship options providers that read from the XState store
 * This ensures editing dropdowns get their data from the same source as the display
 */

import { log } from '@/logger'
import type { EnumOption, RelationshipOptionsProvider } from '../types'

const fileLog = log('components/custom/vibegrid/providers/relationship-provider-factory.ts')

/**
 * Creates a relationship options provider that reads from the store
 * @param relationshipTable - The table to read relationships from (e.g., 'users', 'projects')
 * @param getStore - Function to get the current store actor
 * @param relationshipFilter - Optional filter function to limit options based on current row
 */
export function createStoreRelationshipProvider(
  relationshipTable: string,
  getStore: () => any,
  relationshipFilter?: (row: any) => Promise<string[]> | string[],
): RelationshipOptionsProvider {
  return async (context) => {
    const store = getStore()
    if (!store) {
      fileLog.warn('RelationshipProvider: No store available')
      return []
    }

    // Get current store snapshot
    const snapshot = store.getSnapshot()
    if (!snapshot?.context?.relationships) {
      fileLog.warn('RelationshipProvider: No relationships in store context')
      return []
    }

    // Get the relationship data for this table
    const relationshipData = snapshot.context.relationships[relationshipTable]
    if (!relationshipData) {
      fileLog.warn(`RelationshipProvider: No data for table ${relationshipTable}`)
      return []
    }

    // Debug tags specifically
    if (relationshipTable === 'tags' && process.env.NODE_ENV === 'development') {
      fileLog.info('🔍 RelationshipProvider: Tags data from store', {
        tagCount: Object.keys(relationshipData).length,
        sampleTags: Object.values(relationshipData)
          .slice(0, 3)
          .map((tag: any) => ({
            id: tag.id,
            name: tag.name,
            tagSetId: tag.tagSetId,
          })),
      })
    }

    // Convert to options format
    let options: EnumOption[] = Object.values(relationshipData).map((entity: any) => {
      const option: EnumOption = {
        value: entity.id,
        label: entity.name || entity.displayName || entity.title || entity.id,
      }

      // For tags, add color and group by tagSetId
      if (relationshipTable === 'tags' && entity.tagSetId) {
        option.color = entity.color
        option.group = entity.tagSetId
      }

      return option
    })

    // Resolve tag set names for grouping
    if (relationshipTable === 'tags' && snapshot.context.relationships.tag_sets) {
      const tagSets = snapshot.context.relationships.tag_sets
      options = options.map((option) => {
        if (option.group && tagSets[option.group]) {
          return {
            ...option,
            group: tagSets[option.group].name || 'Other',
          }
        }
        return option
      })
    }

    // Apply filter if provided
    if (relationshipFilter && context?.currentEntity) {
      try {
        const allowedIds = await relationshipFilter(context.currentEntity)
        // Filter options to only include allowed IDs
        options = options.filter((option) => allowedIds.includes(option.value))

        fileLog.info('🔍 RelationshipProvider: Applied filter', {
          relationshipTable,
          originalCount: Object.keys(relationshipData).length,
          filteredCount: options.length,
          allowedIds: allowedIds.slice(0, 5),
          filteredOptions: options
            .slice(0, 3)
            .map((opt) => ({ value: opt.value, label: opt.label })),
        })

        // Debug empty results for tags
        if (relationshipTable === 'tags' && options.length === 0) {
          fileLog.warn('🔍 RelationshipProvider: No tags after filter!', {
            originalTagIds: Object.keys(relationshipData).slice(0, 10),
            allowedIds: allowedIds,
            hasCurrentEntity: !!context?.currentEntity,
          })
        }
      } catch (error) {
        fileLog.error('RelationshipProvider: Error applying filter', error)
      }
    }

    fileLog.info('🔍 RelationshipProvider: Generated options from store', {
      relationshipTable,
      optionCount: options.length,
      sampleOptions: options.slice(0, 3),
    })

    return options
  }
}

/**
 * Adds relationship providers to columns based on their type
 * @param columns - The column definitions
 * @param getStore - Function to get the current store actor
 */
export function addRelationshipProvidersToColumns(columns: any[], getStore: () => any): any[] {
  return columns.map((column) => {
    // Check if this is a relationship column
    const cellType = column.cellType || column.type
    if (cellType?.startsWith('relationship') && column.relationshipTable) {
      // Add the provider if not already present
      if (!column.relationshipOptionsProvider) {
        return {
          ...column,
          relationshipOptionsProvider: createStoreRelationshipProvider(
            column.relationshipTable,
            getStore,
            column.relationshipFilter, // Pass the filter if present
          ),
        }
      }
    }
    return column
  })
}
