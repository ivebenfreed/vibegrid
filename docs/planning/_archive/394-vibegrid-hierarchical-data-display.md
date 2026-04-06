# Feature Planning: VibeGrid Hierarchical & Relational Data Display

> **GitHub Issue:** #394
> **Parent Epic:** #187 (VibeGrid)
> **Status:** in-review
> **Codex Score:** 83/100 (passed >= 75)

---

## 0. Feature Context

**GitHub Issue:** #394 - VibeGrid: Hierarchical & Relational Data Display

**Acceptance Criteria (Scoped):**

**Phase 1: Self-Referential Hierarchy**
- [ ] Rows with parent relationships appear indented under parent
- [ ] Parent rows show expand/collapse toggle
- [ ] Multi-level nesting works (up to 3 levels)
- [ ] Orphan rows (null/invalid parent) appear at root
- [ ] Circular reference detection prevents infinite loops

**Phase 2: Relationship Grouping**
- [ ] Can select relationship fields in "Group By" dropdown
- [ ] Group headers display resolved entity names (not UUIDs)
- [ ] "(No [Entity])" group for null relationships

**OUT OF SCOPE (separate issues):**
- Master-detail nested grids → See #249
- Tree sidebar navigation → See #217

**Related Features:**
- `apps/web/src/systems/vibegrid/processors/GroupProcessor.ts` - Existing grouping with multi-level support
- `apps/web/src/shared/components/knowledge-tree/KnowledgeTreeSection.tsx` - Reusable tree component
- `apps/web/src/features/devplan/components/KnowledgeTree.tsx` - Tree rendering pattern

**Design Decisions:**
1. **Hierarchy Source:** `child_of` relationships via `UnifiedRelationshipService` (authoritative)
2. **Relationship Resolution:** Use existing `entityReferenceData` cache pattern from TableCoreStore
3. **Max Depth:** Configurable per-view, default 3
4. **Client-side processing:** Follows existing `GroupProcessor` pattern (no new server endpoints)

### Hierarchy Data Source (CRITICAL)

**Authoritative source for parent-child relationships: `child_of` relationships via `UnifiedRelationshipService`**

Per `.claude/rules/dataforge-relationships.md`, reference fields (`entity_reference`, `user_reference`) do NOT create columns in the entity table. Therefore:

1. **Never assume `parent_id` is a persisted column** - It may be a virtual field that doesn't exist in row data
2. **Always query relationships for hierarchy** - Use `UnifiedRelationshipService.list()` with `relationshipType: 'child_of'`
3. **Hydration pattern for display:**
   ```typescript
   // 1. Load entities (via DataQueryService - handles auth)
   const entities = await dataQueryService.query({ entityType, security })

   // 2. Load child_of relationships
   const relationships = await unifiedRelationshipService.list(kysely, orgId, {
     sourceEntityType: entityType,
     targetEntityType: entityType, // Same type for self-referential
     relationshipType: 'child_of'
   })

   // 3. Build parent lookup: childId → parentId
   const parentMap = new Map(
     relationships.map(r => [r.sourceEntityId, r.targetEntityId])
   )

   // 4. Hydrate entities with parent info for grouping/indentation
   const hydratedEntities = entities.map(e => ({
     ...e,
     _parentId: parentMap.get(e.id) ?? null, // Virtual field for UI
     _level: computeLevel(e.id, parentMap)   // Nesting depth
   }))
   ```

**For `KnowledgeNode` specifically:** Use `KnowledgeHierarchyService.getRootNodes()` + `getChildren()` to build tree on server side.

### Data Flow: Client → Server → Database

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW DIAGRAM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CLIENT (VibeGrid)                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ HierarchyStore                                                       │   │
│  │   ├─ loadHierarchy() ─────────────────────────────────────────────►│   │
│  │   │                                                                  │   │
│  └───┼──────────────────────────────────────────────────────────────────┘   │
│      │                                                                       │
│      │  oRPC                                                                 │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ EXISTING ENDPOINTS                                                   │   │
│  │   ├─ dataforge.unifiedRelationships.list ─► UnifiedRelationshipSvc  │   │
│  │   ├─ dataforge.data.query ───────────────► DataQueryService         │   │
│  │   └─ (NEW) dataforge.data.getHierarchy ──► HierarchyProcessor       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│      │                                                                       │
│      │  Server queries                                                       │
│      ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DATABASE (via Kysely)                                                │   │
│  │   ├─ entity_relationships table ─► child_of, belongs_to data        │   │
│  │   ├─ entity_data table ──────────► Entity records                   │   │
│  │   └─ (org_id filtering applied by DataQueryService)                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

