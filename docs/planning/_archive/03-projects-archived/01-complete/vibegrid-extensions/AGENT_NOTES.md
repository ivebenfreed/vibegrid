---
initiative: vibegrid-extensions
type: project
status: complete
owner: platform-engineering
updated: 2025-12-07
phase: complete
---

# Agent Notes: Vibegrid Gantt View

**Purpose**: Living document for AI agents to record implementation discoveries, gotchas, and context.

---

## Agent Checklist

**Before starting work** (READ THIS):
- [ ] Read this entire AGENT_NOTES.md file
- [ ] Review DESIGN.md for interfaces and architecture
- [ ] Review IMPLEMENTATION.md for current phase
- [ ] Study existing Vibegrid code (see Quick Reference below)

**After each session** (UPDATE THIS):
- [ ] Add new discoveries to Implementation Discoveries
- [ ] Document any gotchas encountered
- [ ] Update common errors if you solved new ones
- [ ] Update `updated` date in front matter

---

## Quick Reference

### Key Existing Files

**Stores** (study these patterns):
- `src/systems/vibegrid/stores/TableCoreStore.ts` - Main data store, row management
- `src/systems/vibegrid/stores/EditingStore.ts` - Cell editing state
- `src/systems/vibegrid/stores/VirtualViewportStore.ts` - Visible range tracking

**Renderers** (follow this architecture):
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` - Main renderer orchestrator
- `src/systems/vibegrid/renderers/components/BodyRenderer.ts` - Row/cell rendering
- `src/systems/vibegrid/renderers/components/HeaderRenderer.ts` - Column headers

**Virtualization** (reuse for Gantt):
- `src/systems/vibegrid/virtualization/VirtualScrollManager.ts` - Scroll + visible range

**Overlays** (pattern for bar interactions):
- `src/systems/vibegrid/overlays/SelectionOverlayDOM.ts` - Selection highlight
- `src/systems/vibegrid/overlays/ColumnResizeOverlayDOM.ts` - Resize handles

### Common Commands

```bash
# Run dev server
./scripts/dev/start-dev-server.sh

# Type check
pnpm typecheck

# Run Vibegrid tests
pnpm test -- --grep vibegrid

# Check specific file
pnpm typecheck -- --noEmit src/systems/vibegrid/stores/GanttViewStore.ts
```

### Entry Points

- **Vibegrid main component**: `src/systems/vibegrid/components/VibeGrid.tsx`
- **Store context**: `src/systems/vibegrid/stores/context.tsx`
- **Renderer initialization**: `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`

---

## Architecture Decisions

### Decision: Split Pane with Synced Scroll
**Date**: 2025-12-05
**Context**: How to structure Gantt view relative to table view

**Decision**: Two side-by-side panes sharing vertical scroll
- Left pane: Existing table renderer (subset of columns)
- Right pane: New timeline renderer (bars + headers)
- Cutoff divider: Draggable to resize panes

**Rationale**:
- Reuses 70%+ of existing Vibegrid code
- Row positions automatically stay in sync
- Selection, virtualization, keyboard nav all shared
- Only need to implement timeline-specific rendering

**Validation**: Verify rows align pixel-perfect between panes

---

### Decision: DOM Bars (Not Canvas)
**Date**: 2025-12-05
**Context**: How to render Gantt bars

**Decision**: Use DOM elements for bars, not Canvas

**Rationale**:
- Native drag events (no hit-testing needed)
- Consistent with existing Vibegrid overlay pattern
- CSS for styling (hover, selected states)
- Easier debugging (inspect element)
- Virtualization handles performance for 1000+ rows

**Trade-off**: Slightly more DOM elements than Canvas, but simpler interaction code

---

### Decision: Grouping Disabled in V1
**Date**: 2025-12-05
**Context**: Scope decision for initial implementation

**Decision**: Flat list only, grouping disabled when in Gantt mode

**Rationale**:
- Grouping in Gantt requires summary bars, hierarchy rendering
- Significantly more complex (parent bars spanning children)
- Ship core value first, add complexity later

**Future**: V2 will add hierarchy mode with collapsible parent rows

---

## Implementation Discoveries

### Discovery: containerRef Handling in Split Pane
**Date**: 2025-12-05
**Context**: Integrating SplitPaneContainer into VibeGrid

**Discovery**: The containerRef for the SimplePassiveRenderer needs to be in the DOM when the renderer initializes. With the conditional split pane rendering, the containerRef moves between the split pane's leftPane slot and the direct rendering. The MobX autorun handles this correctly because it waits for columns to be ready, but the ref must be attached before initialization.

**Why It Matters**: If we ever change the conditional rendering logic, ensure the containerRef element exists in the DOM before renderer initialization triggers.

---

### Discovery: View Mode Toggle Placement
**Date**: 2025-12-05
**Context**: Adding view toggle UI to header

**Discovery**: The toggle replaces the static "Table View" text rather than adding alongside it. When enableGantt is false, the original behavior is preserved. This keeps the UI clean and avoids showing controls for disabled features.

**Why It Matters**: Pattern for future feature flags - hide related UI completely when feature is disabled.

---

### Discovery: VirtualRow Wrapper Structure
**Date**: 2025-12-06
**Context**: Implementing bar position calculation in GanttViewStore

**Discovery**: The `processedRows` from TableCoreStore returns VirtualRow objects with `{ type, id, index, height, data }` structure. The actual entity data is in `row.data`, not directly on `row`. When accessing fields like `row.created_at`, you must use `row.data.created_at` or `(row.data || row)[fieldName]` for safety.

**Why It Matters**: Any code reading row field values from processedRows must account for the VirtualRow wrapper. Direct field access like `row[fieldName]` will always be undefined.

---

### Discovery: Database Uses snake_case Field Names
**Date**: 2025-12-06
**Context**: Field mapping for Gantt bars

**Discovery**: Database columns use snake_case (`created_at`, `due_date`, `updated_at`) while TypeScript interfaces may show camelCase. The data coming from TanStack DB collections uses the database field names. Always check the actual database schema:
```bash
./scripts/db/query.sh "SELECT column_name FROM information_schema.columns WHERE table_name = 'org_..._worktask'"
```

**Why It Matters**: Field mapping configuration must match database column names, not TypeScript type definitions.

---

### Discovery: Split Pane Without SplitPaneContainer
**Date**: 2025-12-06
**Context**: Fixing blank left pane issue in Gantt mode

**Discovery**: The SplitPaneContainer wrapper caused issues because the containerRef for SimplePassiveRenderer moved between DOM elements when toggling modes. The fix was to always render the same containerRef element and only change its width style - never conditionally render different container elements. The resizer and timeline pane are rendered alongside the table container, not wrapping it.

**Why It Matters**: DOM element stability is critical for renderers that attach to container refs. Changing the ref target breaks the attachment.

---

### [Template: Discovery Title]
**Date**: YYYY-MM-DD
**Context**: What you were implementing

**Discovery**: What you learned

**Why It Matters**: How this affects future work

---

## Gotchas & Edge Cases

### Gotcha: VirtualScrollManager Scroll Events
**Problem**: Scroll sync between panes can cause infinite loops

**Why**: Each pane's scroll event triggers the other, which triggers back

**Solution**:
```typescript
// Use flag to prevent re-entry
private isSyncing = false

