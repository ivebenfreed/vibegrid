/**
 * GridModule Interface Validation Tests
 *
 * Tests the validateGridModule() function that validates objects
 * implement the GridModule interface correctly.
 *
 * Part of: VibeGrid D1 Module Registry
 * @see Issue #1416 for architecture overview
 */

import { describe, expect, it } from 'vitest'
import { validateGridModule } from '../GridModule'
import type { GridModule } from '../GridModule'
import React from 'react'

describe('validateGridModule', () => {
  describe('required fields validation', () => {
    it('should accept a valid minimal module', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should reject null', () => {
      expect(() => validateGridModule(null)).toThrow('[GridModule] Module must be an object')
    })

    it('should reject undefined', () => {
      expect(() => validateGridModule(undefined)).toThrow('[GridModule] Module must be an object')
    })

    it('should reject non-objects (string)', () => {
      expect(() => validateGridModule('not-an-object')).toThrow('[GridModule] Module must be an object')
    })

    it('should reject non-objects (number)', () => {
      expect(() => validateGridModule(123)).toThrow('[GridModule] Module must be an object')
    })

    it('should reject non-objects (array)', () => {
      // Arrays are technically objects in JS, so validation proceeds to check id field
      expect(() => validateGridModule([])).toThrow('[GridModule] Module missing valid "id" field')
    })
  })

  describe('id field validation', () => {
    it('should reject missing id', () => {
      const invalidModule = {
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow('[GridModule] Module missing valid "id" field')
    })

    it('should reject empty string id', () => {
      const invalidModule = {
        id: '',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow('[GridModule] Module missing valid "id" field')
    })

    it('should reject non-string id', () => {
      const invalidModule = {
        id: 123,
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow('[GridModule] Module missing valid "id" field')
    })

    it('should accept valid string id', () => {
      const validModule = {
        id: 'valid-id',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })
  })

  describe('displayName field validation', () => {
    it('should reject missing displayName', () => {
      const invalidModule = {
        id: 'test-module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow('[GridModule] Module "test-module" missing "displayName"')
    })

    it('should reject empty string displayName', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: '',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow('[GridModule] Module "test-module" missing "displayName"')
    })

    it('should reject non-string displayName', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 123,
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow('[GridModule] Module "test-module" missing "displayName"')
    })

    it('should accept valid string displayName', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module Display Name',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })
  })

  describe('render function validation', () => {
    it('should reject missing render', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" missing "render" function',
      )
    })

    it('should reject non-function render', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: 'not-a-function',
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" missing "render" function',
      )
    })

    it('should reject null render', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: null,
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" missing "render" function',
      )
    })

    it('should accept valid function render', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept arrow function render', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: (_props: unknown, _stores: unknown) => React.createElement('span', null, 'content'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })
  })

  describe('optional icon field validation', () => {
    it('should accept module without icon', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept undefined icon', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        icon: undefined,
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept valid string icon', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        icon: 'table-icon',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should reject non-string icon', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        icon: 123,
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" has invalid "icon" (must be string)',
      )
    })

    it('should reject array icon', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        icon: ['icon1', 'icon2'],
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" has invalid "icon" (must be string)',
      )
    })
  })

  describe('optional init field validation', () => {
    it('should accept module without init', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept undefined init', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        init: undefined,
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept valid function init', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        init: () => {},
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept init that returns cleanup function', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        init: () => () => {},
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should reject non-function init', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        init: 'not-a-function',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" has invalid "init" (must be function)',
      )
    })

    it('should reject object init', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        init: { initialize: () => {} },
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" has invalid "init" (must be function)',
      )
    })
  })

  describe('optional registerSlots field validation', () => {
    it('should accept module without registerSlots', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept undefined registerSlots', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        registerSlots: undefined,
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should accept valid function registerSlots', () => {
      const validModule = {
        id: 'test-module',
        displayName: 'Test Module',
        registerSlots: (_registry: unknown) => {},
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(validModule)).not.toThrow()
    })

    it('should reject non-function registerSlots', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        registerSlots: 'not-a-function',
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" has invalid "registerSlots" (must be function)',
      )
    })

    it('should reject null registerSlots', () => {
      const invalidModule = {
        id: 'test-module',
        displayName: 'Test Module',
        registerSlots: null,
        render: () => React.createElement('div'),
      }

      expect(() => validateGridModule(invalidModule)).toThrow(
        '[GridModule] Module "test-module" has invalid "registerSlots" (must be function)',
      )
    })
  })

  describe('complete module validation', () => {
    it('should accept a fully populated module', () => {
      const completeModule = {
        id: 'complete-module',
        displayName: 'Complete Test Module',
        icon: 'test-icon',
        init: (_stores: unknown) => {
          // Module initialization
          return () => {
            // Cleanup function
          }
        },
        render: (_props: unknown, _stores: unknown) => React.createElement('div'),
        registerSlots: (_registry: unknown) => {
          // Register custom slots
        },
      }

      expect(() => validateGridModule(completeModule)).not.toThrow()
    })

    it('should work with type assertion after validation', () => {
      const moduleCandidate: unknown = {
        id: 'typed-module',
        displayName: 'Typed Module',
        render: () => React.createElement('div'),
      }

      // This should not throw
      validateGridModule(moduleCandidate)

      // After validation, moduleCandidate is asserted as GridModule
      const validatedModule = moduleCandidate as GridModule
      expect(validatedModule.id).toBe('typed-module')
      expect(validatedModule.displayName).toBe('Typed Module')
      expect(typeof validatedModule.render).toBe('function')
    })
  })

  describe('extra fields handling', () => {
    it('should allow extra unknown fields', () => {
      const moduleWithExtras = {
        id: 'test-module',
        displayName: 'Test Module',
        render: () => React.createElement('div'),
        customProperty: 'custom-value',
        anotherProperty: 123,
      }

      // Should not throw - extra fields are allowed for extensibility
      expect(() => validateGridModule(moduleWithExtras)).not.toThrow()
    })
  })
})