CLIENT ENDPOINTS USED:
1. Hierarchy data: dataforge.data.getHierarchy (NEW - returns tree structure)
2. Relationship grouping: dataforge.unifiedRelationships.list (EXISTING)
3. Detail grid data: dataforge.data.query (EXISTING)
4. Entity name resolution: Uses existing TableCoreStore.entityReferenceData cache

CACHE STRATEGY:
- Hierarchy tree cached in HierarchyStore.treeData
- Relationship data cached via existing entityReferenceData pattern
- Cache invalidated on:
  - Entity CRUD events (via EventBus)
  - Relationship changes (`entity_relationships` table mutations)
  - Use existing EventBus patterns from apps/web/src/shared/lib/events/
```

---

## 1. Backend / API

### 1.1 Similar Feature Analysis

**Most similar existing feature:**
Path: `apps/web/src/server/domain/dataforge/processors/DependencyProcessor.ts`
Why similar: Also handles entity relationships with graph traversal

**Relationship service to use:**
Path: `apps/web/src/server/domain/dataforge/services/UnifiedRelationshipService.ts`
Key patterns: MUST use `UnifiedRelationshipService.list()` for all `child_of` and `belongs_to` queries - never query `entity_relationships` table directly

**Knowledge hierarchy service:**
Path: `apps/web/src/server/domain/knowledge-graph/services/KnowledgeHierarchyService.ts`
Key patterns: For `KnowledgeNode` entity type, MUST use `KnowledgeHierarchyService` which handles cycle detection, folder constraints, and materialized path updates

**Router pattern to follow:**
Path: `apps/web/src/server/orpc/routers/dataforge/data-router.ts`
Key patterns: Uses `orgProcedure`, queries via existing data services, handles entity data

### 1.2 New Files

| File Path | Purpose | Based On |
|-----------|---------|----------|
| `apps/web/src/server/domain/dataforge/processors/HierarchyProcessor.ts` | Build parent-child trees, detect cycles | `DependencyProcessor.ts` |

### 1.3 API Endpoints

**NO new endpoints needed for basic hierarchy** - uses existing endpoints:

| Existing Endpoint | Purpose | Used For |
|-------------------|---------|----------|
| `dataforge.data.query` | Fetch entities | Load all entities for hierarchy |
| `dataforge.unifiedRelationships.list` | Fetch relationships | Get `child_of` / `belongs_to` relationships |

**Optional: Lazy-load endpoint for master-detail (only if needed for large datasets):**

| Procedure | Type | Procedure Base | Input Schema | Output | Notes |
|-----------|------|----------------|--------------|--------|-------|
| `dataforge.data.getChildren` | query | `orgProcedure` | See below | `Entity[]` | Lazy-load children for master-detail |

```typescript
// getChildren - Cross-entity relationship (master-detail)
// Only needed if lazy-loading children on expand
interface GetChildrenInput {
  sourceEntityType: string     // Parent entity type, e.g., 'Project'
  targetEntityType: string     // Child entity type, e.g., 'Task'
  relationshipType: string     // e.g., 'belongs_to' (Task belongs_to Project)
  parentId: string             // The parent entity ID
}
```

**Client-side relationship query pattern:**
```typescript
// Use existing oRPC endpoint
const relationships = await api.dataforge.unifiedRelationships.list.query({
  sourceEntityType: entityType,
  targetEntityType: entityType, // Same type for self-ref
  relationshipType: 'child_of'
})
```

**Sort Order:**
Both endpoints respect relationship `sortOrder` property if present, falling back to entity `created_at`.

### 1.3.1 Hierarchy Processing (CLIENT-SIDE)

**Client builds trees** - follows existing `GroupProcessor` pattern.

```
CLIENT-SIDE PROCESSING (matches existing patterns)
──────────────────────────────────────────────────
1. Entities loaded via dataforge.data.query (EXISTING)
       │
2. Relationships loaded via dataforge.unifiedRelationships.list (EXISTING)
       │
3. HierarchyProcessor.buildTree(entities, relationships) (NEW - client-side)
       │
4. HierarchyStore.treeData ──► TreeSidebar
       │
