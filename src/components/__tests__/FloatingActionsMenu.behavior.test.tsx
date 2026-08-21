/**
 * FloatingActionsMenu behavior tests
 *
 * The row 3-dot menu shares the ActionsBar defect: a destructive ROW ACTION
 * opened the confirm dialog, but confirming only ever called the `onDelete`
 * prop — so ChildEntitySection's "Delete" (which opens its own per-record
 * DeleteConfirmDialog) never fired. Also covers the row menu standing down
 * from the built-in Delete when the caller ships its own.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RowAction } from '../../VibeGrid'

vi.mock('mobx-react-lite', () => ({
  observer: (fn: Function) => fn,
}))

const closeRowActionMenu = vi.fn()

vi.mock('../../stores/context', () => ({
  useVibeGridStores: () => ({
    menuStateStore: {
      rowActionMenuState: { isOpen: true, rowId: 'r1', position: { x: 0, y: 0 } },
      closeRowActionMenu,
    },
  }),
}))

import { FloatingActionsMenu } from '../FloatingActionsMenu'

const getRowData = (rowId: string) => ({ id: rowId, name: `Row ${rowId}` })

function renderMenu(props: Partial<React.ComponentProps<typeof FloatingActionsMenu>> = {}) {
  return render(<FloatingActionsMenu getRowData={getRowData} {...props} />)
}

describe('FloatingActionsMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs a destructive row action when its confirmation is accepted', async () => {
    const onClick = vi.fn().mockResolvedValue(undefined)
    const rowActions: RowAction[] = [
      { id: 'delete', label: 'Delete', destructive: true, singleRowOnly: true, onClick },
    ]

    renderMenu({ rowActions })

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onClick).toHaveBeenCalledWith({ id: 'r1', name: 'Row r1' }))
  })

  it('shows only one Delete when the caller ships its own destructive action', () => {
    const rowActions: RowAction[] = [
      { id: 'delete', label: 'Delete', destructive: true, singleRowOnly: true, onClick: vi.fn() },
    ]
    renderMenu({ rowActions, enableDelete: true, onDelete: vi.fn() })

    expect(screen.getAllByRole('menuitem', { name: 'Delete' })).toHaveLength(1)
  })

  it('routes the built-in Delete to onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderMenu({ enableDelete: true, onDelete })

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('r1', { id: 'r1', name: 'Row r1' }))
  })
})
