/**
 * HierarchyStore - Hierarchy State Management (MobX)
 *
 * Manages state for hierarchical data display in VibeGrid:
 * - Self-referential hierarchy (Task → Task via child_of)
 * - Master-detail nested grids (Project → Tasks via belongs_to)
 * - Tree sidebar navigation
 *
 * This store does NOT fetch data - it relies on parent components to provide
 * entities and relationships. It focuses on UI state management.
 */

import { action, computed, makeObservable, observable, runInAction } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import {
  HierarchyProcessor,
  type HierarchyConfig,
  type HierarchyNode,
  type HierarchyRelationship,
  type HierarchyTree,
} from '../processors/HierarchyProcessor'
import type { TableRow, VirtualRow } from '../types'

const logger = getLogger(['vibegrid', 'stores', 'HierarchyStore'])

// ====================================
// TYPES
// ====================================

export type HierarchyMode = 'none' | 'self-ref' | 'master-detail'

export interface HierarchyStoreState {
  hierarchyMode: HierarchyMode
  relationshipType: string
  expandedRows: Set<string>
  detailExpandedRows: Set<string>
  maxDepth: number
  showTreeSidebar: boolean
}

// ====================================
// STORE
// ====================================

export class HierarchyStore implements IStore {
  // ====================================
  // OBSERVABLE STATE
  // ====================================

  /** Current hierarchy display mode */
  @observable hierarchyMode: HierarchyMode = 'none'

  /** Relationship type for hierarchy (e.g., 'child_of', 'belongs_to') */
  @observable relationshipType: string = 'child_of'

  /** Expanded row IDs for self-referential hierarchy */
  @observable expandedRows: Set<string> = new Set()

  /** Expanded master row IDs for master-detail view */
  @observable detailExpandedRows: Set<string> = new Set()

  /** Maximum nesting depth (default 3, max 10) */
  @observable maxDepth: number = 3

  /** Whether the tree sidebar is visible */
  @observable showTreeSidebar: boolean = false

  /** Cached tree data built from entities + relationships */
  @observable private _treeData: HierarchyTree | null = null

  /** Entities for tree building (set by parent component) */
  @observable private _entities: TableRow[] = []

  /** Relationships for tree building (set by parent component) */
  @observable private _relationships: HierarchyRelationship[] = []

  /** Show orphaned nodes at root level */
  @observable showOrphans: boolean = true

  // ====================================
  // LIFECYCLE
  // ====================================

  private disposers = new DisposerManager()

  constructor() {
    makeObservable(this)
    logger.info('HierarchyStore created')
  }

  async init(): Promise<void> {
    logger.info('HierarchyStore initialized')
  }

  dispose(): void {
    this.disposers.dispose()
    logger.info('HierarchyStore disposed')
  }

  @action
  reset(): void {
    this.hierarchyMode = 'none'
    this.relationshipType = 'child_of'
    this.expandedRows = new Set()
    this.detailExpandedRows = new Set()
    this.maxDepth = 3
    this.showTreeSidebar = false
    this._treeData = null
    this._entities = []
    this._relationships = []
    this.showOrphans = true
    logger.info('HierarchyStore reset')
  }

  // ====================================
  // DATA SETTERS (from parent component)
  // ====================================

  /**
   * Set entities for tree building.
   * Called by parent component when entity data is loaded.
   */
  @action
  setEntities(entities: TableRow[]): void {
    this._entities = entities
    this._treeData = null // Invalidate cached tree
    logger.debug('Entities set', { count: entities.length })
  }

  /**
   * Set relationships for tree building.
   * Called by parent component when relationship data is loaded.
   */
  @action
  setRelationships(relationships: HierarchyRelationship[]): void {
    this._relationships = relationships
    this._treeData = null // Invalidate cached tree
    logger.debug('Relationships set', { count: relationships.length })
  }

  /**
   * Set both entities and relationships at once.
   */
  @action
  setData(entities: TableRow[], relationships: HierarchyRelationship[]): void {
    this._entities = entities
    this._relationships = relationships
    this._treeData = null // Invalidate cached tree
    logger.debug('Data set', {
      entityCount: entities.length,
      relationshipCount: relationships.length,
    })
  }

  // ====================================
  // COMPUTED PROPERTIES
  // ====================================

