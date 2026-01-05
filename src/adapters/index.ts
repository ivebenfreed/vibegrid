/**
 * Layout Adapters for VibeGrid
 *
 * Adapters enable VibeGrid to render in different layouts (grid, property sheet, forms, etc.)
 * while maintaining consistent navigation, selection, and Y.js sync behavior.
 */

export { PropertySheetAdapter } from './PropertySheetAdapter'
export type { PropertySheetAdapterOptions } from './PropertySheetAdapter'

export { GridAdapter } from './GridAdapter'
export type { GridAdapterOptions } from './GridAdapter'

export type {
	CellLayoutAdapter,
	CellPosition,
	FieldNeighbors,
	FieldPlacement,
	LayoutConfig,
	LayoutType,
	ResponsiveConfig,
} from '../types/layout-types'
