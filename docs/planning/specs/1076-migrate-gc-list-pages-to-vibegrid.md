---
initiative: migrate-gc-list-pages-to-vibegrid
type: project
issue_type: feature
status: approved
priority: medium
roadmap: null
owner: platform-engineering
github_issue: 1076
github_milestone: null
parent_epic: null
created: 2026-01-11
updated: 2026-01-13

phases:
  - id: p1
    name: "Bid Packages Page"
    tasks:
      - "Update ProjectBidPackagesPage.tsx to use VibeGrid"
      - "Configure columns: name, trade, dueDate, reminderEnabled, codeCount, vendorCount"
      - "Add badge cell renderers for reminder status"
      - "Preserve click-through to package detail"
  - id: p2
    name: "Bid Submissions Page"
    tasks:
      - "Update ProjectBidPackageSubmissionsPage.tsx to use VibeGrid"
      - "Configure columns: vendor, contact, responseStatus, dueDate, submittedAt, baseAmount, documentsCount"
      - "Enable inline editing for baseAmount (bid entry)"
      - "Configure default sort: responseStatus DESC, submittedAt ASC"
      - "Add status badge cell renderer and currency formatter for baseAmount"
  - id: p3
    name: "COI List Page"
    tasks:
      - "Update COIList.tsx to use VibeGrid"
      - "Configure columns: insured_name, status, compliance, gl_each_occurrence, gl_expiration_date"
      - "Add column filters to replace external filter bar"
      - "Add status and compliance badge cell renderers"
      - "Add currency formatter for GL limit"
  - id: p4
    name: "Cleanup & Polish"
    tasks:
      - "Remove deprecated markers or add JSDoc deprecation comments"
      - "Update any tests that reference old components"
      - "Verify pnpm typecheck passes"
      - "Verify pnpm lint passes"
---

# Migrate Remaining GC List Pages to VibeGrid

> **Full-Stack Feature**: Migrate 3 GC list pages from custom implementations to the standard VibeGrid pattern for consistent UX.

## User Story

As a **GC project user**,
I want **all entity list pages to use the same VibeGrid interface**,
so that **I have consistent sorting, filtering, grouping, and inline editing across all GC entities**.

## Acceptance Criteria

- [ ] Given Bid Packages page, when user navigates there, then VibeGrid displays packages with badge columns
- [ ] Given Bid Submissions page, when user clicks a cell, then inline editing allows bid entry
- [ ] Given COI List page, when user uses column filters, then documents filter correctly by status/compliance
- [ ] Given any migrated page, when data changes elsewhere, then VibeGrid reflects changes via TanStack Query invalidation
- [ ] Given existing URLs, when user bookmarks them, then bookmarks continue to work (no route changes)

---

## Scope

### In Scope (3 Pages)

| Page | Route | Current Pattern | Migration Effort |
|------|-------|-----------------|------------------|
| Bid Packages | `/projects/:id/bids` | Card list with badges | Medium |
| Bid Submissions | `/projects/:id/bids/:pkgId/submissions` | HTML `<Table>` component | High |
| COI List | `/projects/:id/compliance` (COI tab) | 3-column card grid | Medium |

### Out of Scope (Phase 2)

| Page | Route | Reason |
|------|-------|--------|
| Lien Waivers | `/projects/:id/lien-waivers` | Complex dashboard layout - requires separate design work |

---

## User Journey

| Step | Action | UI State | Notes |
|------|--------|----------|-------|
| **1. Entry Point** | User clicks entity in sidebar | Current page | Same navigation, no change |
| **2. First Interaction** | User sees VibeGrid with data | Standard grid layout | Column headers with sort/filter |
| **3. Core Action** | User filters/sorts/groups | Grid updates reactively | Consistent with RFI, Submittals, etc. |
| **4. Editing** | User clicks cell (Bid Submissions) | Inline editor appears | For bid entry specifically |
| **5. Exit Point** | User clicks row or action | Detail view/modal | Preserve existing detail flows |

---

## UI Layout (ASCII Wireframe)

### Bid Packages (After Migration)

```
┌─────────────────────────────────────────────────────────────┐
│ Bid Packages                                    [+New] [⋮]   │
├─────────────────────────────────────────────────────────────┤
│  □  Name              │ Trade     │ Due Date    │ Reminder  │ Codes │ Vendors │
│─────────────────────────────────────────────────────────────│
│  □  Foundation Work   │ Concrete  │ 2026-01-15  │ 🔔 Sent   │  3    │  12     │
│  □  Electrical Phase1 │ Electric  │ 2026-01-20  │ 🔔 On     │  2    │  8      │
│  □  Plumbing Rough-in │ Plumbing  │ 2026-01-25  │ -         │  1    │  5      │
└─────────────────────────────────────────────────────────────┘
```