  /**
   * Build and cache the hierarchy tree.
   * Uses HierarchyProcessor to build tree from entities + relationships.
   */
  @computed
  get treeData(): HierarchyTree {
    // Return cached tree if available
    if (this._treeData) {
      return this._treeData
    }

    // Build new tree if we have data
    if (this._entities.length === 0) {
      return {
        roots: [],
        nodeMap: new Map(),
        cycleIds: new Set(),
        orphanIds: new Set(),
        totalCount: 0,
      }
    }

    const config: HierarchyConfig = {
      relationshipType: this.relationshipType,
      maxDepth: this.maxDepth,
      expandedRows: this.expandedRows,
      showOrphans: this.showOrphans,
    }

    const tree = HierarchyProcessor.buildTree(this._entities, this._relationships, config)

    // Cache the result (will be invalidated when data changes)
    runInAction(() => {
      this._treeData = tree
    })

    logger.debug('Tree built', {
      roots: tree.roots.length,
      total: tree.totalCount,
      cycles: tree.cycleIds.size,
      orphans: tree.orphanIds.size,
    })

    return tree
  }

  /**
   * Flattened hierarchy for virtual row rendering.
   * Respects current expansion state.
   */
  @computed
  get flattenedHierarchy(): VirtualRow[] {
    if (this.hierarchyMode === 'none') {
      return []
    }

    const config: HierarchyConfig = {
      relationshipType: this.relationshipType,
      maxDepth: this.maxDepth,
      expandedRows: this.expandedRows,
      showOrphans: this.showOrphans,
    }

    return HierarchyProcessor.flattenToVirtualRows(this.treeData, config)
  }

  /**
   * Check if hierarchy mode is active.
   */
  @computed
  get isHierarchyActive(): boolean {
    return this.hierarchyMode !== 'none'
  }

  /**
   * Check if there are any cycles in the hierarchy.
   */
  @computed
  get hasCycles(): boolean {
    return this.treeData.cycleIds.size > 0
  }

  /**
   * Get the maximum depth of the current tree.
   */
  @computed
  get currentMaxDepth(): number {
    return HierarchyProcessor.getMaxDepth(this.treeData)
  }

  // ====================================
  // ACTIONS
  // ====================================

  /**
   * Set the hierarchy display mode.
   */
  @action
  setHierarchyMode(mode: HierarchyMode): void {
    if (this.hierarchyMode === mode) return

    this.hierarchyMode = mode
    this._treeData = null // Invalidate tree when mode changes

    logger.info('Hierarchy mode changed', { mode })
  }

  /**
   * Set the relationship type for hierarchy queries.
   */
  @action
  setRelationshipType(type: string): void {
    if (this.relationshipType === type) return

    this.relationshipType = type
    this._treeData = null // Invalidate tree when relationship type changes

    logger.info('Relationship type changed', { type })
  }