onScroll(event: Event) {
  if (this.isSyncing) return
  this.isSyncing = true
  // Update other pane
  otherPane.scrollTop = this.scrollTop
  requestAnimationFrame(() => {
    this.isSyncing = false
  })
}
```

---

### Gotcha: Row Position Sync
**Problem**: Bars must align exactly with left pane rows

**Why**: Any pixel difference is immediately visible and looks broken

**Solution**:
- Use same `rowPositions` Map from TableCoreStore
- Don't compute bar top independently
- Sync on every row position change (grouping, filtering, etc.)

---

### Gotcha: Date Parsing
**Problem**: Entity date fields may be strings, Dates, or timestamps

**Why**: DataForge stores dates as ISO strings, but computed fields might differ

**Solution**:
```typescript
function parseDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') return new Date(value)
  if (typeof value === 'number') return new Date(value)
  return null
}
```

---

### Gotcha: Dependency Arrow Direction
**Problem**: Arrows rendered backwards (right-to-left instead of left-to-right)

**Why**: In "depends_on" relationships, the semantic direction is OPPOSITE to visual direction:
- **Data**: `sourceEntityId` = successor (task waiting), `targetEntityId` = predecessor (must finish first)
- **Visual**: Arrow should go FROM predecessor TO successor (following time flow)

**Solution**: Swap source/target when drawing arrows:
```typescript
// In DependencyArrowLayer.tsx
// Dependency data: source = successor, target = predecessor
// Arrow visual: source = predecessor, target = successor (SWAP)
const arrowSourceBar = barMap.get(dep.targetEntityId)  // predecessor
const arrowTargetBar = barMap.get(dep.sourceEntityId)  // successor
const path = calculateArrowPath(arrowSourceBar, arrowTargetBar, dep.dependencyType)
```

**Why This Makes Sense**:
- "A depends_on B" = "A cannot start until B finishes"
- Arrow shows workflow: B finishes → A starts
- Arrow direction follows TIME, not semantic relationship

---

## Testing Notes

### Test Patterns
- **Unit tests**: Test GanttViewStore computations in isolation
- **Integration tests**: Mock TableCoreStore, verify bar positions
- **Visual tests**: Use Storybook/similar for timeline rendering

### Known Test Challenges
- Time-dependent tests (today line) - mock Date.now()
- Scroll sync tests - need actual DOM containers
- Drag tests - need mouse event simulation

---

## Performance Observations

### Bar Rendering Performance
**Measurement**: TBD
**Target**: 60fps with 1000 rows
**Strategy**:
- Only render visible bars (virtualization)
- Use CSS transforms (GPU accelerated)
- Batch DOM updates

---

## Dependencies & Integration Points

### Internal Dependencies
- **TableCoreStore**: Row data, positions, selection
- **VirtualScrollManager**: Visible range calculation
- **SelectionService**: Row selection sync
- **DataForge**: Entity updates on bar drag

### External Dependencies
- None (no external Gantt libraries)
- CSS only (no additional packages needed)

---

## Common Errors & Solutions

### Error: "Cannot read property 'top' of undefined"
**Cause**: Trying to position bar for row that's not in rowPositions Map
**Solution**: Check if row has position before rendering bar
```typescript
const rowPos = rowPositions.get(rowId)
if (!rowPos) return null // Skip bar for unknown row
```

---

### Error: MobX strict mode violation
**Cause**: State change outside @action
**Solution**: Wrap all state mutations in @action methods
```typescript
// Bad
this.cutoffWidth = newWidth

// Good
@action setCutoffWidth(width: number) {
  this.cutoffWidth = width
}
```

---

## Future Agent Context

### What Future Agents Should Know
1. This is a V1 implementation - flat list only, no grouping
2. Reuse existing Vibegrid patterns extensively
3. Split pane architecture is key - don't rebuild left pane
4. Bar positions come from TableCoreStore row positions
5. Test scroll sync thoroughly - it's the trickiest part

### Recommended Reading Order
1. Start with: `src/systems/vibegrid/stores/TableCoreStore.ts` (understand data model)
2. Then review: `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` (rendering pattern)
3. Then: `src/systems/vibegrid/virtualization/VirtualScrollManager.ts` (scroll handling)
4. Key design decisions: DESIGN.md sections on Architecture and Flows

### V2 Features (Not in V1)
- [ ] Grouping/hierarchy support
- [ ] Summary bars for parent entities
- [ ] Date inheritance from children
- [ ] Subtask relationships
- [ ] Milestone markers
- [ ] Resource/capacity view

---

## Session Log

### 2025-12-05 - Initial Planning
**Agent**: Claude
**Goal**: Create planning documents for Gantt view
**Outcome**:
- Created DESIGN.md with interfaces and flows
- Created IMPLEMENTATION.md with 4 phases
- Created AGENT_NOTES.md (this file)
**Key Decisions**:
- Split pane architecture (reuse left side)
- DOM bars (not Canvas)
- V1 scope: no grouping, flat list only
**Updated Files**: README.md, DESIGN.md, IMPLEMENTATION.md, AGENT_NOTES.md

---

### 2025-12-05 - Phase 1 Complete
**Agent**: Claude
**Goal**: Implement split pane infrastructure
**Outcome**:
- Created `ViewModeStore.ts` - manages 'table' | 'gantt' mode, cutoff width
- Created `CutoffResizer.tsx` - draggable divider with double-click reset
- Created `SplitPaneContainer.tsx` - two-pane layout with synced vertical scroll
- Updated `context.tsx` - added ViewModeStore to store context
- Updated `VibeGridXHeaderPure.tsx` - added Table/Gantt toggle buttons
- Updated `VibeGrid.tsx` - conditional split pane rendering
**Key Discoveries**:
- Scroll sync implemented with isSyncing flag as documented in Gotchas
- ButtonGroup component provides perfect segmented toggle appearance
- enableGantt prop required on both VibeGrid and Header
**Updated Files**:
- `src/systems/vibegrid/stores/ViewModeStore.ts` (new)
- `src/systems/vibegrid/stores/context.tsx` (modified)
- `src/systems/vibegrid/components/CutoffResizer.tsx` (new)
- `src/systems/vibegrid/components/SplitPaneContainer.tsx` (new)
- `src/systems/vibegrid/components/VibeGridXHeaderPure.tsx` (modified)
- `src/systems/vibegrid/VibeGrid.tsx` (modified)

---

### 2025-12-06 - Phase 2 Complete
**Agent**: Claude (Opus 4.5)
**Goal**: Implement timeline rendering with bars
**Outcome**:
- Created `GanttViewStore.ts` - computes bar positions from row data, time scale management
- Created `GanttTimeline.tsx` - timeline component with TimeScaleHeader, GanttBar, TodayLine
- Updated `context.tsx` - added GanttViewStore to store context, hook, cleanup
- Updated `VibeGrid.tsx` - replaced placeholder with GanttTimeline component
- Created `/debug/gantt` route for testing
- Added Gantt View to Debug sidebar menu
**Key Discoveries**:
- VirtualRow wrapper requires accessing `row.data[field]` not `row[field]`
- Database uses snake_case field names (`created_at`, `due_date`)
- SplitPaneContainer removed - containerRef must stay stable for renderer attachment
- TimeScaleHeader renders week markers (Monday-based) at configurable zoom levels
**Key Bug Fixes**:
- Blank left pane: Fixed by always rendering same containerRef element, only changing width
- No bars rendering: Fixed field mapping to snake_case and VirtualRow data access
**Updated Files**:
- `src/systems/vibegrid/stores/GanttViewStore.ts` (new)
- `src/systems/vibegrid/components/GanttTimeline.tsx` (new)
- `src/systems/vibegrid/stores/context.tsx` (modified)
- `src/systems/vibegrid/VibeGrid.tsx` (modified)
- `src/app/routes/_authenticated/debug/gantt.tsx` (new)
- `src/shared/components/layout/data/sidebar-data.ts` (modified)

---

**Agent Guidelines**:
- Add discoveries immediately when you find them
- Include code examples that are copy-pasteable
- Explain WHY, not just WHAT
- Update timestamps when modifying sections
- Don't duplicate DESIGN.md or IMPLEMENTATION.md content
- Append only (unless consolidating)

### 2025-12-06 - Phase 3 In Progress (Dependency Arrows) - BLOCKED
**Agent**: Claude (Opus 4.5)
**Goal**: Implement dependency arrows between Gantt bars
**Outcome**: PARTIALLY COMPLETE, BLOCKED ON DATA LOADING PATTERN
**What Was Done**:
- Created `DependencyArrowLayer.tsx` - SVG overlay for bezier curve arrows
- Added `GanttDependency` type and `dependencies` observable to `GanttViewStore.ts`
- Added `setDependencies` action to GanttViewStore
- Integrated DependencyArrowLayer into GanttTimeline
- Removed debug red border from SVG
- Created test data: GanttDemo entity with 8 records and 8 dependencies via API
- Updated default field mapping to `start_date`/`end_date`/`name` for project archetype

**CRITICAL BLOCKER - DATA LOADING PATTERN**:
The agent attempted to add dependency loading directly in VibeGrid.tsx using raw `fetch()` calls and React useState/useEffect. This is WRONG and breaks the VibeGrid architecture.

**What NOT to do**:
- DO NOT use raw `fetch()` calls in components
- DO NOT use React useState for data that should be in stores
- DO NOT create custom React hooks that duplicate TanStack DB patterns
- The failed attempt created `useGanttDependencies.ts` hook with useState/useEffect - this caused infinite re-render loops

**What NEEDS research**:
1. How does VibeGrid load entity data? → Uses `useEntityCollection` + `useLiveQuery` from TanStack DB
2. How should dependencies be loaded? → Need to understand if dependencies should be:
   - A TanStack DB collection (like entities)
   - Loaded via the existing entity collection system
   - Part of the entity data itself
3. Where is the data fetched from the API? → TanStack DB collections have sync adapters

**Files Modified (may need rollback)**:
- `src/systems/vibegrid/VibeGrid.tsx` - WAS REVERTED BY git checkout (may have lost other changes)
- `src/systems/vibegrid/hooks/useGanttDependencies.ts` - DELETED (was broken)
- `src/systems/vibegrid/components/DependencyArrowLayer.tsx` - still exists
- `src/systems/vibegrid/stores/GanttViewStore.ts` - has dependency support added
- `src/app/routes/_authenticated/debug/gantt.tsx` - updated for GanttDemo

**Current File State** (needs verification):
- VibeGrid.tsx may have been reverted to pre-Phase-3 state
- DependencyArrowLayer.tsx exists but may not be imported
- GanttViewStore.ts has setDependencies action

**ARCHITECTURE RESEARCH COMPLETED**:

### VibeGrid Data Flow (Correct Pattern)
```
Backend API (/api/orpc/dataforge/...)
    ↓