5. HierarchyProcessor.flattenToVirtualRows() ──► VibeGrid renderer
```

**Why client-side?**
- Matches existing `GroupProcessor` pattern (client builds group trees)
- Reuses existing `TableCoreStore.entityReferenceData` for relationship resolution
- No new server endpoints needed for basic hierarchy
- Immediate expand/collapse without round-trips

**NO new server endpoints for tree building** - uses existing data endpoints.

**KnowledgeNode Special Case:**
For `KnowledgeNode` entities only, use existing `KnowledgeHierarchyService` via dedicated endpoints (already exists). All other entity types use client-side tree building.

### 1.4 Validation (Zod Schemas)

**Schema file:** `apps/web/src/server/orpc/schemas/dataforge/hierarchy-schemas.ts`

| Schema | Fields | Validation Rules |
|--------|--------|------------------|
| `getHierarchySchema` | `entityType`, `relationshipType`, `rootIds?`, `maxDepth?` | entityType required, relationshipType validated against canonical types, maxDepth 1-10 |
| `getChildrenSchema` | `sourceEntityType`, `targetEntityType`, `relationshipType`, `parentId` | All required, valid UUIDs, relationshipType validated |

**Relationship Type Validation:**
```typescript
const CANONICAL_HIERARCHY_TYPES = ['child_of', 'belongs_to', 'contains'] as const
// Validate relationshipType against canonical types to prevent unsupported modes
```

### 1.5 Business Logic

**Service file:** `apps/web/src/server/domain/dataforge/processors/HierarchyProcessor.ts`

| Method | What it does | Dependencies |
|--------|--------------|--------------|
| `buildHierarchyTree()` | Converts flat rows to tree structure | `UnifiedRelationshipService` |
| `detectCycles()` | Prevents infinite loops in parent chain | None (pure function) |
| `getAncestorPath()` | Returns path from root to node | Used for scroll-to |
| `flattenHierarchy()` | Converts tree back to ordered flat list | Used for virtual rows |

**CRITICAL Integration Requirements:**

1. **Relationship Queries via UnifiedRelationshipService:**
   ```typescript
   // CORRECT: Use UnifiedRelationshipService
   const relationships = await unifiedRelationshipService.list(kysely, orgId, {
     sourceEntityType: entityType,
     targetEntityType: entityType,
     relationshipType: 'child_of'
   })

   // INCORRECT: Never query table directly
   // await kysely.selectFrom('entity_relationships')... // ❌
   ```

2. **KnowledgeNode Special Handling:**
   ```typescript
   // For KnowledgeNode entities, delegate to KnowledgeHierarchyService
   if (entityType === 'KnowledgeNode') {
     const service = new KnowledgeHierarchyService({ kysely, orgId })
     return service.getTree(rootId) // Handles cycles, folders, paths
   }
   ```

3. **Access Control via AuthorizationService:**
   The new endpoints MUST reuse the existing DataForge data query permission path:
   - Use `context.security` from request context
   - Apply same container/archetype authorization as `dataforge.data.query`
   - See `apps/web/src/server/domain/dataforge/services/DataQueryService.ts` for pattern

---

## 2. Frontend / UI

### 2.1 Similar Feature Analysis

**Most similar existing feature:**
Path: `apps/web/src/systems/vibegrid/processors/GroupProcessor.ts`
Why similar: Already handles multi-level grouping with VirtualRow generation

**Component patterns to follow:**
- Tree: `apps/web/src/shared/components/knowledge-tree/KnowledgeTreeSection.tsx`
- Sidebar: `apps/web/src/features/devplan/components/DevPlanSidebarContent.tsx`
- Store: `apps/web/src/systems/vibegrid/stores/TableCoreStore.ts`

### 2.2 New Files

| File Path | Purpose | Based On |
|-----------|---------|----------|
| `apps/web/src/systems/vibegrid/processors/HierarchyProcessor.ts` | Client-side hierarchy building | `GroupProcessor.ts` |
| `apps/web/src/systems/vibegrid/stores/HierarchyStore.ts` | Hierarchy state (expansion, tree data) | `VisualStateStore.ts` |
| `apps/web/src/systems/vibegrid/renderers/components/DetailGridRenderer.tsx` | Nested VibeGrid for master-detail | `GroupRenderer.ts` |
| `apps/web/src/systems/vibegrid/components/TreeSidebar.tsx` | Hierarchy tree navigation panel | `KnowledgeTreeSection.tsx` |

### 2.3 MobX Store Design

**Store file:** `apps/web/src/systems/vibegrid/stores/HierarchyStore.ts`
**Integration:** Compose with existing stores in `apps/web/src/systems/vibegrid/stores/context.tsx`

**Key Patterns (from existing stores):**
- Call `makeObservable(this)` in constructor
- Use `runInAction` for async callbacks
- Implement `IStore` interface (`init()`, `dispose()`)
- Use `DisposerManager` for cleanup

**Observable State:**
| Field | Type | Initial | Purpose |
|-------|------|---------|---------|
| `hierarchyMode` | `'none' \| 'self-ref' \| 'master-detail'` | `'none'` | Current hierarchy display mode |
| `relationshipType` | `string \| null` | `'child_of'` | Relationship type for hierarchy (queried via `UnifiedRelationshipService`) |
| `expandedRows` | `Set<string>` | `new Set()` | Expanded row IDs (for self-ref) |
| `detailExpandedRows` | `Set<string>` | `new Set()` | Expanded master rows (for detail) |
| `treeData` | `HierarchyNode[]` | `[]` | Computed tree structure for sidebar |
| `maxDepth` | `number` | `3` | Maximum nesting depth |
| `showTreeSidebar` | `boolean` | `false` | Toggle tree sidebar visibility |

**Actions:**
| Action | API Call | Optimistic? | Error Handling |
|--------|----------|-------------|----------------|
| `toggleRowExpansion(rowId)` | None | Yes | N/A |
| `toggleDetailExpansion(rowId)` | `getChildren` | No | Toast + retry |
| `scrollToNode(nodeId)` | None | Yes | N/A |
| `setHierarchyMode(mode)` | None | Yes | N/A |

**Computed Values:**
| Computed | Derivation | Used By |
|----------|------------|---------|
| `hierarchyTree` | Built client-side from entities + relationships | TreeSidebar (Phase 2) |
| `flattenedHierarchy` | Client flattens `hierarchyTree` respecting `expandedRows` | VibeGrid renderer |

### 2.4 HierarchyProcessor (Client-side - Full Tree Building)

**File:** `apps/web/src/systems/vibegrid/processors/HierarchyProcessor.ts`

**Follows existing `GroupProcessor` pattern** - client builds trees from entities + relationships.

```typescript
// Key types
interface HierarchyNode {
  id: string
  data: TableRow                   // Entity data
  parentId: string | null
  level: number
  children: HierarchyNode[]        // Built by client
  hasChildren: boolean
  path: string[]                   // Ancestor IDs (for cycle detection)
}

