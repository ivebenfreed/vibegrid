/**
 * SlotRegistry - Unified cell renderer resolution system (D2)
 *
 * Consolidates FieldTypeRegistry + ModularCellBridge + CellFactory.
 * Single source of truth for cell rendering with priority-based resolution.
 *
 * Resolution Algorithm:
 * 1. Filter slots by contextFilter(context) - scopes by viewMode, entityType, schemaId
 * 2. Filter by canHandle(column, context) predicate OR exact fieldType match
 * 3. Sort by priority descending (higher wins: view=100, domain=50, default=0)
 * 4. Return highest priority match, or fallback to 'text' renderer
 *
 * @see Issue #1416 Section 3 for full D2 spec
 */

import { getLogger } from '@/shared/lib/logging'
import { action, observable, makeObservable, runInAction } from 'mobx'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'slots', 'SlotRegistry'])

/**
 * Context for cell rendering with full scoping information.
 * Used for slot resolution and cache invalidation.
 *
 * DESIGN DECISIONS (from spec):
 * - organizationId IS included: Multi-tenant apps may have org-specific renderers
 * - gridId is NOT included: Renderers don't vary per grid instance
 * - locale/permissions are NOT included: These affect formatting/actions, not renderer selection
 */
export interface CellRendererContext {
  /** Current view mode (table, kanban, gantt, etc.) */
  viewMode?: string

  /** Entity type being rendered (e.g., 'Project', 'Task') */
  entityType?: string

  /** Schema ID for custom entities */
  schemaId?: string

  /** Grid instance ID (for multi-grid pages) - NOT used in cache key */
  gridId?: string

  /** Current organization ID (for multi-tenant isolation) */
  organizationId?: string

  /** Relationship data cache (for relationship renderers) */
  relationshipData?: Map<string, unknown>

  /** Any additional context needed by renderers (not used for cache keys) */
  [key: string]: unknown
}

/**
 * CellRenderer: Interface for cell rendering.
 * Preserves ALL capabilities from FieldTypeRegistry's VibeGridFieldType.
 */
export interface CellRenderer {
  /** Render cell content (read-only mode) */
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement

  /** Optional: Update cell value (inline editing) */
  update?(
    value: unknown,
    newValue: unknown,
    column: Column,
    context: CellRendererContext,
  ): Promise<void>

  /** Optional: Validate input before saving */
  validate?(value: unknown, column: Column, context: CellRendererContext): string | null | undefined

  /** Optional: Format value for display */
  format?(value: unknown, column: Column, context: CellRendererContext): string

  /** Optional: Async data loader for relationship/rollup cells */
  asyncDataLoader?(value: unknown, column: Column, context: CellRendererContext): Promise<void>

  /** Optional: Rollup calculation function */
  rollupCalculator?(relatedData: unknown[], column: Column, context: CellRendererContext): unknown

  /** Optional: Cell affordance metadata */
  affordances?: {
    sortable?: boolean
    filterable?: boolean
    editable?: boolean
    resizable?: boolean
    reorderable?: boolean
    groupable?: boolean
  }

  /** Optional: Interaction policy — preserves CellActionRouter's routing semantics */
  interactionPolicy?: {
    defaultAction: 'navigate' | 'edit' | 'custom' | 'none'
    editTrigger: 'content-click' | 'click' | 'f2' | 'icon' | 'none'
    blurPolicy: 'commit' | 'cancel' | 'keep-open'
  }

  /** Optional: Affordance group — preserves AffordanceResolver's group-based styling */
  affordanceGroup?: {
    group: string
    whenNotEditable: string | { remove: string[] } | { override: any[] }
  }

  /** Optional: Custom click handler (for 'custom' defaultAction) */
  handleClick?(context: CellRendererContext & { rowData: any; column: Column }): void

  /** Optional: Renderer metadata */
  metadata?: {
    category?: 'basic' | 'relationship' | 'rollup' | 'computed' | 'gantt'
    description?: string
    [key: string]: unknown
  }

  /** Optional: Cleanup when cell is removed */
  dispose?(): void
}

/**
 * Slot: A cell renderer registration with priority and context scoping.
 *
 * Priority levels (convention):
 * - 0: Default renderers (base field types)
 * - 50: Domain-specific renderers (entity type overrides)
 * - 100: View mode-specific renderers (gantt bars, kanban cards)
 */
export interface Slot {
  /** Slot identifier (e.g., 'text', 'currency-abbreviated', 'gantt-bar') */
  id: string

  /** Priority: higher values win in conflict (view=100, domain=50, default=0) */
  priority?: number