TanStack DB Collection (singleton per entity+orgId)
    ├─ Created via getOrCreateEntityCollection()
    ├─ queryFn calls orpcClient.dataforge.data.query()
    └─ Cached in registry.ts
    ↓
useVibeGridData Hook
    ├─ Gets collection via useEntityCollection(entityType)
    ├─ Applies filters via useLiveQuery()
    ├─ Client-side sorting
    └─ Returns rows + CRUD functions
    ↓
MobX Stores (TableCoreStore, GanttViewStore)
    ├─ Row positions, bar positions computed
    └─ @observable + @computed for reactivity
    ↓
React Components (observer())
```

### Key Files to Study
- `src/shared/data/db/collections/entity-collections.ts` - How collections fetch data
- `src/shared/data/db/collections/registry.ts` - Singleton caching pattern
- `src/systems/vibegrid/hooks/useVibeGridData.ts` - How filters/sorting applied
- `src/systems/vibegrid/managers/RelationshipDataManager.ts` - Pattern for loading related data

### RelationshipDataManager Pattern (USE THIS FOR DEPENDENCIES)
The RelationshipDataManager shows how to load related entity data:
1. Maintains cache: `Map<cacheKey, { data, expiry }>` (5 min TTL)
2. Deduplicates in-flight requests via `loadingPromises` Map
3. Called from ModularCellBridge.preloadRelationshipData()
4. Fetches from `/api/dataforge/orgs/{orgId}/relationships/{entity}`

### Correct Pattern for Dependencies
**Option A: Create DependencyDataManager (Similar to RelationshipDataManager)**
```typescript
// New file: src/systems/vibegrid/managers/DependencyDataManager.ts
class DependencyDataManager {
  private cache: Map<string, { deps: GanttDependency[], expiry: number }>
  private loadingPromises: Map<string, Promise<GanttDependency[]>>

  async loadDependencies(entityIds: string[]): Promise<GanttDependency[]> {
    // Deduplicate, check cache, fetch from API, return
  }
}
```

**Option B: Add to GanttViewStore with proper async handling**
```typescript
// In GanttViewStore
@observable dependencies: GanttDependency[] = []
@observable dependenciesLoading: boolean = false

