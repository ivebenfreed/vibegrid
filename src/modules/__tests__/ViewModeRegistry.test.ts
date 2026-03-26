/**
 * ViewModeRegistry Tests
 *
 * Comprehensive test suite for the ViewModeRegistry singleton:
 * - Module registration
 * - Lazy loading behavior
 * - Metadata access without loading modules
 * - Default module handling
 * - Cache management
 * - Error handling and fail-fast validation
 *
 * Part of: VibeGrid D1 Module Registry
 * @see Issue #1416 for architecture overview
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridModule, GridModuleRenderProps } from '../GridModule'
import type { VibeGridStores } from '../../stores/context'
import React from 'react'

// Mock logger to avoid side effects
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Import after mocking
import { viewModeRegistry } from '../ViewModeRegistry'

/**
 * Create a valid test module
 */
function createTestModule(id: string, displayName: string): GridModule {
  return {
    id,
    displayName,
    render: () => React.createElement('div', null, `${id} content`),
  }
}

/**
 * Create a mock VibeGridStores object for testing
 */
function createMockStores(): VibeGridStores {
  return {} as VibeGridStores
}

describe('ViewModeRegistry', () => {
  beforeEach(() => {
    // Clear the registry before each test
    viewModeRegistry.clear()
  })

  describe('register', () => {
    it('should register a module with metadata', () => {
      const factory = async () => createTestModule('test', 'Test Module')

      viewModeRegistry.register('test', factory, {
        displayName: 'Test Module',
        icon: 'test-icon',
      })

      expect(viewModeRegistry.has('test')).toBe(true)
    })

    it('should register multiple modules', () => {
      viewModeRegistry.register('table', async () => createTestModule('table', 'Table'), {
        displayName: 'Table View',
      })
      viewModeRegistry.register('kanban', async () => createTestModule('kanban', 'Kanban'), {
        displayName: 'Kanban Board',
      })

      expect(viewModeRegistry.has('table')).toBe(true)
      expect(viewModeRegistry.has('kanban')).toBe(true)
    })

    it('should overwrite existing registration with warning', () => {
      const factory1 = async () => createTestModule('test', 'Test v1')
      const factory2 = async () => createTestModule('test', 'Test v2')

      viewModeRegistry.register('test', factory1, { displayName: 'Test v1' })
      viewModeRegistry.register('test', factory2, { displayName: 'Test v2' })

      expect(viewModeRegistry.has('test')).toBe(true)
      // Metadata should be updated
      const meta = viewModeRegistry.getMetadata('test')
      expect(meta?.displayName).toBe('Test v2')
    })
  })

  describe('get (lazy loading)', () => {
    it('should lazy load module on first get()', async () => {
      let loadCount = 0
      const factory = async () => {
        loadCount++
        return createTestModule('lazy', 'Lazy Module')
      }

      viewModeRegistry.register('lazy', factory, { displayName: 'Lazy Module' })

      // Module not loaded yet
      expect(viewModeRegistry.isLoaded('lazy')).toBe(false)
      expect(loadCount).toBe(0)

      // First get() triggers load
      const module = await viewModeRegistry.get('lazy')
      expect(module.id).toBe('lazy')
      expect(loadCount).toBe(1)
      expect(viewModeRegistry.isLoaded('lazy')).toBe(true)
    })

    it('should cache loaded module', async () => {
      let loadCount = 0
      const factory = async () => {
        loadCount++
        return createTestModule('cached', 'Cached Module')
      }

      viewModeRegistry.register('cached', factory, { displayName: 'Cached Module' })

      // First load
      await viewModeRegistry.get('cached')
      expect(loadCount).toBe(1)

      // Second get() should use cache
      await viewModeRegistry.get('cached')
      expect(loadCount).toBe(1) // Still 1, not 2
    })

    it('should throw for unregistered module', async () => {
      // Register a module first so registry isn't empty
      viewModeRegistry.register('other', async () => createTestModule('other', 'Other'), {
        displayName: 'Other',
      })

      await expect(viewModeRegistry.get('nonexistent')).rejects.toThrow(
        '[ViewModeRegistry] Module "nonexistent" not registered',
      )
    })

    it('should validate module on load', async () => {
      const invalidFactory = async () =>
        ({
          id: 'invalid',
          // Missing displayName and render
        }) as unknown as GridModule

      viewModeRegistry.register('invalid', invalidFactory, { displayName: 'Invalid' })

      await expect(viewModeRegistry.get('invalid')).rejects.toThrow(
        '[ViewModeRegistry] Failed to load module "invalid"',
      )
    })

    it('should handle factory errors', async () => {
      const failingFactory = async (): Promise<GridModule> => {
        throw new Error('Factory error')
      }

      viewModeRegistry.register('failing', failingFactory, { displayName: 'Failing' })

      await expect(viewModeRegistry.get('failing')).rejects.toThrow(
        '[ViewModeRegistry] Failed to load module "failing": Factory error',
      )
    })
  })

  describe('has', () => {
    it('should return true for registered modules', () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      expect(viewModeRegistry.has('test')).toBe(true)
    })

    it('should return false for unregistered modules', () => {
      expect(viewModeRegistry.has('nonexistent')).toBe(false)
    })
  })

  describe('isLoaded', () => {
    it('should return false before get()', () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      expect(viewModeRegistry.isLoaded('test')).toBe(false)
    })

    it('should return true after get()', async () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      await viewModeRegistry.get('test')

      expect(viewModeRegistry.isLoaded('test')).toBe(true)
    })

    it('should return false for unregistered modules', () => {
      expect(viewModeRegistry.isLoaded('nonexistent')).toBe(false)
    })
  })

  describe('getRegisteredIds (fail-fast validation)', () => {
    it('should return array of registered module IDs', () => {
      viewModeRegistry.register('table', async () => createTestModule('table', 'Table'), {
        displayName: 'Table',
      })
      viewModeRegistry.register('kanban', async () => createTestModule('kanban', 'Kanban'), {
        displayName: 'Kanban',
      })
      viewModeRegistry.register('gantt', async () => createTestModule('gantt', 'Gantt'), {
        displayName: 'Gantt',
      })

      const ids = viewModeRegistry.getRegisteredIds()

      expect(ids).toContain('table')
      expect(ids).toContain('kanban')
      expect(ids).toContain('gantt')
      expect(ids).toHaveLength(3)
    })

    it('should throw when registry is empty (fail-fast)', () => {
      // Registry is cleared in beforeEach, so it's empty

      expect(() => viewModeRegistry.getRegisteredIds()).toThrow('[ViewModeRegistry] Registry is empty')
    })

    it('should not load modules (just return IDs)', async () => {
      let loadCount = 0
      viewModeRegistry.register(
        'test',
        async () => {
          loadCount++
          return createTestModule('test', 'Test')
        },
        { displayName: 'Test' },
      )

      viewModeRegistry.getRegisteredIds()

      expect(loadCount).toBe(0) // Module not loaded
    })
  })

  describe('getRegisteredMeta (fail-fast validation)', () => {
    it('should return metadata map without loading modules', () => {
      viewModeRegistry.register('table', async () => createTestModule('table', 'Table View'), {
        displayName: 'Table View',
        icon: 'table',
      })
      viewModeRegistry.register('kanban', async () => createTestModule('kanban', 'Kanban Board'), {
        displayName: 'Kanban Board',
        icon: 'kanban',
      })

      const meta = viewModeRegistry.getRegisteredMeta()

      expect(meta.get('table')).toEqual({
        displayName: 'Table View',
        icon: 'table',
      })
      expect(meta.get('kanban')).toEqual({
        displayName: 'Kanban Board',
        icon: 'kanban',
      })
    })

    it('should throw when registry is empty (fail-fast)', () => {
      expect(() => viewModeRegistry.getRegisteredMeta()).toThrow('[ViewModeRegistry] Registry is empty')
    })

    it('should return a copy (not reference to internal map)', () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      const meta1 = viewModeRegistry.getRegisteredMeta()
      const meta2 = viewModeRegistry.getRegisteredMeta()

      // Should be different Map instances
      expect(meta1).not.toBe(meta2)
      // But have same content
      expect(meta1.get('test')).toEqual(meta2.get('test'))
    })
  })

  describe('getMetadata', () => {
    it('should return metadata for registered module', () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test Module',
        icon: 'test-icon',
      })

      const meta = viewModeRegistry.getMetadata('test')

      expect(meta).toEqual({
        displayName: 'Test Module',
        icon: 'test-icon',
      })
    })

    it('should return undefined for unregistered module', () => {
      const meta = viewModeRegistry.getMetadata('nonexistent')

      expect(meta).toBeUndefined()
    })
  })

  describe('getAvailableModules', () => {
    it('should return all modules when no filters defined', () => {
      viewModeRegistry.register('table', async () => createTestModule('table', 'Table'), {
        displayName: 'Table',
      })
      viewModeRegistry.register('kanban', async () => createTestModule('kanban', 'Kanban'), {
        displayName: 'Kanban',
      })

      const props: GridModuleRenderProps = { tableId: 'test', entityType: 'Task' }
      const stores = createMockStores()

      const available = viewModeRegistry.getAvailableModules(props, stores)

      expect(available).toContain('table')
      expect(available).toContain('kanban')
    })

    it('should filter by isEnabled', () => {
      viewModeRegistry.register('enabled', async () => createTestModule('enabled', 'Enabled'), {
        displayName: 'Enabled',
        isEnabled: () => true,
      })
      viewModeRegistry.register('disabled', async () => createTestModule('disabled', 'Disabled'), {
        displayName: 'Disabled',
        isEnabled: () => false,
      })

      const props: GridModuleRenderProps = { tableId: 'test', entityType: 'Task' }
      const stores = createMockStores()

      const available = viewModeRegistry.getAvailableModules(props, stores)

      expect(available).toContain('enabled')
      expect(available).not.toContain('disabled')
    })

    it('should filter by canHandle', () => {
      viewModeRegistry.register('can-handle', async () => createTestModule('can-handle', 'Can Handle'), {
        displayName: 'Can Handle',
        canHandle: () => true,
      })
      viewModeRegistry.register('cannot-handle', async () => createTestModule('cannot-handle', 'Cannot Handle'), {
        displayName: 'Cannot Handle',
        canHandle: () => false,
      })

      const props: GridModuleRenderProps = { tableId: 'test', entityType: 'Task' }
      const stores = createMockStores()

      const available = viewModeRegistry.getAvailableModules(props, stores)

      expect(available).toContain('can-handle')
      expect(available).not.toContain('cannot-handle')
    })

    it('should pass props and stores to canHandle', () => {
      const canHandleSpy = vi.fn().mockReturnValue(true)

      viewModeRegistry.register('spy-module', async () => createTestModule('spy-module', 'Spy'), {
        displayName: 'Spy',
        canHandle: canHandleSpy,
      })

      const props: GridModuleRenderProps = { tableId: 'test-table', entityType: 'Project' }
      const stores = createMockStores()

      viewModeRegistry.getAvailableModules(props, stores)

      expect(canHandleSpy).toHaveBeenCalledWith(props, stores)
    })

    it('should not load modules during availability check', () => {
      let loadCount = 0
      viewModeRegistry.register(
        'lazy',
        async () => {
          loadCount++
          return createTestModule('lazy', 'Lazy')
        },
        {
          displayName: 'Lazy',
          canHandle: () => true,
        },
      )

      const props: GridModuleRenderProps = { tableId: 'test', entityType: 'Task' }
      const stores = createMockStores()

      viewModeRegistry.getAvailableModules(props, stores)

      expect(loadCount).toBe(0) // Module should not be loaded
    })
  })

  describe('setDefault', () => {
    it('should set default module ID', () => {
      viewModeRegistry.register('table', async () => createTestModule('table', 'Table'), {
        displayName: 'Table',
      })

      viewModeRegistry.setDefault('table')

      expect(viewModeRegistry.getDefault()).toBe('table')
    })

    it('should throw for unregistered module', () => {
      expect(() => viewModeRegistry.setDefault('nonexistent')).toThrow(
        '[ViewModeRegistry] Cannot set default to unregistered module "nonexistent"',
      )
    })
  })

  describe('getDefault', () => {
    it('should return "table" by default', () => {
      // Default is 'table' even when nothing is registered
      // (clear() resets to 'table')
      expect(viewModeRegistry.getDefault()).toBe('table')
    })
  })

  describe('clearCache', () => {
    it('should clear loaded modules but keep registrations', async () => {
      let loadCount = 0
      viewModeRegistry.register(
        'test',
        async () => {
          loadCount++
          return createTestModule('test', 'Test')
        },
        { displayName: 'Test' },
      )

      // Load the module
      await viewModeRegistry.get('test')
      expect(loadCount).toBe(1)
      expect(viewModeRegistry.isLoaded('test')).toBe(true)

      // Clear cache
      viewModeRegistry.clearCache()

      // Module still registered but not loaded
      expect(viewModeRegistry.has('test')).toBe(true)
      expect(viewModeRegistry.isLoaded('test')).toBe(false)

      // Next get() should reload
      await viewModeRegistry.get('test')
      expect(loadCount).toBe(2)
    })
  })

  describe('unregister', () => {
    it('should remove module registration', () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      expect(viewModeRegistry.has('test')).toBe(true)

      viewModeRegistry.unregister('test')

      expect(viewModeRegistry.has('test')).toBe(false)
    })

    it('should remove metadata', () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      viewModeRegistry.unregister('test')

      expect(viewModeRegistry.getMetadata('test')).toBeUndefined()
    })

    it('should remove loaded module from cache', async () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      await viewModeRegistry.get('test')
      expect(viewModeRegistry.isLoaded('test')).toBe(true)

      viewModeRegistry.unregister('test')

      expect(viewModeRegistry.isLoaded('test')).toBe(false)
    })
  })

  describe('clear', () => {
    it('should clear all registrations', () => {
      viewModeRegistry.register('table', async () => createTestModule('table', 'Table'), {
        displayName: 'Table',
      })
      viewModeRegistry.register('kanban', async () => createTestModule('kanban', 'Kanban'), {
        displayName: 'Kanban',
      })

      viewModeRegistry.clear()

      expect(viewModeRegistry.has('table')).toBe(false)
      expect(viewModeRegistry.has('kanban')).toBe(false)
    })

    it('should clear all metadata', () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      viewModeRegistry.clear()

      expect(viewModeRegistry.getMetadata('test')).toBeUndefined()
    })

    it('should clear loaded modules', async () => {
      viewModeRegistry.register('test', async () => createTestModule('test', 'Test'), {
        displayName: 'Test',
      })

      await viewModeRegistry.get('test')

      viewModeRegistry.clear()

      expect(viewModeRegistry.isLoaded('test')).toBe(false)
    })

    it('should reset default to "table"', () => {
      viewModeRegistry.register('custom', async () => createTestModule('custom', 'Custom'), {
        displayName: 'Custom',
      })
      viewModeRegistry.setDefault('custom')

      viewModeRegistry.clear()

      expect(viewModeRegistry.getDefault()).toBe('table')
    })
  })
})

