/**
 * Entity Reference Field Type Implementation
 *
 * Handles custom_entity_reference and entity_reference field types with dynamic target entities.
 */

import { reaction } from 'mobx'
import { orpcClient } from '@/shared/data/orpc/client'
import { getLogger } from '@/shared/lib/logging'
import type { FieldTypeAffordance } from '../../../affordances/types'
import type { TableCoreStore } from '../../../stores/TableCoreStore'
import type {
  AsyncDataLoader,
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  RelationshipData,
  RelationshipOption,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

const logger = getLogger(
  'components/vibegrid/field-types/implementations/relationship/EntityReferenceFieldType',
)

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
 * Check if a given entity type name corresponds to a relationship archetype schema.
 * Results are cached per entity type to avoid repeated network calls.
 */
async function isRelationshipEntityType(targetEntity: string): Promise<boolean> {
  const meta = await getRelationshipSchemaMetadata(targetEntity)
  return meta?.archetype === 'relationship'
}

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

export class EntityDataLoader implements AsyncDataLoader {
  async loadRelationshipData(
    column: EnhancedColumn,
    rowIds: string[],
    _tableCore$: TableCoreStore,
  ): Promise<RelationshipData> {
    const orgId = this.getOrgId()
    const targetEntity =
      column.relationshipConfig?.targetEntityType ||
      (column.targetEntityType as string) ||
      'Unknown'

    try {
      // Check if this field targets a relationship archetype entity type
      const isRelArchetype = await isRelationshipEntityType(targetEntity)

      if (isRelArchetype) {
        // Route to entity_records query for relationship archetype entities
        return await this.loadRelationshipDataFromEntityRecords(targetEntity, rowIds)
      }

      // Fallback: existing entity_relationships endpoint
      const response = await fetch(
        `/api/dataforge/orgs/${orgId}/relationships/${targetEntity.toLowerCase()}?rowIds=${rowIds.join(',')}`,
      )
      if (!response.ok) throw new Error(`Failed to load ${targetEntity} data: ${response.status}`)

      const result = (await response.json()) as { data?: RelationshipData }
      return result.data || {}
    } catch (error) {
      logger.error('Failed to load entity relationship data', { error, column: column.id })
      throw error
    }
  }

  /**
   * Load relationship data from entity_records for relationship archetype entities.
   * Queries entity_records for the relationship entity type and transforms results
   * into the RelationshipData format expected by the renderer.
   */
  private async loadRelationshipDataFromEntityRecords(
    relationshipEntityName: string,
    rowIds: string[],
  ): Promise<RelationshipData> {
    const meta = await getRelationshipSchemaMetadata(relationshipEntityName)
    if (!meta?.relationship) return {}

    const { targetEntity: actualTargetEntity } = meta.relationship

    try {
      // Query all records of this relationship entity type
      const result = await orpcClient.dataforge.data.query({
        entityName: relationshipEntityName,
        limit: 1000,
      })

      const records = result?.data || []

      // Filter to records where source_entity_id is in our rowIds
      const rowIdSet = new Set(rowIds)
      const matchingRecords = records.filter((r: any) => rowIdSet.has(r.source_entity_id))

      // Build RelationshipData keyed by target entity type (lowercase) and target entity ID
      const relationshipData: RelationshipData = {}
      const targetKey = actualTargetEntity.toLowerCase()
      relationshipData[targetKey] = {}

      // For each matching relationship record, fetch the target entity data
      const targetIds = [...new Set(matchingRecords.map((r: any) => r.target_entity_id))]
      for (const targetId of targetIds) {
        try {
          const targetResult = await orpcClient.dataforge.data.get({
            entityName: actualTargetEntity,
            recordId: targetId,
          })
          if (targetResult?.data) {
            relationshipData[targetKey][targetId] = targetResult.data
          }
        } catch {
          logger.warn('Failed to fetch target entity for relationship', {
            targetId,
            targetEntity: actualTargetEntity,
          })
        }
      }

      return relationshipData
    } catch (error) {
      logger.error('Failed to load relationship data from entity_records', {
        error,
        relationshipEntityName,
      })
      return {}
    }
  }

  resolveDisplayValue(
    value: any,
    column: EnhancedColumn,
    relationshipData: RelationshipData,
  ): string {
    if (value == null) return ''

    const entityId = String(value)
    const targetEntity = column.relationshipConfig?.targetEntityType?.toLowerCase() || 'unknown'
    const entityData = relationshipData[targetEntity]?.[entityId]

    if (entityData) {
      const displayField = column.relationshipConfig?.displayField || 'name'
      return entityData[displayField] || entityData.name || entityData.title || entityData.id
    }

    return `${column.relationshipConfig?.targetEntityType || 'Entity'} ${entityId}`
  }

  async getSearchSuggestions(
    query: string,
    column: EnhancedColumn,
    limit: number = 10,
  ): Promise<RelationshipOption[]> {
    const orgId = this.getOrgId()
    const targetEntity = column.relationshipConfig?.targetEntityType || 'Unknown'

    try {
      // Check if this field targets a relationship archetype entity type
      const isRelArchetype = await isRelationshipEntityType(targetEntity)

      if (isRelArchetype) {
        // For relationship archetype, search the actual target entity type
        // (e.g., "Company"), not the relationship entity type (e.g., "ProjectVendor")
        return await this.getSearchSuggestionsForRelationshipEntity(
          targetEntity,
          query,
          column,
          limit,
        )
      }

      // Fallback: existing search endpoint
      const searchParams = new URLSearchParams({
        q: query,
        limit: String(limit),
        fields: column.relationshipConfig?.searchFields?.join(',') || 'name,title',
      })

      const response = await fetch(
        `/api/dataforge/orgs/${orgId}/data/${targetEntity}/search?${searchParams}`,
      )
      if (!response.ok) throw new Error(`${targetEntity} search failed: ${response.status}`)

      const results = (await response.json()) as { data?: any[] }
      const displayField = column.relationshipConfig?.displayField || 'name'

      return (results.data || []).map((item: any) => ({
        value: item.id,
        label: item[displayField] || item.name || item.title || item.id,
        metadata: item,
      }))
    } catch (error) {
      logger.error('Failed to search target entity', { error, query, targetEntity })
      return []
    }
  }

  /**
   * Search suggestions for relationship archetype entities.
   * Searches the actual target entity type (from schema metadata), not the relationship entity itself.
   */
  private async getSearchSuggestionsForRelationshipEntity(
    relationshipEntityName: string,
    query: string,
    column: EnhancedColumn,
    limit: number,
  ): Promise<RelationshipOption[]> {
    const meta = await getRelationshipSchemaMetadata(relationshipEntityName)
    if (!meta?.relationship) return []

    const actualTargetEntity = meta.relationship.targetEntity
    const orgId = this.getOrgId()
    const displayField = column.relationshipConfig?.displayField || 'name'

    try {
      const searchParams = new URLSearchParams({
        q: query,
        limit: String(limit),
        fields: column.relationshipConfig?.searchFields?.join(',') || 'name,title',
      })

      const response = await fetch(
        `/api/dataforge/orgs/${orgId}/data/${actualTargetEntity}/search?${searchParams}`,
      )
      if (!response.ok) throw new Error(`${actualTargetEntity} search failed: ${response.status}`)

      const results = (await response.json()) as { data?: any[] }

      return (results.data || []).map((item: any) => ({
        value: item.id,
        label: item[displayField] || item.name || item.title || item.id,
        metadata: item,
      }))
    } catch (error) {
      logger.error('Failed to search target entity for relationship archetype', {
        error,
        query,
        relationshipEntityName,
        actualTargetEntity,
      })
      return []
    }
  }

  getCacheKey(column: EnhancedColumn, value: any): string {
    const targetEntity = column.relationshipConfig?.targetEntityType || 'unknown'
    return `entity_ref:${targetEntity}:${column.id}:${String(value)}`
  }

  invalidateCache(column: EnhancedColumn): void {
    logger.debug('Invalidating entity reference cache', { column: column.id })
  }

  private getOrgId(): string {
    try {
      const path = window.location.pathname
      const orgMatch = path.match(/\/org\/([^/]+)/)
      if (orgMatch) {
        return orgMatch[1]
      }
      return '01920000-1000-7000-8000-000000000001'
    } catch (error) {
      logger.warn('Failed to get org ID from URL', { error })
      return '01920000-1000-7000-8000-000000000001'
    }
  }
}

export class EntityReferenceRenderer implements CellRenderer {
  private disposers: Array<() => void> = []

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    // Add affordance data attributes
    container.dataset.affordance = isEditable ? 'edit' : 'none'
    container.dataset.affordanceRole = 'badge'

    container.className = 'vibegridx-entity-reference'
    container.style.cssText = 'max-width: 100%; min-width: 0; overflow: hidden;'

    if (!value) {
      if (!isEditable) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

    // Check for backend-resolved display fields (_name suffix from UnifiedResolver).
    // Skip if the _name key is a real schema field (not a synthetic resolved field) to
    // avoid collisions like "project" entity ref + "project_name" extracted text field.
    const nameKey = `${column.id}_name`
    const resolvedName = rowData[nameKey]
    if (resolvedName && !this.isSchemaField(nameKey, column)) {
      container.innerHTML = this.createEntityBadge({ name: resolvedName }, value, column)
      return container
    }

    // Legacy: check __resolved_ prefix (deprecated, kept as fallback)
    const resolvedValue = rowData[`__resolved_${column.id}`]
    if (resolvedValue) {
      container.innerHTML = this.createEntityBadge(resolvedValue, value, column)
      return container
    }

    if (typeof value === 'object' && value !== null) {
      const candidate = (value as any).name || (value as any).title
      if (candidate) {
        container.innerHTML = this.createEntityBadge(
          value,
          (value as any).id || rowData[column.id],
          column,
        )
        return container
      }
    }

    const tableCoreStore = this.getTableCoreStore(column)
    const rawTargetEntity = this.getTargetEntityType(column) || this.inferTargetEntity(column)
    if (!rawTargetEntity) {
      logger.warn(
        'EntityReferenceRenderer: unable to determine target entity type; displaying raw value',
        {
          columnId: column.id,
          value,
        },
      )
      container.textContent = String(value)
      container.style.opacity = '0.6'
      return container
    }

    const targetEntity = rawTargetEntity
    const entityId = String(value)

    if (tableCoreStore) {
      const existing = tableCoreStore.getEntityReferenceRecord(targetEntity, entityId)
      if (existing) {
        container.innerHTML = this.createEntityBadge(existing, entityId, column)
        container.style.opacity = '1'
        return container
      }

      container.textContent = 'Loading...'
      container.style.opacity = '0.7'

      void tableCoreStore.ensureEntityReferenceRecord(targetEntity, entityId, async () => {
        const record = await this.fetchEntityRecord(entityId, column, tableCoreStore)
        return record
      })

      const dispose = reaction(
        () => tableCoreStore.getEntityReferenceRecord(targetEntity, entityId),
        (record) => {
          if (record) {
            container.innerHTML = this.createEntityBadge(record, entityId, column)
            container.style.opacity = '1'
            dispose()
          }
        },
        { fireImmediately: false },
      )

      this.disposers.push(dispose)
    } else {
      logger.debug(
        'EntityReferenceRenderer: no tableCoreStore available, falling back to direct fetch',
        {
          columnId: column.id,
          entityId,
        },
      )
      container.textContent = 'Loading...'
      container.style.opacity = '0.7'
      this.loadAndRenderEntity(container, entityId, column, undefined)
    }

    return container
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    element.className = 'vibegridx-entity-reference'

    if (!value) {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      const tableCoreStore = this.getTableCoreStore(column)
      const rawTargetEntity = this.getTargetEntityType(column) || this.inferTargetEntity(column)
      if (!rawTargetEntity) {
        element.textContent = String(value)
        element.style.opacity = '0.6'
        return
      }

      // Check synchronous cache first to avoid "Loading..." flash on re-renders
      if (tableCoreStore) {
        const existing = tableCoreStore.getEntityReferenceRecord(rawTargetEntity, String(value))
        if (existing) {
          element.innerHTML = this.createEntityBadge(existing, String(value), column)
          element.style.opacity = '1'
          return
        }
      }

      element.textContent = 'Loading...'
      this.loadAndRenderEntity(element, String(value), column, tableCoreStore)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return ['custom_entity_reference', 'entity_reference'].includes(type)
  }

  private createEntityBadge(entityData: any, entityId: string, column: EnhancedColumn): string {
    const targetEntity =
      this.getTargetEntityType(column) || this.inferTargetEntity(column) || 'Entity'
    const displayField = this.getDisplayField(column)
    const displayName =
      entityData[displayField] ||
      entityData.name ||
      entityData.title ||
      `${targetEntity} ${entityId}`

    // Badge styling - cursor/hover controlled by affordance system
    return `
      <div class="vibegridx-entity-badge" data-action="edit" title="${displayName}" style="
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
        background-color: #f0f9ff;
        color: #0369a1;
        border: 1px solid #bae6fd;
        max-width: 100%;
        min-width: 0;
      ">
        <div class="vibegridx-entity-icon" style="
          width: 14px;
          height: 14px;
          border-radius: 3px;
          background-color: #0ea5e9;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 8px;
          font-weight: 600;
          flex-shrink: 0;
        ">${targetEntity.charAt(0).toUpperCase()}</div>
        <span class="vibegridx-entity-name" style="
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        ">${displayName}</span>
      </div>
    `
  }

  private async loadAndRenderEntity(
    container: HTMLElement,
    entityId: string,
    column: EnhancedColumn,
    tableCoreStore?: TableCoreStore,
  ) {
    try {
      const rawTargetEntity = this.getTargetEntityType(column) || this.inferTargetEntity(column)
      if (!rawTargetEntity) {
        container.textContent = String(entityId)
        container.style.opacity = '0.6'
        logger.warn('loadAndRenderEntity: unable to determine target entity; displaying raw id', {
          columnId: column.id,
          entityId,
        })
        return
      }

      const targetEntity = rawTargetEntity

      if (tableCoreStore) {
        const record = await tableCoreStore.ensureEntityReferenceRecord(
          targetEntity,
          entityId,
          async () => {
            return this.fetchEntityRecord(entityId, column, tableCoreStore)
          },
        )

        if (record) {
          container.innerHTML = this.createEntityBadge(record, entityId, column)
          container.style.opacity = '1'
          return
        }
      } else {
        const record = await this.fetchEntityRecord(entityId, column, undefined)
        if (record) {
          container.innerHTML = this.createEntityBadge(record, entityId, column)
          container.style.opacity = '1'
          return
        }
      }

      const fallbackEntity = this.getTargetEntityType(column) || 'Entity'
      container.textContent = `${fallbackEntity} ${entityId}`
      container.style.opacity = '0.6'
      logger.debug('EntityReferenceRenderer: fallback display', {
        entityId,
        columnId: column.id,
      })
    } catch (error) {
      logger.error('Failed to load entity data', { error, entityId })
      const fallbackEntity = this.getTargetEntityType(column) || 'Entity'
      container.textContent = `${fallbackEntity} ${entityId}`
      container.className += ' vibegridx-entity-reference-error'
    }
  }

  private async fetchEntityRecord(
    entityId: string,
    column: EnhancedColumn,
    tableCoreStore?: TableCoreStore,
  ): Promise<any | null> {
    try {
      const targetEntity = this.getTargetEntityType(column) || this.inferTargetEntity(column)
      if (!targetEntity) {
        logger.warn('fetchEntityRecord: Unable to determine target entity type', {
          columnId: column.id,
          entityId,
        })
        return null
      }

      // For relationship archetype entities, the value stored in the field is the
      // actual target entity ID (e.g., Company UUID), not a relationship record ID.
      // We need to resolve through the archetype metadata to fetch from the correct entity type.
      const meta = await getRelationshipSchemaMetadata(targetEntity)
      const fetchEntityName =
        meta?.archetype === 'relationship' && meta.relationship?.targetEntity
          ? meta.relationship.targetEntity
          : targetEntity

      const response = await orpcClient.dataforge.data.get({
        entityName: fetchEntityName,
        recordId: entityId,
      })

      const record = response?.data
      if (record && tableCoreStore) {
        // Cache under the column's target entity type so synchronous lookups in render/update work
        tableCoreStore.setEntityReferenceRecord(targetEntity, entityId, record)
        // Also cache under the resolved entity type for cross-column consistency
        if (fetchEntityName !== targetEntity) {
          tableCoreStore.setEntityReferenceRecord(fetchEntityName, entityId, record)
        }
      }

      return record ?? null
    } catch (error) {
      logger.error('Failed to fetch entity record', { error, entityId, columnId: column.id })
      return null
    }
  }

  private getTargetEntityType(column: EnhancedColumn): string | null {
    return (
      column.relationshipConfig?.targetEntityType ||
      (column as any).relationshipTargetEntity ||
      (column as any).targetEntityType ||
      null
    )
  }

  private getDisplayField(column: EnhancedColumn): string {
    return (
      column.relationshipConfig?.displayField || (column as any).relationshipDisplayField || 'name'
    )
  }

  private inferTargetEntity(column: EnhancedColumn): string | null {
    const fieldName = (column.field || column.id || '').toString()
    if (!fieldName) return null

    const base = fieldName
      .replace(/_id$/i, '')
      .replace(/Id$/i, '')
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .trim()

    if (!base) return null

    return base
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  }

  private getTableCoreStore(column: EnhancedColumn): TableCoreStore | undefined {
    return (column as any).tableCoreStore || (column as any).tableCore$
  }

  /**
   * Check if a key is a real schema field (has its own column definition).
   * Used to avoid treating data fields like "project_name" as resolved display
   * names for entity reference columns like "project".
   */
  private isSchemaField(fieldKey: string, column: EnhancedColumn): boolean {
    const tableCoreStore = this.getTableCoreStore(column)
    if (!tableCoreStore?.columns) return false
    return tableCoreStore.columns.some((col: any) => col.field === fieldKey || col.id === fieldKey)
  }
}

export const EntityReferenceFieldType: VibeGridFieldType = {
  type: 'custom_entity_reference',
  category: 'relationship',
  renderer: new EntityReferenceRenderer(),
  editor: new (class implements CellEditor {
    create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
      const input = document.createElement('input')
      input.placeholder = `Search ${column.relationshipConfig?.targetEntityType || 'entities'}...`
      input.value = value ? String(value) : ''
      input.style.cssText =
        'width: 100%; height: 100%; border: none; outline: none; padding: 0 8px;'

      input.addEventListener('blur', () => onSave(input.value || null))
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSave(input.value || null)
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          input.blur()
        }
      })

      setTimeout(() => input.focus(), 0)
      return input
    }
    getValue(element: HTMLElement): any {
      return (element as HTMLInputElement).value || null
    }
    setValue(element: HTMLElement, value: any): void {
      ;(element as HTMLInputElement).value = value || ''
    }
    validate(): any {
      return { valid: true, errors: [] }
    }
    destroy(): void {}
    requiresAsyncOptions(): boolean {
      return true
    }
  })(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      return value ? String(value) : ''
    }
    parse(text: string): any {
      return text.trim() || null
    }
  })(),
  asyncDataLoader: new EntityDataLoader(),
  relationshipConfig: {
    targetEntityType: 'dynamic',
    cardinality: 'many-to-one',
    displayField: 'name',
    searchFields: ['name', 'title'],
  },
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
    requiresAsyncData: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, _rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🚀 Interaction policy
  interactionPolicy: {
    defaultAction: 'edit', // Relationship fields open picker on click
    editTrigger: 'content-click', // Click badge to open picker (padding = selection only)
    blurPolicy: 'commit', // Save on blur
  },

  // 🎯 Affordance Group System
  affordance: {
    group: 'editable-badge',
    whenNotEditable: 'readonly-badge',
  } as FieldTypeAffordance,
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('custom_entity_reference', EntityReferenceFieldType)
fieldTypeRegistry.register('entity_reference', EntityReferenceFieldType)
