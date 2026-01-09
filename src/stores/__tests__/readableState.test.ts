import { beforeEach, describe, expect, it } from 'vitest'
import type { Column } from '../../types'
import { InteractionStore } from '../InteractionStore'
import { TableCoreStore } from '../TableCoreStore'
import { VisualStateStore } from '../VisualStateStore'

describe('readableState computed properties (GH#938)', () => {
  describe('TableCoreStore.readableState', () => {
    let store: TableCoreStore

    beforeEach(() => {
      store = new TableCoreStore('task')
      // Initialize with test columns
      const columns: Column[] = [
        {
          id: 'id',
          label: 'ID',
          type: 'text',
          fieldName: 'id',
          fieldType: { type: 'text' },
        } as any,
        {
          id: 'name',
          label: 'Name',
          type: 'text',
          fieldName: 'name',
          fieldType: { type: 'text' },
        } as any,
        {
          id: 'status',
          label: 'Status',
          type: 'text',
          fieldName: 'status',
          fieldType: { type: 'text' },
        } as any,
      ]
      ;(store as any).columns = columns
      // Enable schema loaded so processedRows returns actual rows
      ;(store as any).isSchemaLoaded = true
    })

    it('should expose entityType', () => {
      const state = store.readableState
      expect(state.entityType).toBe('task')
    })

    it('should expose row count', () => {
      store.setRows([
        { id: '1', name: 'Task 1', status: 'active' },
        { id: '2', name: 'Task 2', status: 'done' },
      ])

      const state = store.readableState
      expect(state.rowCount).toBe(2)
    })

    it('should expose visible rows (max 50)', () => {
      store.setRows([
        { id: '1', name: 'Task 1', status: 'active' },
        { id: '2', name: 'Task 2', status: 'done' },
      ])

      const state = store.readableState
      expect(state.visibleRows).toHaveLength(2)
      expect(state.visibleRows[0]).toEqual({
        id: '1',
        data: { id: '1', name: 'Task 1', status: 'active' },
      })
    })

    it('should limit visible rows to 50', () => {
      // Create 100 rows
      const rows = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        name: `Task ${i}`,
        status: 'active',
      }))
      store.setRows(rows)

      const state = store.readableState
      expect(state.rowCount).toBe(100)
      expect(state.visibleRows).toHaveLength(50)
    })

    it('should expose column definitions', () => {
      const state = store.readableState
      expect(state.columns).toHaveLength(3)
      expect(state.columns[0]).toEqual({
        fieldName: 'id',
        fieldType: 'text',
        displayName: 'ID',
      })
    })
  })

  describe('VisualStateStore.readableState', () => {
    let store: VisualStateStore

    beforeEach(() => {
      store = new VisualStateStore()
    })

    it('should expose empty filters initially', () => {
      const state = store.readableState
      expect(state.filters).toEqual([])
      expect(state.filterCount).toBe(0)
    })

    it('should expose sort configuration', () => {
      store.setSortBy([{ field: 'name', direction: 'asc' }])

      const state = store.readableState
      expect(state.sortBy).toEqual([{ field: 'name', direction: 'asc' }])
    })

    it('should expose null group config initially', () => {
      const state = store.readableState
      expect(state.groupConfig).toBeNull()
    })

    it('should expose group config when set', () => {
      // GroupConfig uses fields array, not single field
      store.setGroupConfig({
        fields: [{ field: 'status', displayName: 'Status' }],
        expandedGroups: new Set<string>(),
      } as any)

      const state = store.readableState
      expect(state.groupConfig).toEqual({ field: 'status', collapsed: true })
    })
  })

  describe('InteractionStore.readableState', () => {
    let store: InteractionStore

    beforeEach(() => {
      store = new InteractionStore()
    })

    it('should expose empty selection initially', () => {
      const state = store.readableState
      expect(state.selectedRowIds).toEqual([])
      expect(state.selectedCellIds).toEqual([])
      expect(state.focusedCell).toBeNull()
      expect(state.isEditing).toBe(false)
    })

    it('should expose selected rows', () => {
      store.selectedRows = new Set(['row-1', 'row-2'])

      const state = store.readableState
      expect(state.selectedRowIds).toContain('row-1')
      expect(state.selectedRowIds).toContain('row-2')
      expect(state.selectedRowIds).toHaveLength(2)
    })

    it('should expose selected cells', () => {
      store.selectedCells = new Set(['row1:col1', 'row1:col2'])

      const state = store.readableState
      expect(state.selectedCellIds).toContain('row1:col1')
      expect(state.selectedCellIds).toContain('row1:col2')
    })

    it('should expose focused cell', () => {
      store.setFocusedCell('row-5:col-name')

      const state = store.readableState
      expect(state.focusedCell).toEqual({
        rowId: 'row-5',
        columnId: 'col-name',
      })
    })
  })
})
