---
domain: vibegrid
owner: ben@baseplane.ai
status: active
last_updated: 2025-11-30
size_warning: false
---

# Vibegrid Domain

High-performance, collaborative data grid for 100K+ rows with real-time editing, keyboard navigation, and zero jank.

## Principles

- **MobX strict mode**: All state changes in `@action` methods with `enforceActions: 'always'`
- **Observer pattern**: Components wrapped with `observer()` for granular reactivity
- **Performance first**: <16ms frame time for 60fps, <5ms per cell update
- **Keyboard-native**: Every action accessible via keyboard shortcuts
- **Collaborative by default**: Real-time sync with Yjs CRDTs

## Patterns

### Pattern: MobX Store Setup
**Use when**: Creating any new MobX store
**Code**:
```typescript
class MyStore implements IStore {
  @observable state = {}

  constructor() {
    makeObservable(this)
  }

  @action updateState() {
    this.state = newState
  }

  @computed get derivedValue() {
    return this.state.computed
  }
}
```
**Gotchas**: MUST call `makeObservable(this)` in constructor; forget this and reactivity breaks silently
**Reference**: [vibegrid-complexity-refactor](../projects/vibegrid-complexity-refactor/)

### Pattern: Observer Component
**Use when**: Any component that reads MobX state
**Code**:
```typescript
export const MyComponent = observer(() => {
  const store = useStore()
  return <div>{store.state}</div>
})
```
**Gotchas**: Observer wraps entire component; inner components won't react without their own observer
**Reference**: Vibegrid codebase

### Pattern: EditingStore Pattern
**Use when**: Managing editing state (active cell, edit mode, value)
**Code**:
```typescript
@action startEditing(rowId: string, colId: string) {
  this.activeCell = { rowId, colId }
  this.editMode = true
  this.editValue = this.getCellValue(rowId, colId)
}
```
**Gotchas**: Clear state on commit/cancel; handle Escape/Enter consistently
**Reference**: [keyboard-editing-refactor](../projects/keyboard-editing-vibegrid-refactor/)

### Pattern: Granular Cell Updates
**Use when**: Single-cell edits that shouldn't re-render entire grid
**Code**:
```typescript
@action updateCell(rowId: string, colId: string, value: any) {
  // Update specific cell without triggering full grid re-render
  this.cellData.set(`${rowId}-${colId}`, value)
}
```
**Gotchas**: Previous attempt failed due to MobX timing; use version-based routing
**Reference**: [granular-update-optimization](../projects/vibegrid-granular-update-optimization/)

## Decisions

### Decision: MobX over Redux (2025-09)
**Context**: Needed reactive state management for complex grid
**Decision**: MobX strict mode with enforceActions: 'always'
**Consequences**:
- ✅ Simpler mental model (mutate in actions)
- ✅ Granular reactivity with observers
- ❌ Easy to forget `makeObservable(this)`
- ❌ Strict mode can be limiting
**Status**: active

### Decision: Yjs for Collaboration (2025-10)
**Context**: Real-time collaborative editing required CRDT
**Decision**: Yjs with custom sync protocol
**Consequences**:
- ✅ Proven CRDT algorithm
- ✅ Strong ecosystem
- ❌ Large bundle size (~50kb)
**Status**: active

### Decision: React 19 + Virtual Scrolling (2025-11)
**Context**: Need to render 100K+ rows efficiently
**Decision**: Deferred - current grid handles ~10K rows; virtual scrolling for Q2
**Consequences**:
- ✅ Avoids premature optimization
- ❌ 100K row target pushed to Q2
**Status**: deferred

## Explore

### Canvas Rendering Layer (2025-11-30)
**Saw**: Linear's grid uses Canvas for frozen columns/headers
**Idea**: Hybrid React + Canvas rendering for 100K+ rows
**Potential fit**: Vibegrid 2.0 rewrite in Q2
**Next**: Prototype frozen columns with Canvas
**Source**: Linear's engineering blog

### Notion's Selection Model (2025-11-30)
**Saw**: Notion handles multi-cell selection with keyboard
**Idea**: Range selection with Shift+Arrow keys
**Potential fit**: Vibegrid keyboard improvements
**Next**: Design selection state management
**Source**: Notion app behavior

## Related

- Roadmap: [mvp.md](../roadmap/mvp.md#vibegrid-domain)
- Projects: [keyboard-editing-refactor](../projects/keyboard-editing-vibegrid-refactor/), [complexity-refactor](../projects/vibegrid-complexity-refactor/), [granular-updates](../projects/vibegrid-granular-update-optimization/)
