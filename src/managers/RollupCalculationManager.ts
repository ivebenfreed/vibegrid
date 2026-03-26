/**
 * Rollup Calculation Manager
 *
 * Manages frontend calculation of rollup fields including count, sum, average, and concat.
 * Integrates with entity change events for real-time updates.
 */

import { getLogger } from '@/shared/lib/logging'
import type { EnhancedColumn, RollupCalculator, RollupConfig } from '../field-types/types'
import type { TableCoreStore } from '../stores/TableCoreStore'

const fileLog = getLogger(['custom', 'vibegrid', 'managers', 'RollupCalculationManager.ts'])

export interface EntityChangeEvent {
  entityType: string
  entityId: string
  changeType: 'create' | 'update' | 'delete'
  changedFields?: string[]
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
}

/**
 * Base rollup calculator interface implementation
 */
export abstract class BaseRollupCalculator implements RollupCalculator {
  abstract calculate(rollupConfig: RollupConfig, sourceData: any[], currentRowId: string): any

  getSourceData(rollupConfig: RollupConfig, currentRowId: string, _tableCore$: TableCoreStore): any[] {
    // This would integrate with the table's data to get related records
    // For now, return empty array - will be implemented when integrating with table
    fileLog.debug('Getting source data for rollup', {
      rollupConfig,
      currentRowId,
    })

    return []
  }

  shouldRecalculate(_changeEvent: EntityChangeEvent): boolean {
    // Base implementation - recalculate if the source entity type matches
    return true // For now, always recalculate
  }

  getDependencies(): string[] {
    return [] // Override in specific implementations
  }

  protected matchesConditions(item: any, conditions: Record<string, any>): boolean {
    if (!conditions) return true

    return Object.entries(conditions).every(([field, expectedValue]) => item[field] === expectedValue)
  }
}

/**
 * Count rollup calculator
 */
export class RollupCountCalculator extends BaseRollupCalculator {
  calculate(rollupConfig: RollupConfig, sourceData: any[], _currentRowId: string): number {
    let filteredData = sourceData

    // Apply conditions if specified
    if (rollupConfig.conditions) {
      filteredData = sourceData.filter((item) => this.matchesConditions(item, rollupConfig.conditions!))
    }

    return filteredData.length
  }

  getDependencies(): string[] {
    return ['*'] // Count depends on existence of records, not specific fields
  }
}

/**
 * Sum rollup calculator
 */
export class RollupSumCalculator extends BaseRollupCalculator {
  calculate(rollupConfig: RollupConfig, sourceData: any[], _currentRowId: string): number {
    if (!rollupConfig.sourceField) {
      fileLog.warn('Sum rollup missing sourceField', { rollupConfig })
      return 0
    }

    let filteredData = sourceData

    // Apply conditions if specified
    if (rollupConfig.conditions) {
      filteredData = sourceData.filter((item) => this.matchesConditions(item, rollupConfig.conditions!))
    }

    const sum = filteredData.reduce((total, item) => {
      const value = item[rollupConfig.sourceField!]
      const numValue = Number(value)
      return total + (Number.isNaN(numValue) ? 0 : numValue)
    }, 0)

    // Apply precision if specified
    if (rollupConfig.precision !== undefined) {
      return Number(sum.toFixed(rollupConfig.precision))
    }

    return sum
  }

  getDependencies(): string[] {
    return ['*'] // Depends on the source field
  }
}

/**
 * Average rollup calculator
 */
export class RollupAverageCalculator extends BaseRollupCalculator {
  calculate(rollupConfig: RollupConfig, sourceData: any[], _currentRowId: string): number {
    if (!rollupConfig.sourceField) {
      fileLog.warn('Average rollup missing sourceField', { rollupConfig })
      return 0
    }

    let filteredData = sourceData

    // Apply conditions if specified
    if (rollupConfig.conditions) {
      filteredData = sourceData.filter((item) => this.matchesConditions(item, rollupConfig.conditions!))
    }

    if (filteredData.length === 0) return 0

    const sum = filteredData.reduce((total, item) => {
      const value = item[rollupConfig.sourceField!]
      const numValue = Number(value)
      return total + (Number.isNaN(numValue) ? 0 : numValue)
    }, 0)

    const average = sum / filteredData.length

    // Apply precision if specified
    if (rollupConfig.precision !== undefined) {
      return Number(average.toFixed(rollupConfig.precision))
    }

    return average
  }

