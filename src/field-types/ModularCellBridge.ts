/**
 * Modular Cell Bridge
 *
 * Bridges the new modular field type system with the existing BodyRenderer.
 * Provides a migration path from the old hardcoded cell creation to the new unified system.
 */

import { createLogger } from '@/shared/lib/logging'
import { CellFactory } from '../factories/CellFactory'
import { RelationshipDataManager } from '../managers/RelationshipDataManager'
import { RollupCalculationManager } from '../managers/RollupCalculationManager'
import { SchemaAdapter } from '../schema/SchemaAdapter'
import type { Column } from '../types'
import { FieldTypeRegistry, fieldTypeRegistry } from './FieldTypeRegistry'

// Field type implementations are now imported in the main index.ts

const fileLog = createLogger('components/custom/vibegrid/field-types/ModularCellBridge.ts')

/**
 * Bridge between old and new cell rendering systems
 */
export class ModularCellBridge {
  private cellFactory: CellFactory | null = null
  private relationshipDataManager: RelationshipDataManager
  private rollupCalculationManager: RollupCalculationManager

  constructor() {
    this.relationshipDataManager = new RelationshipDataManager()
    this.rollupCalculationManager = new RollupCalculationManager()

    fileLog.debug(
      '🚀 [FIELD-BRIDGE] ModularCellBridge created (CellFactory will be initialized lazily)',
    )
  }

  private ensureCellFactory(): void {
    if (!this.cellFactory) {
      const registeredTypes = fieldTypeRegistry.getRegisteredTypes()
      fileLog.debug('🔧 [FIELD-BRIDGE] Initializing CellFactory', {
        registeredTypesCount: registeredTypes.length,
        registeredTypes: registeredTypes,
      })

      if (registeredTypes.length === 0) {
        throw new Error(
          'Field type registry is empty - ensure field types are registered before using ModularCellBridge',
        )
      }

      this.cellFactory = new CellFactory(fieldTypeRegistry, {
        enableEditing: true,
        enableTooltips: true,
        enableAccessibility: true,
      })

      fileLog.debug('🎯 [FIELD-BRIDGE] CellFactory initialized lazily', {
        registeredTypes: registeredTypes.length,
        basicTypes: fieldTypeRegistry.getTypesByCategory('basic').length,
        relationshipTypes: fieldTypeRegistry.getTypesByCategory('relationship').length,
        rollupTypes: fieldTypeRegistry.getTypesByCategory('rollup').length,
        allTypes: registeredTypes,
      })
    }
  }

  /**
   * Create a cell using the new modular system
   *
   * This method can be called from the existing BodyRenderer to gradually
   * migrate cell creation to the new system.
   */
  createCell(
    value: any,
    column: Column,
    rowData: any,
    position: { rowIndex: number; columnIndex: number; xPosition?: number; width?: number },
  ): HTMLElement {
    try {
      // 🚀 FAST PATH: Use pre-computed formatter if available
      if (column.formatter) {
        return this.createCellFast(value, column, rowData, position)
      }

      // Legacy path for columns without pre-computed metadata
      fileLog.warn(
        '⚠️ [FIELD-BRIDGE] Using legacy cell creation path - consider pre-computing field types',
        {
          columnId: column.id,
          fieldType: column.cellType || column.type,
        },
      )

      // Ensure cell factory is initialized
      this.ensureCellFactory()

      fileLog.debug('🎯 [FIELD-BRIDGE] Creating cell with modular system', {
        columnId: column.id,
        fieldType: column.cellType || column.type,
        cellType: column.cellType,
        type: column.type,
        hasOptions: !!(column.options && column.options.length > 0),
        optionsCount: column.options?.length || 0,
        value: value,
        position,
      })

      // Enhance the column with backend metadata
      const enhancedColumn = this.enhanceColumn(column)

      // Use the unified cell factory
      const cellElement = this.cellFactory!.createCell(value, enhancedColumn, rowData, position)

      fileLog.debug('✅ [FIELD-BRIDGE] Cell created successfully', {
        columnId: column.id,
        elementClass: cellElement.className,
      })

      return cellElement
    } catch (error) {
      fileLog.error('❌ [FIELD-BRIDGE] Error creating cell with modular system - NO FALLBACK', {
        error,
        column: column.id,
        value,
      })

      // FAIL FAST - Don't fallback, surface the real issue
      throw error
    }
  }

