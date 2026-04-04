---
primitive: vibegrid
status: active
relatedRules:
  - vibegrid
  - vibegrid-interactions
  - access-control
---
# Cross-Cutting

Permission enforcement, multi-tenant isolation, and edge case behaviors that span all VIbeGrid modules.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#187

## Behaviors

### Permissions

### B1: Viewer role sees grid but cannot edit
- **ID:** viewer-read-only
- **Trigger:** User with `viewer` role navigates to an entity list page
- **Expected:** Grid renders with data. No edit affordances on cells (`data-affordance="none"` instead of `"edit"`). No "Create" or "Add" button visible. Row checkboxes may be hidden or disabled. Bulk action bar does not appear.
- **Verify:** Grid visible with data rows, no `data-affordance="edit"` elements in DOM, no create button in toolbar
- **Source:** `stores/PermissionStore.ts`, `renderers/core/SimplePassiveRenderer.ts`

### B2: Admin role sees edit affordances
- **ID:** admin-edit-affordances
- **Trigger:** User with `admin` role navigates to same entity list page
- **Expected:** Grid renders with edit affordances on editable cells (`data-affordance="edit"`). "Create" button visible. Row checkboxes functional. Bulk actions available on selection.
- **Verify:** `data-affordance="edit"` present on editable cells, create button visible, selecting rows shows action bar

### B3: Member role can edit own records only
- **ID:** member-own-records
- **Trigger:** User with `member` role views entities, some created by them, some by others
- **Expected:** Grid renders all visible entities. Edit affordances only appear on records the user created or is assigned to. Other records show `data-affordance="none"`.
- **Verify:** Mixed affordances in grid — own records editable, others read-only

### Multi-Tenant Isolation

### B4: Cross-org data isolation
- **ID:** cross-org-isolation
- **Trigger:** User switches from Org A to Org B (or logs in as user from different org)
- **Expected:** Grid data completely replaces with Org B's entities. No Org A data visible. Schema/columns may differ per org. Entity counts match org-specific data.
- **Verify:** All visible rows belong to current org, row count matches org entity count (verify via API)

### B5: Org switch refreshes grid state
- **ID:** org-switch-refresh
- **Trigger:** User switches org via org picker while viewing an entity grid
- **Expected:** Grid reloads with new org data. Filters, sorts, and grouping reset (they are org-scoped in localStorage). Selection cleared.
- **Verify:** Grid shows new org data, previous filters/sorts not applied, no stale data flash

### Edge Cases

### B6: Empty entity type shows empty state
- **ID:** empty-entity-grid
- **Trigger:** User navigates to entity list for a type with zero records
- **Expected:** Empty state placeholder renders instead of empty grid. Shows message like "No items yet" with optional "Create" action if user has permissions.
- **Verify:** Empty state component visible, no grid headers/rows rendered, create action available for permitted users

### B7: Large dataset uses virtual scrolling
- **ID:** large-dataset-virtualization
- **Trigger:** Grid loads with 1000+ rows
- **Expected:** DOM contains only ~30-50 row elements regardless of total count. Scrolling recycles row elements. `aria-rowcount` reflects true total. Performance remains smooth (60fps scroll).
- **Verify:** DOM row count << total row count, `aria-rowcount` matches total, scrollbar size indicates full dataset

### B8: Grid recovers from API error
- **ID:** api-error-recovery
- **Trigger:** API call for entity data fails (500, timeout, network error)
- **Expected:** Error state renders with retry option. No blank grid with no explanation. Error is logged.
- **Verify:** Error message visible, retry button present, clicking retry re-fetches data

### B9: Schema change reflects in grid
- **ID:** schema-change-reflection
- **Trigger:** Admin adds/removes/renames a field in entity schema while another user has the grid open
- **Expected:** On next data refresh or page reload, grid columns update to reflect schema changes. No stale column references.
- **Verify:** New column appears, removed column gone, renamed column shows new name

## Notes

- Permission checks happen at two levels: API (server enforces access control) and UI (grid hides/disables affordances)
- Multi-tenant isolation is enforced by the gateway's org context header — grid never sees cross-org data
- Empty state component is shared across all entity types
- Virtual scrolling threshold is configurable but defaults to always-on
