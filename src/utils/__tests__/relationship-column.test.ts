/**
 * relationship-column helpers
 *
 * Covers target resolution (which columns get the entity picker instead of a
 * free-text box) and the in-view option scan that feeds the picker's leading
 * group.
 */

import { describe, expect, it } from 'vitest'
import {
  collectInViewRelationshipOptions,
  getRelationshipTarget,
} from '../relationship-column'
import type { Column } from '../../types'

function column(overrides: Record<string, unknown>): Column {
  return { id: 'col', field: 'col', name: 'Col', cellType: 'text', ...overrides } as Column
}

describe('getRelationshipTarget', () => {
  it('resolves from relationshipConfig first', () => {
    const col = column({
      relationshipConfig: { targetEntityType: 'Project', displayField: 'title' },
      relationshipTargetEntity: 'Ignored',
    })
    expect(getRelationshipTarget(col)).toEqual({ targetEntityType: 'Project', displayField: 'title' })
  })

  it('falls back to relationshipTargetEntity and defaults displayField to name', () => {
    const col = column({ cellType: 'badge-list', relationshipTargetEntity: 'Company' })
    expect(getRelationshipTarget(col)).toEqual({ targetEntityType: 'Company', displayField: 'name' })
  })

  it('returns null for a plain column', () => {
    expect(getRelationshipTarget(column({}))).toBeNull()
  })

  it('returns null for a badge-list column whose target could not be derived', () => {
    // Nothing to enumerate — caller must fall back to a free-text value.
    expect(getRelationshipTarget(column({ cellType: 'badge-list' }))).toBeNull()
  })

  it('returns null for a missing column', () => {
    expect(getRelationshipTarget(null)).toBeNull()
  })
})

describe('collectInViewRelationshipOptions', () => {
  const columns = [
    column({ id: 'project', relationshipTargetEntity: 'Project' }),
    column({ id: 'title', cellType: 'text' }),
  ]

  it('reads {id, name} pairs from the join projection', () => {
    const rows = [
      { type: 'data', data: { project__rel: [{ id: 'p1', name: 'Apex' }] } },
      { type: 'data', data: { project__rel: [{ id: 'p2', name: 'Beacon' }] } },
    ]
    expect(collectInViewRelationshipOptions(columns, rows)).toEqual({
      project: [
        { id: 'p1', name: 'Apex' },
        { id: 'p2', name: 'Beacon' },
      ],
    })
  })

  it('dedupes ids across rows and sorts named entries alphabetically', () => {
    const rows = [
      { type: 'data', data: { project__rel: [{ id: 'p2', name: 'Beacon' }] } },
      { type: 'data', data: { project__rel: [{ id: 'p1', name: 'Apex' }] } },
      { type: 'data', data: { project__rel: [{ id: 'p2', name: 'Beacon' }] } },
    ]
    expect(collectInViewRelationshipOptions(columns, rows).project).toEqual([
      { id: 'p1', name: 'Apex' },
      { id: 'p2', name: 'Beacon' },
    ])
  })

  it('backfills a name from a later row when an earlier one had none', () => {
    const rows = [
      { type: 'data', data: { project__rel: [{ id: 'p1', name: '' }] } },
      { type: 'data', data: { project__rel: [{ id: 'p1', name: 'Apex' }] } },
    ]
    expect(collectInViewRelationshipOptions(columns, rows).project).toEqual([{ id: 'p1', name: 'Apex' }])
  })

  it('falls back to bare ids on the source row when no projection is present', () => {
    const rows = [{ type: 'data', data: { project: ['p1', 'p2'] } }]
    expect(collectInViewRelationshipOptions(columns, rows).project).toEqual([
      { id: 'p1', name: '' },
      { id: 'p2', name: '' },
    ])
  })

  it('accepts a scalar id', () => {
    const rows = [{ type: 'data', data: { project: 'p1' } }]
    expect(collectInViewRelationshipOptions(columns, rows).project).toEqual([{ id: 'p1', name: '' }])
  })

  it('sorts unresolved ids after named entries', () => {
    const rows = [
      { type: 'data', data: { project__rel: [{ id: 'p0', name: '' }] } },
      { type: 'data', data: { project__rel: [{ id: 'p1', name: 'Zulu' }] } },
    ]
    expect(collectInViewRelationshipOptions(columns, rows).project.map((o) => o.id)).toEqual(['p1', 'p0'])
  })

  it('skips holes in a sparse row array (substrate windowing)', () => {
    const rows: unknown[] = new Array(1000)
    rows[500] = { type: 'data', data: { project__rel: [{ id: 'p1', name: 'Apex' }] } }
    expect(collectInViewRelationshipOptions(columns, rows).project).toEqual([{ id: 'p1', name: 'Apex' }])
  })

  it('ignores non-data rows (group headers, spacers)', () => {
    const rows = [{ type: 'group', data: { project__rel: [{ id: 'p1', name: 'Apex' }] } }]
    expect(collectInViewRelationshipOptions(columns, rows)).toEqual({})
  })

  it('emits no key for a relationship column with no values in view', () => {
    const rows = [{ type: 'data', data: { title: 'x' } }]
    expect(collectInViewRelationshipOptions(columns, rows)).toEqual({})
  })

  it('caps the distinct options it surfaces per column', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      type: 'data',
      data: { project__rel: [{ id: `p${i}`, name: `Project ${i}` }] },
    }))
    expect(collectInViewRelationshipOptions(columns, rows).project.length).toBe(100)
  })

  it('returns an empty map when there are no relationship columns', () => {
    const rows = [{ type: 'data', data: { title: 'x' } }]
    expect(collectInViewRelationshipOptions([column({})], rows)).toEqual({})
  })
})
