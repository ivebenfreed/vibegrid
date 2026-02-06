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
