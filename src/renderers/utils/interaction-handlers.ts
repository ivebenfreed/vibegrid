// ====================================
// INTERACTION HANDLERS UTILITIES - DEPRECATED
// ====================================
//
// P3 Consolidation: All handlers in this file have been superseded by:
// - Column drag: MouseController handles via global mouse events
// - Column resize: MouseController -> InteractionStore.startColumnResize/updateColumnResize/endColumnResize
// - Row selection: MouseController -> InteractionCoordinator
// - Cell editing: MouseController -> InteractionCoordinator -> CellActionRouter
// - Keyboard: KeyboardController
// - Context menu: MouseController
// - Row drag: DragDropManager (drag-drop-handlers.ts)
//
// This file is intentionally empty. It was preserved (instead of deleted) to avoid
// breaking any indirect references or barrel exports. If you find an import pointing
// here, migrate to the appropriate controller above.
