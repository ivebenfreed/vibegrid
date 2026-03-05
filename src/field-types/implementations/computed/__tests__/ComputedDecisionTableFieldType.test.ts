/* @vitest-environment jsdom */
/**
 * ComputedDecisionTableFieldType Tests
 *
 * Tests for the computed_decision_table cell renderer, formatter, and field type definition.
 * GH#1693
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnhancedColumn } from '../../../FieldTypeRegistry'

// Mock logger to avoid side effects
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import {
  ComputedDecisionTableFieldType,
  ComputedDecisionTableRenderer,
} from '../../computed/ComputedFieldTypes'

/**
 * Helper to create a mock EnhancedColumn for decision table tests
 */
function createDecisionTableColumn(overrides: Partial<EnhancedColumn> = {}): EnhancedColumn {
  return {
    id: 'compliance_check',
    field: 'compliance_check',
    name: 'Compliance Check',
    cellType: 'computed_decision_table',
    width: 160,
    ...overrides,
  } as EnhancedColumn
}

describe('ComputedDecisionTableRenderer', () => {
  let renderer: ComputedDecisionTableRenderer
  let column: EnhancedColumn

  beforeEach(() => {
    renderer = new ComputedDecisionTableRenderer()
    column = createDecisionTableColumn()
  })

  describe('canHandle', () => {
    it('should handle computed_decision_table cellType', () => {
      expect(renderer.canHandle(column)).toBe(true)
    })

    it('should handle computed_decision_table via type fallback', () => {
      const col = createDecisionTableColumn({
        cellType: undefined,
        type: 'computed_decision_table',
      })
      expect(renderer.canHandle(col)).toBe(true)
    })

    it('should NOT handle other types', () => {
      const col = createDecisionTableColumn({ cellType: 'text' as any })
      expect(renderer.canHandle(col)).toBe(false)
    })

    it('should NOT handle computed_expression', () => {
      const col = createDecisionTableColumn({ cellType: 'computed_expression' as any })
      expect(renderer.canHandle(col)).toBe(false)
    })
  })

  describe('render - null/undefined/invalid values', () => {
    it('should render em dash for null value', () => {
      const el = renderer.render(null, column, {})
      expect(el.className).toBe('vibegridx-cell-decision-table')
      expect(el.textContent).toBe('\u2014')
    })

    it('should render em dash for undefined value', () => {
      const el = renderer.render(undefined, column, {})
      expect(el.textContent).toBe('\u2014')
    })

    it('should render em dash for non-object value', () => {
      const el = renderer.render('invalid', column, {})
      expect(el.textContent).toBe('\u2014')
    })

    it('should render em dash for numeric value', () => {
      const el = renderer.render(42, column, {})
      expect(el.textContent).toBe('\u2014')
    })
  })

  describe('render - pass status', () => {
    it('should render pass badge with green styling', () => {
      const value = { status: 'pass', score: 95, violations: [] }
      const el = renderer.render(value, column, {})

      expect(el.className).toBe('vibegridx-cell-decision-table')

      const badge = el.querySelector('span')
      expect(badge).not.toBeNull()
      expect(badge!.textContent).toBe('\u2713 pass')
      // jsdom converts hex to rgb, so check individual style properties
      expect(badge!.style.backgroundColor).toBe('rgb(220, 252, 231)')
      expect(badge!.style.color).toBe('rgb(21, 128, 61)')
    })

    it('should show score next to pass badge', () => {
      const value = { status: 'pass', score: 87.6, violations: [] }
      const el = renderer.render(value, column, {})

      const spans = el.querySelectorAll('span')
      expect(spans.length).toBe(2)
      expect(spans[1].textContent).toBe('88') // Math.round(87.6)
    })

    it('should show score tooltip with "Score: N" when no violations', () => {
      const value = { status: 'pass', score: 100, violations: [] }
      const el = renderer.render(value, column, {})

      const scoreSpan = el.querySelectorAll('span')[1]
      expect(scoreSpan.title).toBe('Score: 100')
    })
  })

  describe('render - fail status', () => {
    it('should render fail badge with red styling', () => {
      const value = { status: 'fail', score: 30, violations: ['Missing cert'] }
      const el = renderer.render(value, column, {})

      const badge = el.querySelector('span')
      expect(badge!.textContent).toBe('\u2717 fail')
      expect(badge!.style.backgroundColor).toBe('rgb(254, 226, 226)')
      expect(badge!.style.color).toBe('rgb(185, 28, 28)')
    })

    it('should show violations in container title', () => {
      const violations = ['Missing cert', 'Expired coverage']
      const value = { status: 'fail', score: 20, violations }
      const el = renderer.render(value, column, {})

      expect(el.title).toBe('Missing cert\nExpired coverage')
    })

    it('should show violations in score tooltip', () => {
      const violations = ['Missing cert']
      const value = { status: 'fail', score: 40, violations }
      const el = renderer.render(value, column, {})

      const scoreSpan = el.querySelectorAll('span')[1]
      expect(scoreSpan.title).toBe('Violations:\nMissing cert')
    })
  })

  describe('render - pending status', () => {
    it('should render pending badge with gray styling', () => {
      const value = { status: 'pending', score: 0, violations: [] }
      const el = renderer.render(value, column, {})

      const badge = el.querySelector('span')
      expect(badge!.textContent).toBe('\u2014 pending')
      expect(badge!.style.backgroundColor).toBe('rgb(243, 244, 246)')
      expect(badge!.style.color).toBe('rgb(107, 114, 128)')
    })

    it('should NOT show score for pending status', () => {
      const value = { status: 'pending', score: 50, violations: [] }
      const el = renderer.render(value, column, {})

      const spans = el.querySelectorAll('span')
      expect(spans.length).toBe(1) // Only the badge, no score span
    })
  })

  describe('render - edge cases', () => {
    it('should handle score of 0', () => {
      const value = { status: 'pass', score: 0, violations: [] }
      const el = renderer.render(value, column, {})

      const spans = el.querySelectorAll('span')
      expect(spans.length).toBe(2)
      expect(spans[1].textContent).toBe('0')
    })

    it('should handle missing violations array', () => {
      const value = { status: 'pass', score: 100 }
      const el = renderer.render(value, column, {})

      // Should not throw
      expect(el.className).toBe('vibegridx-cell-decision-table')
      expect(el.title).toBe('')
    })

    it('should handle unknown status as pending', () => {
      const value = { status: 'unknown', score: 50, violations: [] }
      const el = renderer.render(value, column, {})

      const badge = el.querySelector('span')
      expect(badge!.textContent).toBe('\u2014 pending')
    })
  })

  describe('update', () => {
    it('should replace element content on update', () => {
      const value = { status: 'pass', score: 95, violations: [] }
      const el = renderer.render(value, column, {})

      const newValue = { status: 'fail', score: 30, violations: ['Error'] }
      renderer.update(el, newValue, column)

      const badge = el.querySelector('span')
      expect(badge!.textContent).toBe('\u2717 fail')
    })
  })
})

