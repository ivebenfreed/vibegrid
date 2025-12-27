import { describe, expect, it } from 'vitest'
import {
  HierarchyProcessor,
  type HierarchyConfig,
  type HierarchyRelationship,
} from '../HierarchyProcessor'
import type { TableRow } from '../../types'

// Helper to create test entities
function createEntity(id: string, name: string): TableRow {
  return {
    id,
    data: { name },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    },
  }
}

// Helper to create child_of relationship
function createChildOfRelationship(childId: string, parentId: string): HierarchyRelationship {
  return {
    id: `rel-${childId}-${parentId}`,
    sourceEntityId: childId, // Child
    targetEntityId: parentId, // Parent
    relationshipType: 'child_of',
  }
}

describe('HierarchyProcessor', () => {
  const defaultConfig: HierarchyConfig = {
    relationshipType: 'child_of',
    maxDepth: 3,
    expandedRows: new Set(),
    showOrphans: true,
  }

  describe('buildTree', () => {
    it('builds tree with correct parent-child structure', () => {
      const entities = [
        createEntity('parent', 'Parent Task'),
        createEntity('child1', 'Child 1'),
        createEntity('child2', 'Child 2'),
      ]

      const relationships = [
        createChildOfRelationship('child1', 'parent'),
        createChildOfRelationship('child2', 'parent'),
      ]

      const tree = HierarchyProcessor.buildTree(entities, relationships, defaultConfig)

      expect(tree.roots).toHaveLength(1)
      expect(tree.roots[0].id).toBe('parent')
      expect(tree.roots[0].children).toHaveLength(2)
      expect(tree.roots[0].hasChildren).toBe(true)
    })

    it('assigns correct levels to nested entities', () => {
      const entities = [
        createEntity('root', 'Root'),
        createEntity('level1', 'Level 1'),
        createEntity('level2', 'Level 2'),
      ]

      const relationships = [
        createChildOfRelationship('level1', 'root'),
        createChildOfRelationship('level2', 'level1'),
      ]

      const tree = HierarchyProcessor.buildTree(entities, relationships, defaultConfig)

      const rootNode = tree.nodeMap.get('root')
      const level1Node = tree.nodeMap.get('level1')
      const level2Node = tree.nodeMap.get('level2')

      expect(rootNode?.level).toBe(0)
      expect(level1Node?.level).toBe(1)
      expect(level2Node?.level).toBe(2)
    })

    it('respects maxDepth configuration', () => {
      const entities = [
        createEntity('root', 'Root'),
        createEntity('level1', 'Level 1'),
        createEntity('level2', 'Level 2'),
        createEntity('level3', 'Level 3'),
        createEntity('level4', 'Level 4'),
      ]

      const relationships = [
        createChildOfRelationship('level1', 'root'),
        createChildOfRelationship('level2', 'level1'),
        createChildOfRelationship('level3', 'level2'),
        createChildOfRelationship('level4', 'level3'),
      ]

      const configWithMaxDepth2: HierarchyConfig = {
        ...defaultConfig,
        maxDepth: 2,
      }

      const tree = HierarchyProcessor.buildTree(entities, relationships, configWithMaxDepth2)

      // Level should cap at maxDepth
      const level4Node = tree.nodeMap.get('level4')
      expect(level4Node?.level).toBeLessThanOrEqual(2)
    })

    it('handles orphan nodes with invalid parent references', () => {
      const entities = [
        createEntity('orphan', 'Orphan Task'),
        createEntity('valid', 'Valid Task'),
      ]

      // orphan references a non-existent parent
      const relationships = [createChildOfRelationship('orphan', 'non-existent-parent')]

      const tree = HierarchyProcessor.buildTree(entities, relationships, defaultConfig)

      expect(tree.orphanIds.has('orphan')).toBe(true)
      // Orphans appear at root level
      const orphanNode = tree.roots.find((r) => r.id === 'orphan')
      expect(orphanNode).toBeDefined()
      expect(orphanNode?.parentId).toBeNull()
    })

    it('handles null parent (root nodes)', () => {
      const entities = [
        createEntity('root1', 'Root 1'),
        createEntity('root2', 'Root 2'),
      ]

      // No relationships - both are root nodes
      const relationships: HierarchyRelationship[] = []

      const tree = HierarchyProcessor.buildTree(entities, relationships, defaultConfig)

      expect(tree.roots).toHaveLength(2)
      expect(tree.roots.every((r) => r.parentId === null)).toBe(true)
    })
  })

  describe('detectCycles', () => {
    it('detects simple A -> B -> A cycle', () => {
      const entities = [createEntity('A', 'Task A'), createEntity('B', 'Task B')]

      // A is child of B, B is child of A (cycle)
      const parentMap = new Map([
        ['A', 'B'],
        ['B', 'A'],
      ])

      const cycleIds = HierarchyProcessor.detectCycles(entities, parentMap)

      expect(cycleIds.size).toBeGreaterThan(0)
      expect(cycleIds.has('A') || cycleIds.has('B')).toBe(true)
    })

    it('detects longer A -> B -> C -> A cycle', () => {
      const entities = [
        createEntity('A', 'Task A'),
        createEntity('B', 'Task B'),
        createEntity('C', 'Task C'),
      ]

      // A -> B -> C -> A (cycle)
      const parentMap = new Map([
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'A'],
      ])

      const cycleIds = HierarchyProcessor.detectCycles(entities, parentMap)

      expect(cycleIds.size).toBeGreaterThan(0)
    })

    it('detects self-reference cycle', () => {
      const entities = [createEntity('A', 'Task A')]

      // A is child of itself
      const parentMap = new Map([['A', 'A']])

      const cycleIds = HierarchyProcessor.detectCycles(entities, parentMap)

      expect(cycleIds.has('A')).toBe(true)
    })

    it('returns empty set for valid tree', () => {
      const entities = [
        createEntity('root', 'Root'),
        createEntity('child', 'Child'),
        createEntity('grandchild', 'Grandchild'),
      ]

      // Valid tree: root -> child -> grandchild
      const parentMap = new Map([
        ['child', 'root'],
        ['grandchild', 'child'],
      ])

      const cycleIds = HierarchyProcessor.detectCycles(entities, parentMap)

      expect(cycleIds.size).toBe(0)
    })

    it('isolates cycle nodes from valid tree', () => {
      const entities = [
        createEntity('root', 'Root'),
        createEntity('child', 'Child'),
        createEntity('cycleA', 'Cycle A'),
        createEntity('cycleB', 'Cycle B'),
      ]

      // Valid tree + cycle
      const parentMap = new Map([
        ['child', 'root'],
        ['cycleA', 'cycleB'],
        ['cycleB', 'cycleA'],
      ])

      const cycleIds = HierarchyProcessor.detectCycles(entities, parentMap)

      // Only cycle nodes should be marked
      expect(cycleIds.has('root')).toBe(false)
      expect(cycleIds.has('child')).toBe(false)
      expect(cycleIds.has('cycleA') || cycleIds.has('cycleB')).toBe(true)
    })
  })

  describe('flattenToVirtualRows', () => {
    it('includes only visible rows based on expanded state', () => {
      const entities = [
        createEntity('parent', 'Parent'),
        createEntity('child', 'Child'),
      ]

      const relationships = [createChildOfRelationship('child', 'parent')]

      // Collapsed state
      const collapsedConfig: HierarchyConfig = {
        ...defaultConfig,
        expandedRows: new Set(), // parent not expanded
      }

      const tree = HierarchyProcessor.buildTree(entities, relationships, collapsedConfig)
      const virtualRows = HierarchyProcessor.flattenToVirtualRows(tree, collapsedConfig)

      // Only parent should be visible (child hidden)
      expect(virtualRows).toHaveLength(1)
      expect(virtualRows[0].id).toBe('parent')
    })

    it('shows children when parent is expanded', () => {
      const entities = [
        createEntity('parent', 'Parent'),
        createEntity('child', 'Child'),
      ]

      const relationships = [createChildOfRelationship('child', 'parent')]

      // Expanded state
      const expandedConfig: HierarchyConfig = {
        ...defaultConfig,
        expandedRows: new Set(['parent']), // parent expanded
      }

      const tree = HierarchyProcessor.buildTree(entities, relationships, expandedConfig)
      const virtualRows = HierarchyProcessor.flattenToVirtualRows(tree, expandedConfig)

      // Both parent and child should be visible
      expect(virtualRows).toHaveLength(2)
      expect(virtualRows[0].id).toBe('parent')
      expect(virtualRows[1].id).toBe('child')
    })

    it('sets correct isExpandable and isExpanded on VirtualRows', () => {
      const entities = [
        createEntity('parent', 'Parent'),
        createEntity('child', 'Child'),
      ]

      const relationships = [createChildOfRelationship('child', 'parent')]

      const expandedConfig: HierarchyConfig = {
        ...defaultConfig,
        expandedRows: new Set(['parent']),
      }

      const tree = HierarchyProcessor.buildTree(entities, relationships, expandedConfig)
      const virtualRows = HierarchyProcessor.flattenToVirtualRows(tree, expandedConfig)

      const parentRow = virtualRows.find((r) => r.id === 'parent')
      const childRow = virtualRows.find((r) => r.id === 'child')

      expect(parentRow?.isExpandable).toBe(true)
      expect(parentRow?.isExpanded).toBe(true)
      expect(childRow?.isExpandable).toBe(false)
    })

    it('preserves level information in VirtualRows', () => {
      const entities = [
        createEntity('root', 'Root'),
        createEntity('level1', 'Level 1'),
        createEntity('level2', 'Level 2'),
      ]

      const relationships = [
        createChildOfRelationship('level1', 'root'),
        createChildOfRelationship('level2', 'level1'),
      ]

      const expandedConfig: HierarchyConfig = {
        ...defaultConfig,
        expandedRows: new Set(['root', 'level1']),
      }

      const tree = HierarchyProcessor.buildTree(entities, relationships, expandedConfig)
      const virtualRows = HierarchyProcessor.flattenToVirtualRows(tree, expandedConfig)

      expect(virtualRows[0].level).toBe(0) // root
      expect(virtualRows[1].level).toBe(1) // level1
      expect(virtualRows[2].level).toBe(2) // level2
    })
  })

  describe('utility methods', () => {
    it('findNodeById returns correct node', () => {
      const entities = [createEntity('test', 'Test')]
      const tree = HierarchyProcessor.buildTree(entities, [], defaultConfig)

      const node = HierarchyProcessor.findNodeById(tree, 'test')

      expect(node).not.toBeNull()
      expect(node?.id).toBe('test')
    })

    it('findNodeById returns null for non-existent node', () => {
      const entities = [createEntity('test', 'Test')]
      const tree = HierarchyProcessor.buildTree(entities, [], defaultConfig)

      const node = HierarchyProcessor.findNodeById(tree, 'non-existent')

      expect(node).toBeNull()
    })

    it('getAncestorPath returns correct path', () => {
      const entities = [
        createEntity('root', 'Root'),
        createEntity('child', 'Child'),
        createEntity('grandchild', 'Grandchild'),
      ]

      const relationships = [
        createChildOfRelationship('child', 'root'),
        createChildOfRelationship('grandchild', 'child'),
      ]

      const tree = HierarchyProcessor.buildTree(entities, relationships, defaultConfig)
      const path = HierarchyProcessor.getAncestorPath(tree, 'grandchild')

      expect(path).toEqual(['root', 'child'])
    })

    it('getDescendantIds returns all descendants', () => {
      const entities = [
        createEntity('parent', 'Parent'),
        createEntity('child1', 'Child 1'),
        createEntity('child2', 'Child 2'),
        createEntity('grandchild', 'Grandchild'),
      ]

      const relationships = [
        createChildOfRelationship('child1', 'parent'),
        createChildOfRelationship('child2', 'parent'),
        createChildOfRelationship('grandchild', 'child1'),
      ]

      const tree = HierarchyProcessor.buildTree(entities, relationships, defaultConfig)
      const descendants = HierarchyProcessor.getDescendantIds(tree, 'parent')

      expect(descendants).toContain('child1')
      expect(descendants).toContain('child2')
      expect(descendants).toContain('grandchild')
      expect(descendants).toHaveLength(3)
    })

    it('getMaxDepth returns correct tree depth', () => {
      const entities = [
        createEntity('root', 'Root'),
        createEntity('level1', 'Level 1'),
        createEntity('level2', 'Level 2'),
      ]

      const relationships = [
        createChildOfRelationship('level1', 'root'),
        createChildOfRelationship('level2', 'level1'),
      ]

      const tree = HierarchyProcessor.buildTree(entities, relationships, defaultConfig)
      const maxDepth = HierarchyProcessor.getMaxDepth(tree)

      expect(maxDepth).toBe(2)
    })
  })
})
