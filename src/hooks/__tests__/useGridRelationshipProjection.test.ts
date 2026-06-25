/**
 * Unit tests for the pure helpers behind `useGridRelationshipProjection`.
 *
 * These cover the grid-specific glue (flattening substrate rows, stable
 * relCol keying) and the end-to-end projection of `colId__rel` name lookups
 * onto a flat substrate row — the path that fixes relationship chips rendering
 * IDs instead of names (GH#3119 follow-up).
 */

import { describe, expect, it } from 'vitest'
import {
  relColsKey,
  toFlatIdRow,
} from '../useGridRelationshipProjection'
import {
  buildIncludedFromTargets,
  projectRow,
  type RelColumnDescriptor,
  type TargetsByEntityType,
} from '@/shared/data/query/unified/project-row'

describe('toFlatIdRow', () => {
  it('passes through a flat substrate record unchanged (id + fields)', () => {
    const row = { id: 'r1', name: 'Row One', project_id: ['p1'] }
    expect(toFlatIdRow(row)).toEqual({ id: 'r1', name: 'Row One', project_id: ['p1'] })
  })

  it('flattens an already-wrapped {id, data} row', () => {
    const row = { id: 'r1', data: { name: 'Row One', project_id: ['p1'] } }
    expect(toFlatIdRow(row)).toEqual({ id: 'r1', name: 'Row One', project_id: ['p1'] })
  })

  it('does NOT treat a flat row whose own field is named "data" as wrapped', () => {
    // 3 top-level keys (id, data, other) → not the {id,data} wrapped shape.
    const row = { id: 'r1', data: { nested: true }, other: 'x' }
    expect(toFlatIdRow(row)).toEqual({ id: 'r1', data: { nested: true }, other: 'x' })
  })

  it('coerces a missing/non-string id to empty string', () => {
    expect(toFlatIdRow({ name: 'x' }).id).toBe('')
  })
})

describe('relColsKey', () => {
  const a: RelColumnDescriptor = {
    id: 'project_id',
    relationshipTargetEntity: 'Project',
    relationshipDisplayField: 'project_number',
  }
  const b: RelColumnDescriptor = {
    id: 'vendor_id',
    relationshipTargetEntity: 'Company',
    relationshipDisplayField: 'company_name',
  }

  it('is stable for identical content', () => {
    expect(relColsKey([a, b])).toBe(relColsKey([{ ...a }, { ...b }]))
  })

  it('changes when the display field changes', () => {
    expect(relColsKey([a])).not.toBe(
      relColsKey([{ ...a, relationshipDisplayField: 'name' }]),
    )
  })

  it('is empty for no rel columns', () => {
    expect(relColsKey([])).toBe('')
  })
})

describe('grid projection end-to-end (flatten → lookup → projectRow)', () => {
  const relCols: RelColumnDescriptor[] = [
    {
      id: 'project_id',
      relationshipTargetEntity: 'Project',
      relationshipDisplayField: 'project_number',
    },
  ]

  it('projects target names into data.colId__rel (the badge-list Path 1 source)', () => {
    // Target rows carry the display field at the top level.
    const targetsByType: TargetsByEntityType = new Map([
      ['Project', new Map([['p1', { id: 'p1', project_number: 'PRJ-001' }]])],
    ])
    const lookup = buildIncludedFromTargets(relCols, targetsByType)

    const row = { id: 'coi1', name: 'COI 1', project_id: ['p1'] }
    const projected = projectRow(toFlatIdRow(row), lookup, relCols)

    expect(projected.id).toBe('coi1')
    expect(projected.data.project_id__rel).toEqual([{ id: 'p1', name: 'PRJ-001' }])
  })

  it('reads the display field from a target row JSONB data blob when absent at top level', () => {
    const targetsByType: TargetsByEntityType = new Map([
      ['Project', new Map([['p1', { id: 'p1', data: { project_number: 'PRJ-009' } }]])],
    ])
    const lookup = buildIncludedFromTargets(relCols, targetsByType)
    const projected = projectRow(
      toFlatIdRow({ id: 'coi1', project_id: ['p1'] }),
      lookup,
      relCols,
    )
    expect(projected.data.project_id__rel).toEqual([{ id: 'p1', name: 'PRJ-009' }])
  })

  it('emits name="" for an unresolved target (renderer falls back to id suffix)', () => {
    const lookup = buildIncludedFromTargets(relCols, new Map())
    const projected = projectRow(
      toFlatIdRow({ id: 'coi1', project_id: ['pX'] }),
      lookup,
      relCols,
    )
    expect(projected.data.project_id__rel).toEqual([{ id: 'pX', name: '' }])
  })
})