### Bid Submissions (After Migration)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Bid Package: Foundation Work                                    [← Back]    │
├─────────────────────────────────────────────────────────────────────────────┤
│  □  Vendor           │ Contact      │ Status      │ Due      │ Base Bid    │ Docs │
│─────────────────────────────────────────────────────────────────────────────│
│  □  ABC Concrete     │ John Smith   │ ✓ Submitted │ Jan 15   │ $125,000    │  3   │
│  □  XYZ Foundations  │ Jane Doe     │ ● Pending   │ Jan 15   │ [Edit]      │  0   │
│  □  123 Construction │ Bob Wilson   │ ✗ Declined  │ Jan 15   │ -           │  0   │
└─────────────────────────────────────────────────────────────────────────────┘
│ Group by Status to see: Submitted (1) │ Pending (1) │ Declined (1)         │
```

### COI List (After Migration)

```
┌─────────────────────────────────────────────────────────────┐
│ Certificates of Insurance                       [+Upload]    │
├─────────────────────────────────────────────────────────────┤
│  □  Vendor/Insured    │ Status      │ Compliance  │ GL Limit  │ Expires    │
│─────────────────────────────────────────────────────────────│
│  □  ABC Contractors   │ ✓ Approved  │ ● Compliant │ $1,000,000│ 2026-06-15 │
│  □  XYZ Electric      │ ⚠ Review    │ ○ Deficient │ $500,000  │ 2026-03-01 │
│  □  123 Plumbing      │ ◷ Processing│ ◷ Pending   │ -         │ -          │
└─────────────────────────────────────────────────────────────┘
```

---

## Requirements Interview Summary

> Captured 2026-01-11 during planning session

### Core Functionality

| Question | Answer | Rationale |
|----------|--------|-----------|
| Should all pages use table layout? | Yes - all 3 pages use VibeGrid table | Consistency with other GC entity pages |
| What happens to Lien Waivers? | Deferred to Phase 2 | Complex dashboard layout needs separate design |
| How to handle Bid Submissions actions? | Inline editing for bid entry, click for view | Leverages VibeGrid's built-in editing |
| How to handle COI filters? | Standard VibeGrid column filters | Replace external filter bar with consistent UX |

### Edge Cases

| Scenario | Handling | Rationale |
|----------|----------|-----------|
| Empty state | VibeGrid's built-in empty state | Consistent messaging |
| Large vendor lists (100+) | VibeGrid virtual scrolling | Already handled by grid |
| Concurrent bid edits | TanStack Query invalidation | Built into data layer |
| Network interruption | VibeGrid error state | Consistent error handling |

### Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Real-time Sync | Inherent | Built into VibeGrid + TanStack Query |
| Access Control | Use existing entity permissions | No new permissions needed |
| Audit Logging | Already exists for entities | No changes needed |
| Feature Flags | Not needed | Direct replacement, deprecate old |

### UX Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Summary stats (Bid Submissions) | Use VibeGrid grouping counts | Group by status shows counts automatically |
| Default sorting (Bid Submissions) | Preserve: responseStatus, submittedAt | Match current user expectations |
| Loading state | VibeGrid skeleton | Consistent with other grids |
| Error recovery | VibeGrid retry UI | Consistent error handling |

### Frontend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Component location | Keep in feature folders | Update in place, minimal moves |
| Route changes | None | Same URLs, preserve bookmarks |
| Store type | VibeGrid MobX stores | Standard pattern |
| Data fetching | TanStack Query (existing) | Already in use, works with VibeGrid |

### Scope Boundaries

| Excluded | Reason |
|----------|--------|
| Lien Waiver Dashboard | Phase 2 - complex sidebar/dashboard layout |
| New features | Migration only - no new functionality |
| Route changes | Preserve existing URLs |

---

## Blast Radius Analysis

### Code Impact

- **Direct changes**:
  - `apps/web/src/features/bid-mail/pages/ProjectBidPackagesPage.tsx`
  - `apps/web/src/features/bid-mail/pages/ProjectBidPackageSubmissionsPage.tsx`
  - `apps/web/src/features/coi/components/COIList.tsx`
  - Parent page components that render these
- **Indirect dependencies**: Routes, navigation, any components linking to these pages
- **Workers affected**: Web only (frontend-only change)

### Database Impact

| Change | Type | Migration | Existing Data |
|--------|------|-----------|---------------|
| None | N/A | None | No data changes |

### API Impact

- **Breaking changes**: None
- **New endpoints**: None - using existing DataForge entity queries
- **Modified contracts**: None

### Test Impact

- **Tests to update**: Existing page tests for the 3 pages
- **New test categories**: E2E tests for VibeGrid interactions
- **Test data requirements**: Existing seed data sufficient

### Performance Considerations

- **Query complexity**: Same - using existing entity queries
- **Virtual scrolling**: VibeGrid handles large lists efficiently
- **Bundle size**: Minimal - VibeGrid already in bundle

### Security Review

- **Permission checks**: Existing entity permissions (entities:read/write)
- **Data sensitivity**: No change - same data exposed
- **Input validation**: VibeGrid handles inline edit validation

---

## Auxiliary Systems Integration

### Notifications

- [ ] **Needed?** No - no new notification triggers

### Real-time Sync

- [x] **Needed?** Yes - inherent to VibeGrid + TanStack Query
- Already handled by existing infrastructure

### Access Control

- [x] **Needed?** Yes - use existing entity permissions
- No new permissions required

### Audit Logging

- [x] **Needed?** Yes - already exists for entity mutations
- No changes required

### Workflows Integration

- [ ] **Needed?** No

### Settings/Preferences

- [ ] **Needed?** No - VibeGrid persists column preferences automatically

### Feature Flags

- [ ] **Needed?** No - direct migration with deprecation

---

## Primitives Design

> **Prime Directive**: Use primitives. VibeGrid IS the primitive for list views.

### Primitives Capability Audit

| Primitive | Applicable? | Usage | Gap? |
|-----------|-------------|-------|------|
| **DataForge** | Yes | Entity data for BidPackage, BidSubmission, COI | None |
| **VibeGrid** | Yes | List display, filtering, sorting, inline editing | None |
| **Relationships** | Yes | Bid Package → Vendors, COI → Project | None |

### Using Existing Primitives

| Primitive | Specific Usage |
|-----------|----------------|
| VibeGrid | `GCProjectEntityGrid` wrapper for all 3 pages |
| DataForge | Existing entity types: `BidMailBidPackage`, `BidMailBidPackageVendor`, `COIDocument` |
| TanStack Query | Existing query hooks for data fetching |

### Custom Code Decisions

> No custom code needed - pure primitive usage.

| Component | Why Custom? | Why Not Extend Primitive? |
|-----------|-------------|---------------------------|
| (None) | N/A | All functionality available in VibeGrid |

---

## Design

### Overview

This is a UI migration, not a new feature. Each page will be converted from its custom implementation to use the standard `GCProjectEntityGrid` or `VibeGrid` component. The data layer and API remain unchanged.

### Architecture

```
Current:
┌─────────────────┐
│ ProjectBids...  │ → Custom card list component
│ Page.tsx        │ → useBidMailBidPackages() query
└─────────────────┘

