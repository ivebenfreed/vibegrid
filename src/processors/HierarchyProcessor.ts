// ====================================
// HIERARCHY PROCESSOR
// ====================================
// Client-side processor for building parent-child trees from entities + relationships.
// Follows the GroupProcessor pattern for consistency.
// Used for self-referential hierarchies (Task → Task via child_of).

import { getLogger } from '@/shared/lib/logging'
import type { TableRow, VirtualRow, VirtualRowType } from '../types'

const fileLog = getLogger(['HierarchyProcessor'])

// ====================================
// CONSTANTS
// ====================================

const DATA_ROW_HEIGHT = 40
const HIERARCHY_ROW_HEIGHT = 40 // Same as data rows, indentation shows hierarchy

// ====================================
// TYPES
// ====================================

/**
 * Represents a node in the hierarchy tree.
 * Contains the entity data plus parent/child relationship info.
 */
export interface HierarchyNode {
  id: string
  data: TableRow
  parentId: string | null
  level: number
  children: HierarchyNode[]
  hasChildren: boolean
  path: string[] // Ancestor IDs from root to this node (for cycle detection)
}

/**
 * Configuration for hierarchy processing.
 */
export interface HierarchyConfig {
  relationshipType: string // e.g., 'child_of'
  maxDepth: number // Default 3, max 10
  expandedRows: Set<string> // Currently expanded row IDs
  showOrphans: boolean // Show rows with null/invalid parent at root
}

/**
 * Relationship data from UnifiedRelationshipService.list()
 */
export interface HierarchyRelationship {
  id: string
  sourceEntityId: string // Child entity
  targetEntityId: string // Parent entity
  relationshipType: string
  properties?: Record<string, unknown>
}

/**
 * Result of building a hierarchy tree.
 */
export interface HierarchyTree {
  roots: HierarchyNode[] // Top-level nodes (no parent or orphaned)
  nodeMap: Map<string, HierarchyNode> // Quick lookup by entity ID
  cycleIds: Set<string> // Entity IDs involved in cycles
  orphanIds: Set<string> // Entity IDs with invalid parent references
  totalCount: number // Total number of nodes
}

// ====================================
// HIERARCHY PROCESSOR CLASS
// ====================================

export class HierarchyProcessor {
  // ====================================
  // MAIN TREE BUILDING METHOD
  // ====================================

  /**
   * Build a hierarchy tree from entities and relationships.
   * This is the main entry point for hierarchy processing.
   *
   * @param entities - Array of TableRow entities
   * @param relationships - Array of relationships from UnifiedRelationshipService
   * @param config - Hierarchy configuration
   * @returns HierarchyTree with roots, node map, and metadata
   */
  static buildTree(
    entities: TableRow[],
    relationships: HierarchyRelationship[],
    config: HierarchyConfig,
  ): HierarchyTree {
    fileLog.debug('HierarchyProcessor.buildTree called', {
      entityCount: entities.length,
      relationshipCount: relationships.length,
      relationshipType: config.relationshipType,
      maxDepth: config.maxDepth,
    })

    // 1. Build parent lookup map: childId → parentId
    const parentMap = HierarchyProcessor.buildParentMap(relationships, config.relationshipType)

    // 2. Detect cycles before building tree
    const cycleIds = HierarchyProcessor.detectCycles(entities, parentMap)

    if (cycleIds.size > 0) {
      fileLog.warn('Cycles detected in hierarchy', {
        cycleCount: cycleIds.size,
        cycleIds: Array.from(cycleIds),
      })
    }

    // 3. Create entity lookup map
    const entityMap = new Map<string, TableRow>()
    for (const entity of entities) {
      entityMap.set(entity.id, entity)
    }

    // 4. Build nodes for all entities
    const nodeMap = new Map<string, HierarchyNode>()
    const orphanIds = new Set<string>()
    const validEntityIds = new Set(entities.map((e) => e.id))

    for (const entity of entities) {
      const parentId = parentMap.get(entity.id) ?? null

      // Check if parent exists and is valid
      const isOrphan = parentId !== null && !validEntityIds.has(parentId)
      if (isOrphan) {
        orphanIds.add(entity.id)
      }

      // Skip cycles - they'll be treated as orphans
      const isInCycle = cycleIds.has(entity.id)

      const node: HierarchyNode = {
        id: entity.id,
        data: entity,
        parentId: isInCycle || isOrphan ? null : parentId,
        level: 0, // Will be computed after tree structure
        children: [],
        hasChildren: false,
        path: [],
      }

      nodeMap.set(entity.id, node)
    }

    // 5. Link children to parents
    for (const node of nodeMap.values()) {
      if (node.parentId !== null) {
        const parentNode = nodeMap.get(node.parentId)
        if (parentNode) {
          parentNode.children.push(node)
          parentNode.hasChildren = true
        }
      }
    }

    // 6. Find root nodes (no parent or orphaned)
    const roots: HierarchyNode[] = []
    for (const node of nodeMap.values()) {
      if (node.parentId === null) {
        roots.push(node)
      }
    }

    // 7. Compute levels and paths for all nodes
    HierarchyProcessor.computeLevelsAndPaths(roots, 0, [], config.maxDepth)

    fileLog.debug('HierarchyProcessor.buildTree completed', {
      rootCount: roots.length,
      totalNodes: nodeMap.size,
      cycleCount: cycleIds.size,
      orphanCount: orphanIds.size,
    })

    return {
      roots,
      nodeMap,
      cycleIds,
      orphanIds,
      totalCount: nodeMap.size,
    }
  }

