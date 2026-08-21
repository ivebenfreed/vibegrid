import type { RowAction } from '../VibeGrid'

/**
 * Resolve whether a grid shows the built-in bulk/row Delete.
 *
 * Policy: every selectable, writable grid offers at least bulk delete to
 * anyone with write access — a grid that renders checkboxes but no bulk bar
 * is a dead end (the PaymentCycle "Payment Lines" tab shipped that way).
 *
 * The default yields to two things:
 *  - an explicit `enableDelete` prop (a grid over a non-DataForge row source
 *    passes `false`, because the generic entity delete has nothing to delete);
 *  - the caller's own destructive row action, so grids like ChildEntitySection
 *    and GCFileBrowser keep their bespoke delete instead of showing two.
 */
export function resolveEnableDelete(opts: {
  enableDelete?: boolean
  readOnly: boolean
  enableSelectionColumn: boolean
  rowActions?: RowAction[]
}): boolean {
  const { enableDelete, readOnly, enableSelectionColumn, rowActions } = opts
  if (enableDelete !== undefined) return enableDelete
  if (readOnly || !enableSelectionColumn) return false
  return !hasCustomDestructiveAction(rowActions)
}

function hasCustomDestructiveAction(rowActions?: RowAction[]): boolean {
  // `singleRowOnly` actions never reach the bulk bar, so they don't stand in
  // for a bulk delete — a grid whose only delete is a per-record dialog still
  // needs the built-in one.
  return rowActions?.some((a) => (a.destructive || a.id === 'delete') && !a.singleRowOnly) ?? false
}