After Migration:
┌─────────────────┐
│ ProjectBids...  │ → VibeGridStoreProvider
│ Page.tsx        │ → VibeGrid (entityType="BidMailBidPackage")
└─────────────────┘   → Same query, wrapped by VibeGrid data layer
```

### Key Interfaces

```typescript
// Standard VibeGrid usage pattern (no new interfaces)
<VibeGridStoreProvider tableId={`project-${projectId}-bidpackages`} entityType="BidMailBidPackage">
  <VibeGrid
    tableId={tableId}
    entityType="BidMailBidPackage"
    height="100%"
    enableSelectionColumn={true}
    enableFiltering={true}
    enableSorting={true}
    enableInlineEditing={true}  // For Bid Submissions
  />
</VibeGridStoreProvider>
```

### Data Model Changes

| Table/Entity | Change | Notes |
|--------------|--------|-------|
| None | N/A | No data model changes - frontend only |

---

## Implementation

> **Note**: All 3 pages in a single phase since they're similar migrations.

### Phase 0: Baseline Verification (BLOCKING)

Before starting implementation, verify existing functionality works:

| Check | How to Verify |
|-------|---------------|
| Bid Packages page loads | Navigate to `/projects/[id]/bids`, see card list |
| Bid Submissions page loads | Click a package, see table with vendors |
| COI List page loads | Navigate to `/projects/[id]/compliance`, see COI tab |
| VibeGrid works on RFI page | Navigate to `/projects/[id]/rfis`, verify grid functions |
| No console errors | Open DevTools on each page |

**If any check fails**: STOP. File a bug. Fix baseline first.

---

### Phase 1: Bid Packages Page Migration

Tasks:
- Update `ProjectBidPackagesPage.tsx` to use VibeGrid
- Configure columns: name, trade, dueDate, reminderEnabled, codeCount, vendorCount
- Add badge cell renderers for reminder status
- Preserve click-through to package detail
- Mark old component code as deprecated (keep for reference)

Verification:
- Navigate to `/projects/[id]/bids`
- Verify all columns display correctly
- Verify filtering and sorting work
- Verify clicking row navigates to detail
- Compare side-by-side with old implementation

---

### Phase 2: Bid Submissions Page Migration

Tasks:
- Update `ProjectBidPackageSubmissionsPage.tsx` to use VibeGrid
- Configure columns: vendor, contact, responseStatus, dueDate, submittedAt, baseAmount, documentsCount
- Enable inline editing for baseAmount (bid entry)
- Configure default sort: responseStatus DESC, submittedAt ASC
- Add status badge cell renderer
- Add currency formatter for baseAmount
- Mark old component code as deprecated

Verification:
- Navigate to a bid package's submissions
- Verify all columns display correctly
- Verify inline editing works for bid entry
- Verify grouping shows status counts
- Verify default sort order matches current behavior
- Verify currency formatting correct

---

### Phase 3: COI List Page Migration

Tasks:
- Update `COIList.tsx` to use VibeGrid (or create new component in same folder)
- Configure columns: insured_name, status, compliance, gl_each_occurrence, gl_expiration_date
- Add column filters (replace external filter bar)
- Add status and compliance badge cell renderers
- Add currency formatter for GL limit
- Mark old component code as deprecated

Verification:
- Navigate to `/projects/[id]/compliance` COI tab
- Verify all columns display correctly
- Verify column filters work for status and compliance
- Verify search works (filter on insured_name)
- Verify clicking row opens detail view

---

### Phase 4: Cleanup & Polish

Tasks:
- Remove deprecated markers or add JSDoc deprecation comments
- Update any tests that reference old components
- Verify no TypeScript errors (`pnpm typecheck`)
- Verify no lint errors (`pnpm lint`)

Verification:
- `pnpm typecheck` passes
- `pnpm lint` passes
- All 3 pages work correctly
- No console errors on any page

---

### Implementation Summary

| Phase | Focus | Key Verification |
|-------|-------|------------------|
| P0 | Baseline | All pages load, VibeGrid works |
| P1 | Bid Packages | Grid displays packages with badges |
| P2 | Bid Submissions | Inline editing, grouping, sorting |
| P3 | COI List | Column filters, status badges |
| P4 | Cleanup | Typecheck, lint, no errors |

---

## Testing

### Unit Tests

- [ ] Column configuration tests for each entity type
- [ ] Cell renderer tests (badges, currency)

### Integration Tests

- [ ] VibeGrid renders with correct data
- [ ] Filtering produces correct results
- [ ] Inline editing persists data

### E2E Tests

- [ ] Navigate to each page, verify grid renders
- [ ] Filter by status, verify results
- [ ] Edit a bid amount, verify persisted

### Manual Testing

- [ ] Test on each page as admin
- [ ] Test column persistence (refresh, columns stay)
- [ ] Compare UX to old implementation

---

## Rollout

### Feature Flag

Not using feature flag - direct migration with deprecated old code kept for emergency rollback.

### Rollback

1. Revert to old component by un-deprecating and swapping imports
2. No data migration needed - frontend only change
3. Old code preserved in repo for 1-2 releases

---

## Decision Log

### Decision 1: Defer Lien Waivers to Phase 2
**Date**: 2026-01-11
**Chose**: Defer
**Over**: Include in this migration
**Reason**: Complex dashboard layout with sidebar, status cards, and collection progress needs separate design work

### Decision 2: Use Inline Editing for Bid Entry
**Date**: 2026-01-11
**Chose**: Inline editing
**Over**: Modal dialog, row actions
**Reason**: Leverages VibeGrid's built-in editing capability, faster UX for entering multiple bids

### Decision 3: Convert COI to Table (Not Cards)
**Date**: 2026-01-11
**Chose**: Standard VibeGrid table
**Over**: Keep card layout, hybrid approach
**Reason**: Consistency across all GC entity pages outweighs visual document preview benefits

### Decision 4: Keep Components in Feature Folders
**Date**: 2026-01-11
**Chose**: Update in place
**Over**: Move to gc-entities/, route-only files
**Reason**: Minimal file moves, easier to review changes

---

## Related Work

- [Issue #1076](https://github.com/baseplane-ai/baseplane/issues/1076) - GitHub tracking issue
- Lien Waivers migration - Phase 2 (separate issue needed)