  /**
   * 🚀 FAST PATH: Create cell using pre-computed formatter
   */
  private createCellFast(
    value: any,
    column: Column,
    rowData: any,
    position: { rowIndex: number; columnIndex: number; xPosition?: number; width?: number },
  ): HTMLElement {
    // Create container with proper VibeGrid structure (matching CellFactory)
    const container = document.createElement('div')
    container.className = 'vibegridx-cell'
    container.dataset.columnId = column.id
    container.dataset.field = column.field || column.id

    // Get column width (fallback to 150px if not specified)
    const actualWidth = position.width ?? column.width ?? 150

    // Apply VibeGrid-compatible positioning (matching CellFactory structure)
    if (position.xPosition !== undefined) {
      container.style.cssText = `
        position: absolute;
        left: ${position.xPosition}px;
        top: 0;
        width: ${actualWidth}px;
        height: 100%;
        padding: 0 12px;
        display: flex;
        align-items: center;
        font-size: 14px;
        overflow: hidden;
        cursor: default;
      `
    } else {
      container.style.cssText = `
        flex: 0 0 ${actualWidth}px;
        height: 100%;
        padding: 0 12px;
        display: flex;
        align-items: center;
        font-size: 14px;
        overflow: hidden;
        position: relative;
        cursor: default;
      `
    }

    // Use the original field type renderer for proper styling (badges, etc.)
    if (column.fieldType?.renderer) {
      try {
        const content = column.fieldType.renderer.render(value, column, rowData)
        container.appendChild(content)
      } catch (error) {
        // Fallback to formatter if renderer fails
        const displayValue = column.formatter!(value, rowData, column)
        container.textContent = displayValue
      }
    } else {
      // Fallback to formatter
      const displayValue = column.formatter!(value, rowData, column)
      container.textContent = displayValue
    }

    // 🚀 Fast path cell created successfully

    return container
  }

  /**
   * Update a cell using the new modular system
   */
  updateCell(cellElement: HTMLElement, value: any, column: Column, rowData: any): void {
    try {
      this.ensureCellFactory()
      const enhancedColumn = this.enhanceColumn(column)
      this.cellFactory!.updateCell(cellElement, value, enhancedColumn, rowData)
    } catch (error) {
      fileLog.error('Error updating cell with modular system', {
        error,
        column: column.id,
        value,
      })

      // Fallback to basic text update
      cellElement.textContent = String(value || '')
    }
  }

  /**
   * Check if a field type is supported by the modular system
   */
  isSupported(column: Column): boolean {
    const fieldType = column.cellType || column.type || 'text'
    const isSupported = fieldTypeRegistry.hasFieldType(fieldType)

    fileLog.debug('🔍 [FIELD-BRIDGE] Field type support check', {
      columnId: column.id,
      fieldType,
      isSupported,
      registeredTypes: fieldTypeRegistry.getRegisteredTypes().length,
    })

    return isSupported
  }

  /**
   * Get the field type category for a column
   */
  getFieldCategory(column: Column): string {
    if (!this.isSupported(column)) return 'unsupported'

    const enhancedColumn = this.enhanceColumn(column)
    const fieldTypeDefinition = fieldTypeRegistry.getFieldType(enhancedColumn)
    return fieldTypeDefinition.category
  }

  /**
   * Check if a column requires async data loading
   */
  requiresAsyncData(column: Column): boolean {
    const category = this.getFieldCategory(column)
    return category === 'relationship'
  }

