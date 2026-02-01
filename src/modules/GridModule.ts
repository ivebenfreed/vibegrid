/**
 * GridModule - Pluggable view mode interface for VibeGrid
 *
 * Each view mode (Table, Kanban, Gantt, etc.) implements this interface.
 * Modules are registered with ViewModeRegistry and lazy-loaded on demand.
 *
 * @see ViewModeRegistry for registration and loading
 * @see Issue #1416 for architecture overview
 */

import type React from 'react'
import type { VibeGridStores } from '../stores/context'
import type { SlotRegistry } from '../slots/SlotRegistry'

/**
 * Props passed to view mode render functions
 */
export interface GridModuleRenderProps {
  /** Unique identifier for this table instance */
  tableId: string
  /** Entity type being rendered (e.g., 'Project', 'Task') */
  entityType: string
  /** User-friendly display name for the entity */
  entityDisplayName?: string
  /** Organization ID for multi-tenant support */
  orgId?: string
  /** Container width */
  width?: number | string
  /** Container height */
  height?: number | string
  /** Additional class names */
  className?: string
  /** Enable selection column */
  enableSelectionColumn?: boolean
  /** Enable drag and drop */
  enableDragAndDrop?: boolean
  /** Enable grouping */
  enableGrouping?: boolean
  /** Enable hierarchy mode */
  enableHierarchy?: boolean
  /** Cell click handler */
  onCellClick?: (rowId: string, columnId: string) => void
  /** Entity update handler */
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
  /** Any additional props */
  [key: string]: unknown
}

/**
 * GridModule: Pluggable view mode implementation for VibeGrid.
 *
 * Design decisions:
 * - ID-based registry (not class-based): Simple string keys for lazy loading
 * - init() cleanup pattern: Follows React hooks pattern for resource management
 * - registerSlots() integration: View modes can extend cell rendering (D2 integration)
 */
export interface GridModule {
  /** Unique identifier for this view mode (e.g., 'table', 'kanban', 'gantt') */
  readonly id: string

  /** Display name for UI (e.g., "Table View", "Kanban Board") */
  readonly displayName: string

  /** Optional icon class for view mode switcher */
  readonly icon?: string

  /**
   * Initialize view mode-specific stores and state.
   * Called once when module is first activated.
   *
   * @param stores - The VibeGrid store context
   * @returns Cleanup function (called when view mode changes or grid unmounts)
   */
  init?: (stores: VibeGridStores) => void | (() => void)

  /**
   * Render the view mode UI.
   * Receives all VibeGrid props and store context.
   *
   * @param props - Props for the view mode component
   * @param stores - The VibeGrid store context
   * @returns React element to render
   */
  render: (props: GridModuleRenderProps, stores: VibeGridStores) => React.ReactElement

  /**
   * Optional: Register custom slots for this view mode.
   * Allows view modes to extend cell rendering (e.g., Gantt's timeline cells).
   *
   * WHEN CALLED: Once after module is loaded, before init() is called.
   * WHERE CALLED: VibeGrid.tsx module activation logic.
   *
   * CLEANUP: Slots remain registered after module deactivation but become
   * inactive via contextFilter (e.g., Gantt slots only match when viewMode='gantt').
   * Cleanup hook can optionally unregister slots for memory efficiency.
   *
   * @param slotRegistry - The slot registry for custom cell renderers
   */
  registerSlots?: (slotRegistry: SlotRegistry) => void
}

/**
 * Factory function type for lazy-loading modules.
 * Modules are not loaded until first use.
 */
export type GridModuleFactory = () => Promise<GridModule>

/**
 * Validates that an object implements the GridModule interface correctly.
 *
 * @param module - Object to validate
 * @throws Error if module is invalid
 */
export function validateGridModule(module: unknown): asserts module is GridModule {
  if (!module || typeof module !== 'object') {
    throw new Error('[GridModule] Module must be an object')
  }

  const m = module as Record<string, unknown>

  if (!m.id || typeof m.id !== 'string') {
    throw new Error('[GridModule] Module missing valid "id" field')
  }

  if (!m.displayName || typeof m.displayName !== 'string') {
    throw new Error(`[GridModule] Module "${m.id}" missing "displayName"`)
  }

  if (typeof m.render !== 'function') {
    throw new Error(`[GridModule] Module "${m.id}" missing "render" function`)
  }

  // Optional fields type checks
  if (m.icon !== undefined && typeof m.icon !== 'string') {
    throw new Error(`[GridModule] Module "${m.id}" has invalid "icon" (must be string)`)
  }

  if (m.init !== undefined && typeof m.init !== 'function') {
    throw new Error(`[GridModule] Module "${m.id}" has invalid "init" (must be function)`)
  }

  if (m.registerSlots !== undefined && typeof m.registerSlots !== 'function') {
    throw new Error(`[GridModule] Module "${m.id}" has invalid "registerSlots" (must be function)`)
  }
}