  getDependencies(): string[] {
    return ['*'] // Depends on the source field
  }
}

/**
 * Concatenation rollup calculator
 */
export class RollupConcatCalculator extends BaseRollupCalculator {
  calculate(rollupConfig: RollupConfig, sourceData: any[], _currentRowId: string): string {
    if (!rollupConfig.sourceField) {
      fileLog.warn('Concat rollup missing sourceField', { rollupConfig })
      return ''
    }

    let filteredData = sourceData

    // Apply conditions if specified
    if (rollupConfig.conditions) {
      filteredData = sourceData.filter((item) => this.matchesConditions(item, rollupConfig.conditions!))
    }

    const values = filteredData
      .map((item) => item[rollupConfig.sourceField!])
      .filter((value) => value != null && value !== '')
      .map((value) => String(value))

    const separator = rollupConfig.separator || ', '
    return values.join(separator)
  }

  getDependencies(): string[] {
    return ['*'] // Depends on the source field
  }
}

/**
 * Central manager for rollup calculations
 */
export class RollupCalculationManager {
  private calculators = new Map<string, RollupCalculator>()

  constructor() {
    this.calculators.set('count', new RollupCountCalculator())
    this.calculators.set('sum', new RollupSumCalculator())
    this.calculators.set('average', new RollupAverageCalculator())
    this.calculators.set('concat', new RollupConcatCalculator())
  }

  /**
   * Calculate rollup value for a column and row
   */
  calculate(column: EnhancedColumn, rowData: any): any {
    if (!column.rollupConfig) {
      fileLog.warn('No rollup configuration found', { column: column.id })
      return null
    }

    const rollupConfig = column.rollupConfig
    const calculator = this.calculators.get(rollupConfig.calculationType)

    if (!calculator) {
      fileLog.error('No calculator found for rollup type', {
        type: rollupConfig.calculationType,
        column: column.id,
      })
      return null
    }

    try {
      // Get source data (this will be enhanced when integrating with table data)
      const sourceData = this.getSourceData(rollupConfig, rowData)
      const result = calculator.calculate(rollupConfig, sourceData, rowData.id)

      fileLog.debug('Calculated rollup value', {
        column: column.id,
        type: rollupConfig.calculationType,
        sourceCount: sourceData.length,
        result,
      })

      return result
    } catch (error) {
      fileLog.error('Error calculating rollup', {
        error,
        column: column.id,
        type: rollupConfig.calculationType,
      })
      return null
    }
  }

  /**
   * Invalidate rollups based on entity changes
   */
  invalidateRollups(changeEvent: EntityChangeEvent): void {
    fileLog.debug('Processing entity change for rollup invalidation', {
      changeEvent,
    })

    // In a full implementation, this would:
    // 1. Find all rollup fields that depend on the changed entity
    // 2. Trigger recalculation for affected rows
    // 3. Update the UI with new values
  }

  /**
   * Get rollup calculator for a specific type
   */
  getCalculator(type: string): RollupCalculator | null {
    return this.calculators.get(type) || null
  }

  /**
   * Register a custom rollup calculator
   */
  registerCalculator(type: string, calculator: RollupCalculator): void {
    this.calculators.set(type, calculator)
  }

  private getSourceData(rollupConfig: RollupConfig, rowData: any): any[] {
    // This is a placeholder - in the real implementation this would:
    // 1. Use the relationship configuration to find related records
    // 2. Get data from tableCore$ or make API calls
    // 3. Return the related records for calculation

    fileLog.debug('Getting source data for rollup calculation', {
      rollupConfig,
      currentRowId: rowData.id,
    })

    // For demonstration, return mock data
    const mockData = []
    for (let i = 0; i < 5; i++) {
      mockData.push({
        id: `related-${i}`,
        [rollupConfig.sourceField || 'amount']: Math.random() * 100,
        status: Math.random() > 0.5 ? 'active' : 'inactive',
      })
    }

    return mockData
  }
}
