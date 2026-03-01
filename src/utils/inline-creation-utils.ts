/**
 * Inline Creation Utilities
 * GH#1658: Utilities for computing inherited fields from group hierarchy
 */

import type { GroupNode } from '../types'

/**
 * Extract inherited fields from a group node and its ancestors.
 * Sets fields[groupNode.field] = groupNode.value for the current node,
 * then walks up parentId chain to collect all ancestor { field: value } pairs.
 * Guards against circular parentId references with a visited Set.
 */
export function extractGroupInheritedFields(
  groupNode: GroupNode,
  allGroupNodesById: Map<string, GroupNode>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const visited = new Set<string>()

  let current: GroupNode | undefined = groupNode
  while (current) {
    if (visited.has(current.id)) break // Guard against circular refs
    visited.add(current.id)

    if (current.field) {
      fields[current.field] = current.value
    }

    current = current.parentId ? allGroupNodesById.get(current.parentId) : undefined
  }

  return fields
}