interface HierarchyConfig {
  relationshipType: string         // e.g., 'child_of'
  maxDepth: number                 // Default 3
  expandedRows: Set<string>        // Currently expanded
  showOrphans: boolean             // Show orphaned rows at root
}

// Key methods - FULL CLIENT-SIDE PROCESSING
class HierarchyProcessor {
  // Build tree from entities + relationships (client-side)
  static buildTree(
    entities: TableRow[],
    relationships: Relationship[],  // From unifiedRelationships.list
    config: HierarchyConfig
  ): HierarchyNode[]

  // Detect cycles during tree building
  static detectCycles(relationships: Relationship[]): string[]  // Returns cyclic entity IDs

  // Flatten tree to virtual rows for rendering
  static flattenToVirtualRows(tree: HierarchyNode[], config: HierarchyConfig): VirtualRow[]

  // Find node in tree by ID (for scroll-to)
  static findNodeById(tree: HierarchyNode[], id: string): HierarchyNode | null

  // Get ancestor path for breadcrumb
  static getAncestorPath(tree: HierarchyNode[], nodeId: string): string[]
}
```

**Pattern follows `GroupProcessor`:** Load data → Build tree → Flatten for virtual rows.

### 2.5 GroupProcessor Enhancement

**File:** `apps/web/src/systems/vibegrid/processors/GroupProcessor.ts`

Extend to support relationship grouping:
- Add `isRelationship` flag to `GroupField`
- Resolve relationship display names via `TableCoreStore.entityReferenceData`
- Handle null relationships with "(No [EntityType])" label

### 2.6 DetailGridRenderer Component

**File:** `apps/web/src/systems/vibegrid/renderers/components/DetailGridRenderer.tsx`

```typescript
interface DetailGridRendererProps {
  parentRow: TableRow
  relationshipType: string      // e.g., 'belongs_to'
  targetEntityType: string      // e.g., 'Task'
  columns?: Column[]            // Override columns, or use archetype defaults
  onClose: () => void
}
```

Features:
- Lazy-loads children on first expand
- Full VibeGrid capabilities (sort, filter, select)
- Constrained height with scroll
- Visual distinction (slightly different background)

### 2.7 TreeSidebar Component

**File:** `apps/web/src/systems/vibegrid/components/TreeSidebar.tsx`

Reuses patterns from `KnowledgeTreeSection`:
- Collapsible tree nodes
- Keyboard navigation
- Click to scroll grid to row
- Synced expansion state with grid

### 2.8 Component Props & State

| Component | Props | Local State | Store Access |
|-----------|-------|-------------|--------------|
| `TreeSidebar` | `onNodeClick` | None | `hierarchyStore.treeData` |
| `DetailGridRenderer` | `parentRow`, `targetEntityType` | `isLoading`, `children` | `tableCoreStore` for entity cache |

### 2.9 Routing

No new routes needed - this is a VibeGrid capability enhancement.

### 2.10 Accessibility & Testing

**data-testid attributes needed:**
| Element | data-testid | Purpose |
|---------|-------------|---------|
| Tree sidebar | `vibegrid-tree-sidebar` | E2E: verify sidebar renders |
| Tree node | `vibegrid-tree-node-{id}` | E2E: click to scroll |
| Expand toggle | `vibegrid-row-expand-{id}` | E2E: expand/collapse |
| Detail grid | `vibegrid-detail-{parentId}` | E2E: verify nested grid |

---

## 3. Database / DataForge

### 3.1 Entity Design

**Approach:** NO new archetypes or tables needed.

This feature works with existing entity data by:
1. Querying `child_of` relationships via `UnifiedRelationshipService` (self-referential hierarchy)
2. Using existing `belongs_to` relationships for grouping (cross-entity grouping)
3. For `KnowledgeNode` entities, delegating to `KnowledgeHierarchyService`

**Note:** Reference fields in archetypes do NOT create columns. All parent-child data comes from relationships, not entity fields.

### 3.2 Fields

No new fields required. Hierarchy is derived from relationships:
- `child_of` relationship type for self-referential hierarchies (Task → Task)
- `belongs_to` relationship type for cross-entity grouping (Task → Project)

**Important:** Reference fields in archetypes are virtual - they query relationships, not columns.

### 3.3 Relationships

Uses existing relationship types:
| From | To | Relationship Type | Usage |
|------|----|-------------------|-------|
| `Task` | `Task` | `child_of` | Self-referential hierarchy |
| `Task` | `Project` | `belongs_to` | Relationship grouping |
| `Any` | `Any` | `relates_to` | Generic relationships |

### 3.4 Migration

**Migration needed?** No - uses existing infrastructure.

---

## 3.5 Infrastructure

**No new infrastructure required.** This feature extends existing systems:

| System | Usage | Extends |
|--------|-------|---------|
| `UnifiedRelationshipService` | Query `child_of` and `belongs_to` relationships | Uses existing service, no changes needed |
| `KnowledgeHierarchyService` | Tree operations for `KnowledgeNode` entities | Uses existing `getRootNodes()` + `getChildren()` |
| `DataQueryService` | Query entities with authorization | Uses existing query path |
| `EventBus` | Cache invalidation on entity changes | Uses existing event patterns |
| `TableCoreStore.entityReferenceData` | Resolve relationship display names | Uses existing cache pattern |

**Existing oRPC endpoints to use:**
- `dataforge.unifiedRelationships.list` - Fetch relationship data
- `dataforge.data.query` - Fetch entity data with auth

**Existing relationship field resolution:**
Path: `apps/web/src/server/orpc/routers/dataforge/data.ts`
Pattern: Extend existing relationship field resolution pipeline for group header names.

---

## 4. Security

### 4.1 Authorization

**Access control pattern:** MUST match existing DataForge data queries - uses `AuthorizationService` for container/archetype permissions, not just org membership.

**Required integration with existing authorization:**
```typescript
// Reference: apps/web/src/server/domain/dataforge/services/DataQueryService.ts
// Use context.security to apply container + archetype permissions

