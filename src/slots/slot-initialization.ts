/**
 * Default slot registrations for VibeGrid
 *
 * Registers all built-in field type CellRenderers at priority 0.
 * Called during each grid instance's initialization.
 * Idempotent - safe to call multiple times on the same registry.
 *
 * Renderer implementations live in `./renderers/` — one file per category.
 */

import { getLogger } from '@/shared/lib/logging'
import type { SlotRegistry } from './SlotRegistry'
import {
  textFallbackRenderer,
  textCellRenderer,
  numberCellRenderer,
  dateCellRenderer,
  booleanCellRenderer,
  selectCellRenderer,
  emailCellRenderer,
  urlCellRenderer,
  phoneCellRenderer,
  colorCellRenderer,
  currencyCellRenderer,
  fileCellRenderer,
  imageCellRenderer,
  ratingCellRenderer,
  sliderCellRenderer,
  markdownCellRenderer,
  entityNameCellRenderer,
  rowExpandCellRenderer,
  computedExpressionCellRenderer,
  computedFormulaCellRenderer,
  computedDecisionTableCellRenderer,
  rollupCountCellRenderer,
  rollupSumCellRenderer,
  rollupAverageCellRenderer,
  rollupConcatCellRenderer,
  badgeListCellRenderer,
  badgeListLiveCellRenderer,
} from './renderers'

const logger = getLogger(['vibegrid', 'slots', 'slot-initialization'])

/**
 * Register all default slots for built-in field types.
 *
 * Registers the text fallback at priority -1, and all field type
 * CellRenderers at priority 0 with their aliases.
 *
 * @param registry - SlotRegistry instance to register slots on
 */
export function registerDefaultSlots(registry: SlotRegistry): void {
  logger.debug('Registering default slots')

  // Catch-all fallback at priority -1
  registry.register({
    id: '__text_fallback__',
    priority: -1,
    canHandle: () => true,
    renderer: () => textFallbackRenderer,
  })

  // --- 1. Text ---
  registry.register({ id: 'text', priority: 0, renderer: () => textCellRenderer })
  registry.register({ id: 'string', priority: 0, renderer: () => textCellRenderer })

  // --- 2. Number ---
  registry.register({ id: 'number', priority: 0, renderer: () => numberCellRenderer })
  registry.register({ id: 'integer', priority: 0, renderer: () => numberCellRenderer })
  registry.register({ id: 'decimal', priority: 0, renderer: () => numberCellRenderer })
  registry.register({ id: 'percentage', priority: 0, renderer: () => numberCellRenderer })

  // --- 3. Date ---
  registry.register({ id: 'date', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'datetime', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'datetime-local', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'time', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'timestamp', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'timestamptz', priority: 0, renderer: () => dateCellRenderer })

  // --- 4. Boolean ---
  registry.register({ id: 'boolean', priority: 0, renderer: () => booleanCellRenderer })

  // --- 5. Select ---
  registry.register({ id: 'select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'single-select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'multi-select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'select-multi', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'enum', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'custom_select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({
    id: 'custom_option_reference',
    priority: 0,
    renderer: () => selectCellRenderer,
  })
  registry.register({ id: 'status', priority: 0, renderer: () => selectCellRenderer })

  // --- 6. Email ---
  registry.register({ id: 'email', priority: 0, renderer: () => emailCellRenderer })

  // --- 7. URL ---
  registry.register({ id: 'url', priority: 0, renderer: () => urlCellRenderer })

  // --- 8. Phone ---
  registry.register({ id: 'phone', priority: 0, renderer: () => phoneCellRenderer })

  // --- 9. Color ---
  registry.register({ id: 'color', priority: 0, renderer: () => colorCellRenderer })

  // --- 10. Currency (dedicated type, also registered as number/currency alias above) ---
  registry.register({ id: 'currency', priority: 0, renderer: () => currencyCellRenderer })

  // --- 11. File ---
  registry.register({ id: 'file', priority: 0, renderer: () => fileCellRenderer })
  registry.register({ id: 'file_upload', priority: 0, renderer: () => fileCellRenderer })

  // --- 12. Image ---
  registry.register({ id: 'image', priority: 0, renderer: () => imageCellRenderer })

  // --- 13. Rating ---
  registry.register({ id: 'rating', priority: 0, renderer: () => ratingCellRenderer })

  // --- 14. Slider ---
  registry.register({ id: 'slider', priority: 0, renderer: () => sliderCellRenderer })

  // --- 15. Markdown ---
  registry.register({ id: 'markdown', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'rich-text', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'richtext', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'html', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'textarea', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'longtext', priority: 0, renderer: () => markdownCellRenderer })

  // --- 16. Entity Name ---
  // Priority 50 so it wins over the default text renderer (priority 0) for name columns.
  // canHandle matches by column id ('name'/'title') or explicit isPrimaryField flag.
  registry.register({
    id: 'entity-name',
    priority: 50,
    canHandle: (column) => column.id === 'name' || column.id === 'title' || (column as any).isPrimaryField === true,
    renderer: () => entityNameCellRenderer,
  })

  // --- 17. Row Expand ---
  registry.register({ id: 'row-expand', priority: 0, renderer: () => rowExpandCellRenderer })

  // --- 18. Computed Expression ---
  registry.register({
    id: 'computed_expression',
    priority: 0,
    renderer: () => computedExpressionCellRenderer,
  })

  // --- 21. Computed Formula ---
  registry.register({
    id: 'computed_formula',
    priority: 0,
    renderer: () => computedFormulaCellRenderer,
  })

  // --- 22. Computed Decision Table ---
  registry.register({
    id: 'computed_decision_table',
    priority: 0,
    renderer: () => computedDecisionTableCellRenderer,
  })

  // --- 23. Rollup Count ---
  registry.register({
    id: 'rollup_count',
    priority: 0,
    renderer: () => rollupCountCellRenderer,
  })

  // --- 24. Rollup Sum ---
  registry.register({
    id: 'rollup_sum',
    priority: 0,
    renderer: () => rollupSumCellRenderer,
  })

  // --- 25. Rollup Average ---
  registry.register({
    id: 'rollup_average',
    priority: 0,
    renderer: () => rollupAverageCellRenderer,
  })

  // --- 26. Rollup Concat ---
  registry.register({
    id: 'rollup_concat',
    priority: 0,
    renderer: () => rollupConcatCellRenderer,
  })

  // --- 27. Badge List ---
  registry.register({ id: 'badge-list', priority: 0, renderer: () => badgeListCellRenderer })
  // GH#2651 P1.3: badge-list-live renders via TanStack DB liveQuery join
  // (see useBadgeListEnrichment + badge-list-live.ts)
  registry.register({ id: 'badge-list-live', priority: 0, renderer: () => badgeListLiveCellRenderer })

  logger.debug('Default slots registered', {
    slotCount: registry.getRegisteredIds().length,
  })
}
