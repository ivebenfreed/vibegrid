/* @vitest-environment jsdom */

/**
 * ComputedDecisionTableFieldType Tests
 *
 * GH#1693: computed_decision_table field type
 *
 * Tests cover:
 * 1. Renderer canHandle() correctly identifies computed_decision_table columns
 * 2. Renderer creates DOM elements for pass/fail/pending states
 * 3. Formatter produces correct text output for all states
 * 4. Editor is read-only
 * 5. Field type metadata declares correct capabilities
 * 6. Field type registration in the global registry
 */

import { describe, expect, it, beforeEach } from 'vitest'
import {
  ComputedDecisionTableFieldType,
  ComputedDecisionTableRenderer,
  ComputedDecisionTableEditor,
} from '../ComputedDecisionTableFieldType'
import { fieldTypeRegistry } from '../../../FieldTypeRegistry'
import type { EnhancedColumn } from '../../../FieldTypeRegistry'

// ============================================================================
// Test helpers
// ============================================================================

function makeColumn(cellType: string): EnhancedColumn {
  return {
    id: 'compliance_check',
    field: 'compliance_check',
    name: 'Compliance Check',
    type: cellType,
    cellType,
    width: 160,
    minWidth: 120,
    editable: false,
  } as EnhancedColumn
}

function makePassValue(score = 94) {
  return {
    passed: true,
    score,
    decision: 'approve',
    violations: [],
  }
}

function makeFailValue(score = 48) {
  return {
    passed: false,
    score,
    decision: 'deny',
    violations: [
      { ruleId: 'r1', ruleName: 'GL Limit', severity: 'error', message: 'Below minimum' },
    ],
  }
}

function makePendingValue() {
  return {
    passed: null,
    score: null,
    decision: 'pending',
    violations: [],
  }
}

// ============================================================================
// Renderer tests
// ============================================================================

describe('ComputedDecisionTableRenderer', () => {
  const renderer = new ComputedDecisionTableRenderer()

  describe('canHandle', () => {
    it('should handle computed_decision_table cellType', () => {
      const column = makeColumn('computed_decision_table')
      expect(renderer.canHandle(column)).toBe(true)
    })

    it('should not handle text cellType', () => {
      const column = makeColumn('text')
      expect(renderer.canHandle(column)).toBe(false)
    })

    it('should not handle computed_expression cellType', () => {
      const column = makeColumn('computed_expression')
      expect(renderer.canHandle(column)).toBe(false)
    })
  })

  describe('render - pass state', () => {
    it('should render a badge with "pass" and score', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(makePassValue(94), column, {})
      expect(element.className).toContain('vibegridx-cell-computed-decision-table')
      expect(element.textContent).toContain('pass')
      expect(element.textContent).toContain('94')
    })

    it('should use green background for pass state', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(makePassValue(), column, {})
      const badge = element.querySelector('span')
      expect(badge).not.toBeNull()
      // Colors use CSS custom properties (var(--color-green-100, ...)) for theming
      const bg = badge?.style.backgroundColor ?? ''
      expect(bg).toContain('var(--color-green-100')
    })
  })

  describe('render - fail state', () => {
    it('should render a badge with "fail" and score', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(makeFailValue(48), column, {})
      expect(element.textContent).toContain('fail')
      expect(element.textContent).toContain('48')
    })

    it('should include violation indicator when violations exist', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(makeFailValue(), column, {})
      // The down-pointing triangle character
      expect(element.textContent).toContain('\u25BE')
    })

    it('should use red background for fail state', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(makeFailValue(), column, {})
      const badge = element.querySelector('span')
      expect(badge).not.toBeNull()
      // Colors use CSS custom properties (var(--color-red-100, ...)) for theming
      const bg = badge?.style.backgroundColor ?? ''
      expect(bg).toContain('var(--color-red-100')
    })
  })

  describe('render - pending state', () => {
    it('should render "pending" for null passed value', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(makePendingValue(), column, {})
      expect(element.textContent).toContain('pending')
    })

    it('should render "pending" for null value', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(null, column, {})
      expect(element.textContent).toContain('pending')
    })

    it('should render "pending" for undefined value', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(undefined, column, {})
      expect(element.textContent).toContain('pending')
    })
  })

  describe('update', () => {
    it('should update element content for a new value', () => {
      const column = makeColumn('computed_decision_table')
      const element = renderer.render(makePassValue(), column, {})
      expect(element.textContent).toContain('pass')

      renderer.update(element, makeFailValue(), column)
      expect(element.textContent).toContain('fail')
    })
  })
})