// ============================================================================
// Built-in Module Registration Tests
// ============================================================================

describe('Built-in Module Registration', () => {
  beforeEach(() => {
    viewModeRegistry.clear()
  })

  it('should register table module correctly', async () => {
    viewModeRegistry.register('table', async () => createTestModule('table', 'Table View'), {
      displayName: 'Table View',
      icon: 'table',
      canHandle: () => true,
      isEnabled: () => true,
    })

    expect(viewModeRegistry.has('table')).toBe(true)
    const meta = viewModeRegistry.getMetadata('table')
    expect(meta?.displayName).toBe('Table View')
    expect(meta?.icon).toBe('table')
  })

  it('should register kanban module correctly', async () => {
    viewModeRegistry.register('kanban', async () => createTestModule('kanban', 'Kanban Board'), {
      displayName: 'Kanban Board',
      icon: 'kanban',
      canHandle: () => true,
      isEnabled: () => true,
    })

    expect(viewModeRegistry.has('kanban')).toBe(true)
    const meta = viewModeRegistry.getMetadata('kanban')
    expect(meta?.displayName).toBe('Kanban Board')
    expect(meta?.icon).toBe('kanban')
  })

  it('should register gantt module correctly', async () => {
    viewModeRegistry.register('gantt', async () => createTestModule('gantt', 'Gantt Timeline'), {
      displayName: 'Gantt Timeline',
      icon: 'gantt',
      canHandle: () => true,
      isEnabled: () => true,
    })

    expect(viewModeRegistry.has('gantt')).toBe(true)
    const meta = viewModeRegistry.getMetadata('gantt')
    expect(meta?.displayName).toBe('Gantt Timeline')
    expect(meta?.icon).toBe('gantt')
  })

  it('should support registering all three built-in modules', () => {
    viewModeRegistry.register('table', async () => createTestModule('table', 'Table'), {
      displayName: 'Table View',
      icon: 'table',
    })
    viewModeRegistry.register('kanban', async () => createTestModule('kanban', 'Kanban'), {
      displayName: 'Kanban Board',
      icon: 'kanban',
    })
    viewModeRegistry.register('gantt', async () => createTestModule('gantt', 'Gantt'), {
      displayName: 'Gantt Timeline',
      icon: 'gantt',
    })

    const ids = viewModeRegistry.getRegisteredIds()

    expect(ids).toHaveLength(3)
    expect(ids).toContain('table')
    expect(ids).toContain('kanban')
    expect(ids).toContain('gantt')
  })

  it('should set table as default', () => {
    viewModeRegistry.register('table', async () => createTestModule('table', 'Table'), {
      displayName: 'Table View',
    })

    viewModeRegistry.setDefault('table')

    expect(viewModeRegistry.getDefault()).toBe('table')
  })
})

