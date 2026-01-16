# VibeGrid Overhaul Analysis (MobX)

Date: 2026-01-XX
Scope: apps/web/src/systems/vibegrid (current MobX implementation) + ag-Grid source review
Goal: make VibeGrid the singular, extensible data display component with customizable display and layout.

## Executive Summary
VibeGrid already has many advanced behaviors wired (selection, inline editing, clipboard, fill handle, column resize/drag). The current flakiness stems less from missing features and more from competing sources of truth, overlapping lifecycle gates, and duplicated interaction/render pipelines. A big-bang overhaul should consolidate runtime state, formalize extension points (cell types as extensions), and enforce a single rendering/geometry pipeline.

## Current Architecture Map

### Entry + Store Wiring
- VibeGrid entry: apps/web/src/systems/vibegrid/VibeGrid.tsx
- Store provider: apps/web/src/systems/vibegrid/stores/context.tsx
- Init coordinator: apps/web/src/systems/vibegrid/stores/InitStore.ts

### Data Pipeline
- Data hook: apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts
- Data store: apps/web/src/systems/vibegrid/stores/TableCoreStore.ts
  - change classification: apps/web/src/systems/vibegrid/utils/change-classification.ts
  - update routing: apps/web/src/systems/vibegrid/utils/update-router.ts

### Layout + Geometry
- Visual state: apps/web/src/systems/vibegrid/stores/VisualStateStore.ts
- Virtual viewport store (newer): apps/web/src/systems/vibegrid/stores/VirtualViewportStore.ts
- Virtual scroll manager (deprecated but still used): apps/web/src/systems/vibegrid/virtualization/VirtualScrollManager.ts
- DOM position tracking: apps/web/src/systems/vibegrid/stores/dom-position-state.ts

### Rendering + Interaction
- DOM renderer: apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
- Header rendering: apps/web/src/systems/vibegrid/renderers/components/HeaderRenderer.ts
- Body rendering: apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts
- Mouse coordination: apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts
- Keyboard: apps/web/src/systems/vibegrid/renderers/modules/KeyboardController.ts
- Interaction coordination: apps/web/src/systems/vibegrid/coordination/InteractionCoordinator.ts
- Action routing: apps/web/src/systems/vibegrid/routing/CellActionRouter.ts
- Overlays: apps/web/src/systems/vibegrid/renderers/modules/OverlayManager.ts

### Cell Types (Extension Surface Today)
- Registry: apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts
- Bridge: apps/web/src/systems/vibegrid/field-types/ModularCellBridge.ts
- Lazy initialization: apps/web/src/systems/vibegrid/field-types/index.ts

## Feature Status (Updated)

### Works / Wired (Observed in code)
- Column resize: HeaderRenderer + MouseController + InteractionStore + VisualStateStore
- Column reorder (drag): MouseController -> VisualStateStore.reorderColumns
- Selection + fill handle overlay: SelectionOverlayController -> CanvasOverlayDOM -> FillHandleLayerDOM
- Clipboard indicators: ClipboardOverlayController + CanvasOverlayDOM
- Clipboard copy/paste with type-aware validation: managers/ClipboardManager.ts
- Cell editing + editors: EditingStore + EditingOverlay + cell type registry
- Sorting + filtering: VisualStateStore + TableCoreStore

### Partial / Risk Areas
- Row drag reorder: MouseController hooks exist, but DragDropManager callbacks in SimplePassiveRenderer are TODO
  - DragDropManager is instantiated but callbacks return true without updating TableCoreStore
- Redundant resize handling: both HeaderRenderer and MouseController attach resize behavior
  - Two independent resize flows can fight or double-update state
- Column drag preview: MouseController creates a floating preview; OverlayManager also has ColumnDragOverlayDOM
  - Two drag-UX paths increase drift risk

## Primary Flakiness Sources (Root Causes)

### 1) Competing Geometry/Virtualization State
- VisualStateStore geometry and VirtualViewportStore both track scroll/viewport
- VirtualScrollManager is deprecated but still used in SimplePassiveRenderer
- dom-position-state recomputes positions separately from coordinate manager
Result: overlays and selection can desync from rendered DOM under scroll/resize.

### 2) Multi-Stage Initialization and Reactive Gates
- InitStore manages a dense readiness graph
- VibeGrid.tsx also uses autorun + useEffect to create renderer and baseline snapshots
- Renderers also delay observers until after paint
Result: updates can race with DOM readiness, causing intermittent missing render or stale mapping.

### 3) Duplicate Event/State Pipelines
- Resize and drag events are handled in multiple places (HeaderRenderer, MouseController, OverlayManager)
- Some features still use legacy managers (VirtualScrollManager) while others use MobX stores
Result: nondeterministic ordering, hidden coupling, and hard-to-debug behavior.

