---
issue: 415
type: feature
title: VibeGrid Component Testing Framework with Mock Data
status: ready-for-review
created: 2025-12-28
updated: 2025-12-28
template: frontend-only
codex_review: pending
---

# Feature Planning: VibeGrid Component Testing Framework with Mock Data

> GitHub Issue: [#415](https://github.com/baseplane-ai/baseplane/issues/415)

---

## Research Context

### Related Research

| Research Issue | Title | How It Informs This Feature |
|----------------|-------|----------------------------|
| #414 | Research: Component Testing Framework for VibeGrid | TanStack DB mock patterns, data-testid audit, debug route architecture |

### Key Findings Applied

1. **Finding:** TanStack DB collections are trivially mockable by replacing `queryFn`
   **Impact on spec:** Mock collections follow existing factory pattern in `entity-collections.ts`

2. **Finding:** Only 2 elements currently have `data-testid` (cells, grid container)
   **Impact on spec:** Comprehensive data-testid audit needed across all interactive elements

3. **Finding:** Existing debug routes use `VibeGridStoreProvider` with entity types
   **Impact on spec:** Mock routes follow same pattern but inject mock collections

### Unresolved Questions from Research

| Question | How Addressed in Spec |
|----------|----------------------|
| Session vs localStorage persistence | User chose localStorage with easy reset button |
| Single vs multiple debug routes | User chose multiple specialized routes |
| How to integrate controls | User wants controls integrated with existing UI patterns |

---

## 0. Feature Context

**GitHub Issue:** #415

**Acceptance Criteria:**
- [ ] Debug routes work without DataForge/entity API calls (auth/session still uses DB normally)
- [ ] Can add/remove/modify rows via UI controls
- [ ] Can switch between test scenarios
- [ ] All interactive elements have `data-testid` attributes
- [ ] Mock data supports: basic, hierarchy, gantt with dependencies

**Clarification:** "Without database connection" refers to grid data operations only. Auth/session/org context continue to use normal Better Auth patterns. The goal is to test VibeGrid UI interactions with mock data, not to bypass authentication.

**Related Features:**
- Existing debug routes: `apps/web/src/app/routes/_authenticated/debug/vibegrid.tsx`
- Existing debug routes: `apps/web/src/app/routes/_authenticated/debug/gantt.tsx`
- TanStack DB collections: `apps/web/src/shared/data/db/collections/`

**Existing API Endpoints Used:**
| Endpoint | Purpose | Response Type |
|----------|---------|---------------|
| N/A - Mock data | This feature bypasses API entirely | Static/generated data |

---

## 0.5 BASELINE VERIFICATION (BLOCKING)

> **CRITICAL:** Before ANY implementation, manually verify existing debug routes work.

### Pre-Implementation Checks

| Check | How to Verify | Expected Result | Status |
|-------|---------------|-----------------|--------|
| `/debug/vibegrid` loads | Navigate to route, wait for grid | Grid displays with WorkTask data | [ ] |
| `/debug/gantt` loads | Navigate to route, toggle Gantt view | Gantt bars and dependencies render | [ ] |
| VibeGrid interactions work | Click cells, select rows, resize columns | All interactions respond | [ ] |
| No console errors | Open DevTools Console | No errors on load | [ ] |

**If ANY check fails:** STOP → File bug → Fix baseline first

---

## 1. Backend / API

**N/A** - This is a frontend-only feature using mock data, no API changes.

---

## 2. Frontend / UI

### 2.1 Similar Feature Analysis

**Most similar existing feature:**
Path: `apps/web/src/app/routes/_authenticated/debug/vibegrid.tsx`
Why similar: Existing debug route with VibeGrid, we extend this pattern for mock data

**Component patterns to follow:**
- Debug page layout: `apps/web/src/app/routes/_authenticated/debug/vibegrid.tsx` (lines 1-150)
- Collection factory: `apps/web/src/shared/data/db/collections/entity-collections.ts` (lines 68-154)
- Data hook: `apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts` (lines 210-255)

### 2.2 New Files

| File Path | Purpose | Based On |
|-----------|---------|----------|
| **Infrastructure Changes (modify existing):** | | |
| `apps/web/src/systems/vibegrid/stores/context.tsx` | Add `schemaRegistryOverride` prop | Existing file |
| `apps/web/src/systems/vibegrid/VibeGrid.tsx` | Add `mockCollections` prop | Existing file |
| `apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts` | Add `collectionOverride` parameter | Existing file |
| `apps/web/src/systems/vibegrid/hooks/useVibeGridHierarchy.ts` | Add `mockRelationships` option | Existing file |
| **New Files:** | | |
| `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/` | Test routes directory | Existing debug/ structure |
| `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/index.tsx` | Route index/redirect | - |
| `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/basic.tsx` | Basic grid testing | `debug/vibegrid.tsx` |
| `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/gantt.tsx` | Gantt mode testing | `debug/gantt.tsx` |
| `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/grouping.tsx` | Grouping/hierarchy testing | `debug/vibegrid.tsx` |
| `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/drag-drop.tsx` | Drag interactions testing | `debug/vibegrid.tsx` |
| `apps/web/src/shared/data/mock/mock-schema-registry.ts` | Mock schema registry with full interface | `SchemaRegistryStore` |
| `apps/web/src/shared/data/db/collections/mock-collections.ts` | Mock collection factory | `entity-collections.ts` |
| `apps/web/src/shared/data/mock/generators.ts` | Faker-based data generators | `DependencyRecord` interface |
| `apps/web/src/shared/data/mock/scenarios.ts` | Pre-built test scenarios | - |
| `apps/web/src/systems/vibegrid/components/MockDataControls.tsx` | Data controls UI | Existing toolbar patterns |

### 2.3 Infrastructure Changes for Mock Mode (CRITICAL)

**Problem:** Multiple VibeGrid components hard-wire API-backed data sources:
1. `VibeGridStoreProvider` (context.tsx:82) uses `useSchemaRegistry()` → triggers DataForge API
2. `VibeGrid.tsx:196` uses `useDependencyCollection()` → triggers relationships API
3. `VibeGrid.tsx:193` uses `membersCollection` → triggers members API
4. `useVibeGridData.ts` uses `useEntityCollection()` → triggers entity data API

**Solution:** Add override props to VibeGrid infrastructure.

#### 2.3.1 Modify `VibeGridStoreProvider` (context.tsx)

**File to modify:** `apps/web/src/systems/vibegrid/stores/context.tsx`

```typescript
// ADD: Optional schemaRegistry override prop
export interface VibeGridStoreProviderProps {
  children: React.ReactNode
  entityType: string
  orgId?: string
  tableId?: string
  schemaRegistryOverride?: SchemaRegistryStore  // NEW: Mock mode
}

// In provider implementation:
const schemaRegistry = schemaRegistryOverride ?? useSchemaRegistry()
```

#### 2.3.2 Modify `VibeGrid.tsx` to Accept Mock Collections

**File to modify:** `apps/web/src/systems/vibegrid/VibeGrid.tsx`

```typescript
// ADD: Optional collection overrides
export interface VibeGridProps {
  // ... existing props ...
  mockCollections?: {
    entityCollection?: Collection<any>
    dependencyCollection?: Collection<any>
    membersCollection?: Collection<any>
  }
}

// In component:
const entityCollection = mockCollections?.entityCollection ?? useEntityCollection(entityType)
const dependencyCollection = mockCollections?.dependencyCollection ?? useDependencyCollection(...)
const { members } = mockCollections?.membersCollection
  ? useLiveQuery((q) => q.from({ members: mockCollections.membersCollection }))
  : useLiveQuery((q) => q.from({ members: membersCollection }))
```

#### 2.3.3 Mock Schema Registry Implementation

**File:** `apps/web/src/shared/data/mock/mock-schema-registry.ts`

```typescript
import { makeAutoObservable } from 'mobx'
import type { SchemaRegistryStore } from '@/app/stores/domain/SchemaRegistryStore'

// Must implement full interface used by TableCoreStore and GanttViewStore
export class MockSchemaRegistry {
  // Required by column-generation.ts:151
  isBootstrapping = false

  // Required by GanttViewStore.ts:304
  schemas = {
    byName: {
      'MockTask': {
        name: 'MockTask',
        columns: [...],  // Full column definitions
        // Required by GanttViewStore.ts:320 for dependency loading
        dependencies: {
          enabled: true,
          supportedTypes: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish']
        }
      }
    },
    all: [...],
    nav: [...]
  }

  // Required by context.tsx reaction
  get isReady() { return true }

  constructor() {
    makeAutoObservable(this)
  }
}
```

**Key requirements from Codex review:**
- `schemas.byName[entityType].dependencies` - required for Gantt mode
- `isBootstrapping` - checked by column-generation.ts
- `isReady` - checked by GanttViewStore reaction

#### 2.3.4 Modify `useVibeGridData` Hook

**File to modify:** `apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts`

```typescript
// ADD: Optional collection override parameter
export function useVibeGridData(
  entityType: string,
  tableCoreStore: TableCoreStore,
  visualStateStore: VisualStateStore,
  initStore: InitStore,
  collectionOverride?: Collection<any>  // NEW: For mock mode
) {
  // Use override if provided, otherwise fetch from registry
  const collection = collectionOverride ?? useEntityCollection(entityType)
  // ... rest of hook unchanged
}
```

#### 2.3.5 Modify `useVibeGridHierarchy` Hook

**File to modify:** `apps/web/src/systems/vibegrid/hooks/useVibeGridHierarchy.ts`

```typescript
// ADD: Optional relationships provider
interface UseVibeGridHierarchyOptions {
  hierarchyStore: HierarchyStore
  tableCoreStore: TableCoreStore
  entityType: string
  mockRelationships?: HierarchyRelationship[]  // NEW: Skip oRPC in mock mode
}

export function useVibeGridHierarchy(options: UseVibeGridHierarchyOptions) {
  const { mockRelationships } = options

  // If mock data provided, use it instead of API call
  if (mockRelationships) {
    hierarchyStore.setData(entities, mockRelationships)
    return
  }

  // Otherwise, fetch from oRPC (existing behavior)
  const response = await orpcClient.unifiedRelationships.list(...)
}
```

#### 2.3.6 Feature Flag for Production Safety

**Use existing FeatureFlagStore pattern:**

```typescript
// Route file: apps/web/src/app/routes/_authenticated/debug/vibegrid-test/basic.tsx

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/debug/vibegrid-test/basic')({
  beforeLoad: async ({ context }) => {
    // Use TanStack Router beforeLoad + redirect pattern (per tanstack-router.md rules)
    // Gate behind DEV mode or explicit feature flag
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
  component: MockVibeGridBasic,
})
```

**Note:** Debug routes are development-only by default. For staging access, use `FeatureFlagStore.isEnabled('mock_debug_routes')` check in beforeLoad.

### 2.4 Mock Collection Infrastructure

**Mock Collection Factory:** `apps/web/src/shared/data/db/collections/mock-collections.ts`

Pattern based on `entity-collections.ts`:
```typescript
// Key difference: queryFn returns mock data, mutations are in-memory
export function createMockCollection(initialData: MockEntity[]) {
  const data = new Map<string, MockEntity>()
  initialData.forEach(item => data.set(item.id, item))

  return createCollection(queryCollectionOptions({
    id: `mock-${Date.now()}`,
    queryKey: ['mock', Date.now()],
    queryFn: async () => Array.from(data.values()),
    getKey: (record) => record.id,
    queryClient,
    onInsert: async ({ value }) => {
      data.set(value.id, value)
      return value
    },
    onUpdate: async ({ key, value }) => {
      data.set(key, { ...data.get(key), ...value })
      return data.get(key)
    },
    onDelete: async ({ key }) => {
      data.delete(key)
    },
  }))
}
```

**localStorage Persistence:**
- Save to `localStorage.setItem('vibegrid-mock-data', JSON.stringify(data))`
- Load on init: `localStorage.getItem('vibegrid-mock-data')`
- Reset button clears localStorage and reloads default scenario

### 2.5 Mock Data Generators

**Generator File:** `apps/web/src/shared/data/mock/generators.ts`

```typescript
import { faker } from '@faker-js/faker'

export interface MockTask {
  id: string
  title: string
  status: 'open' | 'in_progress' | 'done'
  assigned_to: string | null
  start_date: string | null
  end_date: string | null
  progress: number
  parent_id: string | null  // For hierarchy
}

// MUST match DependencyRecord from dependency-collection.ts
export interface MockDependency {
  id: string
  sourceEntityType: string      // 'MockTask'
  sourceEntityId: string        // predecessor task ID
  targetEntityType: string      // 'MockTask'
  targetEntityId: string        // successor task ID
  relationshipType: 'depends_on'
  dependencyType: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
  metadata?: Record<string, any>
  createdAt: string
}

export function generateMockTasks(count: number, options?: {
  withHierarchy?: boolean
  hierarchyDepth?: number
}): MockTask[]

// Returns dependencies matching DependencyRecord shape for GanttViewStore compatibility
export function generateMockDependencies(tasks: MockTask[], density: number): MockDependency[]
```

**Key integration:** The `GanttViewStore.setSchemaRegistry()` (context.tsx:160) loads dependencies via `useDependencyCollection()`. Mock routes must provide a mock dependency collection with the same shape.

**Scenario File:** `apps/web/src/shared/data/mock/scenarios.ts`

| Scenario | Description | Row Count | Features |
|----------|-------------|-----------|----------|
| `empty` | No data | 0 | Test empty states |
| `small` | Few rows | 10 | Quick interaction testing |
| `medium` | Moderate data | 50 | Typical usage |
| `large` | Stress test | 500 | Performance testing |
| `hierarchy-2` | 2-level hierarchy | 30 | Parent/child relationships |
| `hierarchy-3` | 3-level hierarchy | 50 | Deep nesting |
| `gantt-simple` | Basic Gantt | 20 | Dates, no dependencies |
| `gantt-deps` | Gantt with dependencies | 30 | FS/SS/FF/SF dependencies |
| `gantt-critical` | Critical path scenario | 25 | Designed to show critical path |

### 2.6 Data Controls UI

**Component:** `apps/web/src/systems/vibegrid/components/MockDataControls.tsx`

Integrated as toolbar section (following existing patterns in debug routes):

```typescript
interface MockDataControlsProps {
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onClear: () => void
  onLoadScenario: (scenario: ScenarioName) => void
  onReset: () => void  // Clears localStorage, reloads default
  currentScenario: ScenarioName
  rowCount: number
}
```

**UI Elements:**
- Scenario dropdown (Select component from existing UI library)
- Row count display
- "+ Add Row" button
- "Clear All" button
- "Reset" button (clears localStorage)
- Custom row count input + "Generate" button

### 2.7 Debug Route Structure

**Routes to create:**

| Route | File | Features |
|-------|------|----------|
| `/debug/vibegrid-test` | `index.tsx` | Redirect to `/basic` |
| `/debug/vibegrid-test/basic` | `basic.tsx` | Basic grid, selection, editing |
| `/debug/vibegrid-test/gantt` | `gantt.tsx` | Gantt view, dependencies, critical path |
| `/debug/vibegrid-test/grouping` | `grouping.tsx` | Grouping, hierarchy, expand/collapse |
| `/debug/vibegrid-test/drag-drop` | `drag-drop.tsx` | Row reordering, fill handle |

**Each route includes:**
- MockDataControls toolbar
- VibeGridStoreProvider with mock collection
- Feature-specific configuration (enableGantt, enableGrouping, etc.)

### 2.8 Comprehensive data-testid Additions

**Audit and add `data-testid` to ALL interactive elements:**

#### BodyRenderer.ts (`apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts`)

| Element | data-testid Pattern | Location |
|---------|---------------------|----------|
| Row container | `row-{rowId}` | Line ~260 (row rendering) |
| Row checkbox | `row-checkbox-{rowId}` | `createSelectionCheckbox()` method |
| Drag handle | `drag-handle-{rowId}` | Drag handle element creation |
| Group header row | `group-header-{groupId}` | Line ~465 (group rendering) |
| Group expand button | `group-expand-{groupId}` | Line ~495 |
| Hierarchy toggle | `hierarchy-toggle-{rowId}` | Line ~526 |

#### HeaderRenderer.ts (`apps/web/src/systems/vibegrid/renderers/components/HeaderRenderer.ts`)

| Element | data-testid Pattern | Location |
|---------|---------------------|----------|
| Column header | `column-header-{columnId}` | `render()` method |
| Select all checkbox | `select-all-checkbox` | Line ~56 |
| Sort indicator | `sort-indicator-{columnId}` | Sort icon element |

#### DOMElementFactory.ts (`apps/web/src/systems/vibegrid/renderers/factories/DOMElementFactory.ts`)

| Element | data-testid Pattern | Location |
|---------|---------------------|----------|
| Resize handle | `resize-handle-{columnId}` | Header cell creation |
| Group expand icon | `group-expand-icon-{groupId}` | `createGroupHeaderElement()` |

#### GanttBar.tsx (`apps/web/src/systems/vibegrid/components/GanttBar.tsx`)

| Element | data-testid Pattern | Location |
|---------|---------------------|----------|
| Gantt bar | `gantt-bar-{rowId}` | Main bar element |
| Left resize handle | `gantt-resize-start-{rowId}` | Left handle |
| Right resize handle | `gantt-resize-end-{rowId}` | Right handle |
| Progress bar | `gantt-progress-{rowId}` | Progress indicator |
| Dependency node (start) | `gantt-dep-node-start-{rowId}` | Connection point |
| Dependency node (end) | `gantt-dep-node-end-{rowId}` | Connection point |

#### DependencyArrowLayer.tsx (`apps/web/src/systems/vibegrid/components/DependencyArrowLayer.tsx`)

| Element | data-testid Pattern | Location |
|---------|---------------------|----------|
| Dependency arrow | `dependency-arrow-{depId}` | SVG path element |
| Arrow hit area | `dependency-hitarea-{depId}` | Clickable area |

#### FillHandleLayerDOM.ts (`apps/web/src/systems/vibegrid/overlays/FillHandleLayerDOM.ts`)

| Element | data-testid Pattern | Location |
|---------|---------------------|----------|
| Fill handle | `fill-handle` | Line ~64 |
| Fill preview container | `fill-preview` | Line ~76 |

#### ContextMenu.tsx (`apps/web/src/systems/vibegrid/components/ContextMenu.tsx`)

| Element | data-testid Pattern | Location |
|---------|---------------------|----------|
| Context menu container | `context-menu` | Portal container |
| Menu item | `context-menu-item-{action}` | Each menu option |

#### Additional Elements to Discover

During implementation, audit for ANY additional interactive elements:
- Toolbar buttons
- Filter controls
- View mode toggles
- Pagination controls
- Status indicators
- Any clickable/draggable element

**Pattern:** `{component}-{element}-{identifier}`

---

## 3. Database / DataForge

**N/A** - Using mock data, no database changes.

---

## 4. Security

**Authentication & Authorization:** Mock debug routes remain under `_authenticated` layout. Normal Better Auth session and org context are used. Only DataForge entity data is mocked.

**Production Gating:**
- Routes use `beforeLoad` + `throw redirect` pattern per TanStack Router conventions
- Default: DEV-only (`import.meta.env.DEV` check)
- Staging access: Use feature flag pattern per `.claude/rules/feature-flags.md`:
  ```typescript
  // In route beforeLoad:
  const featureFlagsStore = context.preload?.featureFlagsStore
  const enabled = featureFlagsStore?.isEnabled?.('mock_debug_routes') ?? false
  if (!import.meta.env.DEV && !enabled) {
    throw redirect({ to: '/' })
  }
  ```

**No Bypass of Auth/Org:** Auth and org context resolution continue normally. The "mock" aspect only affects VibeGrid data (entities, dependencies, schemas), not session/permission checks.

---

## 5. Testing & Verification Gates

### 5.1 Per-Phase Verification Gates

**Phase 0 Verification (Baseline):**
| Check | How to Verify | Status |
|-------|---------------|--------|
| `/debug/vibegrid` loads | Navigate, see grid | [ ] |
| `/debug/gantt` loads | Navigate, toggle Gantt | [ ] |
| No console errors | DevTools Console | [ ] |

**Phase 0.5 Verification (Infrastructure Changes):**
| Check | How to Verify | Status |
|-------|---------------|--------|
| TypeScript compiles | `pnpm typecheck` passes | [ ] |
| Existing routes still work | `/debug/vibegrid` still loads | [ ] |
| New props are optional | No breaking changes to existing usages | [ ] |
| Tests pass | `pnpm test` passes | [ ] |

**Phase 1 Verification (Mock Infrastructure):**
| Check | How to Verify | Status |
|-------|---------------|--------|
| Mock collection creates | Console.log collection instance | [ ] |
| Mock data generates | Call `generateMockTasks(10)`, verify output | [ ] |
| localStorage saves/loads | Add data, refresh, verify persists | [ ] |
| Reset clears data | Click reset, verify localStorage cleared | [ ] |

**Phase 2 Verification (Debug Routes):**
| Check | How to Verify | Status |
|-------|---------------|--------|
| `/debug/vibegrid-test/basic` loads | Navigate, see mock grid | [ ] |
| Add row works | Click add, see new row | [ ] |
| Scenario switch works | Select scenario, see data change | [ ] |
| No API calls made | Network tab shows no dataforge calls | [ ] |

**Phase 3 Verification (data-testid):**
| Check | How to Verify | Status |
|-------|---------------|--------|
| Row checkbox has testid | Inspect element | [ ] |
| Gantt bar has testid | Inspect element | [ ] |
| All interactive elements have testid | Full audit | [ ] |

**Phase 4 Verification (All Routes):**
| Check | How to Verify | Status |
|-------|---------------|--------|
| Gantt route works | Test dependencies, critical path | [ ] |
| Grouping route works | Test expand/collapse | [ ] |
| Drag-drop route works | Test row reordering | [ ] |

### 5.2 E2E Test Scenarios

| Test File | What It Tests | Key Assertions |
|-----------|---------------|----------------|
| `e2e/vibegrid-test/mock-data.spec.ts` | Mock data controls | Add/remove rows, scenario switching |
| `e2e/vibegrid-test/interactions.spec.ts` | Grid interactions with testids | Click via testid, verify state |
| `e2e/vibegrid-test/gantt.spec.ts` | Gantt interactions | Bar drag, dependency creation |

### 5.3 Final Manual Verification

- [ ] All debug routes load without database
- [ ] Mock data persists across refresh
- [ ] Reset button clears all data
- [ ] All interactive elements have data-testid
- [ ] No production API calls from test routes
- [ ] Demo to user before declaring complete

---

## 6. Task Breakdown (Verification-Gated)

### Beads Epic

```bash
EPIC=$(bd create --title="GH#415: VibeGrid Component Testing Framework" --type=epic --external-ref="gh-415" --silent)
echo "Created epic: $EPIC"
```

### Tasks (with verification gates)

```bash
# ============================================
# PHASE 0: BASELINE VERIFICATION (FIRST!)
# ============================================
BASELINE=$(bd create --title="GH#415: VERIFY baseline debug routes work" --type=task --priority=0 --labels=testing --silent)
# Steps: Navigate to /debug/vibegrid and /debug/gantt, verify they load and work

# ============================================
# PHASE 0.5: INFRASTRUCTURE CHANGES (CRITICAL)
# ============================================
# These enable mock mode by adding override props to existing VibeGrid components

INFRA_PROVIDER=$(bd create --title="GH#415: Add schemaRegistryOverride prop to VibeGridStoreProvider" --type=task --priority=0 --silent)
bd dep add $INFRA_PROVIDER $BASELINE
# Modify: apps/web/src/systems/vibegrid/stores/context.tsx

INFRA_GRID=$(bd create --title="GH#415: Add mockCollections prop to VibeGrid.tsx" --type=task --priority=0 --silent)
bd dep add $INFRA_GRID $BASELINE
# Modify: apps/web/src/systems/vibegrid/VibeGrid.tsx - add optional overrides for entity, dependency, members collections

INFRA_DATA_HOOK=$(bd create --title="GH#415: Add collectionOverride to useVibeGridData hook" --type=task --priority=0 --silent)
bd dep add $INFRA_DATA_HOOK $BASELINE
# Modify: apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts

INFRA_HIER_HOOK=$(bd create --title="GH#415: Add mockRelationships to useVibeGridHierarchy hook" --type=task --priority=0 --silent)
bd dep add $INFRA_HIER_HOOK $BASELINE
# Modify: apps/web/src/systems/vibegrid/hooks/useVibeGridHierarchy.ts

# Phase 0.5 Verification
VERIFY_INFRA=$(bd create --title="GH#415: VERIFY infrastructure changes don't break existing grids" --type=task --labels=testing --silent)
bd dep add $VERIFY_INFRA $INFRA_PROVIDER
bd dep add $VERIFY_INFRA $INFRA_GRID
bd dep add $VERIFY_INFRA $INFRA_DATA_HOOK
bd dep add $VERIFY_INFRA $INFRA_HIER_HOOK
# Steps: Run typecheck, test existing /debug/vibegrid still works

# ============================================
# PHASE 1: MOCK INFRASTRUCTURE
# ============================================
MOCK_SCHEMA=$(bd create --title="GH#415: Create MockSchemaRegistry with full interface" --type=task --priority=1 --silent)
bd dep add $MOCK_SCHEMA $VERIFY_INFRA
# Must include: schemas.byName[entityType].dependencies, isBootstrapping, isReady

MOCK_COLL=$(bd create --title="GH#415: Create mock collection factory" --type=task --priority=1 --silent)
bd dep add $MOCK_COLL $VERIFY_INFRA

GENERATORS=$(bd create --title="GH#415: Create mock data generators with faker" --type=task --priority=1 --silent)
bd dep add $GENERATORS $VERIFY_INFRA

SCENARIOS=$(bd create --title="GH#415: Create pre-built test scenarios" --type=task --priority=2 --silent)
bd dep add $SCENARIOS $GENERATORS

LOCALSTORAGE=$(bd create --title="GH#415: Add localStorage persistence with reset" --type=task --priority=2 --silent)
bd dep add $LOCALSTORAGE $MOCK_COLL

# Phase 1 Verification
VERIFY_1=$(bd create --title="GH#415: VERIFY Phase 1 - mock infrastructure works" --type=task --labels=testing --silent)
bd dep add $VERIFY_1 $MOCK_SCHEMA
bd dep add $VERIFY_1 $MOCK_COLL
bd dep add $VERIFY_1 $GENERATORS
bd dep add $VERIFY_1 $SCENARIOS
bd dep add $VERIFY_1 $LOCALSTORAGE

# ============================================
# PHASE 2: DEBUG ROUTES + CONTROLS
# ============================================
CONTROLS=$(bd create --title="GH#415: Create MockDataControls component" --type=task --priority=1 --silent)
bd dep add $CONTROLS $VERIFY_1

ROUTE_BASIC=$(bd create --title="GH#415: Create /debug/vibegrid-test/basic route" --type=task --priority=1 --silent)
bd dep add $ROUTE_BASIC $CONTROLS

ROUTE_GANTT=$(bd create --title="GH#415: Create /debug/vibegrid-test/gantt route" --type=task --priority=2 --silent)
bd dep add $ROUTE_GANTT $CONTROLS

ROUTE_GROUP=$(bd create --title="GH#415: Create /debug/vibegrid-test/grouping route" --type=task --priority=2 --silent)
bd dep add $ROUTE_GROUP $CONTROLS

ROUTE_DRAG=$(bd create --title="GH#415: Create /debug/vibegrid-test/drag-drop route" --type=task --priority=2 --silent)
bd dep add $ROUTE_DRAG $CONTROLS

# Phase 2 Verification
VERIFY_2=$(bd create --title="GH#415: VERIFY Phase 2 - debug routes work without API" --type=task --labels=testing --silent)
bd dep add $VERIFY_2 $ROUTE_BASIC
bd dep add $VERIFY_2 $ROUTE_GANTT
bd dep add $VERIFY_2 $ROUTE_GROUP
bd dep add $VERIFY_2 $ROUTE_DRAG

# ============================================
# PHASE 3: DATA-TESTID ADDITIONS
# ============================================
TESTID_BODY=$(bd create --title="GH#415: Add data-testid to BodyRenderer elements" --type=task --priority=1 --silent)
bd dep add $TESTID_BODY $VERIFY_2

TESTID_HEADER=$(bd create --title="GH#415: Add data-testid to HeaderRenderer elements" --type=task --priority=1 --silent)
bd dep add $TESTID_HEADER $VERIFY_2

TESTID_GANTT=$(bd create --title="GH#415: Add data-testid to GanttBar and DependencyArrowLayer" --type=task --priority=1 --silent)
bd dep add $TESTID_GANTT $VERIFY_2

TESTID_OTHER=$(bd create --title="GH#415: Add data-testid to FillHandle, ContextMenu, DOMFactory" --type=task --priority=2 --silent)
bd dep add $TESTID_OTHER $VERIFY_2

TESTID_AUDIT=$(bd create --title="GH#415: Audit and add data-testid to any missed elements" --type=task --priority=2 --silent)
bd dep add $TESTID_AUDIT $TESTID_BODY
bd dep add $TESTID_AUDIT $TESTID_HEADER
bd dep add $TESTID_AUDIT $TESTID_GANTT
bd dep add $TESTID_AUDIT $TESTID_OTHER

# Phase 3 Verification
VERIFY_3=$(bd create --title="GH#415: VERIFY Phase 3 - all elements have data-testid" --type=task --labels=testing --silent)
bd dep add $VERIFY_3 $TESTID_AUDIT

# ============================================
# PHASE 4: E2E TESTS
# ============================================
E2E_TESTS=$(bd create --title="GH#415: Add E2E tests using data-testid selectors" --type=task --priority=2 --silent)
bd dep add $E2E_TESTS $VERIFY_3

# Final verification
FINAL=$(bd create --title="GH#415: VERIFY complete - demo to user" --type=task --priority=1 --labels=testing --silent)
bd dep add $FINAL $E2E_TESTS
```

### Dependency Graph (Expected)

```
        +------------+
        |  BASELINE  |  ← P0: Verify existing routes work
        +-----+------+
              |
    +---------+---------+
    |                   |
    v                   v
+----------+    +------------+
| MockColl |    | Generators |
+----+-----+    +-----+------+
     |                |
     v                v
+-----------+   +----------+
| LocalStore|   | Scenarios|
+-----+-----+   +----+-----+
      |              |
      +------+-------+
             |
             v
       +-----------+
       | VERIFY 1  |  ← Gate: Mock infra works?
       +-----+-----+
             |
             v
       +-----------+
       | Controls  |
       +-----+-----+
             |
    +--------+--------+--------+
    v        v        v        v
+-------+ +-------+ +-------+ +-------+
| Basic | | Gantt | | Group | | Drag  |
+---+---+ +---+---+ +---+---+ +---+---+
    |         |         |         |
    +---------+---------+---------+
                  |
                  v
            +-----------+
            | VERIFY 2  |  ← Gate: Routes work?
            +-----+-----+
                  |
    +-------------+-------------+
    v             v             v
+--------+   +--------+   +--------+
| Body   |   | Header |   | Gantt  |
| testid |   | testid |   | testid |
+---+----+   +---+----+   +---+----+
    |            |            |
    +------------+------------+
                 |
                 v
           +---------+
           | Other   |
           | testid  |
           +----+----+
                |
                v
           +---------+
           | Audit   |
           +----+----+
                |
                v
          +-----------+
          | VERIFY 3  |  ← Gate: All testids?
          +-----+-----+
                |
                v
          +-----------+
          | E2E Tests |
          +-----+-----+
                |
                v
          +-----------+
          |   FINAL   |  ← Demo to user
          +-----------+
```

---

## 7. Notes

**Discovered complexity:**
- Need to ensure mock collections work with existing `useVibeGridData` hook without changes
- localStorage serialization must handle Date objects properly
- data-testid additions must not break existing CSS selectors
- **Schema registry integration** - Mock routes must provide `MockSchemaRegistry` to prevent DataForge API calls from `useSchemaRegistry()` hook
- **Dependency collection shape** - Mock dependencies must match `DependencyRecord` interface exactly for `GanttViewStore` compatibility

**Open questions:**
- None after clarification

**Risks:**
- Mock collection may need adjustments to work with MobX observer pattern
- Some edge cases in data generators may need iteration
- **Schema registry mocking complexity** - If `SchemaRegistryStore` has more methods than anticipated, mock may need expansion. Mitigated by reading actual interface during implementation.
- **Dependency data flow** - `GanttViewStore.setSchemaRegistry()` triggers dependency loading. Mock dependency collection must be wired correctly to `useDependencyCollection()` hook. Verify by checking Network tab shows no oRPC calls.
- **Auth/Org context still requires DB** - Mock routes remain under `_authenticated`, so auth/session and org context still use normal DB-backed Better Auth. This is intentional - we're mocking grid data, not bypassing auth. Risk is low since dev environments have DB access.
