---
initiative: Workflow Management UI
type: project
issue_type: feature
status: draft
priority: high
roadmap: null
owner: platform-engineering
github_issue: 944
github_milestone: null
parent_epic: null
created: 2026-01-07
updated: 2026-01-07
---

# Workflow Management UI - VibeGrid Views for Executions, Steps, Schedules

> **Full-Stack Feature**: Production-ready workflow management interface with VibeGrid-based views for definitions, executions, step results, and schedules.

## User Stories

**As an Operations User,**
I want to monitor workflow executions in real-time,
so that I can identify failures immediately and take corrective action.

**As a Workflow Author,**
I want to see which workflows are published, their execution history, and schedules,
so that I can manage my workflow portfolio effectively.

**As a PM/Leadership,**
I want to view workflow health and performance metrics,
so that I can assess operational efficiency.

## Acceptance Criteria

- [ ] Given a user navigates to `/tools/workflows`, when the page loads, then they see a tabbed interface with Definitions, Executions, and Schedules views
- [ ] Given a user is on the Executions tab, when an execution is running, then the status updates in real-time via WebSocket (2s polling)
- [ ] Given a user clicks on an execution row, when the side panel opens, then they see step-by-step results with duration, tokens, and cost
- [ ] Given a user is on the Definitions tab, when they click a workflow row, then they can navigate to the workflow editor for that definition
- [ ] Given a user filters executions by status, when they select "failed", then only failed executions are shown
- [ ] Given a user is on the Schedules tab, when they toggle a schedule, then the enabled/disabled state updates immediately

---

## User Journey

| Step | Action | UI State | Notes |
|------|--------|----------|-------|
| **1. Entry Point** | User clicks "Workflows" in Tools navigation | `/tools/workflows` loads with Definitions tab active | Primary entry from sidebar navigation |
| **2. View Definitions** | User sees all workflow definitions in VibeGrid | Grid shows name, status, version, last updated | Draft/Published/Archived status badges |
| **3. Filter/Search** | User filters by status or searches by name | Grid filters in real-time | Status chips: All, Draft, Published, Archived |
| **4. View Executions** | User clicks "Executions" tab | Grid shows all executions with status, workflow name, duration | Sorted by created_at DESC |
| **5. Drill into Execution** | User clicks an execution row | Side panel slides in with step results | Shows timeline: pending > running > completed/failed |
| **6. View Step Details** | User expands a step in the panel | Shows output, error, duration, tokens, cost | Collapsible sections |
| **7. View Schedules** | User clicks "Schedules" tab | Grid shows all scheduled workflows with cron, next run, enabled | Toggle switch per row |
| **8. Open Editor** | User clicks "Edit" on a definition row | Navigates to `/debug/workflow-editor?id=...` | Opens visual workflow editor |
| **9. Exit Point** | User navigates away | State preserved in URL | Returns to same tab via URL params |

**Alternative Flows:**
- If no executions exist, user sees empty state: "No executions yet. Run a workflow to see results."
- Error case: API failure -> Toast notification with retry action

---

## Requirements Interview Summary

### Core Functionality

| Question | Answer | Rationale |
|----------|--------|-----------|
| Happy path? | View definitions, filter, click to see details, view executions/steps | Standard list-detail pattern |
| On failure? | Toast notification with error message and retry button | Matches existing error handling patterns |
| Minimal viable interaction? | View and filter workflows, see execution status | Core monitoring capability |
| Required vs optional data? | Required: name, status, created_at. Optional: description, tags | Minimal columns for MVP |
| Role differences? | All org members can view. entities:write required for edit/execute | Use existing permission model |

### Edge Cases

| Scenario | Handling | Rationale |
|----------|----------|-----------|
| 0 results (empty state) | Simple message with icon: "No workflows yet" | Matches existing empty state patterns |
| 10K+ results (scale) | VibeGrid virtual scrolling with server-side pagination (limit 50 per page) | VibeGrid handles virtual scroll automatically |
| Concurrent edits | Optimistic update with server reconciliation | Local-first pattern |
| Network interruption | Queue changes, retry on reconnect, show offline indicator | Existing sync patterns |
| Invalid input | Zod validation on API, toast on frontend | Standard validation pattern |

### Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Needed: Yes - workflow_failed, workflow_completed | Operations needs alerts on failures |
| Real-time Sync | Needed: Yes - WebSocket for running execution status | Essential for monitoring |
| Access Control | Needed: No - use existing entities:read/entities:write | No new permissions required |
| Audit Logging | Needed: Yes - execution start, cancel, schedule toggle | Operations audit trail |
| Workflows | Needed: No - this IS the workflow UI | Circular dependency |
| Settings | Needed: No | No user preferences for MVP |
| Feature Flags | Needed: Yes - feature.workflows.management_ui | Gradual rollout |

### UX Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Loading state | Skeleton loader for grids, spinner for side panel | Consistent with existing patterns |
| Error recovery | Toast with "Retry" action, persistent error state in grid | User can manually retry |
| Mobile vs desktop | Desktop-first, responsive grid (hide columns on narrow) | Primary use case is desktop |
| Keyboard shortcuts | Tab navigation, Enter to open detail, Escape to close | Standard VibeGrid patterns |
| Accessibility | ARIA labels, focus management, high contrast status badges | WCAG 2.1 AA compliance |

### Frontend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Component location | `src/features/workflows/components/management/` | Separate from existing workflow editor components |
| Route | `/tools/workflows` with tab query param `?tab=executions` | Existing tools pattern |
| Store type | Extend WorkflowExecutionStore, new WorkflowManagementStore | Separate concerns |
| State observable | Definitions list, executions list, schedules list, selected item, filters | MobX for reactive updates |
| Query cache strategy | 5min stale time for definitions, 30s for executions, 1min for schedules | Executions need fresher data |
| Form handling | N/A for MVP (read-only views) | No forms in initial version |

### Backend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Worker | Workflows worker (apps/workflows/) | All workflow logic centralized |
| Router | Extend existing workflows router | Add stepResults.list, timelineEvents.list endpoints |
| Schema | Use existing workflow_* tables | No schema changes needed |
| Service | N/A - direct Kysely queries in router | Simple CRUD, no complex logic |
| Transaction scope | Single query per endpoint | Read-only operations |
| Middleware | Standard orgProcedure with RLS | Existing pattern |

### Scope Boundaries

| Excluded | Reason |
|----------|--------|
| Analytics/charts | Phase 2 - requires metrics aggregation |
| Visual timeline (Gantt) | Phase 2 - complex rendering |
| Schedule creation UI | Phase 2 - use editor for now |
| Workflow creation from management UI | Phase 2 - use editor |
| Execution comparison | Phase 2 - advanced feature |
| Custom column configuration | Phase 2 - VibeGrid enhancement |

---

## Blast Radius Analysis

### Code Impact

- **Direct dependencies**:
  - `apps/web/src/app/routes/_authenticated/tools/workflows.tsx` - Replace ComingSoon
  - `apps/web/src/features/workflows/` - New components, hooks, stores
  - `apps/workflows/src/orpc/routers/workflows.ts` - Add stepResults, timelineEvents endpoints
- **Indirect dependencies**: None - new feature, isolated
- **Workers affected**: Workflows worker (API), Web worker (UI)

### Database Impact

| Change | Type | Migration | Existing Data |
|--------|------|-----------|---------------|
| None | N/A | N/A | N/A |

All required tables already exist:
- `workflow_definitions` - definitions
- `workflow_executions` - execution instances
- `workflow_step_results` - step-level results
- `workflow_timeline_events` - audit events

### API Impact

- **Breaking changes**: None
- **New endpoints**:
  - `GET /api/orpc/workflows/stepResults/list` (Workflows worker) - List step results for execution
  - `GET /api/orpc/workflows/timelineEvents/list` (Workflows worker) - List timeline events for execution
  - `GET /api/orpc/workflows/executions/list` - Add date range filter