@action async loadDependencies(entityIds: string[]) {
  if (this.dependenciesLoading) return
  this.dependenciesLoading = true
  // Fetch and set dependencies
  this.dependenciesLoading = false
}
```

**Option C: Create dependency collection (if needed frequently)**
```typescript
// In src/shared/data/db/collections/
createDependencyCollection(entityType, orgId)
// Pattern: same as entity-collections.ts
```

### RECOMMENDED APPROACH
Use **Option A or B** (DependencyDataManager or in-store loading) because:
- Dependencies are Gantt-specific, not general grid data
- Only needed when Gantt view is active
- Can be cached with short TTL
- Doesn't require new TanStack DB collection plumbing

### Key Gotcha: Don't Use Raw React State
The failed attempt used useState/useEffect which:
- Creates new array references each render → infinite loops
- Doesn't integrate with MobX reactivity
- Bypasses the collection/store architecture

**CORRECT**: Load data → store in MobX @observable → components react via observer()
**WRONG**: Load data → useState → components re-render → re-fetch → loop

**NEXT STEPS FOR IMPLEMENTATION**:
1. Create DependencyDataManager following RelationshipDataManager pattern
2. Or add loadDependencies to GanttViewStore with proper @action
3. Call load when Gantt view mounts (in VibeGrid or GanttTimeline)
4. Use @observable dependencies for reactivity
5. DependencyArrowLayer already reads from GanttViewStore.dependencies

**Test Data Created**:
- Entity type: GanttDemo (project archetype with start_date, end_date, progress_percentage)
- 8 records with timeline dates
- 8 finish_to_start dependencies between records
- Organization: Wide Corp (01920000-1000-7000-8000-000000000001)

---

### 2025-12-06 - Phase 3 UNBLOCKED (Dependencies in Schema API)
**Agent**: Claude (Opus 4.5)
**Goal**: Resolve the Phase 3 blocker by exposing dependencies in schema API
**Outcome**: SUCCESS - Dependencies now flow automatically from schema to GanttViewStore

**Research Findings**:
After analyzing the DataForge dependency vs relationship systems, discovered:
1. Dependencies ARE stored in the same relationship table (`org_xxx_relationships`) with `relationship_type: 'depends_on'`
2. `DependencyProcessor.updateEntitySchemaDependencyMetadata()` automatically syncs ALL dependencies for an entity TYPE to `entity_schemas.business_metadata.dependencies`
3. The schema API was already syncing deps to the backend, but NOT exposing them to frontend

**The Gap**: In `entities.ts` line 288, the schema response only extracted `fields: metadata.allFields || []` but NOT dependencies!

**Solution Implemented (Option A: Expose dependencies in schema API)**:

1. **RecordManager.ts** - Added dependencies to getEntityDetails return:
   ```typescript
   dependencies: metadata.dependencies || null, // Dependencies for Gantt charts
   ```

2. **entities.ts** - Added dependencies to update handler response:
   ```typescript
   dependencies: metadata.dependencies || null,
   ```

3. **dataforge.ts** - Extended EntitySchema type with dependency types:
   ```typescript
   export interface DependencyMetadata {
     supportsDependencies: boolean
     validDependencyTypes: DependencyType[]
     currentDependencies: EntityDependency[]
     dependencyCount: number
     lastUpdated: string
   }

   export interface EntitySchema {
     // ... existing fields
     dependencies?: DependencyMetadata | null
   }
   ```

4. **GanttViewStore.ts** - Added schema-based dependency loading:
   - Added `setSchemaRegistry(registry, entityType)` method
   - Added MobX reaction to load dependencies when schema is ready
   - `loadDependenciesFromSchema()` extracts deps from schema metadata
   - Dependencies automatically converted to `GanttDependency[]` format

5. **context.tsx** - Wired up schema registry to GanttViewStore:
   ```typescript
   ganttViewStore.setSchemaRegistry(schemaRegistry, entityType)
   ```

**Why This Is Better Than Previous Approaches**:
- Dependencies come with schema automatically (no extra API calls)
- Follows existing MobX + TanStack DB patterns
- No useState/useEffect in components
- Reactive via MobX observables
- Dependencies update when schema cache refreshes

**Files Modified**:
- `src/server/domain/dataforge/managers/RecordManager.ts` - Added dependencies to response
- `src/server/orpc/routers/dataforge/entities.ts` - Added dependencies to update handler
- `src/shared/types/dataforge.ts` - Added DependencyMetadata, EntityDependency types
- `src/systems/vibegrid/stores/GanttViewStore.ts` - Added setSchemaRegistry and reaction
- `src/systems/vibegrid/stores/context.tsx` - Wired up schema registry

**Typecheck**: PASSED ✅

**Next Steps**:
1. Verify DependencyArrowLayer is imported in GanttTimeline
2. Test with actual dependency data in browser
3. May need to verify dependency metadata is being synced when deps are created

---

### 2025-12-06 - Phase 3 COMPLETE (Dependency Arrows Rendering)
**Agent**: Claude (Opus 4.5)
**Goal**: Fix dependency arrow rendering to show correct direction
**Outcome**: SUCCESS - Arrows now correctly show finish-to-start flow

**Critical Bug Fixed - Arrow Source/Target Semantics**:
The dependency arrows were rendering BACKWARDS (going right-to-left on timeline instead of left-to-right).

**Root Cause**: In a "depends_on" relationship:
- `sourceEntityId` = the successor (task that WAITS for the dependency)
- `targetEntityId` = the predecessor (task that MUST COMPLETE first)

But for arrow VISUALIZATION, we need to draw FROM predecessor TO successor (left-to-right in time).

**Fix in DependencyArrowLayer.tsx**:
```typescript
// SWAP: arrow source = dep.target (predecessor), arrow target = dep.source (successor)
const arrowSourceBar = barMap.get(dep.targetEntityId)  // predecessor
const arrowTargetBar = barMap.get(dep.sourceEntityId)  // successor
```

**Other Fixes This Session**:
1. Added zoom controls via `GanttToolbar.tsx` (zoom in/out, level selector, Today button)
2. Fixed schema API to expose dependencies at root level (was buried in `businessMetadata.dependencies`)
3. Added debug markers to verify arrow start positions during debugging

**Files Modified**:
- `src/systems/vibegrid/components/DependencyArrowLayer.tsx` - Source/target swap fix
- `src/systems/vibegrid/components/GanttToolbar.tsx` - NEW: Zoom controls
- `src/systems/vibegrid/VibeGrid.tsx` - Integrated GanttToolbar
- `src/server/domain/dataforge/managers/EntitySchemaManager.ts` - Extract dependencies to root level

**Key Learning**:
The semantic direction of "A depends_on B" (A needs B) is the OPPOSITE of the visual arrow direction (B → A). This is a common gotcha - document it clearly in code comments.

---

### Phase 4 Planning: Gantt Bar Interactions

**Features Requested**:
1. **Drag bar to move** - Shift both start and end dates together
2. **Drag left edge** - Change start date only
3. **Drag right edge** - Change end date only
4. **Drag dependency arrow** - Change dependency type (FS/SS/FF/SF)
5. **Shift bars** - Cascade date changes to dependent tasks

**Implementation Approach**:

#### 4.1 Bar Drag Infrastructure
- Add drag handles to `GanttBar` component (left edge, body, right edge)
- Create `GanttDragManager` class for drag state management
- Use pointer events (not mouse events) for better touch support
- Show preview ghost bar during drag
- Snap to time grid based on zoom level (day/week/month)

#### 4.2 Bar Body Drag (Move)
- Drag handler on bar body
- On drag: calculate new start/end keeping duration constant
- On drop: call DataForge update API for both dates
- Visual feedback: show ghost bar at new position

#### 4.3 Edge Drag (Resize)
- Left handle: changes start_date, keeps end_date
- Right handle: changes end_date, keeps start_date
- Minimum bar width based on zoom level
- Prevent start > end validation

#### 4.4 Dependency Node Interactions
- Clickable nodes at bar edges (circle indicators)
- Drag from source node to target node creates new dependency
- Drag existing arrow to change connection type
- Delete via click + confirm or drag to trash
- Show dependency type indicator on arrow (FS/SS/FF/SF)

#### 4.5 Cascade/Shift Mode
- Shift key modifier: when dragging, cascade changes to dependents
- Calculate delta and apply to all downstream tasks
- Visual indicator when shift mode active
- Undo support critical for this feature

**Technical Considerations**:
- All date changes go through DataForge API (single source of truth)
- Optimistic updates for responsiveness, rollback on error
- Debounce API calls during drag (update on drop only)
- Conflict detection if another user changed same entity

**Recommended File Structure**:
```
src/systems/vibegrid/
├── components/
│   ├── GanttBar.tsx              # Add drag handles
│   ├── GanttBarDragPreview.tsx   # Ghost bar during drag
│   └── DependencyNode.tsx        # Clickable/draggable nodes
├── managers/
│   └── GanttDragManager.ts       # Drag state management
└── stores/
    └── GanttViewStore.ts         # Add drag state observables
