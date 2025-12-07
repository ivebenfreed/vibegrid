/**
 * Cascade Scheduler - Calculates cascading date updates for Gantt dependencies
 *
 * Uses industry-standard formulas (MS Project, Primavera P6):
 * - FS: successor.start = predecessor.end + lag
 * - SS: successor.start = predecessor.start + lag
 * - FF: successor.end = predecessor.end + lag
 * - SF: successor.end = predecessor.start + lag
 *
 * ASAP scheduling: Only shifts successors if constraint is VIOLATED.
 */

import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'utils', 'cascade-scheduler'])

// ====================================
// TYPES
// ====================================

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'

export interface CascadeDependency {
  id: string
  sourceEntityId: string // The successor (waits)
  targetEntityId: string // The predecessor (must complete first)
  dependencyType: DependencyType
  lagDays?: number
}

export interface CascadeBar {
  id: string
  startDate: Date
  endDate: Date
}

export interface CascadeUpdate {
  entityId: string
  newStartDate: Date
  newEndDate: Date
  durationDays: number
}

// ====================================
// CALCULATION
// ====================================

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Calculate cascading updates when a bar's dates change.
 *
 * @param movedBarId - The bar that was moved (predecessor)
 * @param newStartDate - New start date of the moved bar
 * @param newEndDate - New end date of the moved bar
 * @param dependencies - All dependencies
 * @param getBar - Function to get bar position by ID
 * @returns Array of cascade updates for successor bars
 */
export function calculateCascadeUpdates(
  movedBarId: string,
  newStartDate: Date,
  newEndDate: Date,
  dependencies: CascadeDependency[],
  getBar: (id: string) => CascadeBar | undefined,
): CascadeUpdate[] {
  const updates: CascadeUpdate[] = []
  const processed = new Set<string>()

  // BFS queue
  const queue: Array<{
    predecessorId: string
    predecessorStart: Date
    predecessorEnd: Date
  }> = [{ predecessorId: movedBarId, predecessorStart: newStartDate, predecessorEnd: newEndDate }]

  while (queue.length > 0) {
    const { predecessorId, predecessorStart, predecessorEnd } = queue.shift()!

    // Find successors: where targetEntityId === predecessorId
    const successorDeps = dependencies.filter(
      (dep) => dep.targetEntityId === predecessorId && !processed.has(dep.sourceEntityId),
    )

    for (const dep of successorDeps) {
      const successorId = dep.sourceEntityId
      const successorBar = getBar(successorId)
      if (!successorBar) continue

      const update = calculateSingleCascade(
        dep,
        predecessorStart,
        predecessorEnd,
        successorBar,
      )

      if (!update) continue

      updates.push(update)
      processed.add(successorId)

      // Queue for further cascading
      queue.push({
        predecessorId: successorId,
        predecessorStart: update.newStartDate,
        predecessorEnd: update.newEndDate,
      })
    }
  }

  logger.info('Cascade calculated', {
    movedBarId,
    count: updates.length,
    affected: updates.map((u) => u.entityId),
  })

  return updates
}

/**
 * Calculate cascade for a single dependency.
 * Returns null if no update needed (constraint satisfied).
 */
function calculateSingleCascade(
  dep: CascadeDependency,
  predecessorStart: Date,
  predecessorEnd: Date,
  successorBar: CascadeBar,
): CascadeUpdate | null {
  const lagMs = (dep.lagDays || 0) * MS_PER_DAY
  let requiredDate: Date
  let isStartConstrained: boolean

  switch (dep.dependencyType) {
    case 'finish_to_start':
      requiredDate = new Date(predecessorEnd.getTime() + lagMs)
      isStartConstrained = true
      break
    case 'start_to_start':
      requiredDate = new Date(predecessorStart.getTime() + lagMs)
      isStartConstrained = true
      break
    case 'finish_to_finish':
      requiredDate = new Date(predecessorEnd.getTime() + lagMs)
      isStartConstrained = false
      break
    case 'start_to_finish':
      requiredDate = new Date(predecessorStart.getTime() + lagMs)
      isStartConstrained = false
      break
    default:
      return null
  }

  // ASAP: only shift if violated
  const currentDate = isStartConstrained ? successorBar.startDate : successorBar.endDate
  if (currentDate >= requiredDate) return null

  // Preserve duration
  const durationMs = successorBar.endDate.getTime() - successorBar.startDate.getTime()
  const durationDays = Math.ceil(durationMs / MS_PER_DAY)

  let newStart: Date
  let newEnd: Date

  if (isStartConstrained) {
    newStart = requiredDate
    newEnd = new Date(requiredDate.getTime() + durationMs)
  } else {
    newEnd = requiredDate
    newStart = new Date(requiredDate.getTime() - durationMs)
  }

  return {
    entityId: successorBar.id,
    newStartDate: newStart,
    newEndDate: newEnd,
    durationDays,
  }
}
