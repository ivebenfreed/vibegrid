---
issue: 187
type: epic
title: VibeGrid - High-Performance Data Grid Component
status: active
created: 2025-12-17
updated: 2025-12-27
---

# VibeGrid - High-Performance Data Grid Component

> GitHub Issue: [#187](https://github.com/baseplane-ai/baseplane/issues/187)

## Overview

VibeGrid is Baseplane's high-performance, virtualized data grid component for rendering and editing large entity collections (10k+ rows) with smooth 60fps scrolling, real-time collaboration, and comprehensive keyboard navigation.

## Principles

- **MobX strict mode**: All state changes in `@action` methods with `enforceActions: 'always'`
- **Observer pattern**: Components wrapped with `observer()` for granular reactivity
- **Performance first**: <16ms frame time for 60fps, <5ms per cell update
- **Keyboard-native**: Every action accessible via keyboard shortcuts
- **Collaborative by default**: Real-time sync with Yjs CRDTs (future)

## Scope

**In scope:**
- Virtual scrolling with DOM recycling
- Loading skeleton and progressive hydration
- Performance optimization for large datasets (10k+ rows)
- Dark mode support
- Scroll performance monitoring
- Inline editing with optimistic updates
- Hierarchical data display (grouping, nesting, master-detail)
- Advanced filtering and views (Gantt, Tree)
- Real-time collaborative editing

**Out of scope:**
- Canvas rendering (deferred to VibeGrid 2.0)
- 100k+ row support without virtual scrolling optimization

## Success Criteria

- [ ] Virtual scrolling confirmed working with 10k+ rows
- [ ] Time-to-interactive < 2s for 10k rows
- [ ] Smooth 60fps scroll performance
- [ ] Loading skeleton matches table structure
- [ ] Dark mode fully supported
- [ ] All field types validated and working

## Features

| Issue | Title | Status | Priority |
|-------|-------|--------|----------|
| #394 | Hierarchical & Relational Data Display | Open | High |
| #242 | Y.js Real-time Sync Integration | Open | Medium |
| #244 | Unified Data Entry System (Grid UX for Forms) | Open | Medium |
| #240 | Field Type QA Testing | Open | High |
| #232 | Consolidate Text Field Types | Open | Low |

| #215 | Gantt View Polish & Enhancements | Open | Medium |
| #216 | Multi-Level Advanced Filtering | Open | Medium |

### Closed/Consolidated

| Issue | Title | Action | Reason |
|-------|-------|--------|--------|
| #247 | Relationship Field Grouping | Consolidated | → #394 Hierarchical Data Display |
| #248 | Self-Referential Grouping | Consolidated | → #394 Hierarchical Data Display |
| #249 | Master-Detail Nested Grids | Consolidated | → #394 Hierarchical Data Display |
| #217 | Tree Viewer | Consolidated | → #394 Hierarchical Data Display |

## Architecture

```
vibegrid/
├── components/         # React components
│   ├── VibeGrid.tsx   # Main entry point
│   ├── ActionsBar.tsx # Row actions
│   └── TreeSidebar.tsx
├── stores/            # MobX stores
│   ├── TableCoreStore.ts
│   ├── InteractionStore.ts
│   ├── EditingStore.ts
│   └── GanttViewStore.ts
├── processors/        # Data processing
│   ├── GroupProcessor.ts
│   └── HierarchyProcessor.ts
├── renderers/         # Row/cell renderers
├── field-types/       # Field type implementations
├── affordances/       # Click behavior system
└── utils/             # Helpers
```

## Key Decisions

### MobX over Redux (2025-09)
**Decision**: MobX strict mode with `enforceActions: 'always'`
**Rationale**: Simpler mental model, granular reactivity with observers
**Trade-offs**: Easy to forget `makeObservable(this)`

### Yjs for Collaboration (2025-10)
**Decision**: Yjs with custom sync protocol
**Rationale**: Proven CRDT algorithm, strong ecosystem
**Trade-offs**: Large bundle size (~50kb)
**Status**: Pending #212 (Realtime Sync Infrastructure)

### React 19 + Virtual Scrolling (2025-11)
**Decision**: Defer 100k+ row optimization to Q2
**Rationale**: Current grid handles ~10k rows adequately
**Status**: Deferred

## Dependencies

**Depends on:**
- None (foundational UI component)

**Blocks:**
- #180 GC Vertical UI - uses VibeGrid for entity lists
- All entity list views depend on VibeGrid

**Cross-Epic:**
- #212 (Infrastructure) - Required for #242 Y.js sync

## Related

- Platform component: `apps/web/src/systems/vibegrid/`
- Rules: `.claude/rules/vibegrid.md`, `.claude/rules/vibegrid-interactions.md`
- Archived domain doc: `planning/_archive/01-domains/vibegrid.md`

## Timeline

| Milestone | Target | Status |
|-----------|--------|--------|
| Field Type QA (#240) | Q1 2025 | In Progress |
| Hierarchical Data Display | Q1 2025 | Planning |
| Text Field Consolidation (#232) | Q1 2025 | Pending |
| Unified Data Entry (#244) | Q2 2025 | Pending |
| Y.js Sync (#242) | Q2 2025 | Blocked by #212 |

## Notes

### 2025-12-27 - Issue Consolidation
- Consolidated 4 hierarchical data issues (#247, #248, #249, #217) into single Feature
- Closed stub issues (#215, #216, #217) that had no content
- Updated this spec with actual feature list and architecture
- Planning docs referenced in old issues (`planning/03-projects/*`) did not exist
