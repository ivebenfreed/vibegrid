/**
 * Relationship Data Manager
 *
 * Manages loading, caching, and resolving relationship data for VibeGrid.
 * Handles user references, entity references, and relationship display data.
 */

import { getLogger } from '@/shared/lib/logging'
import type {
  EnhancedColumn,
  RelationshipData,
  RelationshipOption,
} from '../field-types/FieldTypeRegistry'

const fileLog = getLogger(['custom', 'vibegrid', 'managers', 'RelationshipDataManager.ts'])

export interface RelationshipCacheEntry {
  data: RelationshipData
  loadedAt: Date
  expiresAt: Date
  rowIds: string[]
}

/**
 * Manages relationship data loading and caching for VibeGrid
 */
export class RelationshipDataManager {
  private cache = new Map<string, RelationshipCacheEntry>()
  private loadingPromises = new Map<string, Promise<void>>()
  private cacheExpiryMs = 5 * 60 * 1000 // 5 minutes

  /**
   * Load relationship data for specified columns and row IDs
   */
  async loadData(column: EnhancedColumn, rowIds: string[]): Promise<void> {
    const cacheKey = this.getCacheKey(column, rowIds)

    // Check if already loading
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!
    }

    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > new Date()) {
      return Promise.resolve()
    }

    fileLog.debug('Loading relationship data', {
      columnId: column.id,
      targetEntity: column.relationshipConfig?.targetEntityType,
      rowCount: rowIds.length,
    })

    // Load data
    const loadPromise = this.loadDataFromBackend(column, rowIds)
    this.loadingPromises.set(cacheKey, loadPromise)

    try {
      await loadPromise
    } finally {
      this.loadingPromises.delete(cacheKey)
    }
  }

  /**
   * Get cached relationship data for a column and row ID
   */
  getData(column: EnhancedColumn, rowId: string): RelationshipData | null {
    const cacheKey = this.getCacheKey(column, [rowId])
    const cached = this.cache.get(cacheKey)

    if (cached && cached.expiresAt > new Date()) {
      return cached.data
    }

    return null
  }

  /**
   * Get resolved display value for a relationship
   */
  getDisplayValue(value: any, column: EnhancedColumn, relationshipData?: RelationshipData): string {
    if (value == null) return ''

    // Use relationship data if available
    if (relationshipData && column.relationshipConfig) {
      const targetEntity = column.relationshipConfig.targetEntityType.toLowerCase()
      const entityData = relationshipData[targetEntity]

      if (entityData && entityData[value]) {
        const record = entityData[value]
        const displayField = column.relationshipConfig.displayField
        return record[displayField] || record.name || record.title || record.id
      }
    }

    // Fallback to value itself
    return String(value)
  }

  /**
   * Get search suggestions for relationship fields
   */
  async getSearchSuggestions(
    query: string,
    column: EnhancedColumn,
    limit: number = 10,
  ): Promise<RelationshipOption[]> {
    if (!column.relationshipConfig) {
      return []
    }

    try {
      const config = column.relationshipConfig
      const _orgId = this.getOrgId()

      const searchParams = new URLSearchParams({
        q: query,
        limit: String(limit),
        fields: config.searchFields.join(','),
      })

      const endpoint = this.getSearchEndpoint(config.targetEntityType)
      const response = await fetch(`${endpoint}?${searchParams}`)

      if (!response.ok) {
        throw new Error(`Search request failed: ${response.status}`)
      }

      const results = (await response.json()) as { data?: any[] }

      return (results.data || []).map((item: any) => ({
        value: item.id,
        label: item[config.displayField] || item.name || item.title || item.id,
        metadata: item,
      }))
    } catch (error) {
      fileLog.error('Failed to load search suggestions', {
        error,
        column: column.id,
        query,
      })
      return []
    }
  }

  /**
   * Invalidate cache for a column
   */
  invalidateCache(column: EnhancedColumn): void {
    const keysToRemove: string[] = []

    this.cache.forEach((_entry, key) => {
      if (key.startsWith(`${column.id}:`)) {
        keysToRemove.push(key)
      }
    })

    keysToRemove.forEach((key) => this.cache.delete(key))

    fileLog.debug('Invalidated relationship cache', {
      columnId: column.id,
      keysRemoved: keysToRemove.length,
    })
  }

  /**
   * Clear expired cache entries
   */
  cleanupExpiredCache(): void {
    const now = new Date()
    const keysToRemove: string[] = []

    this.cache.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        keysToRemove.push(key)
      }
    })

    keysToRemove.forEach((key) => this.cache.delete(key))

    if (keysToRemove.length > 0) {
      fileLog.debug('Cleaned up expired cache entries', {
        removed: keysToRemove.length,
      })
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      totalEntries: this.cache.size,
      activeLoads: this.loadingPromises.size,
      memoryUsage: this.estimateMemoryUsage(),
    }
  }

  private async loadDataFromBackend(column: EnhancedColumn, rowIds: string[]): Promise<void> {
    if (!column.relationshipConfig) {
      throw new Error('No relationship configuration found')
    }

    const config = column.relationshipConfig
    const _orgId = this.getOrgId()

    try {
      const endpoint = this.getRelationshipEndpoint(config.targetEntityType)
      const response = await fetch(`${endpoint}?rowIds=${rowIds.join(',')}`)

      if (!response.ok) {
        throw new Error(`Failed to load relationship data: ${response.status}`)
      }

      const data = (await response.json()) as { data?: any } | any

      // Store in cache
      const cacheKey = this.getCacheKey(column, rowIds)
      const now = new Date()
      const relationshipData = (data as any).data || data
      this.cache.set(cacheKey, {
        data: relationshipData,
        loadedAt: now,
        expiresAt: new Date(now.getTime() + this.cacheExpiryMs),
        rowIds: [...rowIds],
      })

      fileLog.debug('Loaded relationship data', {
        columnId: column.id,
        targetEntity: config.targetEntityType,
        recordCount: Object.keys(relationshipData).length,
      })
    } catch (error) {
      fileLog.error('Failed to load relationship data', {
        error,
        column: column.id,
        targetEntity: config.targetEntityType,
      })
      throw error
    }
  }

  private getCacheKey(column: EnhancedColumn, rowIds: string[]): string {
    const sortedIds = [...rowIds].sort()
    return `${column.id}:${column.relationshipConfig?.targetEntityType}:${sortedIds.join(',')}`
  }

  private getOrgId(): string {
    // TODO: Get from app context or configuration
    return '01920000-1000-7000-8000-000000000001' // Default for now
  }

  private getRelationshipEndpoint(targetEntityType: string): string {
    const orgId = this.getOrgId()

    if (targetEntityType === 'User') {
      return `/api/dataforge/orgs/${orgId}/relationships/users`
    } else {
      return `/api/dataforge/orgs/${orgId}/relationships/${targetEntityType.toLowerCase()}`
    }
  }

  private getSearchEndpoint(targetEntityType: string): string {
    const orgId = this.getOrgId()

    if (targetEntityType === 'User') {
      return `/api/dataforge/orgs/${orgId}/users/search`
    } else {
      return `/api/dataforge/orgs/${orgId}/data/${targetEntityType}/search`
    }
  }

  private estimateMemoryUsage(): number {
    let totalSize = 0

    this.cache.forEach((entry) => {
      // Rough estimation of memory usage
      const dataSize = JSON.stringify(entry.data).length
      totalSize += dataSize + entry.rowIds.length * 40 // Rough estimate
    })

    return totalSize
  }
}
