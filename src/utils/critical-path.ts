/**
 * Critical Path Algorithm for Gantt Charts
 *
 * Calculates the critical path through a dependency graph using:
 * 1. Forward pass: Calculate earliest start/finish times
 * 2. Backward pass: Calculate latest start/finish times
 * 3. Identify tasks with zero slack (critical path)
 *
 * @see planning/specs/215-gantt-view-polish.md section 2.5
 */

import type { BarPosition, GanttDependency } from '../stores/GanttViewStore'

// ====================================
// TYPES
// ====================================

interface TaskTiming {
  /** Earliest this task can start */
  earliestStart: number
  /** Earliest this task can finish */
  earliestFinish: number
  /** Latest this task can start without delaying project */
  latestStart: number
  /** Latest this task can finish without delaying project */
  latestFinish: number
  /** Total slack (latestStart - earliestStart) */
  slack: number
}

// ====================================
// ALGORITHM
// ====================================

/**
 * Calculate critical path through dependency graph
 *
 * The critical path is the longest path through the project network,
 * determining the minimum project duration. Tasks on this path have
 * zero slack - any delay will delay the entire project.
 *
 * Algorithm complexity: O(V + E) where V = tasks, E = dependencies
 *
 * @param bars - Array of bar positions with start/end dates
 * @param dependencies - Array of dependencies between tasks
 * @returns Array of row IDs on the critical path
 */
export function calculateCriticalPath(
  bars: BarPosition[],
  dependencies: GanttDependency[],
): string[] {
  // Handle edge cases
  if (bars.length === 0) return []
  if (bars.length === 1) return [bars[0].rowId]
  if (dependencies.length === 0) {
    // No dependencies: critical path is the task with longest duration
    // or earliest start (to show something useful)
    const sorted = [...bars].sort((a, b) => {
      const aDuration = a.endDate.getTime() - a.startDate.getTime()
      const bDuration = b.endDate.getTime() - b.startDate.getTime()
      if (bDuration !== aDuration) return bDuration - aDuration
      return a.startDate.getTime() - b.startDate.getTime()
    })
    return sorted.length > 0 ? [sorted[0].rowId] : []
  }

  // Build lookup maps
  const barMap = new Map<string, BarPosition>()
  for (const bar of bars) {
    barMap.set(bar.rowId, bar)
  }

  // Build adjacency list (predecessors for each task)
  // In our model: source depends_on target, meaning target must finish first
  // So target -> source is the direction of work flow
  const predecessors = new Map<string, string[]>()
  const successors = new Map<string, string[]>()

  for (const bar of bars) {
    predecessors.set(bar.rowId, [])
    successors.set(bar.rowId, [])
  }

  for (const dep of dependencies) {
    // source depends_on target, meaning target is predecessor of source
    const targetExists = barMap.has(dep.targetEntityId)
    const sourceExists = barMap.has(dep.sourceEntityId)

    if (targetExists && sourceExists) {
      predecessors.get(dep.sourceEntityId)?.push(dep.targetEntityId)
      successors.get(dep.targetEntityId)?.push(dep.sourceEntityId)
    }
  }

  // Find project start (earliest date across all tasks)
  let projectStart = Number.POSITIVE_INFINITY
  for (const bar of bars) {
    projectStart = Math.min(projectStart, bar.startDate.getTime())
  }

  // Initialize timing data
  const timings = new Map<string, TaskTiming>()
  for (const bar of bars) {
    timings.set(bar.rowId, {
      earliestStart: 0,
      earliestFinish: 0,
      latestStart: Number.POSITIVE_INFINITY,
      latestFinish: Number.POSITIVE_INFINITY,
      slack: 0,
    })
  }

  // ====================================
  // TOPOLOGICAL SORT
  // ====================================

  const sorted = topologicalSort(bars, predecessors)
  if (sorted.length === 0) {
    // Cycle detected or empty - fall back to showing longest tasks
    return bars.slice(0, 3).map((b) => b.rowId)
  }

  // ====================================
  // FORWARD PASS: Calculate earliest start/finish
  // ====================================

  for (const barId of sorted) {
    const bar = barMap.get(barId)
    if (!bar) continue

    const timing = timings.get(barId)!
    const preds = predecessors.get(barId) || []

    // Earliest start is max of predecessor finish times, or task's actual start
    let earliestStart = bar.startDate.getTime() - projectStart
    for (const predId of preds) {
      const predTiming = timings.get(predId)
      if (predTiming) {
        earliestStart = Math.max(earliestStart, predTiming.earliestFinish)
      }
    }

    const duration = bar.endDate.getTime() - bar.startDate.getTime()
    timing.earliestStart = earliestStart
    timing.earliestFinish = earliestStart + duration
  }

  // Find project end (maximum earliest finish)
  let projectEnd = 0
  for (const timing of timings.values()) {
    projectEnd = Math.max(projectEnd, timing.earliestFinish)
  }

  // ====================================
  // BACKWARD PASS: Calculate latest start/finish
  // ====================================

  // Process in reverse topological order
  for (let i = sorted.length - 1; i >= 0; i--) {
    const barId = sorted[i]
    const bar = barMap.get(barId)
    if (!bar) continue

    const timing = timings.get(barId)!
    const succs = successors.get(barId) || []

    // Latest finish is min of successor start times, or project end
    let latestFinish = succs.length === 0 ? projectEnd : Number.POSITIVE_INFINITY
    for (const succId of succs) {
      const succTiming = timings.get(succId)
      if (succTiming) {
        latestFinish = Math.min(latestFinish, succTiming.latestStart)
      }
    }

    const duration = bar.endDate.getTime() - bar.startDate.getTime()
    timing.latestFinish = latestFinish
    timing.latestStart = latestFinish - duration
    timing.slack = timing.latestStart - timing.earliestStart
  }

  // ====================================
  // IDENTIFY CRITICAL PATH
  // ====================================

  // Tasks with zero (or near-zero) slack are on the critical path
  const criticalIds: string[] = []
  const SLACK_THRESHOLD = 1000 // 1 second tolerance for floating point

  for (const [barId, timing] of timings) {
    if (Math.abs(timing.slack) < SLACK_THRESHOLD) {
      criticalIds.push(barId)
    }
  }

  return criticalIds
}

/**
 * Topological sort using Kahn's algorithm
 * Returns empty array if cycle detected
 */
function topologicalSort(
  bars: BarPosition[],
  predecessors: Map<string, string[]>,
): string[] {
  // Count incoming edges (number of predecessors)
  const inDegree = new Map<string, number>()
  for (const bar of bars) {
    inDegree.set(bar.rowId, predecessors.get(bar.rowId)?.length || 0)
  }

  // Start with nodes that have no predecessors
  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id)
    }
  }

  const sorted: string[] = []

  // Build successor map for traversal
  const successors = new Map<string, string[]>()
  for (const bar of bars) {
    successors.set(bar.rowId, [])
  }
  for (const [nodeId, preds] of predecessors) {
    for (const predId of preds) {
      successors.get(predId)?.push(nodeId)
    }
  }

  // Process queue
  while (queue.length > 0) {
    const node = queue.shift()!
    sorted.push(node)

    // Reduce in-degree for all successors
    for (const succ of successors.get(node) || []) {
      const degree = (inDegree.get(succ) || 0) - 1
      inDegree.set(succ, degree)
      if (degree === 0) {
        queue.push(succ)
      }
    }
  }

  // If we couldn't sort all nodes, there's a cycle
  if (sorted.length !== bars.length) {
    return [] // Cycle detected
  }

  return sorted
}
