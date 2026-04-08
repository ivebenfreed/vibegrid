---
issue: 1255
type: feature
title: VibeGrid Core Runtime Overhaul
status: draft
created: 2026-01-16
updated: 2026-01-16
template: frontend-only
---

# Feature Planning: VibeGrid Core Runtime Overhaul

> GitHub Issue: [#1255](https://github.com/baseplane-ai/baseplane/issues/1255)

## Research Context (Optional)

### Related Research

| Research Issue | Title | How It Informs This Feature |
|----------------|-------|----------------------------|
| N/A | apps/web/src/systems/vibegrid/VIBEGRID_OVERHAUL_ANALYSIS.md | Core runtime scope, risk areas, and AG Grid patterns to adopt |

### Key Findings Applied

1. **Finding:** Geometry/virtualization state is duplicated across VisualStateStore, VirtualViewportStore, VirtualScrollManager, and dom-position-state.
   **Impact on spec:** Core runtime must own a single geometry source and retire deprecated global virtualization.

2. **Finding:** Interaction/overlay pipelines overlap (resize/drag flows in HeaderRenderer + MouseController + OverlayManager).
   **Impact on spec:** Consolidate to a single event pipeline and runtime scheduler to prevent races.

3. **Finding:** Cell types are already modular but initialization is async/global.
   **Impact on spec:** Cell type contract and registry become core runtime surface; built-ins ship as default module.

### Unresolved Questions from Research

| Question | How Addressed in Spec |
|----------|------------------------|
| Should Gantt/Kanban become full modules or remain as view modes in VibeGrid.tsx? | Convert to modules with shared runtime (Phase 2) |
| Should we keep dom-position-state after coordinate manager consolidation? | Remove or reduce to adapter (Phase 1) |

---

## 0. Feature Context

**GitHub Issue:** #1255

**Acceptance Criteria:**
1. Single core runtime owns geometry + virtualization; VirtualScrollManager is removed from runtime path.
2. Single event pipeline for mouse/keyboard interactions (no duplicate resize/drag handlers).
3. Module registry and slot registry exist; cell type registry is owned by core runtime and built-in cell types register via a module.
4. Existing VibeGrid usage continues to render with current features (selection/edit/clipboard/fill/drag) intact.
5. Legacy exports from `apps/web/src/systems/vibegrid/index.ts` are removed or replaced with runtime API surface.

**Related Features:**
- apps/web/src/features/entities/components/EntityListView.tsx
- apps/web/src/features/admin/pages/UsersPage.tsx
- apps/web/src/features/email-inbox/components/ThreadListGrid.tsx
- apps/web/src/app/routes/_authenticated/debug/vibegrid.tsx
- apps/web/src/app/routes/_authenticated/debug/vibegrid-test/basic.tsx

**Existing API Endpoints Used:**
| Endpoint | Purpose | Response Type |
|----------|---------|---------------|
| TanStack DB collections | Grid row data | Entity rows from TanStack DB |

---

## 0.5 BASELINE VERIFICATION (BLOCKING)

### Pre-Implementation Checks

| Check | How to Verify | Expected Result | Status |
|-------|---------------|-----------------|--------|
| VibeGrid debug page loads | Navigate to /debug/vibegrid | Grid renders, no console errors | [ ] |
| Basic grid interactions | /debug/vibegrid-test/basic | Selection + edit + scroll work | [ ] |
| Column resize/reorder | Drag header resize + reorder | Width/order updates live | [ ] |
| Clipboard + fill handle | Copy/paste + drag fill handle | Overlays show; fill writes | [ ] |
| Gantt view | /debug/gantt | Split pane + bars render | [ ] |

### Baseline Verification Task (auto-created in Beads)
```bash
BASELINE=$(bd create --title="GH#1255: VERIFY baseline works before implementing" --type=task --priority=0 --labels=testing --silent)
```

---

## 1. Backend / API

**N/A** - Frontend-only refactor; uses existing TanStack DB data sources.

---

## 2. Frontend / UI

### 2.1 Similar Feature Analysis

**Most similar existing feature:**
- apps/web/src/systems/vibegrid (current runtime)

**Component patterns to follow:**
- Renderer pipeline: apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
- Interaction routing: apps/web/src/systems/vibegrid/coordination/InteractionCoordinator.ts
- Overlays: apps/web/src/systems/vibegrid/renderers/modules/OverlayManager.ts

### 2.2 New Files (Core Runtime)

| File Path | Purpose | Based On |
|-----------|---------|----------|
| apps/web/src/systems/vibegrid/runtime/CoreRuntime.ts | Runtime orchestrator (stores + renderer + scheduler) | SimplePassiveRenderer.ts |
| apps/web/src/systems/vibegrid/runtime/ModuleRegistry.ts | Module registry + dependency validation | ag-grid moduleRegistry.ts |
| apps/web/src/systems/vibegrid/runtime/SlotRegistry.ts | Renderer/editor/overlay slot resolution | FieldTypeRegistry.ts |
| apps/web/src/systems/vibegrid/runtime/models/DataModel.ts | Row model interface + data transforms | TableCoreStore.ts |
| apps/web/src/systems/vibegrid/runtime/models/LayoutModel.ts | Geometry + virtualization | VisualStateStore.ts |
| apps/web/src/systems/vibegrid/runtime/models/InteractionModel.ts | Selection/edit/clipboard/drag | InteractionStore.ts |
| apps/web/src/systems/vibegrid/runtime/renderers/RuntimeRenderer.ts | Render scheduler | SimplePassiveRenderer.ts |

### 2.3 Store Design (MobX)

**Primary store files to consolidate:**
- apps/web/src/systems/vibegrid/stores/TableCoreStore.ts
- apps/web/src/systems/vibegrid/stores/VisualStateStore.ts
- apps/web/src/systems/vibegrid/stores/InteractionStore.ts
- apps/web/src/systems/vibegrid/stores/VirtualViewportStore.ts

**Retire or deprecate:**
- apps/web/src/systems/vibegrid/virtualization/VirtualScrollManager.ts
- apps/web/src/systems/vibegrid/stores/dom-position-state.ts

**Key Patterns:**
- Use `makeObservable(this)` in constructors
- Use `runInAction` for async changes
- Implement `IStore` interface (`init`, `dispose`, `reset`)

### 2.4 Rendering + Interaction Pipeline

**Single event pipeline:**
- apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts
- apps/web/src/systems/vibegrid/renderers/modules/KeyboardController.ts
- apps/web/src/systems/vibegrid/coordination/InteractionCoordinator.ts

**Renderer consolidation targets:**
- apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
- apps/web/src/systems/vibegrid/renderers/components/HeaderRenderer.ts
- apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts
- apps/web/src/systems/vibegrid/renderers/modules/OverlayManager.ts

### 2.5 Cell Types as Extensions

**Core contract + registry:**
- apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts

**Extension registration (default module):**
- apps/web/src/systems/vibegrid/field-types/implementations/**

**Remove runtime globals:**
- apps/web/src/systems/vibegrid/field-types/ModularCellBridge.ts (replace with runtime slot registry)

---

## 3. Database / DataForge

**N/A** - Uses existing entity collections (TanStack DB).

---

## 4. Security

**N/A** - No new endpoints.

---

## 5. Testing & Verification Gates

### Phase 1 Verification (Core runtime scaffolding)
- Grid renders in /debug/vibegrid
- No console errors during scroll + selection

### Phase 2 Verification (Module + slot registry)
- Built-in cell types render identically
- No runtime dependency on window globals

### Phase 3 Verification (Pipeline consolidation)
- Column resize/drag/selection stable
- Clipboard + fill handle overlays still show

### Final Verification
- /debug/vibegrid-test/basic passes manual smoke
- /debug/gantt renders and scroll syncs

---

## 6. Task Breakdown (for Beads)

1. Baseline verification task (blocking)
2. Define runtime interfaces + module registry
3. Consolidate geometry + virtualization
4. Port renderer pipeline to runtime scheduler
5. Move cell type registry into slot registry module
6. Remove deprecated globals + legacy exports
7. Regression verification (debug routes)

