/**
 * VibeGrid Renderers - Modular Table Rendering System
 *
 * Organized exports for all renderer modules and components
 */

// Cell Renderers - Type-specific cell rendering
export * from './cell-renderers'
export type { HeaderRendererOptions } from './components/HeaderRenderer'
// Specialized Components
export { HeaderRenderer } from './components/HeaderRenderer'
export type { ObserverManagerOptions } from './core/ObserverManager'
export { ObserverManager } from './core/ObserverManager'
// Core Renderers
export { SimplePassiveRenderer } from './core/SimplePassiveRenderer'
// Legacy Core Renderers
export { UnifiedTableRenderer } from './core/UnifiedTableRenderer'
export { CellPipeline } from './engines/CellPipeline'
// Engines - Complex rendering pipelines (legacy, to be migrated)
export { HeaderEngine } from './engines/HeaderEngine'
export { RowEngine } from './engines/RowEngine'
export type { DOMElementFactoryOptions } from './factories/DOMElementFactory'
// Factories
export { DOMElementFactory } from './factories/DOMElementFactory'
export { ColumnManager } from './managers/ColumnManager'
// Managers - State and lifecycle management
export { SelectionManager } from './managers/SelectionManager'
export { StateManager } from './managers/StateManager'
export { VirtualScrollManager } from './managers/VirtualScrollManager'
export { BadgeRenderer } from './modules/BadgeRenderer'
export { CellFormatter } from './modules/CellFormatter'
export { KeyboardNavigationController } from './modules/KeyboardNavigationController'
// Modules - Feature-specific functionality
export { OverlayManager } from './modules/OverlayManager'
export { ScrollController } from './modules/ScrollController'
export { SelectionController } from './modules/SelectionController'
// Systems - Low-level operations
export { DOMSystem } from './systems/DOMSystem'
export { EventSystem } from './systems/EventSystem'
export { PerformanceSystem } from './systems/PerformanceSystem'

// Utils - Helper functions
export * from './utils/cell-rendering'
export * from './utils/group-behaviors'
export * from './utils/interaction-handlers'
export * from './utils/row-rendering'

/**
 * Recommended Architecture:
 *
 * 1. **Core**: Fundamental renderers and managers (SimplePassiveRenderer, ObserverManager)
 * 2. **Components**: Specialized rendering components (HeaderRenderer, etc.)
 * 3. **Factories**: Object creation patterns (DOMElementFactory)
 * 4. **Modules**: Feature-specific functionality (SelectionController, OverlayManager)
 * 5. **Managers**: State and lifecycle management (SelectionManager, StateManager)
 * 6. **Systems**: Low-level operations (DOMSystem, EventSystem, PerformanceSystem)
 * 7. **Cell Renderers**: Type-specific cell rendering
 * 8. **Utils**: Helper functions and utilities
 *
 * Migration Path:
 * - **Engines** → **Components** (HeaderEngine → HeaderRenderer ✅)
 * - Complex managers → Split into focused modules
 * - Consolidate overlapping functionality
 */
