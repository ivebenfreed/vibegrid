/**
 * Entity Reference Field Type Implementation
 *
 * Handles custom_entity_reference and entity_reference field types with dynamic target entities.
 */

import { reaction } from 'mobx'
import { orpcClient } from '@/shared/data/orpc/client'
import { createLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../../../stores/TableCoreStore'
import type {
  AsyncDataLoader,
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  RelationshipData,
  RelationshipOption,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

const fileLog = createLogger(
  'components/vibegrid/field-types/implementations/relationship/EntityReferenceFieldType',
)

export class EntityDataLoader implements AsyncDataLoader {
  async loadRelationshipData(
    column: EnhancedColumn,
    rowIds: string[],
    tableCore$: TableCoreStore,
  ): Promise<RelationshipData> {
    const orgId = this.getOrgId()
    const targetEntity =
      column.relationshipConfig?.targetEntityType ||
      (column.targetEntityType as string) ||
      'Unknown'

    try {
      const response = await fetch(
        `/api/dataforge/orgs/${orgId}/relationships/${targetEntity.toLowerCase()}?rowIds=${rowIds.join(',')}`,
      )
      if (!response.ok) throw new Error(`Failed to load ${targetEntity} data: ${response.status}`)

      const result = (await response.json()) as { data?: RelationshipData }
      return result.data || {}
    } catch (error) {
      fileLog.error('Failed to load entity relationship data', { error, column: column.id })
      throw error
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
      fileLog.error('Failed to search target entity', { error, query, targetEntity })
      return []
    }
  }

  getCacheKey(column: EnhancedColumn, value: any): string {
    const targetEntity = column.relationshipConfig?.targetEntityType || 'unknown'
    return `entity_ref:${targetEntity}:${column.id}:${String(value)}`
  }

  invalidateCache(column: EnhancedColumn): void {
    fileLog.debug('Invalidating entity reference cache', { column: column.id })
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
      fileLog.warn('Failed to get org ID from URL', { error })
      return '01920000-1000-7000-8000-000000000001'
    }
  }
}

export class EntityReferenceRenderer implements CellRenderer {
  private disposers: Array<() => void> = []

  constructor(private dataLoader: EntityDataLoader) {}

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-entity-reference'
    container.style.cssText = 'max-width: 100%; min-width: 0; overflow: hidden; cursor: pointer;'

    if (!value) {
      if (column.editable === false) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty vibegridx-text-editable'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

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
      fileLog.warn(
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
      fileLog.debug(
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
    this.disposers.forEach((dispose) => dispose())
    this.disposers = []
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    element.className = 'vibegridx-entity-reference'

    if (!value) {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty vibegridx-text-editable'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      element.textContent = 'Loading...'
      const tableCoreStore = this.getTableCoreStore(column)
      const rawTargetEntity = this.getTargetEntityType(column) || this.inferTargetEntity(column)
      if (!rawTargetEntity) {
        element.textContent = String(value)
        element.style.opacity = '0.6'
        return
      }
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

    // Determine if badge is editable based on column context
    // For now, assume editable - will be refined with column.editable check
    const hoverClass = 'vibegridx-badge-editable'

    return `
      <div class="vibegridx-entity-badge ${hoverClass}" data-action="edit" title="${displayName}" style="
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
        fileLog.warn('loadAndRenderEntity: unable to determine target entity; displaying raw id', {
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
      fileLog.debug('EntityReferenceRenderer: fallback display', {
        entityId,
        columnId: column.id,
      })
    } catch (error) {
      fileLog.error('Failed to load entity data', { error, entityId })
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
        fileLog.warn('fetchEntityRecord: Unable to determine target entity type', {
          columnId: column.id,
          entityId,
        })
        return null
      }

      const response = await orpcClient.dataforge.data.get({
        entityName: targetEntity,
        recordId: entityId,
      })

      const record = response?.data
      if (record && tableCoreStore) {
        tableCoreStore.setEntityReferenceRecord(targetEntity, entityId, record)
      }

      return record ?? null
    } catch (error) {
      fileLog.error('Failed to fetch entity record', { error, entityId, columnId: column.id })
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
}

export const EntityReferenceFieldType: VibeGridFieldType = {
  type: 'custom_entity_reference',
  category: 'relationship',
  renderer: new EntityReferenceRenderer(new EntityDataLoader()),
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
    return (value: any, rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🚀 Interaction policy
  interactionPolicy: {
    defaultAction: 'edit', // Relationship fields open picker on click
    editTrigger: 'content-click', // Click badge to open picker (padding = selection only)
    blurPolicy: 'commit', // Save on blur
  },
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('custom_entity_reference', EntityReferenceFieldType)
fieldTypeRegistry.register('entity_reference', EntityReferenceFieldType)
