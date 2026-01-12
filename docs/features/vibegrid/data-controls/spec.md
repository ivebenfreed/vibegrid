# Data Controls
{description}

## Overview
- **Domain:** vibegrid
- **Status:** draft
- **Related Issues:** [list any GH# references found]

## Behaviors
[B1-B10...]

## Notes
[Any additional context]'

[gemini-3-flash-preview]
YOLO mode is enabled. All tool calls will be automatically approved.
Loaded cached credentials.
I will search for "vibegrid" and terms related to data controls like "filter", "group", "preset", and "aggregation" in the `apps/`, `packages/`, and `planning/` directories to understand the current implementation and design.
I will read the `VisualStateStore.ts` and `GroupProcessor.ts` files to understand the implementation of filtering and grouping, and search for "presets" and "view" within the `apps/web/src/systems/vibegrid/` directory to identify how they are handled.
I will read the `InteractionStore.ts` file to understand the triggering of presets and then proceed to draft the "Data Controls" documentation based on my findings.
# Data Controls
Data Controls in VibeGrid provide powerful ways to slice, dice, and view data through multi-level filtering, hierarchical grouping, and persistent presets. These controls are managed primarily through the `VisualStateStore` for grid configuration and `InteractionStore` for UI state, with `GroupProcessor` handling the client-side data transformation.

## Overview
- **Domain:** vibegrid
- **Status:** draft
- **Related Issues:** GH#187, GH#216, GH#247, GH#248, GH#394, GH#415, GH#466

## Behaviors

### B1: Simple Column Filtering
- **Trigger:** User clicks on a column header's filter icon and enters a value/selects an option.
- **Expected:** `VisualStateStore.setFilter` is called, adding the condition to `filters`. `TableCoreStore` is notified to re-render the grid with the filtered subset.
- **Verify:** Grid rows update to show only items matching the column criteria. Filter icon in header indicates active state.
- **Source:** `VisualStateStore.ts` -> `setFilter()`

### B2: Advanced Multi-Level Filtering (Filter Builder)
- **Trigger:** User opens the "Filter Builder" UI and constructs a nested logical group (e.g., `(Status = "Active" AND Priority = "High") OR (Due Date < Today)`).
- **Expected:** `VisualStateStore.applyFilterGroup` is called with a structured `FilterGroup` object.
- **Verify:** Grid displays rows matching the complex logical expression. `activeFilterCount` correctly reflects the total number of conditions.
- **Source:** `VisualStateStore.ts` -> `applyFilterGroup()`

### B3: Single Field Grouping
- **Trigger:** User selects "Group by [Field]" from the column menu or Group Config menu.
- **Expected:** `VisualStateStore.setGroupConfig` is called with the field ID. `GroupProcessor.processData` generates group header virtual rows.
- **Verify:** Grid rows are organized under collapsible group headers showing the field value.
- **Source:** `GroupProcessor.ts` -> `buildSingleLevelGroups()`

### B4: Multi-Level Hierarchical Grouping
- **Trigger:** User adds multiple fields to the grouping configuration (e.g., Group by Project, then by Status).
- **Expected:** `VisualStateStore.setGroupConfig` receives an array of `fields`. `GroupProcessor` builds a recursive tree structure.
- **Verify:** Grid displays nested group headers (Level 0, Level 1, etc.) with proper indentation.
- **Source:** `GroupProcessor.ts` -> `buildMultiLevelGroups()`

### B5: Relationship Field Grouping (Name Resolution)
- **Trigger:** User groups by a relationship field (e.g., `assigned_to_user_id`).
- **Expected:** `GroupProcessor` identifies the relationship type and uses `relationshipNameResolver` to display the entity name (e.g., "John Doe") instead of the UUID in the group header.
- **Verify:** Group headers show human-readable names. Null relationships show as "(No [Entity])".
- **Source:** `GroupProcessor.ts` -> `formatGroupValue()`

### B6: Group Expansion/Collapse
- **Trigger:** User clicks the chevron icon on a group header row.
- **Expected:** `VisualStateStore.toggleGroupExpansion` updates the `expandedGroups` Set. `GroupProcessor.flattenGroupTree` includes or excludes child rows based on this state.
- **Verify:** Sub-rows or sub-groups appear/disappear immediately. Expansion state is preserved during re-renders.
- **Source:** `VisualStateStore.ts` -> `toggleGroupExpansion()`

### B7: Global Group Expansion Control
- **Trigger:** User clicks "Expand All" or "Collapse All" in the grid toolbar.
- **Expected:** `VisualStateStore.expandAllGroups` (passing all known group IDs) or `collapseAllGroups` (clearing the set) is executed.
- **Verify:** All groups in the grid transition to the target state simultaneously.
- **Source:** `VisualStateStore.ts` -> `expandAllGroups()`, `collapseAllGroups()`

### B8: Group Aggregations (Rollups)
- **Trigger:** Grouping is active and `aggregations` are defined in `GroupConfig` (e.g., sum of "Total Cost").
- **Expected:** `GroupProcessor.calculateAggregations` runs for each node, calculating `sum`, `avg`, `min`, `max`, `count`, or `unique` values.
- **Verify:** Group headers display the calculated aggregate values next to the group name (e.g., "Project Alpha (Sum: $5,000)").
- **Source:** `GroupProcessor.ts` -> `calculateAggregations()`

### B9: Creating and Saving Filter Presets
- **Trigger:** User configures a complex filter and clicks "Save Preset" in the Filter Builder, providing a name.
- **Expected:** `InteractionStore.savePreset` creates a `FilterPreset` and stores it in `localStorage` via `utils/filter-storage.ts`.
- **Verify:** The new preset appears in the "Saved Views" or "Presets" list.
- **Source:** `InteractionStore.ts` -> `savePreset()`

### B10: Loading and Applying Presets
- **Trigger:** User selects a saved preset from the list.
- **Expected:** `InteractionStore.loadPreset` updates the draft filter, then `applyFilterGroup` is called to update the grid state.
- **Verify:** Grid immediately updates its filters and sorting to match the saved preset configuration.
- **Source:** `InteractionStore.ts` -> `loadPreset()`

## Notes
- **Performance:** `GroupProcessor` runs on the client. For very large datasets, grouping and aggregation are optimized via virtual row generation to ensure 60fps scrolling even with thousands of groups.
- **Persistence:** All data controls (filters, sorts, grouping) are persisted to `localStorage` keyed by `orgId` and `entityType`, ensuring the user's view remains consistent across sessions.
- **Selection Safety:** Changing grouping or sorting automatically clears cell selections to prevent "phantom" selections when row indices change drastically.
