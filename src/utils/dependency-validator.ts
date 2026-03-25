/**
 * Dependency Validator - Checks for cycles before creating dependencies
 */

export interface ValidatableDependency {
  sourceEntityId: string
  targetEntityId: string
}

/**
 * Check if adding a new dependency would create a cycle in the dependency graph.
 * Uses DFS to detect if target is reachable from source through existing dependencies.
 *
 * In our model: source depends_on target (source waits for target to finish)
 * A cycle exists if target can reach source through existing dependency chains.
 *
 * @param newSource - The successor (waits) entity ID
 * @param newTarget - The predecessor (must finish first) entity ID
 * @param existingDeps - Current dependency list
 * @returns true if adding this dependency would create a cycle
 */
export function wouldCreateCycle(newSource: string, newTarget: string, existingDeps: ValidatableDependency[]): boolean {
  // Self-dependency is always a cycle
  if (newSource === newTarget) return true

  // Build adjacency list: for each entity, what entities does it depend on?
  // source depends_on target, so source -> target in the "depends on" direction
  const adjacency = new Map<string, string[]>()
  for (const dep of existingDeps) {
    if (!adjacency.has(dep.sourceEntityId)) {
      adjacency.set(dep.sourceEntityId, [])
    }
    adjacency.get(dep.sourceEntityId)!.push(dep.targetEntityId)
  }

  // DFS from newTarget following "depends on" direction
  // If we can reach newSource, then adding newSource->newTarget creates a cycle
  const visited = new Set<string>()
  const stack = [newTarget]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === newSource) return true
    if (visited.has(current)) continue
    visited.add(current)

    const neighbors = adjacency.get(current) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor)
      }
    }
  }

  return false
}