- **Modified contracts**: `listWorkflowExecutionsSchema` - add `startDate`, `endDate` optional filters

### Test Impact

- **Tests to update**: None - new feature
- **New test categories**:
  - Unit: Store tests for WorkflowManagementStore
  - Integration: API endpoint tests for new stepResults/timelineEvents endpoints
  - E2E: Workflow management flow tests
- **Test data requirements**: Seed workflows with executions and step results

### Performance Considerations

- **Query complexity**: Simple - single table queries with org_id filter
- **N+1 risks**: Step results fetched on-demand (execution click), not upfront
- **Caching implications**: TanStack Query handles caching, invalidate on execution status change

### Security Review

- **Permission checks**: Use existing entities:read permission via orgProcedure
- **Data sensitivity**: No PII, execution data is operational
- **Input validation**: Zod schemas for all inputs (existing pattern)

---

## Auxiliary Systems Integration

### Notifications

- [x] **Needed?** Yes
- **Events that trigger**: workflow_execution_failed, workflow_execution_completed
- **Channels**: in_app (immediate), email (configurable per workflow)
- **Templates required**: workflow_execution_failed, workflow_execution_completed
- **Recipients**: Workflow creator, optionally team members

**Note:** Notification integration is Phase 2. MVP does not send notifications.

### Real-time Sync

- [x] **Needed?** Yes
- **Events to emit**:
  - `workflow_execution_status_changed` - when status transitions
  - `workflow_step_completed` - when step completes
- **Sync scope**: Org-wide (all org members see updates)
- **Optimistic updates**: Not applicable (read-only views)

**Integration:**
```typescript
// Existing polling pattern in WorkflowExecutionStore (2s interval)
// WebSocket via UserActor already implemented
// No additional sync needed for MVP
```

### Access Control

- [ ] **New permissions needed?** No
- **Permission name(s)**: Use existing `entities:read`, `entities:write`
- **Default role grants**: member+ can view, member+ can execute
- **UI guards**: Check `hasPermission('entities:write')` for Execute/Cancel buttons

**Integration:**
```typescript
// Existing pattern
if (!context.security.hasPermission('entities:write')) {
  throw new ForbiddenError()
}
```

### Audit Logging

- [x] **Needed?** Yes
- **Actions to log**: workflow_executed, workflow_cancelled, schedule_toggled
- **Data to capture**: executionId, workflowDefinitionId, userId, timestamp
- **Retention**: Standard (30 days)

**Integration:**
```typescript
// Already captured in workflow_timeline_events table
// No additional logging needed
```

### Workflows Integration

- [ ] **Needed?** No
- This feature IS the workflow management UI

### Settings/Preferences

- [ ] **Needed?** No
- No user preferences for MVP

### Feature Flags

- **Flag name**: `feature.workflows.management_ui`
- **Default**: false
- **Rollout plan**: 100% to internal -> 100% to all (simple feature flag)
- **Kill switch procedure**: Set flag to false, reverts to ComingSoon component

**Define via migration:**
```sql
INSERT INTO feature_flag_definitions (key, name, description, default_enabled, rollout_percentage)
VALUES ('feature.workflows.management_ui', 'Workflow Management UI', 'Production workflow management interface', false, 0);
```

### Analytics/Metrics

- [ ] **Needed?** No
- Phase 2

---

## Design

### Overview

The Workflow Management UI provides a tabbed interface for viewing and managing workflows. It replaces the existing "Coming Soon" placeholder at `/tools/workflows` with three VibeGrid-based views:

1. **Definitions Tab**: List all workflow definitions with status, version, and actions
2. **Executions Tab**: List all executions with real-time status updates via WebSocket polling
3. **Schedules Tab**: List all scheduled workflows with toggle controls

The UI follows existing Baseplane patterns: tabbed navigation, VibeGrid for data display, side panels for details, and MobX for state management.

### Architecture