  // ====================================
  // PARENT MAP BUILDING
  // ====================================

  /**
   * Build a map of childId → parentId from relationships.
   */
  private static buildParentMap(
    relationships: HierarchyRelationship[],
    relationshipType: string,
  ): Map<string, string> {
    const parentMap = new Map<string, string>()

    for (const rel of relationships) {
      if (rel.relationshipType === relationshipType) {
        // In child_of relationship:
        // - sourceEntityId is the CHILD
        // - targetEntityId is the PARENT
        parentMap.set(rel.sourceEntityId, rel.targetEntityId)
      }
    }

    return parentMap
  }

  // ====================================
  // CYCLE DETECTION
  // ====================================

  /**
   * Detect cycles in the parent-child relationships using DFS.
   * Returns the set of entity IDs that are part of a cycle.
   */
  static detectCycles(entities: TableRow[], parentMap: Map<string, string>): Set<string> {
    const cycleIds = new Set<string>()
    const visited = new Set<string>()
    const recStack = new Set<string>()

    const dfs = (entityId: string, path: string[]): boolean => {
      if (recStack.has(entityId)) {
        // Found a cycle - mark all entities in the cycle
        const cycleStart = path.indexOf(entityId)
        if (cycleStart !== -1) {
          for (let i = cycleStart; i < path.length; i++) {
            cycleIds.add(path[i])
          }
        }
        cycleIds.add(entityId)
        return true
      }

      if (visited.has(entityId)) {
        return false
      }

      visited.add(entityId)
      recStack.add(entityId)
      path.push(entityId)

      const parentId = parentMap.get(entityId)
      if (parentId) {
        dfs(parentId, path)
      }

      path.pop()
      recStack.delete(entityId)
      return false
    }

    for (const entity of entities) {
      if (!visited.has(entity.id)) {
        dfs(entity.id, [])
      }
    }

    return cycleIds
  }

  // ====================================
  // LEVEL AND PATH COMPUTATION
  // ====================================

  /**
   * Recursively compute levels and ancestor paths for all nodes.
   */
  private static computeLevelsAndPaths(
    nodes: HierarchyNode[],
    level: number,
    path: string[],
    maxDepth: number,
  ): void {
    for (const node of nodes) {
      node.level = Math.min(level, maxDepth)
      node.path = [...path]

      if (node.children.length > 0 && level < maxDepth) {
        HierarchyProcessor.computeLevelsAndPaths(
          node.children,
          level + 1,
          [...path, node.id],
          maxDepth,
        )
      }
    }
  }

  // ====================================
  // FLATTEN TO VIRTUAL ROWS
  // ====================================