```

**Estimated Complexity**: HIGH - This is the most complex phase due to:
- Pointer event handling across browsers
- Optimistic update patterns
- Cascade calculation algorithm
- Undo/redo support
- Visual feedback requirements

---

### 2025-12-06 - Phase 4 Bar Drag Interactions (CORE COMPLETE)
**Agent**: Claude (Opus 4.5)
**Goal**: Implement bar drag to move/resize dates
**Outcome**: SUCCESS - Core drag interactions implemented and ready for testing

**What Was Implemented**:

1. **GanttViewStore drag state** (`src/systems/vibegrid/stores/GanttViewStore.ts`):
   - Added `DragState` type with `barId`, `mode`, `originalBar`, `previewBar`, `startX`, `isDragging`
   - Added `DragMode` type: `'move' | 'resize-start' | 'resize-end' | null`
   - Added `setCollection()` method for TanStack DB integration
   - Added `startDrag()`, `updateDrag()`, `endDrag()`, `cancelDrag()` actions
   - `endDrag()` persists changes via `collection.update()` with optimistic updates

2. **GanttBar drag handles** (`src/systems/vibegrid/components/GanttTimeline.tsx`):
   - Left edge handle (8px) → `resize-start` mode (changes start_date)
   - Bar body → `move` mode (shifts both dates by same delta)
   - Right edge handle (8px) → `resize-end` mode (changes end_date)
   - Handles show on hover with `cursor-ew-resize`
   - Body has `cursor-grab` / `cursor-grabbing`
   - Preview bar rendered with dashed border during drag
   - Original bar fades to 40% opacity during drag

3. **GanttTimeline drag coordination**:
   - `handleDragStart` callback passed to bars
   - Global `pointermove`/`pointerup` listeners during drag
   - Escape key cancels drag
   - Cleanup on unmount

4. **VibeGrid.tsx integration**:
   - Added `useEffect` to set TanStack DB collection on GanttViewStore

**Key Design Decisions**:
- Used pointer events (not mouse events) for better touch support
- Drag state in MobX store (not React state) for proper reactivity
- Preview bar shows new position; original bar stays visible but faded
- Date snapping to whole days based on pixelsPerDay
- Validation prevents start >= end (minimum 1 day duration)

**Files Modified**:
- `src/systems/vibegrid/stores/GanttViewStore.ts` - Added drag state and actions
- `src/systems/vibegrid/components/GanttTimeline.tsx` - Added drag handles and event handling
- `src/systems/vibegrid/VibeGrid.tsx` - Wired up collection to GanttViewStore

**Testing Notes**:
- Dev server runs on port 4001 (not 4000 in this worktree)
- Test at `/debug/gantt` with GanttDemo entity type
- Dependencies from Phase 3 should still render

**Remaining Phase 4 Work**:
- [ ] Dependency node interactions (create/delete by dragging)
- [ ] Cascade/shift mode (propagate changes to dependents)
- [ ] Visual polish (bar colors by status, progress fill)
- [ ] Undo/redo support

---

### 2025-12-06 - Gantt Persistence & MobX Fixes
**Agent**: Claude (Opus 4.5)
**Goal**: Add persistence for Gantt zoom level/cutoff width, fix MobX warnings
**Outcome**: SUCCESS

**What Was Implemented**:

1. **Fixed MobX warnings** - Removed `observer()` from components that don't read observables:
   - `CutoffResizer` - only uses props and local state
   - `TimeScaleHeader` - only uses props
   - `GanttBar` - only uses props
   - `TodayLine` - only uses props

2. **Added Gantt persistence to PersistenceStore** (`PersistenceStore.ts`):
   - Added `GanttPreferences` interface: `{ zoomLevel, cutoffWidth, viewMode }`
   - Added `setGanttViewStore()` and `setViewModeStore()` dependency injection
   - Added MobX reaction to watch: `ganttViewStore.zoomLevel`, `viewModeStore.cutoffWidth`, `viewModeStore.mode`
   - Extended `validatePreferences()` to validate Gantt prefs
   - Extended `applyLoadedPreferences()` to restore Gantt settings
   - Extended `saveToStorage()` to include Gantt preferences
   - Only restores `viewMode: 'gantt'` if user was previously in Gantt mode (doesn't force)

3. **Wired up in context.tsx**:
   - `persistenceStore.setGanttViewStore(ganttViewStore)`
   - `persistenceStore.setViewModeStore(viewModeStore)`

**localStorage Key**: `vibegrid-simple-${orgId}_${entityType}`

**Testing Notes**:
- Change zoom level → persisted after 1s debounce
- Resize cutoff divider → persisted after 1s debounce
- Switch to Gantt mode → persisted (restored on next load)
- Dev server on port 4001

**Files Modified**:
- `src/systems/vibegrid/stores/PersistenceStore.ts` - Main persistence logic
- `src/systems/vibegrid/stores/context.tsx` - Wired up stores
- `src/systems/vibegrid/components/CutoffResizer.tsx` - Removed observer()
- `src/systems/vibegrid/components/GanttTimeline.tsx` - Removed observer() from sub-components

---

### 2025-12-06 - Bug Fix: Stuck Preview Bar on Sort
**Agent**: Claude (Opus 4.5)
**Goal**: Fix bug where preview bar gets stuck when row reorders due to date sorting
**Outcome**: SUCCESS

**Bug Description**:
When dragging a bar to change dates, if the table is sorted by date, the row would reorder due to the optimistic update. The preview bar would get stuck at the old position because `cancelDrag()` was called AFTER `collection.update()`.

**Root Cause**:
1. `collection.update()` triggers immediate optimistic update
2. TanStack DB re-sorts rows based on new dates
3. Component re-renders with bars in new positions
4. But `dragState.previewBar` still exists (cancelDrag not called yet)
5. Preview bar renders at stale position

**Fix** (`GanttViewStore.ts` - `endDrag()`):
```typescript
// Capture values before clearing drag state
const newStartDate = previewBar.startDate.toISOString()
const newEndDate = previewBar.endDate.toISOString()

// CRITICAL: Clear drag state BEFORE the update
this.cancelDrag()