// Pattern to follow:
async function getHierarchy(ctx, input) {
  // 1. Get security context
  const { security } = ctx

  // 2. Query entities via DataQueryService (already has auth built in)
  const entities = await dataQueryService.query({
    entityType: input.entityType,
    security, // Applies container/archetype permissions
  })

  // 3. Query relationships via UnifiedRelationshipService
  const relationships = await unifiedRelationshipService.list(...)

  // 4. Build tree from authorized entities only
  return HierarchyProcessor.buildTree(entities, relationships)
}
```

| Action | Procedure | Permission Check | Scope |
|--------|-----------|------------------|-------|
| Get hierarchy | `orgProcedure` | `context.security` → container + archetype permissions | Entity-level |
| Get children | `orgProcedure` | `context.security` → container + archetype permissions | Entity-level |

**Authorization for Relationship Grouping:**
When grouping by relationships, group headers display related entity names. To prevent unauthorized entity names from leaking:
1. Use `DataQueryService` to fetch related entities (applies auth automatically)
2. For unauthorized entities, show generic label: "(Restricted)" instead of name
3. Follow existing pattern in `apps/web/src/server/orpc/routers/dataforge/data.ts` for relationship field resolution

**Key files for authorization patterns:**
- `apps/web/src/server/domain/dataforge/services/DataQueryService.ts` - How to apply security context
- `apps/web/src/server/middleware/security.ts` - Where `context.security` is populated
- `apps/web/src/server/domain/access-control/AuthorizationService.ts` - Permission checking API

### 4.2 Input Validation

| Input | Risk | Mitigation |
|-------|------|------------|
| `parentId` | Invalid reference | Validate exists in same org |
| `entityType` | Injection | Validate against known archetypes |
| `maxDepth` | DoS (deep recursion) | Hard limit of 10, default 3 |

### 4.3 Audit Trail

No new audit requirements - uses existing entity query logging.

---

## 5. Testing

### 5.1 Unit Tests

| Test File | What It Tests | Key Mocks |
|-----------|---------------|-----------|
| `apps/web/src/systems/vibegrid/processors/__tests__/HierarchyProcessor.test.ts` | Tree building, cycle detection, flattening | None (pure functions) |
| `apps/web/src/systems/vibegrid/stores/__tests__/HierarchyStore.test.ts` | State management, expansion toggle | API client |

### 5.2 Integration Tests

| Test File | What It Tests |
|-----------|---------------|
| `apps/web/src/systems/vibegrid/__tests__/hierarchy-integration.test.ts` | Full hierarchy rendering with mock data |

### 5.3 E2E Tests

| Test File | Acceptance Criteria | Flow |
|-----------|---------------------|------|
| `apps/web/e2e/vibegrid/hierarchy.spec.ts` | AC: self-ref, expand/collapse | Create task with subtasks, verify indentation |
| `apps/web/e2e/vibegrid/master-detail.spec.ts` | AC: nested grid | Expand project, verify tasks grid |

### 5.4 Manual Verification

- [ ] Verify smooth 60fps scrolling with 1000+ hierarchical rows
- [ ] Verify keyboard navigation (arrow keys through hierarchy)
- [ ] Verify tree sidebar scroll sync with grid

### 5.5 Success Criteria Verification Approach

| Criterion | Verification Method | Command/Approach |
|-----------|---------------------|------------------|
| Rows with `parent_id` appear indented | DOM inspection | Check `.vibegrid-row[data-level]` attribute |
| Expand/collapse toggle works | Browser automation | `chrome-devtools click .vibegrid-row-expand` |
| Circular reference handling | Unit test | `HierarchyProcessor.detectCycles()` returns cyclic IDs |
| Relationship grouping resolves names | API + DOM | Query returns name, group header shows it |
| Detail grid lazy-loads | Network tab | XHR only fires on first expand |
| Tree sidebar scrolls grid | Browser automation | Click tree node, verify grid scroll position |

---

## 6. Task Breakdown

### Beads Epic

```bash
bd create --title="GH#394: VibeGrid Hierarchical Data Display" --type=epic --external-ref="gh-394"
```

### Tasks (with dependencies)

```bash
# Phase 1: Core Processing
HIERARCHY_PROC=$(bd create --title="Implement HierarchyProcessor (tree building, cycle detection)" --type=task --priority=2 --silent)

