/**
 * ViewModeRegistry - Central registry for VibeGrid view mode modules
 *
 * Supports lazy loading, module validation, and fallback resolution.
 * Singleton pattern ensures consistent registration across app.
 *
 * IMPORTANT: Built-in modules are registered at import time, not in App.tsx.
 * This ensures registry is populated in tests, isolated renders, and all entry points.
 *
 * @see GridModule for module interface
 * @see Issue #1416 for architecture overview
 */

import { getLogger } from '@/shared/lib/logging'
import type { GridModule, GridModuleFactory, GridModuleRenderProps } from './GridModule'
import { validateGridModule } from './GridModule'
import type { VibeGridStores } from '../stores/context'

const logger = getLogger(['vibegrid', 'modules', 'ViewModeRegistry'])

/**
 * Module metadata stored separately from module code.
 * Allows view mode switcher to render without loading modules.
 */
export interface ModuleMetadata {
  /** Display name for UI */
  displayName: string

  /** Icon identifier for view mode switcher */
  icon?: string

  /**
   * Check if this module can handle the given props/context.
   * Used for auto-selection when consumer doesn't specify viewMode.
   * IMPORTANT: This is evaluated WITHOUT loading the module (lightweight predicate).
   *
   * @example
   * canHandle: (props) => props.groupByField !== undefined
   */
  canHandle?: (props: GridModuleRenderProps, stores: VibeGridStores) => boolean

  /**
   * Check if this module is enabled (feature flags, permissions).
   * Used to hide modules from switcher based on runtime conditions.
   * IMPORTANT: This is evaluated WITHOUT loading the module.
   *
   * @example
   * isEnabled: () => featureFlags.enableKanban && hasPermission('kanban.view')
   */
  isEnabled?: () => boolean
}

/**
 * ViewModeRegistry: Central registry for VibeGrid view mode modules.
 *
 * Supports lazy loading, module validation, and fallback resolution.
 * Singleton pattern ensures consistent registration across app.
 *
 * IMPORTANT: Built-in modules are registered at import time, not in App.tsx.
 * This ensures registry is populated in tests, isolated renders, and all entry points.
 */
class ViewModeRegistry {
  private modules = new Map<string, GridModuleFactory>()
  private metadata = new Map<string, ModuleMetadata>()
  private loadedModules = new Map<string, GridModule>()
  private defaultModuleId = 'table'

  /**
   * Register a view mode module factory with metadata.
   * Module is not loaded until first use (lazy loading).
   * Metadata is available immediately without loading module.
   *
   * @param id - Unique module identifier
   * @param factory - Async factory function that returns module
   * @param meta - Module metadata (displayName, icon) for view mode switcher
   *
   * @example
   * registry.register('kanban',
   *   async () => {
   *     const { KanbanModule } = await import('./kanban/KanbanModule')
   *     return KanbanModule
   *   },
   *   { displayName: 'Kanban Board', icon: 'kanban' }
   * )
   */
  register(id: string, factory: GridModuleFactory, meta: ModuleMetadata): void {
    if (this.modules.has(id)) {
      logger.warn(`Module "${id}" already registered, overwriting`)
    }
    this.modules.set(id, factory)
    this.metadata.set(id, meta)
    logger.debug(`Registered module: ${id}`, { displayName: meta.displayName })
  }