// Then persist to database
const tx = this.collection.update(barId, ...)
```

**Key Insight**: Always clear UI state before triggering data mutations that may cause re-renders.

---

### 2025-12-06 - UI Fix: Text Overflow on Narrow Bars
**Agent**: Claude (Opus 4.5)
**Goal**: Show bar labels outside narrow bars instead of hiding them
**Outcome**: SUCCESS

**Problem**: When bars are too narrow (< 80px), the label text was hidden with `truncate`, making it impossible to identify the task.

**Solution** (`GanttTimeline.tsx` - `GanttBar`):
- Added `isNarrowBar = bar.width < 80` check
- For narrow bars: Label positioned outside with `absolute left-full ml-2 text-foreground/80`
- For wide bars: Label stays inside with `text-white text-center`
- Always show label (removed conditional `bar.width > 60` check)
- Added `pointer-events-none` to label so it doesn't block drag

**Visual Result**:
- Wide bars: White text centered inside bar
- Narrow bars: Dark text appears to the right of the bar

**Follow-up fix**: Changed from fixed 80px threshold to dynamic calculation:
```typescript
const estimatedTextWidth = bar.label.length * 7 + 24
const isNarrowBar = bar.width < estimatedTextWidth
```
This ensures text overflows for bars that can't fit their specific label.

---

### 2025-12-06 - Field Mapping Configuration UI
**Agent**: Claude (Opus 4.5)
**Goal**: Add UI to configure start/end date fields for Gantt bars, support date_range field type
**Outcome**: SUCCESS

**What Was Implemented**:

1. **GanttViewStore computed getters** (`GanttViewStore.ts`):
   - `availableDateFields` - Filters columns to date-compatible types (date, datetime, timestamp, date_range)
   - `availableLabelFields` - Filters columns to text-compatible types (text, longtext, name, title)
   - `parseDateRange()` - Parses date_range field values supporting multiple formats:
     - Object: `{ start: Date, end: Date }` or `{ start_date, end_date }`
     - Array: `[startDate, endDate]`
     - String: `"2024-01-01/2024-01-31"` (ISO dates separated by /)
   - `getFieldType()` / `isDateRangeField()` helpers
   - Updated `dateRange` and `barPositions` to handle date_range fields

2. **GanttToolbar field selectors** (`GanttToolbar.tsx`):
   - Added "Fields" button with Settings2 icon
   - Popover with 3 dropdowns:
     - Start Date field selector
     - End Date field selector
     - Bar Label field selector
   - Dropdowns populated from `availableDateFields` and `availableLabelFields`
   - Changes immediately applied via `ganttViewStore.setFieldMapping()`

3. **Persistence integration** (`PersistenceStore.ts`):
   - Extended `GanttPreferences` to include `fieldMapping?: GanttFieldMapping`
   - Updated reaction to watch `ganttViewStore.fieldMapping`
   - Extended validate/apply/save methods to handle field mapping
   - Field mapping persists with other Gantt preferences

**date_range Field Type Support**:
When a date_range field is selected as the start field, both start and end dates are extracted from it. This allows entities with a single date range field (instead of separate start/end) to work with Gantt.

**Files Modified**:
- `src/systems/vibegrid/stores/GanttViewStore.ts` - Added computed getters and date_range parsing
- `src/systems/vibegrid/components/GanttToolbar.tsx` - Added field selector UI
- `src/systems/vibegrid/stores/PersistenceStore.ts` - Added field mapping persistence

**Testing Notes**:
- Open Gantt view, click "Fields" button in toolbar
- Select different date fields → bars reposition
- Field selection persists across page reloads
- date_range fields appear in dropdown but actual usage depends on entity having such fields

---

### 2025-12-06 - Phase 4 Polish: +1 Row Bug Fix
**Agent**: Claude (Opus 4.5)
**Goal**: Fix +1 row issue at bottom of scroll where table doesn't render last row
**Outcome**: PARTIAL SUCCESS - Core bug identified and fixed, separate pre-existing issue discovered

**Bug Fix - Virtual Scroll Observer End Index**:

**Root Cause**: In `SimplePassiveRenderer.ts`, the virtual scroll observer was capping `endRowIndex` at `rowCount - 1` instead of `rowCount`:
```typescript
// BEFORE (buggy)
const endRowIndex = Math.min(
  rowCount - 1,  // ← BUG: Should be rowCount (end is EXCLUSIVE)
  this.tableCoreStore.findRowAtScrollPosition(...) + 1,
)

// AFTER (fixed)
const endRowIndex = Math.min(
  rowCount, // Note: end is EXCLUSIVE, so use rowCount not rowCount-1
  this.tableCoreStore.findRowAtScrollPosition(...) + 1,
)
```

**Why This Was Wrong**: The range `{start, end}` uses `end` as EXCLUSIVE (for use with slice). So when `rowCount = 28`, we need `end = 28` to include row 27 (0-indexed last row). With `rowCount - 1 = 27`, we were excluding the last row.

**File Modified**:
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` line 846

**Typecheck**: PASSED ✅

**SEPARATE ISSUE DISCOVERED - Table Body Not Rendering**:
During testing, discovered that the table body (`.vibegridx-body`) has 0 children on both the Gantt debug page AND regular entity pages. This is a pre-existing bug unrelated to the +1 row fix.

**Symptoms**:
- Table container exists with correct structure
- Header exists but empty
- Body exists but empty (0 children, no height)
- Gantt timeline renders correctly (all 28 bars visible)
- Console shows "28 records" on entity page

**Not Caused By This Fix**: The empty table issue existed before and after the fix. The virtual scroll observer fix only affects INCREMENTAL updates when scrolling, not the initial render path.

**Likely Cause**: The `dataObserverDisposer` reaction in `initFocusedObservers()` may not be triggering the initial render. The guards check:
1. `observersEnabled` (set to true at line 243)
2. `isFullyHydrated` (from initStore)
3. Version change detection

If no version change is detected (initial state), no render triggers. The hydration observer at line 872-884 should handle this, but may have a timing issue.

**Files to Investigate**:
- `SimplePassiveRenderer.ts` lines 872-884 (hydration observer)
- `SimplePassiveRenderer.ts` lines 476-546 (data observer guards)
- `InitializationStore.ts` (isFullyHydrated state)

**Testing Notes**:
- Dev server runs on port 4001
- Table rendering issue affects ALL VibeGrid instances, not just Gantt
- Hot module reload may be causing state corruption - try full server restart

---

### 2025-12-06 - Phase 4 Complete: Table Rendering + Sticky Header
**Agent**: Claude (Opus 4.5)
**Goal**: Fix table body not rendering, fix +1 row issue, make Gantt header sticky
**Outcome**: SUCCESS - All issues resolved

**Bug Fixes Applied**:

1. **+1 Row Fix** (`SimplePassiveRenderer.ts` line 846):
   ```typescript
   // BEFORE (buggy)
   const endRowIndex = Math.min(
     rowCount - 1,  // BUG: Should be rowCount (end is EXCLUSIVE)
     ...
   )

   // AFTER (fixed)
   const endRowIndex = Math.min(
     rowCount, // Note: end is EXCLUSIVE, so use rowCount not rowCount-1
     ...
   )
   ```
   **Why**: The range uses `end` as EXCLUSIVE (for use with slice()). So when `rowCount = 28`, we need `end = 28` to include row 27 (0-indexed last row).

2. **Table Body Empty Bug** (`SimplePassiveRenderer.ts` line 885):
   ```typescript
   // BEFORE (buggy) - No fireImmediately
   reaction(
     () => this.initStore.isFullyHydrated,
     (isHydrated) => { ... },
   )

   // AFTER (fixed)
   reaction(
     () => this.initStore.isFullyHydrated,
     (isHydrated) => { ... },
     { fireImmediately: true },  // CRITICAL: ensures initial render
   )
   ```
   **Why**: The hydration observer only reacted to CHANGES in `isFullyHydrated`. If already hydrated when observer was set up, initial render never fired. Adding `fireImmediately: true` ensures the callback fires once on setup.

3. **Sticky Gantt Header** (`GanttTimeline.tsx` line 107):
   ```typescript
   // BEFORE
   className="relative border-b bg-muted/50 flex-shrink-0"

   // AFTER
   className="relative border-b bg-muted/50 flex-shrink-0 sticky top-0 z-20"
   ```
   **Why**: Simple CSS fix - adding `sticky top-0` makes the header stick to the top of the scroll container during vertical scrolling.