  /**
   * Context filter for scoping slot to specific contexts.
   * Return true to match, false to skip.
   *
   * @example
   * // Gantt-specific slot (only in Gantt view)
   * contextFilter: (ctx) => ctx.viewMode === 'gantt'
   *
   * @example
   * // Project-specific slot (only for Project entities)
   * contextFilter: (ctx) => ctx.entityType === 'Project'
   */
  contextFilter?: (context: CellRendererContext) => boolean

  /**
   * Custom match predicate (overrides fieldType matching).
   * Use for slots that match based on column properties, not just fieldType.
   *
   * @example
   * // Match columns by ID (e.g., entity-name for 'name' columns)
   * canHandle: (column) => column.id === 'name' || column.isPrimaryField
   */
  canHandle?: (column: Column, context: CellRendererContext) => boolean

  /** Renderer implementation (factory pattern for lazy loading) */
  renderer: () => Promise<CellRenderer> | CellRenderer
}

/**
 * SlotRegistry: Unified cell renderer resolution system.
 *
 * Consolidates FieldTypeRegistry + ModularCellBridge + CellFactory.
 * Single source of truth for cell rendering with priority-based resolution.
 *
 * Usage:
 * 1. Register slots at app startup (or lazily via module.registerSlots())
 * 2. Call preloadForColumns() during grid initialization
 * 3. Call resolve() synchronously during render (uses cache)
 */
export class SlotRegistry {
  private slots: Slot[] = []
  private resolvedCache = new Map<string, CellRenderer>()
  private loadingPromises = new Map<string, Promise<void>>()

  /**
   * Preload ready flag (observable for reactive UIs).
   * Set to true when preloadForColumns() completes successfully.
   * VibeGrid gates cell rendering on this flag to prevent sync resolve() errors.
   */
  @observable
  public preloadReady = false

  constructor() {
    makeObservable(this)
    logger.debug('SlotRegistry created')
  }

  /**
   * Register a slot (cell renderer).
   *
   * Supports multiple slots with the same field type but different scopes.
   * Priority and contextFilter determine which slot is selected during resolution.
   *
   * IDEMPOTENCY: If a slot with identical (id, priority, contextFilter) is already
   * registered, it is skipped to prevent duplicate registrations on module reload.
   */
  register(slot: Slot): void {
    // Check for idempotent registration (same id, priority, and contextFilter reference)
    const isDuplicate = this.slots.some(
      (existing) =>
        existing.id === slot.id &&
        (existing.priority ?? 0) === (slot.priority ?? 0) &&
        existing.contextFilter === slot.contextFilter,
    )

    if (isDuplicate) {
      logger.debug(
        `Skipping duplicate slot registration: "${slot.id}" (priority ${slot.priority ?? 0})`,
      )
      return
    }

    // Add slot to array (allows multiple slots per field type)
    this.slots.push(slot)

    // Clear cache when new slot registered
    this.resolvedCache.clear()
    logger.debug(`Registered slot: ${slot.id} (priority: ${slot.priority ?? 0})`)
  }

  /**
   * Unregister a slot by ID.
   * Removes ALL slots with matching ID (regardless of priority/context).
   * Used when view mode deactivates to free memory.
   */
  unregister(id: string): void {
    const initialLength = this.slots.length
    this.slots = this.slots.filter((s) => s.id !== id)
    const removedCount = initialLength - this.slots.length

    if (removedCount > 0) {
      this.resolvedCache.clear()
      logger.debug(`Unregistered ${removedCount} slot(s) with id="${id}"`)
    }
  }

  /**
   * Get all registered slot IDs (may include duplicates for same id with different priorities).
   */
  getRegisteredIds(): string[] {
    return this.slots.map((s) => s.id)
  }

  /**
   * Generate cache key for a column + context combination.
   *
   * Cache key format: fieldType::columnId::entityType::schemaId::viewMode::organizationId
   *
   * Note: columnId IS included because canHandle() predicates may differentiate by column.
   * Note: gridId is NOT included because renderers don't vary per grid instance.
   */
  private getCacheKey(column: Column, context: CellRendererContext): string {
    return [
      column.cellType ?? 'unknown',
      column.id ?? 'unknown',
      context.entityType ?? 'unknown',
      context.schemaId ?? 'default',
      context.viewMode ?? 'table',
      context.organizationId ?? 'default',
    ].join('::')
  }