```
/tools/workflows
├── WorkflowsManagementPage.tsx
│   ├── TabNavigation (Definitions | Executions | Schedules)
│   ├── WorkflowDefinitionsGrid.tsx
│   │   └── VibeGrid with definition columns
│   ├── WorkflowExecutionsGrid.tsx
│   │   └── VibeGrid with execution columns
│   │   └── ExecutionDetailPanel.tsx (side panel)
│   │       └── StepResultsList.tsx
│   └── WorkflowSchedulesGrid.tsx
│       └── VibeGrid with schedule columns
└── Stores
    ├── WorkflowManagementStore.ts (lists, filters)
    └── WorkflowExecutionStore.ts (existing, for detail polling)
```

**Data Flow:**
```
User Action (filter, click)
    → MobX Store Action
    → TanStack Query (API call via workflowsClient)
    → WebSocket to UserActor
    → Workflows Worker (oRPC router)
    → Database (Kysely)
    → Response flows back
    → MobX observable update
    → React re-render
```

### Key Interfaces

```typescript
// Grid column definitions
interface WorkflowDefinitionColumn {
  id: string
  workflow_name: string
  status: 'draft' | 'published' | 'archived'
  version: string
  description: string | null
  created_at: string
  updated_at: string
}

interface WorkflowExecutionColumn {
  id: string
  workflow_name: string
  workflow_version: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  trigger_type: string
  duration_ms: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface WorkflowScheduleColumn {
  workflowDefinitionId: string
  workflowName: string  // Joined from definitions
  cronExpression: string
  timezone: string
  enabled: boolean
  lastRun: number | null
  nextRun: number
  consecutiveFailures: number
}

// Step results for detail panel
interface StepResult {
  id: string
  execution_id: string
  step_id: string
  success: boolean
  output: Record<string, unknown> | null
  error: Record<string, unknown> | null
  retry_count: number
  duration_ms: number | null
  tokens_used: number | null
  cost_usd: number | null
  started_at: string
  completed_at: string
}

// New API schemas
interface ListStepResultsInput {
  execution_id: string
}

interface ListStepResultsResponse {
  stepResults: StepResult[]
  total: number
}

interface ListTimelineEventsInput {
  execution_id: string
  limit?: number
  offset?: number
}

interface ListTimelineEventsResponse {
  events: TimelineEvent[]
  total: number
}
```

### Data Model Changes

| Table/Entity | Change | Notes |
|--------------|--------|-------|
| None | N/A | All tables exist |

---

## Implementation

> **TDD Enforcement**: Each phase follows TEST -> IMPL -> VERIFY pattern.
> Beads are created with dependencies: IMPL depends on TEST, VERIFY depends on IMPL.

### Phase 0: Baseline Verification (BLOCKING)

Before starting implementation, manually verify existing functionality works:

| Check | How to Verify | Status |
|-------|---------------|--------|
| `/debug/workflow-editor` loads | Navigate to page, see canvas | [ ] Verified |
| Workflow CRUD API works | Create workflow via editor, save | [ ] Verified |
| Execution API works | Execute workflow, see polling | [ ] Verified |
| Schedules API works | Register schedule, list returns it | [ ] Verified |
| No console errors | Open DevTools during all above | [ ] Verified |

**If any check fails**: STOP. File a bug. Fix baseline first.

**Beads:**
```bash
bd create --title="GH#944: P0 Baseline verification" --type=task --labels=phase-0,baseline
```

---

### Phase 1: Backend API Extensions

#### TEST (Write First)
- [ ] Test: `stepResults.list` returns step results for valid execution_id
- [ ] Test: `stepResults.list` returns empty array for execution with no steps
- [ ] Test: `timelineEvents.list` returns events sorted by timestamp DESC
- [ ] Test: `executions.list` filters by startDate and endDate
- [ ] Test: All endpoints respect org_id (RLS)
- [ ] Test: Unauthorized requests return 401

```bash
# Run tests - should FAIL (nothing implemented yet)
pnpm test -- --grep "stepResults"
pnpm test -- --grep "timelineEvents"
```