  /**
   * Toggle row expansion for self-referential hierarchy.
   */
  @action
  toggleRowExpansion(rowId: string): void {
    const newExpanded = new Set(this.expandedRows)

    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId)
      logger.debug('Row collapsed', { rowId })
    } else {
      newExpanded.add(rowId)
      logger.debug('Row expanded', { rowId })
    }

    this.expandedRows = newExpanded
  }

  /**
   * Expand a specific row.
   */
  @action
  expandRow(rowId: string): void {
    if (this.expandedRows.has(rowId)) return

    const newExpanded = new Set(this.expandedRows)
    newExpanded.add(rowId)
    this.expandedRows = newExpanded

    logger.debug('Row expanded', { rowId })
  }

  /**
   * Collapse a specific row.
   */
  @action
  collapseRow(rowId: string): void {
    if (!this.expandedRows.has(rowId)) return

    const newExpanded = new Set(this.expandedRows)
    newExpanded.delete(rowId)
    this.expandedRows = newExpanded

    logger.debug('Row collapsed', { rowId })
  }

  /**
   * Expand all rows up to a certain level.
   */
  @action
  expandToLevel(level: number): void {
    const nodesToExpand = new Set<string>()

    for (const node of this.treeData.nodeMap.values()) {
      if (node.level < level && node.hasChildren) {
        nodesToExpand.add(node.id)
      }
    }

    this.expandedRows = nodesToExpand

    logger.info('Expanded to level', { level, expandedCount: nodesToExpand.size })
  }

  /**
   * Expand all nodes.
   */
  @action
  expandAll(): void {
    const allExpandable = new Set<string>()

    for (const node of this.treeData.nodeMap.values()) {
      if (node.hasChildren) {
        allExpandable.add(node.id)
      }
    }

    this.expandedRows = allExpandable

    logger.info('All nodes expanded', { count: allExpandable.size })
  }

  /**
   * Collapse all nodes.
   */
  @action
  collapseAll(): void {
    this.expandedRows = new Set()
    logger.info('All nodes collapsed')
  }

  /**
   * Toggle master-detail expansion for a row.
   */
  @action
  toggleDetailExpansion(rowId: string): void {
    const newExpanded = new Set(this.detailExpandedRows)

    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId)
      logger.debug('Detail collapsed', { rowId })
    } else {
      newExpanded.add(rowId)
      logger.debug('Detail expanded', { rowId })
    }

    this.detailExpandedRows = newExpanded
  }

  /**
   * Expand ancestors and scroll to a specific node.
   * Useful for "reveal in tree" functionality.
   */
  @action
  scrollToNode(nodeId: string): void {
    const ancestorsToExpand = HierarchyProcessor.getAncestorsToExpand(this.treeData, nodeId)

    if (ancestorsToExpand.length > 0) {
      const newExpanded = new Set(this.expandedRows)
      for (const ancestorId of ancestorsToExpand) {
        newExpanded.add(ancestorId)
      }
      this.expandedRows = newExpanded

      logger.debug('Expanded ancestors for node', {
        nodeId,
        ancestorCount: ancestorsToExpand.length,
      })
    }

    // Note: Actual scroll position handling is done by the UI component
    // that observes this store's state
  }

  /**
   * Set maximum depth for hierarchy.
   */
  @action
  setMaxDepth(depth: number): void {
    const validDepth = Math.max(1, Math.min(10, depth))

    if (this.maxDepth === validDepth) return

    this.maxDepth = validDepth
    this._treeData = null // Invalidate tree when depth changes

    logger.info('Max depth changed', { depth: validDepth })
  }

  /**
   * Toggle tree sidebar visibility.
   */
  @action
  toggleTreeSidebar(): void {
    this.showTreeSidebar = !this.showTreeSidebar
    logger.debug('Tree sidebar toggled', { visible: this.showTreeSidebar })
  }

  /**
   * Set tree sidebar visibility.
   */
  @action
  setTreeSidebarVisible(visible: boolean): void {
    this.showTreeSidebar = visible
    logger.debug('Tree sidebar visibility set', { visible })
  }

  /**
   * Set whether to show orphan nodes at root level.
   */
  @action
  setShowOrphans(show: boolean): void {
    if (this.showOrphans === show) return

    this.showOrphans = show
    this._treeData = null // Invalidate tree when orphan setting changes

    logger.debug('Show orphans changed', { show })
  }

  // ====================================
  // UTILITY METHODS
  // ====================================

  /**
   * Find a node by ID.
   */
  findNode(nodeId: string): HierarchyNode | null {
    return HierarchyProcessor.findNodeById(this.treeData, nodeId)
  }

  /**
   * Get all descendant IDs of a node.
   */
  getDescendantIds(nodeId: string): string[] {
    return HierarchyProcessor.getDescendantIds(this.treeData, nodeId)
  }

  /**
   * Get ancestor path for a node.
   */
  getAncestorPath(nodeId: string): string[] {
    return HierarchyProcessor.getAncestorPath(this.treeData, nodeId)
  }

  /**
   * Check if a row is expanded.
   */
  isRowExpanded(rowId: string): boolean {
    return this.expandedRows.has(rowId)
  }

  /**
   * Check if a row has children.
   */
  hasChildren(rowId: string): boolean {
    const node = this.findNode(rowId)
    return node?.hasChildren ?? false
  }

  /**
   * Get the level of a row.
   */
  getRowLevel(rowId: string): number {
    const node = this.findNode(rowId)
    return node?.level ?? 0
  }

  /**
   * Get current state for persistence.
   */
  getState(): HierarchyStoreState {
    return {
      hierarchyMode: this.hierarchyMode,
      relationshipType: this.relationshipType,
      expandedRows: this.expandedRows,
      detailExpandedRows: this.detailExpandedRows,
      maxDepth: this.maxDepth,
      showTreeSidebar: this.showTreeSidebar,
    }
  }

  /**
   * Restore state from persistence.
   */
  @action
  restoreState(state: Partial<HierarchyStoreState>): void {
    if (state.hierarchyMode !== undefined) {
      this.hierarchyMode = state.hierarchyMode
    }
    if (state.relationshipType !== undefined) {
      this.relationshipType = state.relationshipType
    }
    if (state.expandedRows !== undefined) {
      this.expandedRows = new Set(state.expandedRows)
    }
    if (state.detailExpandedRows !== undefined) {
      this.detailExpandedRows = new Set(state.detailExpandedRows)
    }
    if (state.maxDepth !== undefined) {
      this.maxDepth = state.maxDepth
    }
    if (state.showTreeSidebar !== undefined) {
      this.showTreeSidebar = state.showTreeSidebar
    }

    this._treeData = null // Invalidate tree after state restore

    logger.info('State restored', state)
  }
}