# Phase 2: State Management
HIERARCHY_STORE=$(bd create --title="Implement HierarchyStore (expansion state, tree data)" --type=task --priority=2 --silent)
bd dep add $HIERARCHY_STORE $HIERARCHY_PROC

# Phase 3: Self-Referential Display
SELF_REF=$(bd create --title="Integrate self-referential hierarchy with GroupProcessor" --type=task --priority=2 --silent)
bd dep add $SELF_REF $HIERARCHY_STORE

# Phase 4: Relationship Grouping
REL_GROUP=$(bd create --title="Extend GroupProcessor for relationship grouping" --type=task --priority=2 --silent)
bd dep add $REL_GROUP $HIERARCHY_STORE

# Phase 5: Master-Detail
DETAIL_GRID=$(bd create --title="Implement DetailGridRenderer for nested grids" --type=task --priority=2 --silent)
bd dep add $DETAIL_GRID $SELF_REF

# Phase 6: Tree Sidebar
TREE_SIDEBAR=$(bd create --title="Implement TreeSidebar component" --type=task --priority=2 --silent)
bd dep add $TREE_SIDEBAR $HIERARCHY_STORE

# Phase 7: API Endpoints (if needed for lazy-load)
API=$(bd create --title="Add getHierarchy and getChildren API endpoints" --type=task --priority=3 --silent)