#### IMPL (Make Tests Pass)
- [ ] Add `listStepResultsSchema` and `stepResultSchema` to workflow-schemas.ts
- [ ] Add `listTimelineEventsSchema` and `timelineEventSchema` to workflow-schemas.ts
- [ ] Add `stepResults.list` endpoint to workflows router
- [ ] Add `timelineEvents.list` endpoint to workflows router
- [ ] Add `startDate`, `endDate` optional filters to `listWorkflowExecutionsSchema`
- [ ] Update `executions.list` to support date range filtering

#### VERIFY (Confirm Done)
| Check | How to Verify | Status |
|-------|---------------|--------|
| Tests pass | `pnpm test -- --grep "stepResults\|timelineEvents"` | [ ] Pass |
| API works | curl stepResults.list with valid execution_id | [ ] Verified |
| Date filter works | curl executions.list with startDate/endDate | [ ] Verified |
| Typecheck | `pnpm typecheck` | [ ] Pass |

**Beads:**
```bash
TEST_P1=$(bd create --title="GH#944: TEST P1 - API extension tests" --type=task --priority=1 --labels=phase-1,testing,tdd --silent)
IMPL_P1=$(bd create --title="GH#944: IMPL P1 - stepResults, timelineEvents, date filter APIs" --type=task --priority=2 --labels=phase-1 --silent)
VERIFY_P1=$(bd create --title="GH#944: VERIFY P1 - API extensions complete" --type=task --labels=phase-1,testing --silent)
bd dep add $IMPL_P1 $TEST_P1    # Impl depends on test
bd dep add $VERIFY_P1 $IMPL_P1  # Verify depends on impl
```

---

### Phase 2: VibeGrid Adapters and Data Layer

#### TEST (Write First)
- [ ] Test: WorkflowManagementStore initializes with empty lists
- [ ] Test: loadDefinitions populates definitions list
- [ ] Test: loadExecutions populates executions list
- [ ] Test: loadSchedules populates schedules list
- [ ] Test: setStatusFilter updates filter and triggers reload
- [ ] Test: selectExecution loads step results
- [ ] Test: workflowsClient extensions return expected shapes

```bash
# Run tests - should FAIL (nothing implemented yet)
pnpm test -- --grep "WorkflowManagementStore"
```

#### IMPL (Make Tests Pass)
- [ ] Create `WorkflowManagementStore.ts` in `src/features/workflows/stores/`
- [ ] Add observable: definitions, executions, schedules, selectedExecutionId, statusFilter
- [ ] Add actions: loadDefinitions, loadExecutions, loadSchedules, selectExecution, setStatusFilter
- [ ] Add computed: filteredDefinitions, filteredExecutions
- [ ] Extend `workflows-client.ts` with stepResults.list, timelineEvents.list
- [ ] Create column definitions for each grid type

#### VERIFY (Confirm Done)
| Check | How to Verify | Status |
|-------|---------------|--------|
| Tests pass | `pnpm test -- --grep "WorkflowManagementStore"` | [ ] Pass |
| Store hydrates | Console log in init() shows data loaded | [ ] Verified |
| Client extensions work | Call stepResults.list from console | [ ] Verified |
| Typecheck | `pnpm typecheck` | [ ] Pass |

**Beads:**
```bash
TEST_P2=$(bd create --title="GH#944: TEST P2 - Store and client tests" --type=task --priority=1 --labels=phase-2,testing,tdd --silent)
IMPL_P2=$(bd create --title="GH#944: IMPL P2 - WorkflowManagementStore, client extensions" --type=task --priority=2 --labels=phase-2 --silent)
VERIFY_P2=$(bd create --title="GH#944: VERIFY P2 - Data layer complete" --type=task --labels=phase-2,testing --silent)
bd dep add $TEST_P2 $VERIFY_P1  # Phase 2 tests depend on Phase 1 verify
bd dep add $IMPL_P2 $TEST_P2
bd dep add $VERIFY_P2 $IMPL_P2
```

