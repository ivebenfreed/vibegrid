import { describe, expect, it } from 'vitest'
import { GroupProcessor } from '../GroupProcessor'
import type { Column, GroupConfig, TableRow } from '../../types'

// Helper to create test rows
function createRow(id: string, data: Record<string, any>): TableRow {
  return {
    id,
    data,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    },
  }
}

describe('GroupProcessor', () => {
  describe('relationship field grouping', () => {
    const columns: Column[] = [
      {
        id: 'assigned_to',
        field: 'assigned_to',
        name: 'Assigned To',
        cellType: 'reference-select' as any,
        relationshipEntityType: 'PlatformUser',
      },
      {
        id: 'project',
        field: 'project',
        name: 'Project',
        cellType: 'reference-select' as any,
        relationshipEntityType: 'Project',
      },
    ]

    it('shows "(No PlatformUser)" for null user reference values', () => {
      const rows = [
        createRow('1', { assigned_to: null, name: 'Task 1' }),
        createRow('2', { assigned_to: 'user-123', name: 'Task 2' }),
      ]

      const config: GroupConfig = {
        fields: [{ field: 'assigned_to', displayName: 'Assigned To' }],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: [],
        expandedGroups: new Set(),
      }

      const result = GroupProcessor.processData(rows, columns, config)

      // Should have 2 groups: null and user-123
      expect(result.groups.length).toBe(2)

      // Find the null group
      const nullGroup = result.groups.find((g) => g.value === null)
      expect(nullGroup).toBeDefined()
      expect(nullGroup?.displayValue).toBe('(No PlatformUser)')
    })

    it('shows "(No Project)" for null entity reference values', () => {
      const rows = [
        createRow('1', { project: null, name: 'Task 1' }),
        createRow('2', { project: 'proj-456', name: 'Task 2' }),
      ]

      const config: GroupConfig = {
        fields: [{ field: 'project', displayName: 'Project' }],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: [],
        expandedGroups: new Set(),
      }

      const result = GroupProcessor.processData(rows, columns, config)

      const nullGroup = result.groups.find((g) => g.value === null)
      expect(nullGroup).toBeDefined()
      expect(nullGroup?.displayValue).toBe('(No Project)')
    })

    it('resolves entity names using relationshipNameResolver', () => {
      const rows = [
        createRow('1', { assigned_to: 'user-123', name: 'Task 1' }),
        createRow('2', { assigned_to: 'user-456', name: 'Task 2' }),
      ]

      // Mock resolver that returns names for known IDs
      const mockResolver = (entityType: string, entityId: string) => {
        if (entityType === 'PlatformUser') {
          if (entityId === 'user-123') return 'Alice Smith'
          if (entityId === 'user-456') return 'Bob Jones'
        }
        return null
      }

      const config: GroupConfig = {
        fields: [{ field: 'assigned_to', displayName: 'Assigned To' }],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: [],
        expandedGroups: new Set(),
        relationshipNameResolver: mockResolver,
      }

      const result = GroupProcessor.processData(rows, columns, config)

      expect(result.groups.length).toBe(2)

      const aliceGroup = result.groups.find((g) => g.value === 'user-123')
      const bobGroup = result.groups.find((g) => g.value === 'user-456')

      expect(aliceGroup?.displayValue).toBe('Alice Smith')
      expect(bobGroup?.displayValue).toBe('Bob Jones')
    })

    it('falls back to truncated ID when resolver returns null', () => {
      const rows = [createRow('1', { assigned_to: 'user-12345678-abcd', name: 'Task 1' })]

      // Resolver that returns null (entity not found)
      const mockResolver = () => null

      const config: GroupConfig = {
        fields: [{ field: 'assigned_to', displayName: 'Assigned To' }],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: [],
        expandedGroups: new Set(),
        relationshipNameResolver: mockResolver,
      }

      const result = GroupProcessor.processData(rows, columns, config)

      expect(result.groups.length).toBe(1)
      // Should show truncated UUID
      expect(result.groups[0].displayValue).toBe('user-123...')
    })

    it('shows full ID for short IDs when resolver returns null', () => {
      const rows = [createRow('1', { assigned_to: 'u123', name: 'Task 1' })]

      const config: GroupConfig = {
        fields: [{ field: 'assigned_to', displayName: 'Assigned To' }],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: [],
        expandedGroups: new Set(),
        relationshipNameResolver: () => null,
      }

      const result = GroupProcessor.processData(rows, columns, config)

      expect(result.groups[0].displayValue).toBe('u123')
    })
  })

  describe('non-relationship field grouping', () => {
    const columns: Column[] = [
      {
        id: 'status',
        field: 'status',
        name: 'Status',
        cellType: 'select' as any,
        enumOptions: [
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ],
      },
    ]

    it('shows "(Empty)" for null non-relationship values', () => {
      const rows = [
        createRow('1', { status: null, name: 'Task 1' }),
        createRow('2', { status: 'open', name: 'Task 2' }),
      ]

      const config: GroupConfig = {
        fields: [{ field: 'status', displayName: 'Status' }],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: [],
        expandedGroups: new Set(),
      }

      const result = GroupProcessor.processData(rows, columns, config)

      const nullGroup = result.groups.find((g) => g.value === null)
      expect(nullGroup?.displayValue).toBe('(Empty)')
    })

    it('resolves enum labels for select fields', () => {
      const rows = [
        createRow('1', { status: 'open', name: 'Task 1' }),
        createRow('2', { status: 'closed', name: 'Task 2' }),
      ]

      const config: GroupConfig = {
        fields: [{ field: 'status', displayName: 'Status' }],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: [],
        expandedGroups: new Set(),
      }

      const result = GroupProcessor.processData(rows, columns, config)

      const openGroup = result.groups.find((g) => g.value === 'open')
      const closedGroup = result.groups.find((g) => g.value === 'closed')

      expect(openGroup?.displayValue).toBe('Open')
      expect(closedGroup?.displayValue).toBe('Closed')
    })
  })
})