  /**
   * Preload and cache all slot renderers for given columns and context.
   *
   * CRITICAL: This method MUST be called during grid initialization (in InitStore)
   * BEFORE the render path begins. The synchronous resolve() method
   * will throw if preload hasn't completed.
   *
   * Called when:
   * - Grid first mounts (InitStore initialization)
   * - View mode changes (VibeGrid.tsx useEffect)
   * - Columns change (VibeGrid.tsx useEffect on columns prop)
   */
  @action
  async preloadForColumns(columns: Column[], context: CellRendererContext): Promise<void> {
    this.preloadReady = false // Reset flag at start
    logger.debug('Preloading slots for columns', { count: columns.length, context })

    const preloadPromises: Promise<void>[] = []

    for (const column of columns) {
      const cacheKey = this.getCacheKey(column, context)

      // Skip if already cached
      if (this.resolvedCache.has(cacheKey)) {
        continue
      }

      // Skip if already loading (dedup concurrent calls)
      if (this.loadingPromises.has(cacheKey)) {
        preloadPromises.push(this.loadingPromises.get(cacheKey)!)
        continue
      }

      // Preload asynchronously
      const preloadPromise = this.resolveAsync(column, context, cacheKey)
      this.loadingPromises.set(cacheKey, preloadPromise)
      preloadPromises.push(preloadPromise)
    }

    // Wait for all preloads to complete
    await Promise.all(preloadPromises)

    // Clean up loading promises
    for (const column of columns) {
      const cacheKey = this.getCacheKey(column, context)
      this.loadingPromises.delete(cacheKey)
    }

    runInAction(() => {
      this.preloadReady = true // Set flag when complete
    })
    logger.debug('Slot preload complete', { cachedCount: this.resolvedCache.size })
  }

  /**
   * Internal async resolution (used by preloadForColumns).
   * Resolves and caches renderer for a column + context.
   *
   * Resolution algorithm:
   * 1. Filter slots by contextFilter(context) - must pass if present
   * 2. Filter by canHandle(column, context) OR exact fieldType match
   * 3. Sort by priority descending (higher wins)
   * 4. Return highest priority match, or fallback to 'text' renderer
   */
  private async resolveAsync(
    column: Column,
    context: CellRendererContext,
    cacheKey: string,
  ): Promise<void> {
    // Find matching slots (iterate all slots, may match multiple)
    const candidates: Slot[] = []

    for (const slot of this.slots) {
      // Step 1: Context filter check (if present, must pass)
      if (slot.contextFilter && !slot.contextFilter(context)) {
        continue
      }

      // Step 2: Match by canHandle() predicate OR exact fieldType match
      if (slot.canHandle) {
        if (slot.canHandle(column, context)) {
          candidates.push(slot)
        }
        // canHandle takes precedence - don't fall through to fieldType match
        continue
      }

      // Match by exact cellType (slot.id === column.cellType)
      if (column.cellType === slot.id) {
        candidates.push(slot)
      }
    }

    // Step 3: Sort by priority (descending: highest priority wins)
    candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    // Step 4: Load highest priority match
    if (candidates.length > 0) {
      const slot = candidates[0]
      try {
        const renderer =
          typeof slot.renderer === 'function'
            ? await Promise.resolve(slot.renderer())
            : slot.renderer

        this.resolvedCache.set(cacheKey, renderer)
        logger.debug(
          `Resolved slot for "${column.cellType}": ${slot.id} (priority ${slot.priority ?? 0})`,
        )
        return
      } catch (error) {
        logger.error(`Failed to load renderer for slot "${slot.id}"`, { error })
        throw error
      }
    }

    // Step 4 fallback: Try text renderer as fallback
    if (column.cellType !== 'text') {
      logger.warn(`No renderer for cellType="${column.cellType}", falling back to text`)

      // Find text renderer
      const textSlots = this.slots.filter((s) => s.id === 'text')
      if (textSlots.length > 0) {
        // Sort text slots by priority (in case there are multiple)
        textSlots.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        const textSlot = textSlots[0]

        try {
          const renderer =
            typeof textSlot.renderer === 'function'
              ? await Promise.resolve(textSlot.renderer())
              : textSlot.renderer

          this.resolvedCache.set(cacheKey, renderer)
          return
        } catch (error) {
          logger.error('Failed to load text fallback renderer', { error })
        }
      }
    }

    // No renderer found and no fallback available
    logger.warn(
      `No renderer found for cellType="${column.cellType}" and no text fallback available`,
    )
  }