---

### Phase 3: UI Components and Routes

#### TEST (Write First)
- [ ] Test: WorkflowsManagementPage renders with three tabs
- [ ] Test: Definitions tab shows VibeGrid with workflow data
- [ ] Test: Executions tab shows VibeGrid with execution data
- [ ] Test: Schedules tab shows VibeGrid with schedule data
- [ ] Test: Clicking execution row opens side panel
- [ ] Test: Side panel shows step results list
- [ ] Test: Status filter chips update grid

```bash
# Run tests - should FAIL (nothing implemented yet)
pnpm test -- --grep "WorkflowsManagement"
```

#### IMPL (Make Tests Pass)
- [ ] Create `src/features/workflows/components/management/` directory
- [ ] Create `WorkflowsManagementPage.tsx` with tabbed layout
- [ ] Create `WorkflowDefinitionsGrid.tsx` with VibeGrid columns
- [ ] Create `WorkflowExecutionsGrid.tsx` with VibeGrid columns
- [ ] Create `WorkflowSchedulesGrid.tsx` with VibeGrid columns
- [ ] Create `ExecutionDetailPanel.tsx` with step results
- [ ] Create `StepResultsList.tsx` for step-by-step display
- [ ] Update `/tools/workflows.tsx` route to use new component
- [ ] Add feature flag check with fallback to ComingSoon
- [ ] Wire up MobX stores with observer()

#### VERIFY (Confirm Done)
| Check | How to Verify | Status |
|-------|---------------|--------|
| Tests pass | `pnpm test -- --grep "WorkflowsManagement"` | [ ] Pass |
| Page renders | Navigate to `/tools/workflows` | [ ] Verified |
| Tabs work | Click each tab, see correct grid | [ ] Verified |
| Detail panel works | Click execution, see step results | [ ] Verified |
| Typecheck | `pnpm typecheck` | [ ] Pass |

#### Browser Smoke Test (Required for UI)

```bash
# 1. Navigate and screenshot
.claude/skills/chrome-devtools/scripts/cdp.sh navigate "http://localhost:$DEV_PORT/tools/workflows"
.claude/skills/chrome-devtools/scripts/cdp.sh screenshot /tmp/workflows-management-before.png

# 2. Click Executions tab
.claude/skills/chrome-devtools/scripts/cdp.sh click "button[data-value='executions']"
.claude/skills/chrome-devtools/scripts/cdp.sh wait 1000
.claude/skills/chrome-devtools/scripts/cdp.sh screenshot /tmp/workflows-management-executions.png

# 3. Check for console errors
.claude/skills/chrome-devtools/scripts/cdp.sh evaluate "window.__errors || []"
```

| Smoke Test Check | Status |
|------------------|--------|
| Page loads without console errors | [ ] Pass |
| Three tabs visible | [ ] Pass |
| Grids render with data | [ ] Pass |
| Screenshots captured as evidence | [ ] Done |

**Beads:**
```bash
TEST_P3=$(bd create --title="GH#944: TEST P3 - UI component tests" --type=task --priority=1 --labels=phase-3,testing,tdd --silent)
IMPL_P3=$(bd create --title="GH#944: IMPL P3 - WorkflowsManagementPage, grids, detail panel" --type=task --priority=2 --labels=phase-3 --silent)
VERIFY_P3=$(bd create --title="GH#944: VERIFY P3 - UI components complete" --type=task --labels=phase-3,testing --silent)
SMOKE_P3=$(bd create --title="GH#944: SMOKE P3 - Browser smoke test" --type=task --labels=phase-3,testing,smoke --silent)
bd dep add $TEST_P3 $VERIFY_P2  # Phase 3 tests depend on Phase 2 verify
bd dep add $IMPL_P3 $TEST_P3
bd dep add $VERIFY_P3 $IMPL_P3
bd dep add $SMOKE_P3 $VERIFY_P3  # Smoke test after verify
```

