import { describe, expect, it } from 'vitest'
import type { RowAction } from '../../VibeGrid'
import { resolveEnableDelete } from '../resolve-enable-delete'

const base = { readOnly: false, enableSelectionColumn: true }

describe('resolveEnableDelete', () => {
  it('defaults ON for a writable grid with a selection column', () => {
    // Regression: the PaymentCycle "Payment Lines" tab rendered checkboxes but
    // no bulk bar, because no caller opted into delete.
    expect(resolveEnableDelete(base)).toBe(true)
  })

  it('stays OFF for read-only (viewer) grids', () => {
    expect(resolveEnableDelete({ ...base, readOnly: true })).toBe(false)
  })

  it('stays OFF when the grid has no selection column', () => {
    expect(resolveEnableDelete({ ...base, enableSelectionColumn: false })).toBe(false)
  })

  it('yields to an explicit prop in both directions', () => {
    expect(resolveEnableDelete({ ...base, enableDelete: false })).toBe(false)
    expect(resolveEnableDelete({ ...base, readOnly: true, enableDelete: true })).toBe(true)
  })

  it('stands down when the caller ships its own destructive action', () => {
    const rowActions: RowAction[] = [
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete', destructive: true },
    ]
    expect(resolveEnableDelete({ ...base, rowActions })).toBe(false)
  })

  it('still defaults ON when the destructive action is per-record only', () => {
    // ChildEntitySection's Delete opens a one-record dialog and is hidden from
    // the bulk bar, so the grid still needs the built-in bulk delete.
    const rowActions: RowAction[] = [
      { id: 'delete', label: 'Delete', destructive: true, singleRowOnly: true },
    ]
    expect(resolveEnableDelete({ ...base, rowActions })).toBe(true)
  })

  it('still defaults ON alongside non-destructive row actions', () => {
    const rowActions: RowAction[] = [{ id: 'archive', label: 'Archive' }]
    expect(resolveEnableDelete({ ...base, rowActions })).toBe(true)
  })
})
