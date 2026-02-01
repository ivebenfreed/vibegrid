/**
 * SlotRegistry - Unified cell renderer resolution system (D2)
 *
 * Consolidates FieldTypeRegistry + ModularCellBridge + CellFactory.
 * Single source of truth for cell rendering with priority-based resolution.
 *
 * This is a placeholder for the D2 implementation.
 * The full implementation will replace the existing 3-layer cell resolution system.
 *
 * @see Issue #1416 Section 3 for full D2 spec
 */

import { getLogger } from '@/shared/lib/logging'
import { observable, makeObservable } from 'mobx'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'slots', 'SlotRegistry'])

/**
 * Context for cell rendering with full scoping information.
 * Used for slot resolution and cache invalidation.
 */
export interface CellRendererContext {
  /** Current view mode (table, kanban, gantt, etc.) */
  viewMode?: string

  /** Entity type being rendered (e.g., 'Project', 'Task') */
  entityType?: string

  /** Schema ID for custom entities */
  schemaId?: string

  /** Grid instance ID (for multi-grid pages) */
  gridId?: string

  /** Current organization ID (for multi-tenant isolation) */
  organizationId?: string

  /** Any additional context needed by renderers */
  [key: string]: unknown
}

/**
 * CellRenderer: Interface for cell rendering.
 * Matches the existing VibeGridFieldType contract.
 */
export interface CellRenderer {
  /** Render cell content (read-only mode) */
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement

  /** Optional: Update cell value (inline editing) */
  update?(value: unknown, newValue: unknown, column: Column, context: CellRendererContext): Promise<void>

  /** Optional: Render editor UI */
  renderEditor?(value: unknown, column: Column, context: CellRendererContext): HTMLElement

  /** Optional: Validate input before saving */
  validate?(value: unknown, column: Column, context: CellRendererContext): string | null | undefined

  /** Optional: Format value for display */
  format?(value: unknown, column: Column, context: CellRendererContext): string

  /** Optional: Cell affordance metadata */
  affordances?: {
    sortable?: boolean
    filterable?: boolean
    editable?: boolean
    resizable?: boolean
    reorderable?: boolean
    groupable?: boolean
  }

  /** Optional: Cleanup when cell is removed */
  dispose?(): void
}

/**
 * Slot: A cell renderer registration with priority and context scoping.
 */
export interface Slot {
  /** Slot identifier (e.g., 'text', 'currency-abbreviated', 'gantt-bar') */
  id: string

  /** Priority: higher values win in conflict (view=100, domain=50, default=0) */
  priority?: number

  /** Context filter for scoping slot to specific contexts */
  contextFilter?: (context: CellRendererContext) => boolean

  /** Optional: Custom match predicate (overrides fieldType matching) */
  canHandle?: (column: Column, context: CellRendererContext) => boolean

  /** Renderer implementation (factory pattern for lazy loading) */
  renderer: () => Promise<CellRenderer> | CellRenderer
}

/**
 * SlotRegistry: Unified cell renderer resolution system.
 *
 * This is a placeholder implementation for D2.
 * The full implementation will:
 * 1. Replace the 3-layer cell resolution system
 * 2. Support priority-based resolution
 * 3. Support view mode and domain scoping
 * 4. Integrate with ViewModeRegistry for module slots
 */
export class SlotRegistry {
  private slots: Slot[] = []
  private resolvedCache = new Map<string, CellRenderer>()

  /**
   * Preload ready flag (observable for reactive UIs).
   */
  @observable
  public preloadReady = false

  constructor() {
    makeObservable(this)
    logger.debug('SlotRegistry created (D2 placeholder)')
  }

  /**
   * Register a slot (cell renderer).
   */
  register(slot: Slot): void {
    // Check for duplicate registration
    const isDuplicate = this.slots.some(
      (existing) =>
        existing.id === slot.id &&
        (existing.priority ?? 0) === (slot.priority ?? 0) &&
        existing.contextFilter === slot.contextFilter
    )

    if (isDuplicate) {
      logger.debug(`Skipping duplicate slot registration: "${slot.id}"`)
      return
    }

    this.slots.push(slot)
    this.resolvedCache.clear()
    logger.debug(`Registered slot: ${slot.id} (priority: ${slot.priority ?? 0})`)
  }

  /**
   * Unregister a slot by ID.
   */
  unregister(id: string): void {
    const initialLength = this.slots.length
    this.slots = this.slots.filter((s) => s.id !== id)
    if (this.slots.length < initialLength) {
      this.resolvedCache.clear()
      logger.debug(`Unregistered slot: ${id}`)
    }
  }

  /**
   * Get all registered slot IDs.
   */
  getRegisteredIds(): string[] {
    return this.slots.map((s) => s.id)
  }

  /**
   * Preload and cache all slot renderers for given columns and context.
   *
   * CRITICAL: This method MUST be called during grid initialization
   * BEFORE the render path begins.
   */
  async preloadForColumns(columns: Column[], context: CellRendererContext): Promise<void> {
    this.preloadReady = false
    logger.debug('Preloading slots for columns', { count: columns.length, context })

    // Placeholder: In full D2 implementation, this would:
    // 1. Find matching slots for each column
    // 2. Load renderers asynchronously
    // 3. Cache results

    this.preloadReady = true
    logger.debug('Slot preload complete')
  }

  /**
   * Resolve cell renderer for a column + context (SYNCHRONOUS).
   *
   * IMPORTANT: This is a placeholder. The full D2 implementation
   * will provide the actual resolution logic.
   */
  resolve(column: Column, context: CellRendererContext): CellRenderer | null {
    // Placeholder: Return null to indicate no slot found
    // In full D2, this would use the cache populated by preloadForColumns
    logger.debug('SlotRegistry.resolve called (D2 placeholder)', {
      columnId: column.id,
      fieldType: column.fieldType,
    })
    return null
  }

  /**
   * Clear cache for a specific context.
   */
  clearCacheForContext(_context: Partial<CellRendererContext>): void {
    // In full D2, this would selectively clear cache entries matching the context
    this.resolvedCache.clear()
    logger.debug('Cleared slot cache')
  }

  /**
   * Clear all caches.
   */
  clear(): void {
    this.slots = []
    this.resolvedCache.clear()
    this.preloadReady = false
    logger.debug('Cleared all slots')
  }
}

// Singleton instance
export const slotRegistry = new SlotRegistry()