// ============================================================================
// Module Error Boundary Tests
// ============================================================================

describe('Module Error Boundary Behavior', () => {
  beforeEach(() => {
    viewModeRegistry.clear()
  })

  it('should isolate factory errors to specific module', async () => {
    viewModeRegistry.register('good', async () => createTestModule('good', 'Good Module'), {
      displayName: 'Good',
    })
    viewModeRegistry.register(
      'bad',
      async (): Promise<GridModule> => {
        throw new Error('Factory failed')
      },
      {
        displayName: 'Bad',
      },
    )

    // Good module should still work
    const goodModule = await viewModeRegistry.get('good')
    expect(goodModule.id).toBe('good')

    // Bad module should throw
    await expect(viewModeRegistry.get('bad')).rejects.toThrow('Factory failed')

    // Good module still works after bad module error
    const goodModuleAgain = await viewModeRegistry.get('good')
    expect(goodModuleAgain.id).toBe('good')
  })

  it('should isolate validation errors to specific module', async () => {
    viewModeRegistry.register('valid', async () => createTestModule('valid', 'Valid'), {
      displayName: 'Valid',
    })
    viewModeRegistry.register(
      'invalid',
      async () =>
        ({
          id: 'invalid',
          // Missing displayName - will fail validation
        }) as unknown as GridModule,
      {
        displayName: 'Invalid',
      },
    )

    // Valid module should work
    const validModule = await viewModeRegistry.get('valid')
    expect(validModule.id).toBe('valid')

    // Invalid module should throw validation error
    await expect(viewModeRegistry.get('invalid')).rejects.toThrow('missing "displayName"')
  })

  it('should not cache failed module loads', async () => {
    let attemptCount = 0
    viewModeRegistry.register(
      'flaky',
      async (): Promise<GridModule> => {
        attemptCount++
        if (attemptCount === 1) {
          throw new Error('First attempt failed')
        }
        return createTestModule('flaky', 'Flaky Module')
      },
      {
        displayName: 'Flaky',
      },
    )

    // First attempt fails
    await expect(viewModeRegistry.get('flaky')).rejects.toThrow('First attempt failed')
    expect(attemptCount).toBe(1)
    expect(viewModeRegistry.isLoaded('flaky')).toBe(false)

    // Second attempt succeeds
    const module = await viewModeRegistry.get('flaky')
    expect(module.id).toBe('flaky')
    expect(attemptCount).toBe(2)
    expect(viewModeRegistry.isLoaded('flaky')).toBe(true)
  })
})
