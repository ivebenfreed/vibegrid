/**
 * VibeGrid Module System - Main Entry Point
 *
 * Registers all built-in view mode modules and exports the registry.
 *
 * RUNS AT IMPORT TIME - not in App.tsx.
 * This ensures registry is populated in all contexts:
 * - Production app
 * - Tests (Vitest, Playwright)
 * - Isolated renders (Storybook)
 * - Any entry point that imports VibeGrid
 *
 * @see GridModule for module interface
 * @see ViewModeRegistry for registry implementation
 * @see Issue #1416 for architecture overview
 */

import { getLogger } from '@/shared/lib/logging'
import { viewModeRegistry } from './ViewModeRegistry'
import type { GridModuleRenderProps } from './GridModule'

const logger = getLogger(['vibegrid', 'modules', 'index'])

/**
 * Register built-in view mode modules.
 * Called automatically at module import time.
 *
 * Safe to call multiple times - registry checks for duplicates.
 */
export function registerBuiltInModules(): void {
  logger.debug('Registering built-in view mode modules')

  // Table module (default - always available)
  viewModeRegistry.register(
    'table',
    async () => {
      const { TableModule } = await import('./table/TableModule')
      return TableModule
    },
    {
      displayName: 'Table View',
      icon: 'table',
      canHandle: () => true, // Default view, always available
      isEnabled: () => true,
    },
  )

  // Kanban module (lazy - loads on first use)
  viewModeRegistry.register(
    'kanban',
    async () => {
      const { KanbanModule } = await import('./kanban/KanbanModule')
      return KanbanModule
    },
    {
      displayName: 'Kanban Board',
      icon: 'kanban',
      canHandle: (props: GridModuleRenderProps) => {
        if (!props.schemaFields?.length) return true // graceful fallback
        const GROUPABLE = ['status_set', 'single-select', 'multi-select', 'priority']
        return props.schemaFields.some((f) => GROUPABLE.includes(f.fieldType) || f.fieldType === 'entity_reference')
      },
      isEnabled: () => true, // Always enabled for built-in modules
    },
  )

  // Gantt module (lazy - loads on first use)
  viewModeRegistry.register(
    'gantt',
    async () => {
      const { GanttModule } = await import('./gantt/GanttModule')
      return GanttModule
    },
    {
      displayName: 'Gantt Timeline',
      icon: 'gantt',
      canHandle: (_props: GridModuleRenderProps) => {
        // Gantt needs date fields (start_date, end_date)
        // For now, always return true - the module will work without dates
        // but won't show bars
        return true
      },
      isEnabled: () => true,
    },
  )

  // Set default
  viewModeRegistry.setDefault('table')

  logger.info('Built-in view mode modules registered', {
    modules: viewModeRegistry.getRegisteredIds(),
  })
}

// Auto-register on module load (runs once at import time)
registerBuiltInModules()

// Export registry and types
export { viewModeRegistry } from './ViewModeRegistry'
export type { ModuleMetadata } from './ViewModeRegistry'
export type { GridModule, GridModuleFactory, GridModuleRenderProps, SchemaFieldDescriptor } from './GridModule'
export { validateGridModule } from './GridModule'
