import { describe, expect, it } from 'vitest'
import { wouldCreateCycle } from '../dependency-validator'
import type { ValidatableDependency } from '../dependency-validator'

// Helper to create a dependency (source depends_on target)
function createDep(sourceId: string, targetId: string): ValidatableDependency {
  return {
    sourceEntityId: sourceId,
    targetEntityId: targetId,
  }
}

describe('wouldCreateCycle', () => {
  it('returns true for self-dependency', () => {
    expect(wouldCreateCycle('A', 'A', [])).toBe(true)
  })

  it('returns false when no existing deps', () => {
    expect(wouldCreateCycle('A', 'B', [])).toBe(false)
  })

  it('detects cycle in simple chain A->B->C, adding C->A', () => {
    // Existing: A depends_on B, B depends_on C
    const deps = [createDep('A', 'B'), createDep('B', 'C')]

    // Adding C depends_on A would create cycle: C->A->B->C
    expect(wouldCreateCycle('C', 'A', deps)).toBe(true)
  })

  it('returns false for simple chain A->B->C, adding D->A (no cycle)', () => {
    // Existing: A depends_on B, B depends_on C
    const deps = [createDep('A', 'B'), createDep('B', 'C')]

    // Adding D depends_on A does not create a cycle
    expect(wouldCreateCycle('D', 'A', deps)).toBe(false)
  })

  it('detects cycle in diamond graph, adding D->A', () => {
    // Diamond: A->B, A->C, B->D, C->D
    // Existing: A depends_on B, A depends_on C, B depends_on D, C depends_on D
    const deps = [
      createDep('A', 'B'),
      createDep('A', 'C'),
      createDep('B', 'D'),
      createDep('C', 'D'),
    ]

    // Adding D depends_on A would create cycle: D->A->B->D or D->A->C->D
    expect(wouldCreateCycle('D', 'A', deps)).toBe(true)
  })

  it('returns false for disjoint graph (no cycle)', () => {
    // Two separate chains: A->B and C->D
    const deps = [createDep('A', 'B'), createDep('C', 'D')]

    // Adding E->F does not create a cycle
    expect(wouldCreateCycle('E', 'F', deps)).toBe(false)

    // Adding A->C does not create a cycle (connects chains but no cycle)
    expect(wouldCreateCycle('A', 'C', deps)).toBe(false)
  })

  it('returns false when adding parallel dependency', () => {
    // Existing: A depends_on B
    const deps = [createDep('A', 'B')]

    // Adding C depends_on B is fine (parallel to A)
    expect(wouldCreateCycle('C', 'B', deps)).toBe(false)
  })

  it('detects direct back-edge cycle', () => {
    // Existing: A depends_on B
    const deps = [createDep('A', 'B')]

    // Adding B depends_on A would create a direct cycle
    expect(wouldCreateCycle('B', 'A', deps)).toBe(true)
  })

  it('handles longer chains without false positives', () => {
    // Chain: A->B->C->D->E
    const deps = [
      createDep('A', 'B'),
      createDep('B', 'C'),
      createDep('C', 'D'),
      createDep('D', 'E'),
    ]

    // Adding F->A is fine
    expect(wouldCreateCycle('F', 'A', deps)).toBe(false)

    // Adding E->A would create a cycle
    expect(wouldCreateCycle('E', 'A', deps)).toBe(true)
  })
})
