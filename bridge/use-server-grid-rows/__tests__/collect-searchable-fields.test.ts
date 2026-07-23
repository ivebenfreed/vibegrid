/**
 * Tests for collectSearchableFields — global-search field scoping.
 *
 * Search must target only VISIBLE searchable columns so every match lands in
 * an on-screen (highlightable) cell. Matching a hidden text column produces
 * rows with no visible reason for the match ("not sure what's matching").
 */

import { describe, expect, it } from 'vitest'
import { collectSearchableFields } from '../filter-sort-reaction'

const cols = [
  { id: 'name', field: 'name', cellType: 'text' },
  { id: 'project_number', field: 'project_number', cellType: 'text' },
  { id: 'source_file_name', field: 'source_file_name', cellType: 'text' },
  { id: 'owner', field: 'owner', cellType: 'badge-list' }, // relationship — not searchable
  { id: 'created_at', field: 'created_at', cellType: 'datetime' }, // not searchable
]

describe('collectSearchableFields', () => {
  it('returns all searchable text columns when no visibility map is given', () => {
    expect(collectSearchableFields(cols)).toEqual([
      'name',
      'project_number',
      'source_file_name',
    ])
  })

  it('excludes non-searchable cell types (relationship, datetime)', () => {
    const out = collectSearchableFields(cols)
    expect(out).not.toContain('owner')
    expect(out).not.toContain('created_at')
  })

  it('excludes columns explicitly hidden via columnVisibility', () => {
    const visibility = { source_file_name: false } // hidden
    expect(collectSearchableFields(cols, visibility)).toEqual([
      'name',
      'project_number',
    ])
  })

  it('treats undefined visibility entries as visible', () => {
    // Only `name` is explicitly hidden; the rest (undefined) stay visible.
    const visibility = { name: false }
    expect(collectSearchableFields(cols, visibility)).toEqual([
      'project_number',
      'source_file_name',
    ])
  })

  it('returns empty for no columns', () => {
    expect(collectSearchableFields([])).toEqual([])
    expect(collectSearchableFields(null)).toEqual([])
  })
})