  /**
   * Resolve cell renderer for a column + context (SYNCHRONOUS).
   *
   * CRITICAL: This method is SYNCHRONOUS and used in the hot render path.
   * It performs a CACHE LOOKUP ONLY. If the renderer hasn't been preloaded
   * via preloadForColumns(), this method throws an error.
   *
   * @throws Error if preload has not completed (preloadReady is false)
   */
  resolve(column: Column, context: CellRendererContext): CellRenderer | null {
    const cacheKey = this.getCacheKey(column, context)

    // Check cache (MUST be preloaded)
    if (this.resolvedCache.has(cacheKey)) {
      return this.resolvedCache.get(cacheKey)!
    }

    // Preload complete but cache miss — column wasn't in preloadForColumns() column set.
    // This indicates a bug: either preload ran before all columns were ready,
    // or the resolve context differs from the preload context (different entityType/viewMode).
    // Use synchronous resolution as a safety net, but warn so we can fix the root cause.
    if (this.preloadReady) {
      const renderer = this.resolveSynchronous(column, context, cacheKey)
      if (renderer) {
        logger.warn(
          `Cache miss for "${column.cellType}" (col=${column.id}) after preload — resolved synchronously. ` +
            `This means preloadForColumns() missed this column. ` +
            `Context: viewMode=${context.viewMode}, entityType=${context.entityType}`,
        )
        return renderer
      }

      logger.warn(
        `No renderer found for "${column.cellType}". ` +
          `Context: viewMode=${context.viewMode}, entityType=${context.entityType}`,
      )
      return null
    }

    // Preload not ready — try synchronous fallback resolution.
    // This can happen during initial render when the renderer reaction fires
    // before preloadForColumns() has completed (async race).
    // All default renderers are synchronous factories, so this works.
    logger.warn(
      `[SlotRegistry] Preload not complete for "${column.cellType}", attempting sync resolve. ` +
        `Context: viewMode=${context.viewMode}, entityType=${context.entityType}`,
    )

    const renderer = this.resolveSynchronous(column, context, cacheKey)
    if (renderer) return renderer

    return null
  }

  /**
   * Synchronous fallback resolution — used when preload hasn't completed yet.
   * Tries the same matching algorithm as resolveAsync but synchronously.
   * Only works for renderers whose factory returns a CellRenderer (not a Promise).
   */
  private resolveSynchronous(
    column: Column,
    context: CellRendererContext,
    cacheKey: string,
  ): CellRenderer | null {
    const candidates: Slot[] = []

    for (const slot of this.slots) {
      if (slot.contextFilter && !slot.contextFilter(context)) continue
      if (slot.canHandle) {
        if (slot.canHandle(column, context)) candidates.push(slot)
        continue
      }
      if (column.cellType === slot.id) candidates.push(slot)
    }

    candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    const trySlot = (slot: Slot): CellRenderer | null => {
      try {
        const result = slot.renderer()
        // Only use if synchronous (not a Promise)
        if (result && typeof result === 'object' && 'render' in result) {
          this.resolvedCache.set(cacheKey, result as CellRenderer)
          return result as CellRenderer
        }
      } catch {
        // Factory threw — skip
      }
      return null
    }

    if (candidates.length > 0) {
      const renderer = trySlot(candidates[0])
      if (renderer) return renderer
    }

    // Fallback to text slot
    const textSlots = this.slots.filter((s) => s.id === 'text')
    if (textSlots.length > 0) {
      textSlots.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      const renderer = trySlot(textSlots[0])
      if (renderer) return renderer
    }

    return null
  }

  /**
   * Clear cache for specific context (partial invalidation).
   *
   * INVALIDATION TRIGGERS:
   * - Schema change: clearCacheForContext({ schemaId: 'schema-123' })
   * - Org switch: clearCacheForContext({ organizationId: 'org-456' })
   * - View mode change: clearCacheForContext({ viewMode: 'gantt' })
   * - Entity type change: clearCacheForContext({ entityType: 'Project' })
   */
  @action
  clearCacheForContext(contextFilter: Partial<CellRendererContext>): void {
    const keysToDelete: string[] = []

    for (const key of this.resolvedCache.keys()) {
      // Cache key format: fieldType::columnId::entityType::schemaId::viewMode::organizationId
      const parts = key.split('::')
      const [, , entityType, schemaId, viewMode, organizationId] = parts

      let shouldDelete = false

      if (contextFilter.entityType && entityType === contextFilter.entityType) {
        shouldDelete = true
      }
      if (contextFilter.schemaId && schemaId === contextFilter.schemaId) {
        shouldDelete = true
      }
      if (contextFilter.viewMode && viewMode === contextFilter.viewMode) {
        shouldDelete = true
      }
      if (contextFilter.organizationId && organizationId === contextFilter.organizationId) {
        shouldDelete = true
      }

      if (shouldDelete) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.resolvedCache.delete(key)
    }

    if (keysToDelete.length > 0) {
      logger.debug(`Cleared ${keysToDelete.length} cache entries for context filter`, {
        contextFilter,
      })
    }
  }

  /**
   * Clear all caches and registrations.
   */
  @action
  clear(): void {
    this.slots = []
    this.resolvedCache.clear()
    this.loadingPromises.clear()
    this.preloadReady = false
    logger.debug('Cleared all slots and cache')
  }

  /**
   * Clear just the resolved cache (keep registrations).
   * Used for testing/hot reload.
   */
  @action
  clearCache(): void {
    this.resolvedCache.clear()
    this.loadingPromises.clear()
    logger.debug('Cleared slot cache')
  }
}

// Singleton instance
export const slotRegistry = new SlotRegistry()