---

### Phase 4: Real-time Updates and Polish

#### TEST (Write First)
- [ ] Test: Execution status updates when polling returns new status
- [ ] Test: Running indicator appears for running executions
- [ ] Test: Empty state shows correct message
- [ ] Test: Error toast appears on API failure
- [ ] Test: Status badges use correct colors

```bash
# Run tests - should FAIL (nothing implemented yet)
pnpm test -- --grep "real-time\|empty state\|error"
```

#### IMPL (Make Tests Pass)
- [ ] Integrate WorkflowExecutionStore polling for selected execution
- [ ] Add running indicator animation to grid rows
- [ ] Add empty state components for each grid
- [ ] Add error handling with toast notifications
- [ ] Add status badge styling (pending: muted, running: blue, completed: green, failed: red)
- [ ] Add feature flag migration
- [ ] Add loading skeletons for grids

#### VERIFY (Confirm Done)
| Check | How to Verify | Status |
|-------|---------------|--------|
| Tests pass | `pnpm test -- --grep "real-time\|empty state\|error"` | [ ] Pass |
| Real-time works | Execute workflow, watch status update in grid | [ ] Verified |
| Empty state shows | Clear all workflows, verify message | [ ] Verified |
| Error handling | Disconnect network, verify toast | [ ] Verified |
| Feature flag works | Toggle flag, verify ComingSoon fallback | [ ] Verified |

**Beads:**
```bash
TEST_P4=$(bd create --title="GH#944: TEST P4 - Real-time and polish tests" --type=task --priority=1 --labels=phase-4,testing,tdd --silent)
IMPL_P4=$(bd create --title="GH#944: IMPL P4 - Real-time updates, empty states, feature flag" --type=task --priority=2 --labels=phase-4 --silent)
VERIFY_P4=$(bd create --title="GH#944: VERIFY P4 - Feature complete" --type=task --labels=phase-4,testing --silent)
bd dep add $TEST_P4 $SMOKE_P3  # Phase 4 tests depend on Phase 3 smoke
bd dep add $IMPL_P4 $TEST_P4
bd dep add $VERIFY_P4 $IMPL_P4
```

---

### Beads Summary

| Phase | TEST | IMPL | VERIFY | SMOKE |
|-------|------|------|--------|-------|
| P0 | - | - | Baseline | - |
| P1 | API extension tests | stepResults, timelineEvents APIs | API complete | - |
| P2 | Store tests | WorkflowManagementStore | Data layer complete | - |
| P3 | UI component tests | Page, grids, panels | UI complete | Browser test |
| P4 | Real-time tests | Polling, empty states, flags | Feature complete | - |

**Dependency chain:** P0 -> TEST_P1 -> IMPL_P1 -> VERIFY_P1 -> TEST_P2 -> ... -> VERIFY_P4

---

## Testing

### Unit Tests

- [ ] WorkflowManagementStore - all actions and computed
- [ ] Column definitions - correct field mappings
- [ ] Status badge component - correct colors

### Integration Tests

- [ ] API endpoint tests for stepResults.list
- [ ] API endpoint tests for timelineEvents.list
- [ ] API endpoint tests for executions.list with date range
- [ ] Store + API integration

### E2E Tests

- [ ] Navigate to /tools/workflows, verify grids load
- [ ] Filter by status, verify grid updates
- [ ] Click execution, verify detail panel opens
- [ ] Execute workflow, verify status updates in real-time

### Manual Testing

- [ ] Test as admin - all features accessible
- [ ] Test as viewer - Execute/Cancel buttons hidden
- [ ] Test empty state - no workflows, no executions, no schedules
- [ ] Test scale - 100+ executions, verify virtual scroll

---

## Rollout

### Feature Flag

- **Flag name**: `feature.workflows.management_ui`
- **Default**: `false`
- **Stages**: 100% to internal (immediate) -> 100% to all (after 1 week)

### Rollback

1. Set feature flag to false immediately
2. Route reverts to ComingSoon component
3. No data impact (read-only UI)