  /**
   * Get a module by ID, loading it if necessary.
   *
   * @param id - Module identifier
   * @returns Promise resolving to the module
   * @throws Error if module not found or fails validation
   */
  async get(id: string): Promise<GridModule> {
    // Return cached if already loaded
    if (this.loadedModules.has(id)) {
      return this.loadedModules.get(id)!
    }

    // Load module
    const factory = this.modules.get(id)
    if (!factory) {
      throw new Error(
        `[ViewModeRegistry] Module "${id}" not registered. Available: ${this.getRegisteredIds().join(', ')}`,
      )
    }

    try {
      logger.debug(`Loading module: ${id}`)
      const module = await factory()
      validateGridModule(module)
      this.loadedModules.set(id, module)
      logger.info(`Module loaded: ${id}`)
      return module
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`[ViewModeRegistry] Failed to load module "${id}": ${errorMessage}`)
    }
  }

  /**
   * Check if a module is registered.
   *
   * @param id - Module identifier
   * @returns true if module is registered
   */
  has(id: string): boolean {
    return this.modules.has(id)
  }

  /**
   * Check if a module is already loaded (cached).
   *
   * @param id - Module identifier
   * @returns true if module is loaded
   */
  isLoaded(id: string): boolean {
    return this.loadedModules.has(id)
  }

  /**
   * Get all registered module IDs (for view mode switcher UI).
   * Does NOT load modules (just returns IDs).
   *
   * @returns Array of registered module IDs
   * @throws Error if registry is empty (fail-fast validation)
   */
  getRegisteredIds(): string[] {
    // Fail-fast validation: Registry should never be empty after import
    if (this.modules.size === 0) {
      throw new Error(
        '[ViewModeRegistry] Registry is empty - built-in modules failed to register. Check systems/vibegrid/modules/index.ts',
      )
    }
    return Array.from(this.modules.keys())
  }

  /**
   * Get metadata for all registered modules without loading them.
   * Used by view mode switcher to render options.
   *
   * @returns Map of module ID to metadata (displayName, icon)
   * @throws Error if registry is empty (fail-fast validation)
   */
  getRegisteredMeta(): Map<string, ModuleMetadata> {
    // Fail-fast validation: Registry should never be empty after import
    if (this.metadata.size === 0) {
      throw new Error(
        '[ViewModeRegistry] Registry is empty - built-in modules failed to register. Check systems/vibegrid/modules/index.ts',
      )
    }
    return new Map(this.metadata)
  }

  /**
   * Get metadata for a specific module.
   *
   * @param id - Module identifier
   * @returns Module metadata or undefined if not found
   */
  getMetadata(id: string): ModuleMetadata | undefined {
    return this.metadata.get(id)
  }

  /**
   * Get available modules for given props and context.
   * Filters modules by canHandle() and isEnabled() checks (if defined).
   *
   * Used by view mode switcher to hide modes when required data isn't present
   * or when disabled by feature flags/permissions.
   *
   * IMPORTANT: This method does NOT load modules - it evaluates metadata-level
   * predicates only. This preserves lazy loading.
   *
   * @param props - VibeGrid props to check against
   * @param stores - Grid store context
   * @returns Array of module IDs that can handle the given props/context
   */
  getAvailableModules(props: GridModuleRenderProps, stores: VibeGridStores): string[] {
    const availableIds: string[] = []

    for (const id of this.getRegisteredIds()) {
      const meta = this.metadata.get(id)
      if (!meta) continue

      // Check isEnabled first (feature flags, permissions)
      if (meta.isEnabled && !meta.isEnabled()) {
        continue
      }

      // Check canHandle (capability check)
      if (meta.canHandle && !meta.canHandle(props, stores)) {
        continue
      }

      // Module passes both checks
      availableIds.push(id)
    }

    return availableIds
  }

  /**
   * Set default module ID (fallback when viewMode prop not specified).
   *
   * @param id - Module ID to set as default
   * @throws Error if module not registered
   */
  setDefault(id: string): void {
    if (!this.modules.has(id)) {
      throw new Error(`[ViewModeRegistry] Cannot set default to unregistered module "${id}"`)
    }
    this.defaultModuleId = id
    logger.debug(`Set default module: ${id}`)
  }

  /**
   * Get default module ID.
   *
   * @returns Default module ID
   */
  getDefault(): string {
    return this.defaultModuleId
  }

  /**
   * Clear all loaded modules (for testing/hot reload).
   * Does not clear registrations, only cached loaded modules.
   */
  clearCache(): void {
    this.loadedModules.clear()
    logger.debug('Cleared module cache')
  }

  /**
   * Unregister a module (for testing).
   *
   * @param id - Module ID to unregister
   */
  unregister(id: string): void {
    this.modules.delete(id)
    this.metadata.delete(id)
    this.loadedModules.delete(id)
    logger.debug(`Unregistered module: ${id}`)
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.modules.clear()
    this.metadata.clear()
    this.loadedModules.clear()
    this.defaultModuleId = 'table'
    logger.debug('Cleared all modules')
  }
}

// Singleton instance
export const viewModeRegistry = new ViewModeRegistry()