describe('ComputedDecisionTableFieldType', () => {
  it('should have correct type', () => {
    expect(ComputedDecisionTableFieldType.type).toBe('computed_decision_table')
  })

  it('should have computed category', () => {
    expect(ComputedDecisionTableFieldType.category).toBe('computed')
  })

  it('should be read-only', () => {
    expect(ComputedDecisionTableFieldType.metadata.isReadOnly).toBe(true)
  })

  it('should be a calculated field', () => {
    expect(ComputedDecisionTableFieldType.metadata.isCalculatedField).toBe(true)
  })

  it('should have rich display', () => {
    expect(ComputedDecisionTableFieldType.metadata.hasRichDisplay).toBe(true)
  })

  it('should NOT support sorting', () => {
    expect(ComputedDecisionTableFieldType.metadata.supportsSorting).toBe(false)
  })

  it('should support filtering', () => {
    expect(ComputedDecisionTableFieldType.metadata.supportsFiltering).toBe(true)
  })

  it('should NOT support grouping', () => {
    expect(ComputedDecisionTableFieldType.metadata.supportsGrouping).toBe(false)
  })

  describe('formatter', () => {
    const { formatter } = ComputedDecisionTableFieldType
    const col = createDecisionTableColumn()

    it('should format pass status', () => {
      expect(formatter.format({ status: 'pass', score: 95 }, col)).toBe('pass (95)')
    })

    it('should format fail status', () => {
      expect(formatter.format({ status: 'fail', score: 30 }, col)).toBe('fail (30)')
    })

    it('should format pending status', () => {
      expect(formatter.format({ status: 'pending', score: 0 }, col)).toBe('pending (0)')
    })

    it('should return em dash for null', () => {
      expect(formatter.format(null, col)).toBe('\u2014')
    })

    it('should return em dash for undefined', () => {
      expect(formatter.format(undefined, col)).toBe('\u2014')
    })

    it('should return em dash for non-object', () => {
      expect(formatter.format('string', col)).toBe('\u2014')
    })

    it('should handle missing score', () => {
      expect(formatter.format({ status: 'pass' }, col)).toBe('pass (0)')
    })

    it('should round fractional scores', () => {
      expect(formatter.format({ status: 'pass', score: 87.4 }, col)).toBe('pass (87)')
    })

    it('parse should return null (read-only)', () => {
      expect(formatter.parse('anything', {} as any)).toBeNull()
    })
  })

  describe('editor', () => {
    it('should not support inline editing', () => {
      const { editor } = ComputedDecisionTableFieldType
      expect(editor.supportsInlineEditing?.()).toBe(false)
    })

    it('getValue should return null (read-only)', () => {
      const { editor } = ComputedDecisionTableFieldType
      const el = document.createElement('div')
      expect(editor.getValue(el)).toBeNull()
    })
  })
})
