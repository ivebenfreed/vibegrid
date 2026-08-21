/**
 * ActionsBar behavior tests
 *
 * Covers the bulk-selection action bar contract:
 *  1. A destructive ROW ACTION's confirmation actually runs that action.
 *     Previously the confirm handler only ever called the `onDelete` prop, so
 *     grids that ship their own destructive action (ChildEntitySection,
 *     GCFileBrowser) opened a confirm dialog that silently did nothing.
 *  2. The built-in Delete still routes to `onDelete`.
 *  3. Non-destructive actions run immediately, no dialog.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RowAction } from '../../VibeGrid'

vi.mock('mobx-react-lite', () => ({
  observer: (fn: Function) => fn,
}))

const clearSelection = vi.fn()

// Two rows, each fully selected across the two visible columns.
const interactionStore = {
  selectedCells: new Set(['r1:name', 'r1:status', 'r2:name', 'r2:status']),
  selectionMarkerMode: 'explicit' as const,
  selectionExclusions: new Set<string>(),
  clearSelection,
}

vi.mock('../../stores/context', () => ({
  useVibeGridStores: () => ({
    interactionStore,
    visualStateStore: {
      visibleColumns: [{ id: 'selection' }, { id: 'name' }, { id: 'status' }],
    },
    viewportStore: { totalRows: 2 },
  }),
}))

import { ActionsBar } from '../ActionsBar'

const getRowData = (rowId: string) => ({ id: rowId, name: `Row ${rowId}` })

function renderBar(props: Partial<React.ComponentProps<typeof ActionsBar>> = {}) {
  return render(<ActionsBar getRowData={getRowData} {...props} />)
}

async function confirmDialog() {
  const confirm = await screen.findByRole('button', { name: 'Delete' })
  fireEvent.click(confirm)
}

describe('ActionsBar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the bar with the selected-row count', () => {
    renderBar({ enableDelete: true, onDelete: vi.fn() })
    expect(screen.getByTestId('selection-count')).toHaveTextContent('2 rows selected')
  })

  it('runs a destructive row action when its confirmation is accepted', async () => {
    const onClick = vi.fn().mockResolvedValue(undefined)
    const rowActions: RowAction[] = [
      { id: 'delete', label: 'Delete', destructive: true, onClick },
    ]

    // No onDelete prop — this is the ChildEntitySection / GCFileBrowser shape.
    renderBar({ rowActions })

    fireEvent.click(screen.getByTestId('action-delete'))
    await confirmDialog()

    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(2))
    expect(onClick).toHaveBeenCalledWith({ id: 'r1', name: 'Row r1' })
    expect(onClick).toHaveBeenCalledWith({ id: 'r2', name: 'Row r2' })
    expect(clearSelection).toHaveBeenCalled()
  })

  it('falls back to onRowAction for a destructive action with no onClick', async () => {
    const onRowAction = vi.fn().mockResolvedValue(undefined)
    const rowActions: RowAction[] = [{ id: 'archive', label: 'Archive', destructive: true }]

    renderBar({ rowActions, onRowAction })

    fireEvent.click(screen.getByTestId('action-archive'))
    await confirmDialog()

    await waitFor(() =>
      expect(onRowAction).toHaveBeenCalledWith(
        'archive',
        ['r1', 'r2'],
        [
          { id: 'r1', name: 'Row r1' },
          { id: 'r2', name: 'Row r2' },
        ],
      ),
    )
  })

  it('routes the built-in Delete to onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderBar({ enableDelete: true, onDelete })

    fireEvent.click(screen.getByTestId('action-delete'))
    await confirmDialog()

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith(
        ['r1', 'r2'],
        [
          { id: 'r1', name: 'Row r1' },
          { id: 'r2', name: 'Row r2' },
        ],
      ),
    )
    expect(clearSelection).toHaveBeenCalled()
  })

  it('hides singleRowOnly actions from the bulk bar', () => {
    const rowActions: RowAction[] = [
      { id: 'edit', label: 'Edit', singleRowOnly: true, onClick: vi.fn() },
      { id: 'archive', label: 'Archive', onClick: vi.fn() },
    ]
    renderBar({ rowActions })

    expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument()
    expect(screen.getByTestId('action-archive')).toBeInTheDocument()
  })

  it('runs a non-destructive action immediately without a confirmation', async () => {
    const onClick = vi.fn().mockResolvedValue(undefined)
    const rowActions: RowAction[] = [{ id: 'export', label: 'Export', onClick }]

    renderBar({ rowActions })
    fireEvent.click(screen.getByTestId('action-export'))

    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument()
  })
})