  /**
   * Flatten the hierarchy tree to virtual rows for rendering.
   * Respects the expandedRows set to show/hide children.
   *
   * @param tree - The hierarchy tree from buildTree()
   * @param config - Hierarchy configuration with expandedRows
   * @returns Array of VirtualRow for rendering
   */
  static flattenToVirtualRows(tree: HierarchyTree, config: HierarchyConfig): VirtualRow[] {
    const virtualRows: VirtualRow[] = []
    let index = 0

    const flatten = (nodes: HierarchyNode[]): void => {
      for (const node of nodes) {
        const isExpanded = config.expandedRows.has(node.id)

        virtualRows.push({
          type: 'data' as VirtualRowType,
          id: node.id,
          index: index++,
          height: HIERARCHY_ROW_HEIGHT,
          data: node.data,
          level: node.level,
          isExpandable: node.hasChildren,
          isExpanded,
        })

        // Recursively add children if expanded
        if (isExpanded && node.children.length > 0) {
          flatten(node.children)
        }
      }
    }

    flatten(tree.roots)

    fileLog.debug('HierarchyProcessor.flattenToVirtualRows', {
      totalNodes: tree.totalCount,
      virtualRowCount: virtualRows.length,
      expandedCount: config.expandedRows.size,
    })

    return virtualRows
  }

  // ====================================
  // NODE LOOKUP UTILITIES
  // ====================================

  /**
   * Find a node in the tree by ID.
   */
  static findNodeById(tree: HierarchyTree, nodeId: string): HierarchyNode | null {
    return tree.nodeMap.get(nodeId) ?? null
  }

  /**
   * Get the ancestor path from root to the specified node.
   * Returns array of entity IDs from root to parent (not including the node itself).
   */
  static getAncestorPath(tree: HierarchyTree, nodeId: string): string[] {
    const node = tree.nodeMap.get(nodeId)
    if (!node) {
      return []
    }
    return node.path
  }

  /**
   * Get all ancestor IDs that need to be expanded to show a specific node.
   * Useful for "scroll to" functionality.
   */
  static getAncestorsToExpand(tree: HierarchyTree, nodeId: string): string[] {
    return HierarchyProcessor.getAncestorPath(tree, nodeId)
  }

  /**
   * Get all descendant IDs of a node (for bulk operations).
   */
  static getDescendantIds(tree: HierarchyTree, nodeId: string): string[] {
    const node = tree.nodeMap.get(nodeId)
    if (!node) {
      return []
    }

    const descendants: string[] = []

    const collect = (nodes: HierarchyNode[]): void => {
      for (const n of nodes) {
        descendants.push(n.id)
        if (n.children.length > 0) {
          collect(n.children)
        }
      }
    }

    collect(node.children)
    return descendants
  }

  // ====================================
  // TREE MANIPULATION UTILITIES
  // ====================================

  /**
   * Get all nodes at a specific level in the tree.
   */
  static getNodesAtLevel(tree: HierarchyTree, level: number): HierarchyNode[] {
    const nodes: HierarchyNode[] = []

    for (const node of tree.nodeMap.values()) {
      if (node.level === level) {
        nodes.push(node)
      }
    }

    return nodes
  }

  /**
   * Get the maximum depth of the tree.
   */
  static getMaxDepth(tree: HierarchyTree): number {
    let maxDepth = 0

    for (const node of tree.nodeMap.values()) {
      if (node.level > maxDepth) {
        maxDepth = node.level
      }
    }

    return maxDepth
  }

  /**
   * Sort children at each level by a field in the entity data.
   * Modifies the tree in place.
   */
  static sortChildren(
    tree: HierarchyTree,
    sortField: string,
    direction: 'asc' | 'desc' = 'asc',
  ): void {
    const sortNodes = (nodes: HierarchyNode[]): void => {
      nodes.sort((a, b) => {
        const aValue = a.data.data?.[sortField] ?? a.data[sortField] ?? ''
        const bValue = b.data.data?.[sortField] ?? b.data[sortField] ?? ''

        let comparison = 0
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue)
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue
        } else {
          comparison = String(aValue).localeCompare(String(bValue))
        }

        return direction === 'desc' ? -comparison : comparison
      })

      // Recursively sort children
      for (const node of nodes) {
        if (node.children.length > 0) {
          sortNodes(node.children)
        }
      }
    }

    sortNodes(tree.roots)
  }
}
