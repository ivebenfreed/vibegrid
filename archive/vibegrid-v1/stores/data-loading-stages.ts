/**
 * Data Loading Stage Manager
 *
 * Coordinates the loading of data dependencies in proper sequence
 * Prevents cells from rendering with partial data
 */

import { batch, observable } from '@legendapp/state'
import { log } from '@/logger'

const fileLog = log('components/custom/vibegrid/stores/data-loading-stages.ts')

export type LoadingStage =
  | 'idle'
  | 'schema'
  | 'data'
  | 'relationships'
  | 'formatting'
  | 'ready'
  | 'error'

export interface LoadingStageContext {
  entityType: string
  startTime: number
  errors: Error[]
  completedStages: Set<LoadingStage>
  stageTimings: Map<LoadingStage, { start: number; end?: number; duration?: number }>
  currentStageStartTime?: number
  totalLoadTime?: number
}

export interface LoadingStageCallbacks {
  onSchemaLoad?: () => Promise<boolean>
  onDataLoad?: () => Promise<boolean>
  onRelationshipsLoad?: (processedRows: any[]) => Promise<boolean>
  onFormattingLoad?: () => Promise<boolean>
  onStageChange?: (stage: LoadingStage, context: LoadingStageContext) => void
  onError?: (error: Error, stage: LoadingStage) => void
  onReady?: (context: LoadingStageContext) => void
}

/**
 * Create a data loading stage manager for an entity type
 */