  /**
   * Preload relationship data for multiple columns and rows
   */
  async preloadRelationshipData(columns: Column[], rowIds: string[]): Promise<void> {
    const relationshipColumns = columns.filter((col) => this.requiresAsyncData(col))

    const loadPromises = relationshipColumns.map(async (column) => {
      try {
        const enhancedColumn = this.enhanceColumn(column)
        await this.relationshipDataManager.loadData(enhancedColumn, rowIds)
      } catch (error) {
        fileLog.warn('Failed to preload relationship data', {
          error,
          column: column.id,
        })
      }
    })

    await Promise.allSettled(loadPromises)
  }

  /**
   * Get relationship data for a column
   */
  getRelationshipData(column: Column, rowId: string): any {
    if (!this.requiresAsyncData(column)) return null

    const enhancedColumn = this.enhanceColumn(column)
    return this.relationshipDataManager.getData(enhancedColumn, rowId)
  }

  /**
   * Calculate rollup value for a column
   */
  calculateRollupValue(column: Column, rowData: any): any {
    const category = this.getFieldCategory(column)
    if (category !== 'rollup') return null

    const enhancedColumn = this.enhanceColumn(column)
    return this.rollupCalculationManager.calculate(enhancedColumn, rowData)
  }

  /**
   * Get registry statistics for debugging
   */
  getStats() {
    return {
      registry: {
        totalTypes: fieldTypeRegistry.getRegisteredTypes().length,
        basicTypes: fieldTypeRegistry.getTypesByCategory('basic'),
        relationshipTypes: fieldTypeRegistry.getTypesByCategory('relationship'),
        rollupTypes: fieldTypeRegistry.getTypesByCategory('rollup'),
        computedTypes: fieldTypeRegistry.getTypesByCategory('computed'),
      },
      cache: this.relationshipDataManager.getCacheStats(),
    }
  }

  private enhanceColumn(column: Column): any {
    // PERFORMANCE: Use cached enhanced column if available
    if (column._cachedRenderer?.fieldTypeConfig?.enhancedColumn) {
      fileLog.debug('🚀 [PERF-CACHE] Using cached enhanced column', {
        columnId: column.id,
        cacheAge: performance.now() - column._cachedRenderer.resolvedAt,
      })
      return column._cachedRenderer.fieldTypeConfig.enhancedColumn
    }

    // Fallback: Create enhanced column and cache it for future use
    const mockSchema = SchemaAdapter.createMockSchema('UnknownEntity', [column])
    const enhancedColumns = SchemaAdapter.enhanceColumns([column], mockSchema, 'UnknownEntity')
    const enhancedColumn = enhancedColumns[0]

    // Cache the enhanced column for future use
    if (column._cachedRenderer?.fieldTypeConfig) {
      column._cachedRenderer.fieldTypeConfig.enhancedColumn = enhancedColumn
      fileLog.debug('💾 [PERF-CACHE] Cached enhanced column for future use', {
        columnId: column.id,
      })
    }

    return enhancedColumn
  }

  private createFallbackCell(value: any, column: Column): HTMLElement {
    const cell = document.createElement('div')
    cell.className = 'vibegridx-cell vibegridx-fallback-cell'
    cell.style.cssText = `
      padding: 0 12px;
      display: flex;
      align-items: center;
      height: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background-color: #fef3c7;
      border-left: 3px solid #f59e0b;
    `

    const content = document.createElement('span')
    content.textContent = String(value || '')
    content.title = `Fallback rendering for ${column.id} (${column.cellType || column.type})`

    cell.appendChild(content)
    return cell
  }
}

// Create singleton instance
export const modularCellBridge = new ModularCellBridge()

// Development helper
if (typeof window !== 'undefined') {
  ;(window as any).vibeGridModularBridge = modularCellBridge
  fileLog.debug('ModularCellBridge available globally as window.vibeGridModularBridge')
}