### 4) Legacy API Surface Still Exported
- index.ts still exports legacy pure-observables entrypoints
- pure-observables.ts throws at runtime if used
Result: accidental usage can crash or mislead developers about current architecture.

## ag-Grid Patterns Worth Adopting (Source References)
- Module registry with dependency + grid scoping: ag-grid-community/src/modules/moduleRegistry.ts
  https://raw.githubusercontent.com/ag-grid/ag-grid/latest/packages/ag-grid-community/src/modules/moduleRegistry.ts
- Grid bootstrap with DI beans + API registration: ag-grid-community/src/grid.ts
  https://raw.githubusercontent.com/ag-grid/ag-grid/latest/packages/ag-grid-community/src/grid.ts
- User component registry + selectors: ag-grid-community/src/components/framework/registry.ts
  https://raw.githubusercontent.com/ag-grid/ag-grid/latest/packages/ag-grid-community/src/components/framework/registry.ts
- User component factory: ag-grid-community/src/components/framework/userComponentFactory.ts
  https://raw.githubusercontent.com/ag-grid/ag-grid/latest/packages/ag-grid-community/src/components/framework/userComponentFactory.ts
- Row model interface: ag-grid-community/src/interfaces/iRowModel.ts
  https://raw.githubusercontent.com/ag-grid/ag-grid/latest/packages/ag-grid-community/src/interfaces/iRowModel.ts
- Central config service: ag-grid-community/src/gridOptionsService.ts
  https://raw.githubusercontent.com/ag-grid/ag-grid/latest/packages/ag-grid-community/src/gridOptionsService.ts

## Proposed Big-Bang Core Runtime (MobX)

### Core Runtime Responsibilities
- Single source of truth for geometry + virtualization (no duplicate state)
- Single render pipeline (layout -> DOM -> overlays)
- Central event routing (mouse/keyboard/gesture)
- Stable API surface (grid API style) for integration
- Module registry for optional capabilities

### Suggested Core Runtime Stores
1) DataModelStore (replaces TableCoreStore responsibilities + row model plugins)
2) LayoutModelStore (replaces VisualStateStore + virtualization)
3) InteractionModelStore (selection, editing, clipboard, drag, resize)
4) RenderingRuntime (scheduler + DOM renderer + overlay renderer)

### Row Model Abstraction (AG-style)
Define a RowModel interface that exposes:
- getRowCount, getRowByIndex, getRowById
- getRowBounds, getRowIndexAtPixel
- applySort, applyFilter, applyGroup (or pass in strategies)
This allows multiple layouts (table, gantt, kanban) to share a single DataModelStore.

### Module Registry (AG-style)
- Core module: Table + selection + editing + clipboard
- Optional modules: Gantt, Kanban, Hierarchy, Export
- Module contract: { services, store augmentations, render slots, API extensions }

### Slot Registry (Component Resolution)
Define component slots with selectors (AG Grid pattern):
- CellRenderer, CellEditor, HeaderRenderer, FilterRenderer, OverlayRenderer
Slots are resolved based on column metadata and runtime context.

## Cell Types: Core vs Extension

Recommendation:
- Cell type contract and registry belong to Core Runtime.
- Built-in cell types ship as a Core Module.
- All additional cell types register via module registry.

Reasoning:
- Core runtime needs stable semantics for editing, validation, and navigation.
- Extensions should not rewrite the core pipeline; they should plug into it.

## Big-Bang Implementation Outline

### Phase A: Core Runtime Extraction
- Define runtime interfaces: DataModel, LayoutModel, InteractionModel, Renderer
- Move all geometry + virtualization into LayoutModelStore
- Deprecate VirtualScrollManager and dom-position-state

### Phase B: Module Registry
- Implement ModuleRegistry with dependency resolution
- Convert Gantt/Kanban into modules (shared DataModel + LayoutModel)

### Phase C: Slot Registry
- Unify FieldTypeRegistry and renderer/editor resolution via slots
- Remove ModularCellBridge global dependency

### Phase D: Cleanup
- Remove legacy exports in index.ts
- Remove unused or duplicate managers
- Replace duplicated resize/drag flows with a single pipeline

## Immediate Risks to Address (Even Before Big Bang)
- Remove VirtualScrollManager usage in SimplePassiveRenderer
- Remove redundant resize handler (choose MouseController or HeaderRenderer, not both)
- Wire DragDropManager callbacks to TableCoreStore moveRow* methods
- Decide a single column drag preview path (overlay or floating DOM)

## Output Artifacts Needed for Overhaul Branch
- Runtime spec (interfaces + store graph)
- Module registry spec
- Slot registry spec (cell type contract)
- Migration plan for VibeGrid usage sites

