/**
 * Inline Creation Utils Tests
 *
 * GH#1658: Tests for extractGroupInheritedFields utility
 */

import { describe, expect, it } from 'vitest'
import type { GroupNode } from '../../types'
import { extractGroupInheritedFields } from '../inline-creation-utils'

// Helper to build a minimal GroupNode
function makeGroup(
  overrides: Partial<GroupNode> & { id: string; field: string; value: unknown },
): GroupNode {
  return {
    level: 0,
    displayValue: String(overrides.value),
    rowCount: 0,
    children: [],
    ...overrides,
  }
}

describe('extractGroupInheritedFields', () => {
  it('single-level returns {field: value}', () => {
    const node = makeGroup({ id: 'g1', field: 'status', value: 'active' })
    const map = new Map([['g1', node]])
    expect(extractGroupInheritedFields(node, map)).toEqual({ status: 'active' })
  })

  it('two-level traversal collects both ancestors', () => {
    const parent = makeGroup({ id: 'p1', field: 'department', value: 'eng', level: 0 })
    const child = makeGroup({
      id: 'c1',
      field: 'status',
      value: 'active',
      level: 1,
      parentId: 'p1',
    })
    const map = new Map([
      ['p1', parent],
      ['c1', child],
    ])
    const result = extractGroupInheritedFields(child, map)
    expect(result).toEqual({ status: 'active', department: 'eng' })
  })

  it('three-level traversal collects all ancestors', () => {
    const grandparent = makeGroup({ id: 'gp1', field: 'org', value: 'acme', level: 0 })
    const parent = makeGroup({
      id: 'p1',
      field: 'department',
      value: 'eng',
      level: 1,
      parentId: 'gp1',
    })
    const child = makeGroup({
      id: 'c1',
      field: 'status',
      value: 'active',
      level: 2,
      parentId: 'p1',
    })
    const map = new Map([
      ['gp1', grandparent],
      ['p1', parent],
      ['c1', child],
    ])
    const result = extractGroupInheritedFields(child, map)
    expect(result).toEqual({ status: 'active', department: 'eng', org: 'acme' })
  })

  it('missing parentId returns only current node', () => {
    const node = makeGroup({ id: 'g1', field: 'status', value: 'active', parentId: 'nonexistent' })
    const map = new Map([['g1', node]])
    expect(extractGroupInheritedFields(node, map)).toEqual({ status: 'active' })
  })

  it('handles circular parentId gracefully (guard loop with visited set)', () => {
    const a = makeGroup({ id: 'a', field: 'f1', value: 'v1', parentId: 'b' })
    const b = makeGroup({ id: 'b', field: 'f2', value: 'v2', parentId: 'a' })
    const map = new Map([
      ['a', a],
      ['b', b],
    ])
    // Should not throw or infinite loop
    const result = extractGroupInheritedFields(a, map)
    expect(result).toEqual({ f1: 'v1', f2: 'v2' })
  })

  it('returns empty object when node has no field', () => {
    const node: GroupNode = {
      id: 'g1',
      field: '',
      value: null,
      displayValue: '',
      level: 0,
      rowCount: 0,
      children: [],
    }
    const map = new Map([['g1', node]])
    expect(extractGroupInheritedFields(node, map)).toEqual({})
  })

  it('node without parentId returns only its own field', () => {
    const node = makeGroup({ id: 'g1', field: 'priority', value: 'high' })
    const map = new Map([['g1', node]])
    expect(extractGroupInheritedFields(node, map)).toEqual({ priority: 'high' })
  })
})
