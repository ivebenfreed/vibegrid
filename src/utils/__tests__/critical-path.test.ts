import { describe, expect, it } from 'vitest'
import { calculateCriticalPath } from '../critical-path'
import type { BarPosition, GanttDependency } from '../../stores/GanttViewStore'

// Helper to create a bar position
function createBar(rowId: string, startDays: number, durationDays: number): BarPosition {
  const startDate = new Date(2024, 0, 1 + startDays) // Jan 1, 2024 + offset
  const endDate = new Date(2024, 0, 1 + startDays + durationDays)
  return {
    rowId,
    left: startDays * 20,
    width: durationDays * 20,
    top: 0,
    height: 36,
    startDate,
    endDate,
    label: `Task ${rowId}`,
    progress: null,
    status: null,
    statusColor: null,
  }
}

// Helper to create a dependency (source depends_on target)
function createDep(
  id: string,
  sourceId: string,
  targetId: string,
  type: GanttDependency['dependencyType'] = 'finish_to_start',
): GanttDependency {
  return {
    id,
    sourceEntityId: sourceId,
    targetEntityId: targetId,
    dependencyType: type,
  }
}

describe('calculateCriticalPath', () => {
  describe('edge cases', () => {
    it('returns empty array for no bars', () => {
      const result = calculateCriticalPath([], [])
      expect(result).toEqual([])
    })

    it('returns single bar when only one exists', () => {
      const bars = [createBar('A', 0, 5)]
      const result = calculateCriticalPath(bars, [])
      expect(result).toEqual(['A'])
    })

    it('returns longest task when no dependencies', () => {
      const bars = [
        createBar('A', 0, 3), // 3 days
        createBar('B', 0, 7), // 7 days (longest)
        createBar('C', 0, 2), // 2 days
      ]
      const result = calculateCriticalPath(bars, [])
      expect(result).toEqual(['B'])
    })
  })

  describe('simple chains', () => {
    it('finds critical path in linear chain', () => {
      // A -> B -> C (all on critical path)
      const bars = [createBar('A', 0, 3), createBar('B', 3, 4), createBar('C', 7, 2)]
      const deps = [
        createDep('d1', 'B', 'A'), // B depends_on A
        createDep('d2', 'C', 'B'), // C depends_on B
      ]

      const result = calculateCriticalPath(bars, deps)
      expect(result).toContain('A')
      expect(result).toContain('B')
      expect(result).toContain('C')
      expect(result.length).toBe(3)
    })

    it('identifies non-critical tasks with slack', () => {
      // Critical: A -> C (3 + 5 = 8 days)
      // Non-critical: B (2 days, parallel, has slack)
      //
      //   A (3 days) ---> C (5 days)
      //   B (2 days) parallel, no deps
      const bars = [
        createBar('A', 0, 3),
        createBar('B', 0, 2), // Parallel, shorter
        createBar('C', 3, 5),
      ]
      const deps = [
        createDep('d1', 'C', 'A'), // C depends_on A
      ]

      const result = calculateCriticalPath(bars, deps)
      expect(result).toContain('A')
      expect(result).toContain('C')
      // B should NOT be on critical path (it has slack)
      expect(result).not.toContain('B')
    })
  })

  describe('complex graphs', () => {
    it('finds critical path through diamond dependency', () => {
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      // If B takes longer than C, critical path is A->B->D
      const bars = [
        createBar('A', 0, 2),
        createBar('B', 2, 5), // Longer path
        createBar('C', 2, 2), // Shorter path
        createBar('D', 7, 3),
      ]
      const deps = [
        createDep('d1', 'B', 'A'), // B depends_on A
        createDep('d2', 'C', 'A'), // C depends_on A
        createDep('d3', 'D', 'B'), // D depends_on B
        createDep('d4', 'D', 'C'), // D depends_on C
      ]

      const result = calculateCriticalPath(bars, deps)
      expect(result).toContain('A')
      expect(result).toContain('B')
      expect(result).toContain('D')
      // C has slack (could finish earlier and still not delay D)
      expect(result).not.toContain('C')
    })

    it('handles multiple entry points', () => {
      // A -> C
      // B -> C
      // A and B start at same time, but A is longer
      const bars = [
        createBar('A', 0, 5), // Longer
        createBar('B', 0, 2), // Shorter
        createBar('C', 5, 3),
      ]
      const deps = [
        createDep('d1', 'C', 'A'), // C depends_on A
        createDep('d2', 'C', 'B'), // C depends_on B
      ]

      const result = calculateCriticalPath(bars, deps)
      expect(result).toContain('A')
      expect(result).toContain('C')
      expect(result).not.toContain('B') // B has slack
    })
  })

  describe('cycle handling', () => {
    it('handles missing bars gracefully', () => {
      // Dependency references a bar that doesn't exist
      const bars = [createBar('A', 0, 3)]
      const deps = [createDep('d1', 'B', 'A')] // B doesn't exist

      // Should not crash, should return something reasonable
      const result = calculateCriticalPath(bars, deps)
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
