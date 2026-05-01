/**
 * Re-exports all cell renderer instances from per-category files.
 *
 * slot-initialization.ts imports from here to register renderers.
 * External code should NOT import renderers directly — use SlotRegistry.
 */

export { textFallbackRenderer, textCellRenderer } from './text'
export { numberCellRenderer } from './number'
export { dateCellRenderer } from './date'
export { booleanCellRenderer } from './boolean'
export { selectCellRenderer } from './select'
export { emailCellRenderer, urlCellRenderer, phoneCellRenderer } from './contact'
export { colorCellRenderer } from './color'
export { currencyCellRenderer } from './currency'
export { fileCellRenderer, imageCellRenderer } from './media'
export { ratingCellRenderer, sliderCellRenderer } from './visual'
export { markdownCellRenderer } from './markdown'
export { entityNameCellRenderer } from './entity-name'
export { rowExpandCellRenderer } from './row-expand'
export {
  computedExpressionCellRenderer,
  computedFormulaCellRenderer,
  computedDecisionTableCellRenderer,
} from './computed'
export {
  rollupCountCellRenderer,
  rollupSumCellRenderer,
  rollupAverageCellRenderer,
  rollupConcatCellRenderer,
} from './rollup'
export { badgeListCellRenderer } from './badge-list'
