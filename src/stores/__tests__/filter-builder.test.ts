/**
 * Filter Builder TDD Tests - Phase 1
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * These tests are written FIRST (TDD) and should FAIL initially.
 * Implementation will make them pass.
 *
 * Tests cover:
 * 1. FilterGroup type structure validation
 * 2. InteractionStore.filterBuilderState observable
 * 3. InteractionStore filter builder actions
 * 4. VisualStateStore.filterGroup and activeFilterCount
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { FilterBuilderStore } from '../FilterBuilderStore'
import { VisualStateStore } from '../VisualStateStore'
// Import types that will be created in Phase 1 implementation
// These imports will fail initially (expected - TDD)
import type {
  FilterBuilderState,
  FilterCondition,
  FilterGroup,
  FilterPreset,
  ValidationError,
} from '../../types/filter-types'

// ====================================
// FILTER GROUP TYPE TESTS
// ====================================

describe('FilterGroup Type Structure', () => {
  it('should have logic property with AND or OR value', () => {
    const andGroup: FilterGroup = {
      logic: 'AND',
      conditions: [],
    }

    const orGroup: FilterGroup = {
      logic: 'OR',
      conditions: [],
    }

    expect(andGroup.logic).toBe('AND')
    expect(orGroup.logic).toBe('OR')
  })

  it('should support FilterCondition in conditions array', () => {
    const condition: FilterCondition = {
      id: 'cond-1',
      field: 'status',
      operator: 'equals',
      value: 'active',
    }

    const group: FilterGroup = {
      logic: 'AND',
      conditions: [condition],
    }

    expect(group.conditions).toHaveLength(1)
    expect((group.conditions[0] as FilterCondition).field).toBe('status')
    expect((group.conditions[0] as FilterCondition).operator).toBe('equals')
  })

  it('should support nested FilterGroup in conditions array (recursive)', () => {
    const innerGroup: FilterGroup = {
      logic: 'OR',
      conditions: [
        { id: 'cond-1', field: 'priority', operator: 'equals', value: 'high' },
        { id: 'cond-2', field: 'priority', operator: 'equals', value: 'critical' },
      ],
    }

    const outerGroup: FilterGroup = {
      logic: 'AND',
      conditions: [
        { id: 'cond-3', field: 'status', operator: 'equals', value: 'active' },
        innerGroup,
      ],
    }

    expect(outerGroup.conditions).toHaveLength(2)
    expect((outerGroup.conditions[1] as FilterGroup).logic).toBe('OR')
    expect((outerGroup.conditions[1] as FilterGroup).conditions).toHaveLength(2)
  })

  it('should support caseSensitive option in FilterCondition', () => {
    const condition: FilterCondition = {
      id: 'cond-1',
      field: 'name',
      operator: 'contains',
      value: 'test',
      caseSensitive: true,
    }

    expect(condition.caseSensitive).toBe(true)
  })
})

describe('FilterCondition Type Structure', () => {
  it('should require id, field, operator, and value', () => {
    const condition: FilterCondition = {
      id: 'uuid-here',
      field: 'status',
      operator: 'equals',
      value: 'active',
    }

    expect(condition.id).toBeDefined()
    expect(condition.field).toBeDefined()
    expect(condition.operator).toBeDefined()
    expect(condition.value).toBeDefined()
  })

  it('should support all 13 filter operators', () => {
    const operators = [
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'greater_than',
      'less_than',
      'is_empty',
      'is_not_empty',
      'in',
      'not_in',
      'regex',
    ] as const

    operators.forEach((op) => {
      const condition: FilterCondition = {
        id: 'test',
        field: 'field',
        operator: op,
        value: 'value',
      }
      expect(condition.operator).toBe(op)
    })
  })
})

describe('FilterPreset Type Structure', () => {
  it('should have id, name, filterGroup, and createdAt', () => {
    const preset: FilterPreset = {
      id: 'preset-1',
      name: 'Active High Priority',
      filterGroup: {
        logic: 'AND',
        conditions: [
          { id: 'c1', field: 'status', operator: 'equals', value: 'active' },
          { id: 'c2', field: 'priority', operator: 'equals', value: 'high' },
        ],
      },
      createdAt: '2026-01-03T00:00:00Z',
    }

    expect(preset.id).toBe('preset-1')
    expect(preset.name).toBe('Active High Priority')
    expect(preset.filterGroup.logic).toBe('AND')
    expect(preset.createdAt).toBeDefined()
  })
})

// ====================================
// INTERACTION STORE TESTS
// ====================================

describe('FilterBuilderStore filterBuilderState', () => {
  let store: FilterBuilderStore

  beforeEach(() => {
    store = new FilterBuilderStore()
  })

  it('should have filterBuilderState observable', () => {
    // This test will fail until filterBuilderState is added to InteractionStore
    expect(store.filterBuilderState).toBeDefined()
  })

  it('should have correct initial filterBuilderState', () => {
    const expectedInitial: FilterBuilderState = {
      isOpen: false,
      searchValue: '',
      draftFilterGroup: null,
      presets: [],
      validationErrors: [],
      showComplexityWarning: false,
    }

    expect(store.filterBuilderState.isOpen).toBe(expectedInitial.isOpen)
    expect(store.filterBuilderState.searchValue).toBe(expectedInitial.searchValue)
    expect(store.filterBuilderState.draftFilterGroup).toBe(expectedInitial.draftFilterGroup)
    expect(store.filterBuilderState.presets).toEqual(expectedInitial.presets)
    expect(store.filterBuilderState.validationErrors).toEqual(expectedInitial.validationErrors)
    expect(store.filterBuilderState.showComplexityWarning).toBe(
      expectedInitial.showComplexityWarning,
    )
  })

  it('should reset filterBuilderState on store reset', () => {
    // Set some non-default values
    store.filterBuilderState.isOpen = true
    store.filterBuilderState.searchValue = 'test'
    store.filterBuilderState.draftFilterGroup = {
      logic: 'AND',
      conditions: [],
    }

    // Reset the store
    store.reset()

    // Should be back to defaults
    expect(store.filterBuilderState.isOpen).toBe(false)
    expect(store.filterBuilderState.searchValue).toBe('')
    expect(store.filterBuilderState.draftFilterGroup).toBe(null)
  })
})

describe('FilterBuilderStore openFilterBuilder action', () => {
  let store: FilterBuilderStore

  beforeEach(() => {
    store = new FilterBuilderStore()
  })

  it('should have openFilterBuilder action', () => {
    expect(store.openFilterBuilder).toBeDefined()
    expect(typeof store.openFilterBuilder).toBe('function')
  })

  it('should set isOpen to true when openFilterBuilder is called', () => {
    expect(store.filterBuilderState.isOpen).toBe(false)

    store.openFilterBuilder()

    expect(store.filterBuilderState.isOpen).toBe(true)
  })
})

describe('FilterBuilderStore closeFilterBuilder action', () => {
  let store: FilterBuilderStore

  beforeEach(() => {
    store = new FilterBuilderStore()
  })

  it('should have closeFilterBuilder action', () => {
    expect(store.closeFilterBuilder).toBeDefined()
    expect(typeof store.closeFilterBuilder).toBe('function')
  })

  it('should set isOpen to false and clear draft when closeFilterBuilder is called', () => {
    // Setup: open filter builder with a draft
    store.openFilterBuilder()
    store.filterBuilderState.draftFilterGroup = {
      logic: 'AND',
      conditions: [{ id: 'c1', field: 'status', operator: 'equals', value: 'active' }],
    }
    store.filterBuilderState.searchValue = 'stat'

    // Action
    store.closeFilterBuilder()

    // Verify
    expect(store.filterBuilderState.isOpen).toBe(false)
    expect(store.filterBuilderState.draftFilterGroup).toBe(null)
    expect(store.filterBuilderState.searchValue).toBe('')
  })
})

describe('FilterBuilderStore setDraftFilter action', () => {
  let store: FilterBuilderStore

  beforeEach(() => {
    store = new FilterBuilderStore()
  })

  it('should have setDraftFilter action', () => {
    expect(store.setDraftFilter).toBeDefined()
    expect(typeof store.setDraftFilter).toBe('function')
  })

  it('should update draftFilterGroup when setDraftFilter is called', () => {
    const filterGroup: FilterGroup = {
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'status', operator: 'equals', value: 'active' },
        { id: 'c2', field: 'priority', operator: 'not_equals', value: 'low' },
      ],
    }

    store.setDraftFilter(filterGroup)

    expect(store.filterBuilderState.draftFilterGroup).toEqual(filterGroup)
  })

  it('should set draftFilterGroup to null when called with null', () => {
    // Setup with existing draft
    store.filterBuilderState.draftFilterGroup = {
      logic: 'OR',
      conditions: [],
    }

    store.setDraftFilter(null)

    expect(store.filterBuilderState.draftFilterGroup).toBe(null)
  })
})

// ====================================
// VISUAL STATE STORE TESTS
// ====================================

describe('VisualStateStore filterGroup', () => {
  let store: VisualStateStore

  beforeEach(() => {
    store = new VisualStateStore()
  })

  it('should have filterGroup observable', () => {
    // This test will fail until filterGroup is added to VisualStateStore
    expect(store.filterGroup).toBeDefined()
  })

  it('should have filterGroup initially set to null', () => {
    expect(store.filterGroup).toBe(null)
  })

  it('should reset filterGroup on store reset', () => {
    // Set a filter group
    store.filterGroup = {
      logic: 'AND',
      conditions: [{ id: 'c1', field: 'status', operator: 'equals', value: 'active' }],
    }

    store.reset()

    expect(store.filterGroup).toBe(null)
  })
})

describe('VisualStateStore activeFilterCount computed', () => {
  let store: VisualStateStore

  beforeEach(() => {
    store = new VisualStateStore()
  })

  it('should have activeFilterCount computed', () => {
    expect(store.activeFilterCount).toBeDefined()
  })

  it('should return 0 when filterGroup is null', () => {
    store.filterGroup = null

    expect(store.activeFilterCount).toBe(0)
  })

  it('should return 0 when filterGroup has no conditions', () => {
    store.filterGroup = {
      logic: 'AND',
      conditions: [],
    }

    expect(store.activeFilterCount).toBe(0)
  })

  it('should count conditions in flat filterGroup', () => {
    store.filterGroup = {
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'status', operator: 'equals', value: 'active' },
        { id: 'c2', field: 'priority', operator: 'equals', value: 'high' },
        { id: 'c3', field: 'type', operator: 'contains', value: 'bug' },
      ],
    }

    expect(store.activeFilterCount).toBe(3)
  })

  it('should count conditions recursively in nested filterGroups', () => {
    // Structure:
    // AND
    //   - condition (status = active)
    //   - OR
    //       - condition (priority = high)
    //       - condition (priority = critical)
    //   - condition (assigned = true)
    // Total: 4 conditions
    store.filterGroup = {
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'status', operator: 'equals', value: 'active' },
        {
          logic: 'OR',
          conditions: [
            { id: 'c2', field: 'priority', operator: 'equals', value: 'high' },
            { id: 'c3', field: 'priority', operator: 'equals', value: 'critical' },
          ],
        },
        { id: 'c4', field: 'assigned', operator: 'equals', value: true },
      ],
    }

    expect(store.activeFilterCount).toBe(4)
  })

  it('should count conditions in deeply nested groups (3 levels)', () => {
    // Structure:
    // AND (level 1)
    //   - condition (1)
    //   - OR (level 2)
    //       - condition (2)
    //       - AND (level 3)
    //           - condition (3)
    //           - condition (4)
    // Total: 4 conditions
    store.filterGroup = {
      logic: 'AND',
      conditions: [
        { id: 'c1', field: 'f1', operator: 'equals', value: 'v1' },
        {
          logic: 'OR',
          conditions: [
            { id: 'c2', field: 'f2', operator: 'equals', value: 'v2' },
            {
              logic: 'AND',
              conditions: [
                { id: 'c3', field: 'f3', operator: 'equals', value: 'v3' },
                { id: 'c4', field: 'f4', operator: 'equals', value: 'v4' },
              ],
            },
          ],
        },
      ],
    }

    expect(store.activeFilterCount).toBe(4)
  })
})

// ====================================
// FILTER BUILDER STATE TYPE TESTS
// ====================================

describe('FilterBuilderState Type Structure', () => {
  it('should have all required fields', () => {
    const state: FilterBuilderState = {
      isOpen: false,
      searchValue: '',
      draftFilterGroup: null,
      presets: [],
      validationErrors: [],
      showComplexityWarning: false,
    }

    expect(state.isOpen).toBe(false)
    expect(state.searchValue).toBe('')
    expect(state.draftFilterGroup).toBe(null)
    expect(state.presets).toEqual([])
    expect(state.validationErrors).toEqual([])
    expect(state.showComplexityWarning).toBe(false)
  })

  it('should support draftFilterGroup with nested structure', () => {
    const state: FilterBuilderState = {
      isOpen: true,
      searchValue: 'status',
      draftFilterGroup: {
        logic: 'AND',
        conditions: [
          { id: 'c1', field: 'status', operator: 'equals', value: 'active' },
          {
            logic: 'OR',
            conditions: [{ id: 'c2', field: 'priority', operator: 'equals', value: 'high' }],
          },
        ],
      },
      presets: [
        {
          id: 'p1',
          name: 'My Preset',
          filterGroup: { logic: 'AND', conditions: [] },
          createdAt: '2026-01-03T00:00:00Z',
        },
      ],
      validationErrors: [],
      showComplexityWarning: false,
    }

    expect(state.draftFilterGroup?.logic).toBe('AND')
    expect(state.presets).toHaveLength(1)
  })
})

describe('ValidationError Type Structure', () => {
  it('should support validation errors with conditionId and message', () => {
    const error: ValidationError = {
      conditionId: 'c1',
      message: 'Value is required',
    }

    expect(error.conditionId).toBe('c1')
    expect(error.message).toBe('Value is required')
  })
})
