/**
 * Entity Reference Field Type Implementation
 *
 * Handles custom_entity_reference and entity_reference field types with dynamic target entities.
 */

import type { TableCore$ } from '../../../stores/data-state'
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

export class EntityDataLoader implements AsyncDataLoader {
  async loadRelationshipData(
    column: EnhancedColumn,
    rowIds: string[],
    tableCore$: TableCore$,
  ): Promise<RelationshipData> {
    const orgId = this.getOrgId()
    const targetEntity = column.relationshipConfig?.targetEntityType || 'Unknown'

    try {
      const response = await fetch(
        `/api/dataforge/orgs/${orgId}/relationships/${targetEntity.toLowerCase()}?rowIds=${rowIds.join(',')}`,
      )
      if (!response.ok) throw new Error(`Failed to load ${targetEntity} data: ${response.status}`)

      const result = await response.json()
      return result.data || {}
    } catch (error) {
      console.error('Failed to load entity relationship data', { error, column: column.id })
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

      const results = await response.json()
      const displayField = column.relationshipConfig?.displayField || 'name'

      return results.data.map((item: any) => ({
        value: item.id,
        label: item[displayField] || item.name || item.title || item.id,
        metadata: item,
      }))
    } catch (error) {
      console.error(`Failed to search ${targetEntity}`, { error, query })
      return []
    }
  }

  getCacheKey(column: EnhancedColumn, value: any): string {
    const targetEntity = column.relationshipConfig?.targetEntityType || 'unknown'
    return `entity_ref:${targetEntity}:${column.id}:${String(value)}`
  }

  invalidateCache(column: EnhancedColumn): void {
    console.debug('Invalidating entity reference cache', { column: column.id })
  }

  private getOrgId(): string {
    try {
      const path = window.location.pathname
      const orgMatch = path.match(/\/org\/([^\/]+)/)
      if (orgMatch) {
        return orgMatch[1]
      }
      return '01920000-1000-7000-8000-000000000001'
    } catch (error) {
      console.warn('Failed to get org ID from URL:', error)
      return '01920000-1000-7000-8000-000000000001'
    }
  }
}

export class EntityReferenceRenderer implements CellRenderer {
  constructor(private dataLoader: EntityDataLoader) {}

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-entity-reference'

    if (!value) {
      container.className += ' vibegridx-entity-reference-empty'
      const targetEntity = column.relationshipConfig?.targetEntityType || 'Entity'
      container.textContent = column.editable ? `Select ${targetEntity}...` : `No ${targetEntity}`
      container.style.opacity = '0.6'
      container.style.fontStyle = 'italic'
      return container
    }

    const resolvedValue = rowData[`__resolved_${column.id}`]
    if (resolvedValue) {
      container.innerHTML = this.createEntityBadge(resolvedValue, value, column)
      return container
    }

    container.textContent = 'Loading...'
    container.style.opacity = '0.7'
    this.loadAndRenderEntity(container, value, column)

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    element.className = 'vibegridx-entity-reference'

    if (!value) {
      element.className += ' vibegridx-entity-reference-empty'
      const targetEntity = column.relationshipConfig?.targetEntityType || 'Entity'
      element.textContent = column.editable ? `Select ${targetEntity}...` : `No ${targetEntity}`
      element.style.opacity = '0.6'
    } else {
      element.textContent = 'Loading...'
      this.loadAndRenderEntity(element, value, column)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return ['custom_entity_reference', 'entity_reference'].includes(type)
  }

  private createEntityBadge(entityData: any, entityId: string, column: EnhancedColumn): string {
    const targetEntity = column.relationshipConfig?.targetEntityType || 'Entity'
    const displayField = column.relationshipConfig?.displayField || 'name'
    const displayName =
      entityData[displayField] ||
      entityData.name ||
      entityData.title ||
      `${targetEntity} ${entityId}`

    return `
      <div class="vibegridx-entity-badge" style="
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 6px;
        border-radius: 6px;
        background-color: #f0f9ff;
        border: 1px solid #0ea5e9;
        font-size: 12px;
        font-weight: 500;
        max-width: 100%;
      ">
        <div class="vibegridx-entity-icon" style="
          width: 16px;
          height: 16px;
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
        ">${displayName}</span>
      </div>
    `
  }

  private async loadAndRenderEntity(
    container: HTMLElement,
    entityId: string,
    column: EnhancedColumn,
  ) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 200))

      const targetEntity = column.relationshipConfig?.targetEntityType || 'Entity'
      const mockEntityData = {
        id: entityId,
        name: `${targetEntity} ${entityId.slice(-4)}`,
        title: `Sample ${targetEntity}`,
      }

      container.innerHTML = this.createEntityBadge(mockEntityData, entityId, column)
      container.style.opacity = '1'
    } catch (error) {
      console.error('Failed to load entity data', { error, entityId })
      container.textContent = `${column.relationshipConfig?.targetEntityType || 'Entity'} ${entityId}`
      container.className += ' vibegridx-entity-reference-error'
    }
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
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('custom_entity_reference', EntityReferenceFieldType)
fieldTypeRegistry.register('entity_reference', EntityReferenceFieldType)