**Files Modified**:
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` (2 fixes)
- `src/systems/vibegrid/components/GanttTimeline.tsx` (sticky header)

**Verification**:
- Table body now renders 14 visible rows (virtual scrolling)
- "Warranty Period Start" row is now visible when scrolled to bottom
- All 28 rows accessible (1120px body height / 40px per row)
- Gantt header stays at top when scrolling vertically
- Typecheck PASSED ✅

**Key Learnings**:
1. MobX reactions with `fireImmediately: true` are essential for initial state
2. EXCLUSIVE end indices are a common source of off-by-one errors
3. `position: sticky` works within `overflow: auto` containers

---

### 2025-12-06 - Phase 4: Dependency Node Interactions
**Agent**: Claude (Opus 4.5)
**Goal**: Implement edge node interactions and dependency creation via drag
**Outcome**: SUCCESS - Full drag-to-create dependency flow implemented

**What Was Done**:

1. **GanttViewStore.ts** - Added dependency drag state management:
   - Added `DependencyEdge` type (`'start' | 'end'`)
   - Added `DependencyDragState` interface tracking source bar, edge, current position, and target
   - Added `@observable dependencyDragState`
   - Added actions: `startDependencyDrag`, `updateDependencyDrag`, `endDependencyDrag`, `cancelDependencyDrag`
   - `endDependencyDrag` calculates dependency type from edges (e.g., end→start = finish_to_start)
   - Creates dependency via API call to `/api/orpc/dataforge/relationships/create`
   - Optimistic update adds to local dependencies array

2. **GanttTimeline.tsx** - Added visual interaction components:
   - Added `NODE_SIZE = 12` constant for dependency drag nodes
   - Updated `GanttBar` component with:
     - Left dependency node (blue circle at start edge)
     - Right dependency node (green circle at end edge)
     - Hover effects showing nodes (opacity-0 → opacity-100 on group-hover)
     - Yellow ring highlight when bar is drop target
   - Added `DependencyDragLine` component for visual feedback during drag:
     - SVG line from source bar edge to current mouse position
     - Dashed blue line when no target, solid green when hovering valid target
     - Arrow markers with directional indication
     - Source indicator circle
   - Added dependency drag handlers:
     - `handleDependencyDragStart` - converts screen to container-relative coordinates
     - `handleDependencyNodeHover/Leave` - tracks drop target
     - useEffect for global pointermove/pointerup/keydown events
   - Updated GanttBar rendering to pass new props:
     - `isDependencyDragTarget` - highlights when hovering during drag
     - `onDependencyDragStart`, `onDependencyNodeHover`, `onDependencyNodeLeave`

**Dependency Type Calculation**:
```typescript
// Source edge + target edge → dependency type
end + start    → finish_to_start (most common)
start + start  → start_to_start
end + end      → finish_to_finish
start + end    → start_to_finish
```

**Visual Feedback**:
- Blue node at bar start (for "start from here")
- Green node at bar end (for "end from here")
- Dashed blue line during drag without target
- Solid green line when hovering valid target bar
- Yellow ring around potential drop target

**API Integration**:
```typescript
// Creates relationship with dependency metadata
fetch('/api/orpc/dataforge/relationships/create', {
  method: 'POST',
  body: JSON.stringify({
    json: {
      sourceEntityType: entityType,
      sourceEntityId: sourceBarId,
      targetEntityType: entityType,
      targetEntityId: targetBarId,
      relationshipType: 'depends_on',
      metadata: { dependencyType },
    },
  }),
})
```

**Files Modified**:
- `src/systems/vibegrid/stores/GanttViewStore.ts` (dependency drag state + actions)
- `src/systems/vibegrid/components/GanttTimeline.tsx` (nodes, drag line, handlers)

**Verification**:
- Typecheck PASSED ✅
- Dev server running on port 4001

**Key Learnings**:
1. Pointer events need coordinate conversion from screen to container-relative
2. Scroll offset must be factored into position calculations
3. Global event listeners for drag require careful cleanup in useEffect
4. `response.json()` returns `unknown` and needs explicit type casting

---

### 2025-12-06 - Phase 4: API Auth Fix for Dependency Creation
**Agent**: Claude (Opus 4.5)
**Goal**: Fix 400 Bad Request error when creating dependencies
**Outcome**: SUCCESS - Fixed by using orpcClient

**Problem**:
Raw `fetch()` call to `/api/orpc/dataforge/relationships/create` returned 400 Bad Request because it was missing:
1. `credentials: 'include'` for cookies (authentication)
2. `X-Organization-Id` header

**Solution**:
1. Added `relationships.create` method to `orpcClient` in `src/shared/data/orpc/client.ts`
2. Updated `GanttViewStore.endDependencyDrag()` to use `orpcClient.dataforge.relationships.create()`

**Code Change in client.ts**:
```typescript
relationships: {
  create: (input: {
    sourceEntityType: string
    sourceEntityId: string
    targetEntityType: string
    targetEntityId: string
    relationshipType: string
    metadata?: Record<string, any>
  }) => {
    const orgId = getOrganizationContext()
    return orpcFetch('/dataforge/relationships/create', input, {
      organizationId: orgId,
    })
  },
},
```

**Code Change in GanttViewStore.ts**:
```typescript
// BEFORE (broken)
const response = await fetch('/api/orpc/dataforge/relationships/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ json: {...} }),
})

// AFTER (working)
const result = await orpcClient.dataforge.relationships.create({
  sourceEntityType: this.entityType,
  sourceEntityId: sourceBarId,
  ...
})
```

**Files Modified**:
- `src/shared/data/orpc/client.ts` (added relationships.create)
- `src/systems/vibegrid/stores/GanttViewStore.ts` (use orpcClient)

**Gotcha for Future Agents**:
NEVER use raw `fetch()` for oRPC calls. Always use `orpcClient` which handles:
- Cookie credentials for auth
- Organization ID header
- Correct URL construction
- Error handling with redirect on 401

---

### 2025-12-06 - Phase 4: MobX runInAction Fix
**Agent**: Claude (Opus 4.5)
**Goal**: Fix MobX strict-mode violation preventing dependency display
**Outcome**: SUCCESS

**Problem**:
New dependencies weren't displaying after creation. Console showed:
```
[MobX] Since strict-mode is enabled, changing (observed) observable values
without using an action is not allowed. Tried to modify: GanttViewStore@42.dependencies
```

**Root Cause**:
The `@action` decorator only covers synchronous code. After an `await`, you're in a new async context and lose the action wrapper.

```typescript
@action
async endDependencyDrag() {
  // ... sync code covered by @action
  const result = await orpcClient...  // await breaks action context
  this.dependencies = [...]  // ERROR: not in action anymore!
}
```

**Solution**:
Import and use `runInAction` for state modifications after await:

```typescript
import { runInAction } from 'mobx'

