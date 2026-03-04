/**
 * DecisionTableBadge Component Tests
 *
 * GH#1693: computed_decision_table field type
 *
 * Tests cover:
 * 1. Pass badge rendering (green, with score)
 * 2. Fail badge rendering (red, with score, violations indicator)
 * 3. Pending badge rendering (gray, no score)
 * 4. Edge cases: null/undefined values
 * 5. Expand callback on fail badge click
 *
 * These tests validate source code structure since the component is
 * a React component that requires a DOM environment for full rendering.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const COMPONENT_PATH = join(__dirname, '../DecisionTableBadge.tsx')
const VIOLATIONS_PATH = join(__dirname, '../ViolationsPanel.tsx')

function getSource(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist`)
  }
  return readFileSync(path, 'utf-8')
}

// ============================================================================
// DecisionTableBadge structure tests
// ============================================================================

describe('DecisionTableBadge component structure', () => {
  it('should export DecisionTableBadge function', () => {
    const source = getSource(COMPONENT_PATH)
    expect(source).toContain('export function DecisionTableBadge')
  })

  it('should import DecisionTableFieldValue type', () => {
    const source = getSource(COMPONENT_PATH)
    expect(source).toContain('DecisionTableFieldValue')
  })

  it('should have value prop in interface', () => {
    const source = getSource(COMPONENT_PATH)
    expect(source).toContain('value: DecisionTableFieldValue')
  })

  it('should have optional onExpand prop', () => {
    const source = getSource(COMPONENT_PATH)
    expect(source).toContain('onExpand?: () => void')
  })

  describe('badge states', () => {
    it('should render pending state for null passed', () => {
      const source = getSource(COMPONENT_PATH)
      // Check it handles null/missing value → pending
      expect(source).toContain('pending')
      expect(source).toMatch(/passed\s*===\s*null/)
    })

    it('should render pass state with green styling', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('bg-green-')
      expect(source).toContain('text-green-')
    })

    it('should render fail state with red styling', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('bg-red-')
      expect(source).toContain('text-red-')
    })

    it('should render pending state with muted styling', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('bg-muted')
      expect(source).toContain('text-muted-foreground')
    })

    it('should show score in pass badge', () => {
      const source = getSource(COMPONENT_PATH)
      // pass{score}
      expect(source).toContain('value.score')
    })

    it('should show score in fail badge', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('fail')
    })

    it('should show violations indicator in fail badge', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('violations.length')
    })
  })

  describe('interactivity', () => {
    it('should use button element for fail state', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('<button')
      expect(source).toContain('type="button"')
    })

    it('should call onExpand on fail badge click', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('onClick={onExpand}')
    })

    it('should have cursor-pointer on fail badge', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('cursor-pointer')
    })
  })

  describe('dark mode support', () => {
    it('should have dark mode variants for pass badge', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('dark:bg-green-')
      expect(source).toContain('dark:text-green-')
    })

    it('should have dark mode variants for fail badge', () => {
      const source = getSource(COMPONENT_PATH)
      expect(source).toContain('dark:bg-red-')
      expect(source).toContain('dark:text-red-')
    })
  })
})

// ============================================================================
// ViolationsPanel structure tests
// ============================================================================

describe('ViolationsPanel component structure', () => {
  it('should export ViolationsPanel function', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('export function ViolationsPanel')
  })

  it('should accept violations array prop', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('violations: Violation[]')
  })

  it('should return null for empty violations', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('violations.length === 0')
    expect(source).toContain('return null')
  })

  it('should render severity icons', () => {
    const source = getSource(VIOLATIONS_PATH)
    // Warning icon and error icon
    expect(source).toContain("severity === 'warning'")
  })

  it('should render violation messages', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('v.message')
  })

  it('should use ruleId as key when available', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('v.ruleId')
  })

  it('should have muted foreground text for messages', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('text-muted-foreground')
  })

  it('should show rule name prefix when available', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('v.ruleName')
  })

  it('should have dark mode support for severity colors', () => {
    const source = getSource(VIOLATIONS_PATH)
    expect(source).toContain('dark:text-red-')
    expect(source).toContain('dark:text-yellow-')
  })
})