# Test Beads (--labels testing)
TEST_SELF_REF=$(bd create --title="Verify: Rows with parent_id appear indented" --type=task --labels testing --silent)
bd dep add $TEST_SELF_REF $SELF_REF

TEST_EXPAND=$(bd create --title="Verify: Expand/collapse toggle works" --type=task --labels testing --silent)
bd dep add $TEST_EXPAND $SELF_REF

TEST_CYCLE=$(bd create --title="Verify: Circular reference detection" --type=task --labels testing --silent)
bd dep add $TEST_CYCLE $HIERARCHY_PROC

TEST_REL_GROUP=$(bd create --title="Verify: Relationship grouping shows resolved names" --type=task --labels testing --silent)
bd dep add $TEST_REL_GROUP $REL_GROUP

TEST_DETAIL=$(bd create --title="Verify: Detail grid lazy-loads on expand" --type=task --labels testing --silent)
bd dep add $TEST_DETAIL $DETAIL_GRID

TEST_TREE=$(bd create --title="Verify: Tree sidebar scrolls grid to row" --type=task --labels testing --silent)
bd dep add $TEST_TREE $TREE_SIDEBAR
```

### Dependency Graph (Expected)

```
+-------------------+
| HierarchyProcessor|
+--------+----------+
         |
         v
+-------------------+     +------------------+
|  HierarchyStore   |---->|       API        |
+--------+----------+     +------------------+
         |
    +----+----+----+
    |         |    |
    v         v    v
+-------+ +------+ +----------+
|SelfRef| |RelGrp| |TreeSidebar|
+---+---+ +--+---+ +----+-----+
    |        |          |
    v        |          v
+-------+    |     +--------+
|Detail |    |     |TEST:   |
| Grid  |    |     |TreeNav |
+---+---+    |     +--------+
    |        |
+---+--------+-------+
|    TEST BEADS      |
+--------------------+
```

---

## 7. Notes

**Discovered complexity:**
- The existing `GroupProcessor` already supports multi-level hierarchies - we can extend it rather than replace it
- `KnowledgeTreeSection` is highly reusable for the tree sidebar
- `TableCoreStore.entityReferenceData` provides the caching pattern for relationship resolution

**Open questions (using recommended defaults):**
1. ~~Hierarchy source~~ → Using `child_of` relationships via `UnifiedRelationshipService` exclusively (no direct field access)
2. ~~Relationship resolution~~ → Using existing `entityReferenceData` cache
3. ~~Detail grid config~~ → Smart defaults from archetype with override
4. ~~Tree sidebar location~~ → Inside VibeGrid as toggleable panel
5. ~~Max depth~~ → Configurable, default 3

**Risks:**
- Performance with 1000+ hierarchical rows - mitigated by virtual scrolling (existing)
- Deep nesting could impact layout - mitigated by maxDepth limit
- Circular references - mitigated by explicit cycle detection
- Integration with existing services - mitigated by explicit requirements to use `UnifiedRelationshipService`, `KnowledgeHierarchyService`, and `AuthorizationService`

**Implementation Phasing:**
The issue proposes 4 phases which align with our task breakdown:
1. Self-Referential Hierarchy (foundation)
2. Relationship Grouping (GroupProcessor enhancement)
3. Master-Detail (DetailGridRenderer)
4. Tree Sidebar (TreeSidebar component)
