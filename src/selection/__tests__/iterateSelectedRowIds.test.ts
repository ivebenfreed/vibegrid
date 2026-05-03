/**
 * GH#2804 B10: iterateSelectedRowIds helper tests.
 *
 * Wave 3b ships explicit-mode iteration; marker-mode iteration is a no-op
 * (yields nothing and warns once) — see Critical 3 round-2 review fix.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SelectionMarkerIterationNotImplementedError,
  _resetMarkerWarnForTesting,
  assertSelectionExplicit,
  iterateSelectedRowIds,
} from '../iterateSelectedRowIds'
import type { SelectionState } from '@/systems/vibegrid/types'

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

describe('iterateSelectedRowIds — explicit mode', () => {
  it('yields each row id from selection.rows', async () => {
    const selection: SelectionState = {
      mode: 'explicit',
      cells: new Set(),
      rows: new Set(['r1', 'r2', 'r3']),
    }
    const ids = await collect(iterateSelectedRowIds(selection, null))
    expect(ids.sort()).toEqual(['r1', 'r2', 'r3'])
  })

  it('yields nothing when selection.rows is empty', async () => {
    const selection: SelectionState = {
      mode: 'explicit',
      cells: new Set(),
      rows: new Set(),
    }
    const ids = await collect(iterateSelectedRowIds(selection, null))
    expect(ids).toEqual([])
  })
})

describe('iterateSelectedRowIds — marker mode (Critical 3 round-2 review)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    _resetMarkerWarnForTesting()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('yields no ids and warns once when handed a marker-mode selection', async () => {
    const selection: SelectionState = {
      mode: 'all-with-exclusions',
      exclusions: new Set(['r5']),
      explicitCells: new Set(),
    }
    const ids = await collect(iterateSelectedRowIds(selection, null))
    expect(ids).toEqual([])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[GH#2804 B10]'),
    )
  })

  it('only warns once across multiple iterations (one-shot guard)', async () => {
    const selection: SelectionState = {
      mode: 'all-with-exclusions',
      exclusions: new Set(),
      explicitCells: new Set(),
    }
    await collect(iterateSelectedRowIds(selection, null))
    await collect(iterateSelectedRowIds(selection, null))
    await collect(iterateSelectedRowIds(selection, null))
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

describe('assertSelectionExplicit', () => {
  it('passes through explicit selections', () => {
    const selection: SelectionState = {
      mode: 'explicit',
      cells: new Set(),
      rows: new Set(['r1']),
    }
    expect(() => assertSelectionExplicit(selection)).not.toThrow()
  })

  it('throws SelectionMarkerIterationNotImplementedError on marker selection', () => {
    const selection: SelectionState = {
      mode: 'all-with-exclusions',
      exclusions: new Set(),
      explicitCells: new Set(),
    }
    expect(() => assertSelectionExplicit(selection)).toThrow(
      SelectionMarkerIterationNotImplementedError,
    )
  })
})