---

## Decision Log

### Decision 1: Use existing VibeGrid instead of custom grids
**Date**: 2026-01-07
**Chose**: VibeGrid with custom column definitions
**Over**: Custom table components
**Reason**: VibeGrid provides virtual scrolling, sorting, filtering out of the box. Consistent with rest of platform.

### Decision 2: Polling for real-time instead of WebSocket push
**Date**: 2026-01-07
**Chose**: Continue using WorkflowExecutionStore's 2s polling pattern
**Over**: WebSocket push for status changes
**Reason**: Polling already implemented and working. WebSocket push is Phase 2 optimization.

### Decision 3: Side panel for execution details instead of modal
**Date**: 2026-01-07
**Chose**: Slide-in side panel (reuse ExecutionPanel.tsx pattern)
**Over**: Full-screen modal
**Reason**: User can see list context while viewing details. Matches editor pattern.

### Decision 4: Read-only for MVP
**Date**: 2026-01-07
**Chose**: View and filter only, no CRUD from management UI
**Over**: Full CRUD (create, edit, delete from list)
**Reason**: Editor exists for CRUD. Management UI focuses on monitoring. Reduces scope.

---

## Related Work

- [GH#447 - Workflows Worker Migration](../specs/447-workflows-worker-migration.md) - API lives in workflows worker
- [Debug Workflow Editor](../../apps/web/src/app/routes/_authenticated/debug/workflow-editor.tsx) - Existing editor for reference
- [ExecutionPanel.tsx](../../apps/web/src/features/workflows/components/ExecutionPanel.tsx) - Reusable execution display
- [SchedulePanel.tsx](../../apps/web/src/features/workflows/components/SchedulePanel.tsx) - Schedule management patterns

---

## Key Files Reference

### Existing Files (Read/Reference)

| File | Purpose |
|------|---------|
| `apps/workflows/src/orpc/routers/workflows.ts` | Existing workflow API router |
| `apps/workflows/src/orpc/schemas/workflow-schemas.ts` | Zod schemas for workflows |
| `apps/web/src/features/workflows/api/workflows-client.ts` | Frontend API client |
| `apps/web/src/features/workflows/stores/WorkflowExecutionStore.ts` | Execution polling store |
| `apps/web/src/features/workflows/components/ExecutionPanel.tsx` | Execution display component |
| `apps/web/src/server/migrations/server/20251116_workflow_foundation.sql` | Database schema |
| `apps/web/src/systems/vibegrid/adapters/GridAdapter.ts` | VibeGrid adapter pattern |

### New Files (Create)

| File | Purpose |
|------|---------|
| `apps/web/src/features/workflows/stores/WorkflowManagementStore.ts` | MobX store for management UI |
| `apps/web/src/features/workflows/components/management/WorkflowsManagementPage.tsx` | Main page component |
| `apps/web/src/features/workflows/components/management/WorkflowDefinitionsGrid.tsx` | Definitions VibeGrid |
| `apps/web/src/features/workflows/components/management/WorkflowExecutionsGrid.tsx` | Executions VibeGrid |
| `apps/web/src/features/workflows/components/management/WorkflowSchedulesGrid.tsx` | Schedules VibeGrid |
| `apps/web/src/features/workflows/components/management/ExecutionDetailPanel.tsx` | Execution detail side panel |
| `apps/web/src/features/workflows/components/management/StepResultsList.tsx` | Step results display |
| `apps/web/src/features/workflows/components/management/index.ts` | Barrel export |

### Modified Files

| File | Change |
|------|--------|
| `apps/workflows/src/orpc/routers/workflows.ts` | Add stepResults, timelineEvents endpoints |
| `apps/workflows/src/orpc/schemas/workflow-schemas.ts` | Add new schemas |
| `apps/web/src/features/workflows/api/workflows-client.ts` | Add client methods |
| `apps/web/src/app/routes/_authenticated/tools/workflows.tsx` | Replace ComingSoon |