// ============================================================================
// Editor tests
// ============================================================================

describe('ComputedDecisionTableEditor', () => {
  const editor = new ComputedDecisionTableEditor()

  it('should create a read-only display element', () => {
    const element = editor.create()
    expect(element.textContent).toContain('read-only')
  })

  it('should not support inline editing', () => {
    expect(editor.supportsInlineEditing()).toBe(false)
  })

  it('should return null for getValue', () => {
    expect(editor.getValue()).toBeNull()
  })

  it('should validate as always valid', () => {
    const result = editor.validate()
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

// ============================================================================
// Formatter tests
// ============================================================================

describe('ComputedDecisionTableFieldType formatter', () => {
  const formatter = ComputedDecisionTableFieldType.formatter

  it('should format pass values with score', () => {
    expect(formatter.format(makePassValue(94), makeColumn('computed_decision_table'))).toBe(
      'pass (94)',
    )
  })

  it('should format fail values with score', () => {
    expect(formatter.format(makeFailValue(48), makeColumn('computed_decision_table'))).toBe(
      'fail (48)',
    )
  })

  it('should format pending values', () => {
    expect(formatter.format(makePendingValue(), makeColumn('computed_decision_table'))).toBe(
      'pending',
    )
  })

  it('should format null values as pending', () => {
    expect(formatter.format(null, makeColumn('computed_decision_table'))).toBe('pending')
  })

  it('should format undefined values as pending', () => {
    expect(formatter.format(undefined, makeColumn('computed_decision_table'))).toBe('pending')
  })
})

// ============================================================================
// Metadata tests
// ============================================================================

describe('ComputedDecisionTableFieldType metadata', () => {
  it('should declare correct type', () => {
    expect(ComputedDecisionTableFieldType.type).toBe('computed_decision_table')
  })

  it('should declare computed category', () => {
    expect(ComputedDecisionTableFieldType.category).toBe('computed')
  })

  it('should support sorting', () => {
    expect(ComputedDecisionTableFieldType.metadata.supportsSorting).toBe(true)
  })

  it('should support filtering', () => {
    expect(ComputedDecisionTableFieldType.metadata.supportsFiltering).toBe(true)
  })

  it('should not support grouping', () => {
    expect(ComputedDecisionTableFieldType.metadata.supportsGrouping).toBe(false)
  })

  it('should be a calculated field', () => {
    expect(ComputedDecisionTableFieldType.metadata.isCalculatedField).toBe(true)
  })

  it('should be read-only', () => {
    expect(ComputedDecisionTableFieldType.metadata.isReadOnly).toBe(true)
  })

  it('should have rich display', () => {
    expect(ComputedDecisionTableFieldType.metadata.hasRichDisplay).toBe(true)
  })

  it('should have interaction policy with no edit trigger', () => {
    expect(ComputedDecisionTableFieldType.interactionPolicy?.editTrigger).toBe('none')
    expect(ComputedDecisionTableFieldType.interactionPolicy?.defaultAction).toBe('none')
  })
})

// ============================================================================
// getFormatter tests
// ============================================================================

describe('ComputedDecisionTableFieldType getFormatter', () => {
  it('should return a formatter function', () => {
    const fn = ComputedDecisionTableFieldType.getFormatter?.()
    expect(fn).toBeTypeOf('function')
  })

  it('should format pass values', () => {
    const fn = ComputedDecisionTableFieldType.getFormatter?.()
    expect(fn?.(makePassValue(90))).toBe('pass (90)')
  })

  it('should format fail values', () => {
    const fn = ComputedDecisionTableFieldType.getFormatter?.()
    expect(fn?.(makeFailValue(20))).toBe('fail (20)')
  })

  it('should format null as pending', () => {
    const fn = ComputedDecisionTableFieldType.getFormatter?.()
    expect(fn?.(null)).toBe('pending')
  })
})

// ============================================================================
// Registry tests
// ============================================================================

describe('ComputedDecisionTableFieldType registration', () => {
  beforeEach(async () => {
    // Ensure field types are loaded (the import of the module triggers registration)
    await import('../ComputedDecisionTableFieldType')
  })

  it('should be registered in the field type registry', () => {
    expect(fieldTypeRegistry.hasFieldType('computed_decision_table')).toBe(true)
  })

  it('should be categorized as computed', () => {
    const computedTypes = fieldTypeRegistry.getTypesByCategory('computed')
    expect(computedTypes).toContain('computed_decision_table')
  })
})
