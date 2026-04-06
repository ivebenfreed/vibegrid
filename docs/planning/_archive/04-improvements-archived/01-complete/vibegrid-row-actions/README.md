---
initiative: vibegrid-row-actions
type: improvement
status: complete
owner: platform-engineering
priority: high
blocks: platform-admin-dashboard
updated: 2025-12-13
completed: 2025-12-13
---

# Vibegrid Row Actions & Detail Panel

**Type**: Improvement (Vibegrid system enhancement)
**Status**: Complete
**Priority**: High (blocks Platform Admin Dashboard)
**Effort**: 1-2 days
**Risk**: Low (UI-only, reuses existing patterns)

---

## Executive Summary

### The Problem

Vibegrid has excellent inline editing but **no row-level actions**. Every table needs:

- ❌ Delete button per row (with confirmation)
- ❌ Custom actions menu (impersonate, duplicate, export)
- ❌ Detail panel on row click (currently navigates away)
- ❌ Action callbacks (onDelete, onCustomAction)

**Current Workaround**: Build custom UI outside Vibegrid for each table
- Inconsistent UX across platform
- Duplicate code per feature
- Breaks Vibegrid's self-contained design

**Blocker**: Platform Admin Dashboard needs delete and impersonate actions immediately.

### The Solution

Add **floating actions menu** and **detail sidepanel** to Vibegrid as reusable components:

**Feature 1: Floating Actions Menu** (1 day)
- Portal-based dropdown menu (shadcn DropdownMenu + Portal)
- Appears on row hover or three-dots button
- Configurable actions: `actions={[{ id, label, icon, onClick, destructive }]}`
- Built-in delete confirmation dialog
- Example: Delete, Impersonate, View Details, Export

**Feature 2: Detail Sidepanel** (1 day)
- Opens on row click via Portal (shadcn Sheet/SideCard)
- Configurable: `renderDetailPanel={(rowData) => <YourComponent />}`
- Optional (can disable to use navigation instead)
- Default view: Formatted display of all row data
- Close on ESC or outside click

### ROI & Benefits

| Metric | Current | After |
|--------|---------|-------|
| Code per table | 50-100 lines custom actions | 5-10 lines config |
| UX consistency | Varies by feature | Uniform across platform |
| Delete safety | Sometimes missing | Always has confirmation |
| Developer time | 2-4 hours per table | 15 minutes config |

**Unblocks**: Platform Admin Dashboard Phase 1 Day 2

### Success Criteria

**Floating Actions:**
- ✅ Actions menu shows on row hover
- ✅ Configurable actions array
- ✅ Delete with built-in confirmation
- ✅ Custom action callbacks
- ✅ Portal-based (no z-index conflicts)

**Detail Sidepanel:**
- ✅ Row click opens sidepanel (optional)
- ✅ Uses existing SideCard/Sheet
- ✅ Render prop for custom content
- ✅ Can disable for navigation mode
- ✅ Keyboard navigation (ESC to close)

**Integration:**
- ✅ Backwards compatible (opt-in)
- ✅ Works with selection, sorting, filtering
- ✅ No performance regression

---

## Documentation

**1. DESIGN.md** - Component API and integration points

**2. IMPLEMENTATION.md** - Build phases and testing

**3. AGENT_NOTES.md** - Discoveries and gotchas

---

## Related Work

- **Blocks**: [Platform Admin Dashboard](../../03-projects/platform-admin-dashboard/) (needs delete + impersonate)
- **Uses**: shadcn/ui DropdownMenu, Sheet, Portal
- **Uses**: SideCard pattern (`src/shared/components/`)
- **Domain**: [Vibegrid](../../01-domains/vibegrid.md)

---

**Template Version**: 2.0