export function createDataLoadingStage$(entityType: string, callbacks: LoadingStageCallbacks = {}) {
  const loadingStage$ = observable({
    stage: 'idle' as LoadingStage,

    context: {
      entityType,
      startTime: Date.now(),
      errors: [],
      completedStages: new Set<LoadingStage>(),
      stageTimings: new Map(),
      currentStageStartTime: undefined,
      totalLoadTime: undefined,
    } as LoadingStageContext,

    // Progress tracking
    get progress(): number {
      const stages: LoadingStage[] = [
        'idle',
        'schema',
        'data',
        'relationships',
        'formatting',
        'ready',
      ]
      const currentIndex = stages.indexOf(this.stage)
      const totalStages = stages.length - 1 // Don't count 'idle'
      return Math.max(0, currentIndex) / totalStages
    },

    get progressPercent(): number {
      return Math.round(this.progress * 100)
    },

    // Stage progression gates
    get canLoadData() {
      return this.stage === 'schema' && this.context.completedStages.has('schema')
    },

    get canLoadRelationships() {
      return this.stage === 'data' && this.context.completedStages.has('data')
    },

    get canLoadFormatting() {
      return this.stage === 'relationships' && this.context.completedStages.has('relationships')
    },

    get isReady() {
      return this.stage === 'ready' && this.context.completedStages.has('formatting')
    },

    get hasError() {
      return this.stage === 'error' || this.context.errors.length > 0
    },

    get currentStageElapsed(): number {
      if (!this.context.currentStageStartTime) return 0
      return Date.now() - this.context.currentStageStartTime
    },

    get totalElapsed(): number {
      return Date.now() - this.context.startTime
    },

    // Stage transition methods
    async advanceToStage(targetStage: LoadingStage, data?: any): Promise<boolean> {
      try {
        const previousStage = this.stage

        fileLog.info(`🔄 Advancing stage`, {
          entityType: this.context.entityType,
          from: previousStage,
          to: targetStage,
          elapsed: this.totalElapsed,
        })

        // Mark previous stage as complete and update timing
        if (previousStage !== 'idle') {
          const timing = this.context.stageTimings.get(previousStage)
          if (timing) {
            timing.end = Date.now()
            timing.duration = timing.end - timing.start
          }
        }

        // Start timing for new stage
        const stageStartTime = Date.now()
        this.context.stageTimings.set(targetStage, { start: stageStartTime })

        batch(() => {
          if (previousStage !== 'idle') {
            this.context.completedStages.add(previousStage)
          }
          this.stage = targetStage
          this.context.currentStageStartTime = stageStartTime
        })

        // Notify callback about stage change
        if (callbacks.onStageChange) {
          callbacks.onStageChange(targetStage, this.context)
        }

        // Execute stage-specific loading
        let success = false

        switch (targetStage) {
          case 'schema':
            success = await this.executeSchemaLoad()
            break
          case 'data':
            success = await this.executeDataLoad()
            break
          case 'relationships':
            success = await this.executeRelationshipsLoad(data)
            break
          case 'formatting':
            success = await this.executeFormattingLoad()
            break
          case 'ready':
            success = this.markReady()
            break
          default:
            success = true // No loading required for idle/error states
            break
        }

        return success
      } catch (error) {
        this.handleError(error as Error)
        return false
      }
    },

    async executeSchemaLoad(): Promise<boolean> {
      fileLog.debug(`📋 Loading schema for ${this.context.entityType}`)

      if (callbacks.onSchemaLoad) {
        const success = await callbacks.onSchemaLoad()
        if (!success) {
          throw new Error('Schema loading callback returned false')
        }
      }

      fileLog.info(`✅ Schema loaded for ${this.context.entityType}`)

      // Automatically advance to data loading if gate is open
      if (this.canLoadData) {
        await this.advanceToStage('data')
      }

      return true
    },

    async executeDataLoad(): Promise<boolean> {
      fileLog.debug(`📊 Loading data for ${this.context.entityType}`)

      if (callbacks.onDataLoad) {
        const success = await callbacks.onDataLoad()
        if (!success) {
          throw new Error('Data loading callback returned false')
        }
      }

      fileLog.info(`✅ Data loaded for ${this.context.entityType}`)

      // Automatically advance to relationships loading if gate is open
      if (this.canLoadRelationships) {
        await this.advanceToStage('relationships')
      }

      return true
    },

    async executeRelationshipsLoad(processedRows: any[]): Promise<boolean> {
      fileLog.debug(`🔗 Loading relationships for ${this.context.entityType}`)

      if (callbacks.onRelationshipsLoad) {
        const success = await callbacks.onRelationshipsLoad(processedRows || [])
        if (!success) {
          throw new Error('Relationships loading callback returned false')
        }
      }

      fileLog.info(`✅ Relationships loaded for ${this.context.entityType}`)

      // Automatically advance to formatting loading if gate is open
      if (this.canLoadFormatting) {
        await this.advanceToStage('formatting')
      }

      return true
    },

    async executeFormattingLoad(): Promise<boolean> {
      fileLog.debug(`🎨 Loading formatting for ${this.context.entityType}`)

      if (callbacks.onFormattingLoad) {
        const success = await callbacks.onFormattingLoad()
        if (!success) {
          throw new Error('Formatting loading callback returned false')
        }
      }

      fileLog.info(`✅ Formatting loaded for ${this.context.entityType}`)

      // Advance to ready state
      this.markReady()

      return true
    },

    markReady(): boolean {
      const timing = this.context.stageTimings.get(this.stage)
      if (timing) {
        timing.end = Date.now()
        timing.duration = timing.end - timing.start
      }

      batch(() => {
        this.context.completedStages.add('formatting')
        this.context.totalLoadTime = Date.now() - this.context.startTime
        this.stage = 'ready'
        this.context.currentStageStartTime = undefined
      })

      // Generate loading performance summary
      const summary = this.getPerformanceSummary()

      fileLog.info(`🎉 Data loading complete`, {
        entityType: this.context.entityType,
        totalTime: this.context.totalLoadTime,
        stageTimings: summary.stageTimings,
        stages: Array.from(this.context.completedStages),
      })

      // Notify callback that we're ready
      if (callbacks.onReady) {
        callbacks.onReady(this.context)
      }

      return true
    },

    handleError(error: Error): void {
      const timing = this.context.stageTimings.get(this.stage)
      if (timing) {
        timing.end = Date.now()
        timing.duration = timing.end - timing.start
      }

      fileLog.error(`❌ Data loading error in ${this.stage} stage`, {
        entityType: this.context.entityType,
        stage: this.stage,
        error: error.message,
        elapsed: this.totalElapsed,
      })

      batch(() => {
        this.context.errors.push(error)
        this.stage = 'error'
        this.context.currentStageStartTime = undefined
      })

      // Notify error callback
      if (callbacks.onError) {
        callbacks.onError(error, this.stage)
      }
    },

    reset(): void {
      fileLog.info(`🔄 Resetting loading stage for ${this.context.entityType}`)

      batch(() => {
        this.stage = 'idle'
        this.context.startTime = Date.now()
        this.context.errors = []
        this.context.completedStages.clear()
        this.context.stageTimings.clear()
        this.context.currentStageStartTime = undefined
        this.context.totalLoadTime = undefined
      })
    },

    // Performance and debugging utilities
    getPerformanceSummary() {
      const summary: any = {
        entityType: this.context.entityType,
        totalTime: this.context.totalLoadTime || this.totalElapsed,
        stage: this.stage,
        progress: this.progressPercent,
        stageTimings: {},
      }

      // Convert stage timings to a readable format
      for (const [stage, timing] of this.context.stageTimings) {
        summary.stageTimings[stage] = {
          duration:
            timing.duration || (timing.end ? timing.end - timing.start : Date.now() - timing.start),
          completed: !!timing.end,
        }
      }

      return summary
    },

    getDetailedStatus() {
      return {
        stage: this.stage,
        entityType: this.context.entityType,
        isReady: this.isReady,
        hasError: this.hasError,
        progress: this.progress,
        progressPercent: this.progressPercent,
        totalElapsed: this.totalElapsed,
        currentStageElapsed: this.currentStageElapsed,
        completedStages: Array.from(this.context.completedStages),
        errors: this.context.errors.map((e) => e.message),
        stageTimings: Object.fromEntries(this.context.stageTimings),
        gates: {
          canLoadData: this.canLoadData,
          canLoadRelationships: this.canLoadRelationships,
          canLoadFormatting: this.canLoadFormatting,
        },
      }
    },

    // Convenience methods for external control
    async start(): Promise<boolean> {
      this.reset()
      return await this.advanceToStage('schema')
    },

    async skipToStage(targetStage: LoadingStage): Promise<boolean> {
      // For testing/debugging - skip directly to a stage
      fileLog.warn(`⚡ Skipping to stage ${targetStage} for ${this.context.entityType}`)

      const stages: LoadingStage[] = [
        'idle',
        'schema',
        'data',
        'relationships',
        'formatting',
        'ready',
      ]
      const targetIndex = stages.indexOf(targetStage)

      if (targetIndex === -1) {
        throw new Error(`Invalid target stage: ${targetStage}`)
      }

      // Mark all previous stages as completed
      for (let i = 0; i < targetIndex; i++) {
        this.context.completedStages.add(stages[i])
      }

      return await this.advanceToStage(targetStage)
    },

    // Wait for a specific stage to complete
    async waitForStage(targetStage: LoadingStage, timeoutMs = 10000): Promise<boolean> {
      const startTime = Date.now()

      while (Date.now() - startTime < timeoutMs) {
        if (this.hasError) {
          throw new Error(
            `Loading failed while waiting for ${targetStage}: ${this.context.errors.map((e) => e.message).join(', ')}`,
          )
        }

        if (targetStage === 'ready' && this.isReady) {
          return true
        }

        if (this.context.completedStages.has(targetStage)) {
          return true
        }

        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      throw new Error(`Timeout waiting for stage ${targetStage} after ${timeoutMs}ms`)
    },
  })

  return loadingStage$
}

/**
 * Utility to create stage callbacks that integrate with existing observables
 */
export function createStageCallbacks(
  universeLoading$: any,
  universeSchema$: any,
  tableCore$: any,
  relationshipResolver$?: any,
): LoadingStageCallbacks {
  return {
    async onSchemaLoad(): Promise<boolean> {
      // Check if schema is loaded
      const isLoading = universeLoading$.get()
      const schema = universeSchema$.get()

      if (isLoading) {
        // Wait for loading to complete
        await new Promise((resolve) => {
          const unsubscribe = universeLoading$.onChange(() => {
            if (!universeLoading$.get()) {
              unsubscribe()
              resolve(true)
            }
          })
        })
      }

      return !!universeSchema$.get()
    },

    async onDataLoad(): Promise<boolean> {
      // Check if processed rows are available
      const processedRows = tableCore$.processedRows.get()
      return Array.isArray(processedRows)
    },

    async onRelationshipsLoad(processedRows: any[]): Promise<boolean> {
      if (!relationshipResolver$) {
        return true // No relationship loading needed
      }

      // Get columns with relationships
      const columns = tableCore$.columns.get()
      const relationshipColumns = columns.filter((col) => col.cellType?.startsWith('relationship'))

      if (relationshipColumns.length === 0) {
        return true // No relationships to resolve
      }

      // Resolve relationships for all rows
      const promises = processedRows.map((row) =>
        relationshipResolver$.resolveForRow(row.id, relationshipColumns, row),
      )

      await Promise.all(promises)
      return true
    },

    async onFormattingLoad(): Promise<boolean> {
      // Check if formatters are available
      try {
        const { formatFieldForDisplay } = await import(
          '@/server/dataforge/fields/display-formatters'
        )
        return typeof formatFieldForDisplay === 'function'
      } catch (error) {
        fileLog.warn('Display formatters not available', { error })
        return false
      }
    },
  }
}

/**
 * Helper to monitor stage changes and log performance
 */
export function createStageMonitor(stageName: string) {
  return {
    onStageChange(stage: LoadingStage, context: LoadingStageContext) {
      fileLog.info(`📊 [${stageName}] Stage: ${stage}`, {
        progress: `${Math.round((Array.from(context.completedStages).length / 5) * 100)}%`,
        elapsed: Date.now() - context.startTime,
      })
    },

    onError(error: Error, stage: LoadingStage) {
      fileLog.error(`❌ [${stageName}] Failed at ${stage}`, {
        error: error.message,
      })
    },

    onReady(context: LoadingStageContext) {
      fileLog.info(`🎉 [${stageName}] Ready`, {
        totalTime: context.totalLoadTime,
        stages: Array.from(context.completedStages).length,
      })
    },
  }
}
