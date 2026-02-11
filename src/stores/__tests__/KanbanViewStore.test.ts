import { describe, expect, it, vi } from 'vitest'
import { configure } from 'mobx'

// Mock logger
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { KanbanViewStore } from '../KanbanViewStore'

// MobX strict mode (matches project config)
configure({ enforceActions: 'always' })

describe('KanbanViewStore', () => {
  it('groups cards by column value in a single pass via cardsByColumn computed', () => {
    const store = new KanbanViewStore()

    const mockTableCoreStore = {
      processedRows: [
        { id: '1', data: { status: 'Open', name: 'Task 1' } },
        { id: '2', data: { status: 'Open', name: 'Task 2' } },
        { id: '3', data: { status: 'Closed', name: 'Task 3' } },
        { id: '4', data: { status: null, name: 'Task 4' } },
        { id: '5', data: { status: '', name: 'Task 5' } },
      ],
      columns: [],
    }

    store.setTableCoreStore(mockTableCoreStore as any)

    const columns = store.columns

    // "No Status" column should contain rows with null/empty status
    const noStatusCol = columns.find((c) => c.id === '__no_status__')
    expect(noStatusCol).toBeDefined()
    expect(noStatusCol!.cardIds).toEqual(['4', '5'])

    // "open" column (normalized to lowercase)
    const openCol = columns.find((c) => c.id === 'open')
    expect(openCol).toBeDefined()
    expect(openCol!.cardIds).toEqual(['1', '2'])

    // "closed" column
    const closedCol = columns.find((c) => c.id === 'closed')
    expect(closedCol).toBeDefined()
    expect(closedCol!.cardIds).toEqual(['3'])
  })

  it('returns empty array for column with no matching cards', () => {
    const store = new KanbanViewStore()

    const mockTableCoreStore = {
      processedRows: [
        { id: '1', data: { status: 'Open', name: 'Task 1' } },
      ],
      columns: [],
    }

    store.setTableCoreStore(mockTableCoreStore as any)
    store.setStatusColorMap([
      { value: 'open', label: 'Open', color: '#00ff00', backgroundColor: '#e0ffe0' },
      { value: 'closed', label: 'Closed', color: '#ff0000', backgroundColor: '#ffe0e0' },
    ])

    const columns = store.columns
    const closedCol = columns.find((c) => c.id === 'closed')
    expect(closedCol).toBeDefined()
    // The "closed" column exists (from statusColorMap) but has no cards
    expect(closedCol!.cardIds).toEqual([])
  })

  it('preserves original casing when dragging to an unmapped (data-discovered) status column', async () => {
    const store = new KanbanViewStore()

    const mockTableCoreStore = {
      processedRows: [{ id: '1', data: { status: 'InProgress' } }],
      columns: [],
    }

    store.setTableCoreStore(mockTableCoreStore as any)

    const updates: Array<{ id: string; draft: any }> = []
    const mockCollection = {
      update: vi.fn((id: string, updater: (draft: any) => void) => {
        const draft: any = {}
        updater(draft)
        updates.push({ id, draft })
        return { isPersisted: { promise: Promise.resolve() } }
      }),
    }
    store.setCollection(mockCollection as any)

    // Drag from some other column into a data-discovered column id (normalized/lowercased).
    store.startDrag('1', 'todo')
    store.updateDragTarget('inprogress')
    await store.endDrag()

    expect(mockCollection.update).toHaveBeenCalledTimes(1)
    expect(updates[0]?.draft?.status).toBe('InProgress')
  })
})
