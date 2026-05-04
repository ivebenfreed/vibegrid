/* @vitest-environment jsdom */

/**
 * GH#2806 P5: Mutation merge truth table tests.
 *
 * Six cases per spec line 116:
 *   1. insert → update   → single insert with merged fields
 *   2. insert → delete   → null (cancel both)
 *   3. update → update   → single update with union of changes
 *   4. update → delete   → single delete (prior update dropped)
 *   5. delete → anything → invalid (assert)
 *   6. same-kind same-field same-value → NO_OP
 */

import { describe, expect, it } from 'vitest'
import { mergeMutations, NO_OP } from '../mutation-merge'
import type { Mutation } from '../mutation-merge'

describe('mergeMutations (GH#2806 P5)', () => {
  // ----------------------------------
  // Case 1: insert → update
  // ----------------------------------

  it('insert → update merges fields into a single insert', () => {
    const prev: Mutation = {
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'A', status: 'open' },
    }
    const next: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { status: 'closed', priority: 'high' },
    }
    const result = mergeMutations(prev, next)
    expect(result).toEqual({
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'A', status: 'closed', priority: 'high' },
    })
  })

  it('insert → update with all-already-matching fields returns NO_OP', () => {
    const prev: Mutation = {
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'A', status: 'open' },
    }
    const next: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { status: 'open' },
    }
    expect(mergeMutations(prev, next)).toBe(NO_OP)
  })

  // ----------------------------------
  // Case 2: insert → delete
  // ----------------------------------

  it('insert → delete cancels both (returns null)', () => {
    const prev: Mutation = {
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'A' },
    }
    const next: Mutation = { kind: 'delete', rowId: 'row-1' }
    expect(mergeMutations(prev, next)).toBeNull()
  })

  // ----------------------------------
  // Case 3: update → update
  // ----------------------------------

  it('update → update unions field changes', () => {
    const prev: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A', status: 'open' },
    }
    const next: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { status: 'closed', priority: 'high' },
    }
    const result = mergeMutations(prev, next)
    expect(result).toEqual({
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A', status: 'closed', priority: 'high' },
    })
  })

  it('update → update with all-already-matching fields returns NO_OP', () => {
    const prev: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A' },
    }
    const next: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A' },
    }
    expect(mergeMutations(prev, next)).toBe(NO_OP)
  })

  it('update → update later wins on conflicting field values', () => {
    const prev: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A' },
    }
    const next: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'B' },
    }
    expect(mergeMutations(prev, next)).toEqual({
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'B' },
    })
  })

  // ----------------------------------
  // Case 4: update → delete
  // ----------------------------------

  it('update → delete drops the prior update; only the delete remains', () => {
    const prev: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A' },
    }
    const next: Mutation = { kind: 'delete', rowId: 'row-1' }
    expect(mergeMutations(prev, next)).toEqual({
      kind: 'delete',
      rowId: 'row-1',
    })
  })

  // ----------------------------------
  // Case 5: delete → * is invalid
  // ----------------------------------

  it('delete → update throws (delete is terminal)', () => {
    const prev: Mutation = { kind: 'delete', rowId: 'row-1' }
    const next: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A' },
    }
    expect(() => mergeMutations(prev, next)).toThrow(/terminal/)
  })

  it('delete → delete throws', () => {
    const prev: Mutation = { kind: 'delete', rowId: 'row-1' }
    const next: Mutation = { kind: 'delete', rowId: 'row-1' }
    expect(() => mergeMutations(prev, next)).toThrow(/terminal/)
  })

  it('delete → create throws', () => {
    const prev: Mutation = { kind: 'delete', rowId: 'row-1' }
    const next: Mutation = {
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'A' },
    }
    expect(() => mergeMutations(prev, next)).toThrow(/terminal/)
  })

  // ----------------------------------
  // Other invalid combinations
  // ----------------------------------

  it('insert → insert throws', () => {
    const prev: Mutation = {
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'A' },
    }
    const next: Mutation = {
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'B' },
    }
    expect(() => mergeMutations(prev, next)).toThrow(/insert.*insert/)
  })

  it('update → create throws', () => {
    const prev: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A' },
    }
    const next: Mutation = {
      kind: 'create',
      rowId: 'row-1',
      data: { title: 'B' },
    }
    expect(() => mergeMutations(prev, next)).toThrow(/update.*create/)
  })

  it('throws on rowId mismatch', () => {
    const prev: Mutation = {
      kind: 'update',
      rowId: 'row-1',
      changes: { title: 'A' },
    }
    const next: Mutation = {
      kind: 'update',
      rowId: 'row-2',
      changes: { title: 'B' },
    }
    expect(() => mergeMutations(prev, next)).toThrow(/rowId/)
  })
})
