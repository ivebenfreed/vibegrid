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

export { SingleColumnLayoutAdapter } from './SingleColumnLayoutAdapter'
export type { SingleColumnLayoutAdapterOptions } from './SingleColumnLayoutAdapter'

export { TwoColumnLayoutAdapter } from './TwoColumnLayoutAdapter'
export type { TwoColumnLayoutAdapterOptions } from './TwoColumnLayoutAdapter'

export { InlineRowLayoutAdapter } from './InlineRowLayoutAdapter'
export type { InlineRowLayoutAdapterOptions } from './InlineRowLayoutAdapter'

export { GroupedFormLayoutAdapter } from './GroupedFormLayoutAdapter'
export type { GroupedFormLayoutAdapterOptions, FieldGroup } from './GroupedFormLayoutAdapter'

export type {
  CellLayoutAdapter,
  CellPosition,
  FieldNeighbors,
  FieldPlacement,
  LayoutConfig,
  LayoutType,
  ResponsiveConfig,
} from '../types/layout-types'