@action
async endDependencyDrag() {
  const result = await orpcClient...

  runInAction(() => {
    this.dependencies = [...this.dependencies, newDep]
  })
}
```

**Files Modified**:
- `src/systems/vibegrid/stores/GanttViewStore.ts`

**Gotcha for Future Agents**:
In MobX strict mode, ALWAYS use `runInAction()` for state modifications after `await` in async actions. The `@action` decorator does NOT cover code after await points.

---

### 2025-12-06 - Phase 4: Server-Side created_by Fix
**Agent**: Claude (Opus 4.5)
**Goal**: Fix 500 Internal Server Error when creating relationships
**Outcome**: SUCCESS

**Problem**:
API returned 500 error with "Kysely Transaction Error" and "context validation error".

**Root Cause**:
The `org_*_relationships` table has `created_by uuid NOT NULL`, but the router was using `context.user?.id` which TypeScript allows to be undefined.

**Solution**:
Added explicit check for user ID in `relationships.ts`:

```typescript
const createdBy = context.user?.id
if (!createdBy) {
  throw new ORPCError('UNAUTHORIZED', { message: 'User ID required to create relationship' })
}
```

**Note**: The `orgProcedure` extends `protectedProcedure` which guarantees `context.user` exists. The check is defensive - if user ID is missing, it's a bug in the auth middleware that should fail loudly.

**Files Modified**:
- `src/server/orpc/routers/dataforge/relationships.ts`

**Gotcha for Future Agents**:
Don't use fake "system user" UUIDs as fallbacks. If auth is required, throw an error when credentials are missing.

---

### 2025-12-07 - Phase 4: Duplicate Dependency Error Handling
**Agent**: Claude (Opus 4.5)
**Goal**: Debug 500 error when creating dependencies from browser
**Outcome**: SUCCESS - Root cause identified and fixed

**Problem**:
Browser requests to create dependencies returned 500 error, while curl tests worked. Logs showed "Kysely Transaction Error" with no details.

**Root Cause**:
The 500 error was actually a **duplicate key constraint violation** - the dependency already existed in the database. The unique constraint `unique_org_*_relationships_a` prevents duplicate source→target→type combinations.

**Debugging Steps**:
1. Added `console.log` in GanttViewStore to see params (helped verify data was correct)
2. Added `console.error` in relationships router to see actual Kysely error
3. Found: `PostgresError: duplicate key value violates unique constraint`

**Solution**:
Added specific handling for duplicate key errors in `relationships.ts`:

```typescript
if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
  throw new ORPCError('CONFLICT', {
    message: 'This dependency already exists',
  })
}
```

**Files Modified**:
- `src/server/orpc/routers/dataforge/relationships.ts` (better error handling)
- `src/systems/vibegrid/stores/GanttViewStore.ts` (debug logging, can remove later)

**Gotcha for Future Agents**:
When debugging 500 errors with vague "Transaction Error" messages, add `console.error` to the catch block to see the actual database error. The relationships table has a unique constraint on (source_entity_type, source_entity_id, relationship_type, target_entity_type, target_entity_id).

---

### 2025-12-07 - Phase 4: Schema Sync on Dependency Creation
**Agent**: Claude (Opus 4.5)
**Goal**: Fix dependencies not showing after page refresh
**Outcome**: SUCCESS - Schema now syncs when creating dependencies

**Problem**:
Dependencies created via drag-and-drop in the Gantt UI were stored in the database but NOT displayed after page refresh. The schema's `business_metadata.dependencies` was stale.

**Root Cause**:
- DB had 14 dependencies in `org_*_relationships` table
- Schema only showed 7 in `entity_schemas.business_metadata.dependencies.dependencyCount`
- The `relationships.ts` router was creating relationships but not syncing the schema

**Solution**:
Added call to `DependencyProcessor.updateEntitySchemaDependencyMetadata` in the relationships router after creating `depends_on` relationships:

```typescript
// In relationships.ts create handler
if (input.relationshipType === 'depends_on') {
  try {
    const { DependencyProcessor } = await import(
      '@/server/domain/dataforge/processors/DependencyProcessor.js'
    )
    await withRequestKysely(context.honoContext, async (kysely: any) => {
      await DependencyProcessor.updateEntitySchemaDependencyMetadata(
        kysely,
        orgId,
        input.sourceEntityType,
      )
    })
  } catch (syncError) {
    // Log but don't fail - relationship was created successfully
    console.warn('Failed to sync dependency metadata to schema:', syncError)
  }
}
```

**Verification**:
1. Created a new dependency via API call with real entity IDs
2. Checked schema before: `dependencyCount = 7`
3. Checked schema after: `dependencyCount = 14`
4. Dependencies now persist and display on page refresh

**Key Learnings**:
1. The `DependencyProcessor.updateEntitySchemaDependencyMetadata` method syncs ALL current dependencies for an entity type to the schema
2. Only entities with archetypes `project`, `task`, or `activity` support dependencies
3. The sync is wrapped in try/catch to prevent relationship creation from failing if sync fails

**Files Modified**:
- `src/server/orpc/routers/dataforge/relationships.ts` (added schema sync after depends_on creation)

**Gotcha for Future Agents**:
When creating dependencies via the relationships router (not the DependencyManager), you MUST manually trigger schema sync. The DependencyManager has its own sync logic, but direct relationship creation does not.

---

### 2025-12-07 - Phase 4: Transaction Fix for Schema Sync
**Agent**: Claude (Opus 4.5)
**Goal**: Wrap relationship insert and schema sync in same transaction
**Outcome**: SUCCESS

**Problem**:
The initial schema sync fix used two separate `withRequestKysely` calls - if the schema sync failed, the relationship was already committed. This could leave the database in an inconsistent state.

**Solution**:
Wrapped both operations in a single Kysely transaction:

```typescript
const relationshipId = await withRequestKysely(context.honoContext, async (kysely: any) => {
  return await kysely.transaction().execute(async (trx: any) => {
    // Insert relationship using trx
    const result = await trx.insertInto(tableName)...

    // Sync schema using same trx
    if (input.relationshipType === 'depends_on') {
      await DependencyProcessor.updateEntitySchemaDependencyMetadata(trx, orgId, entityType)
    }

    return relId
  })
})
```

**Files Modified**:
- `src/server/orpc/routers/dataforge/relationships.ts`

**Key Learning**:
Always use transactions when multiple database operations must succeed or fail together. This follows the same pattern used in `SchemaManager.ts` for field updates.

---

### 2025-12-07 - Phase 4: Fix Dependency Creation Direction
**Agent**: Claude (Opus 4.5)
**Goal**: Fix reversed dependency direction when creating via drag
**Outcome**: SUCCESS

**Problem**:
When dragging from bar A's end node to bar B's start node, the dependency was being created as "A depends_on B" instead of "B depends_on A". This is the same semantic issue we fixed for arrow rendering, but now for creation.

**Root Cause**:
The code was using:
- `sourceEntityId: sourceBarId` (A - bar dragged FROM)
- `targetEntityId: targetBarId` (B - bar dragged TO)

But in our data model, "source depends_on target" means source WAITS for target. So dragging A→B should create "B depends_on A".

**Solution**:
Swapped source and target when creating the relationship:

```typescript
// When user drags from bar A's end to bar B's start, they mean "B depends on A"
// (B cannot start until A finishes). So we SWAP:
const successorId = targetBarId   // The bar that will WAIT (dragged TO)
const predecessorId = sourceBarId // The bar that must finish first (dragged FROM)

await orpcClient.dataforge.relationships.create({
  sourceEntityId: successorId,    // Successor = source (the one that waits)
  targetEntityId: predecessorId,  // Predecessor = target (must complete first)
  ...
})
```

**Files Modified**:
- `src/systems/vibegrid/stores/GanttViewStore.ts`

**Key Learning**:
The dependency semantic is: "source depends_on target" = "source waits for target". This is the OPPOSITE of the visual drag direction. Both arrow rendering AND dependency creation must swap source/target.

---

**Template Version**: 1.0
