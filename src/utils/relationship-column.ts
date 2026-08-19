/**
 * Relationship-column helpers shared by the filter builder.
 *
 * A relationship column is one whose cell value is a target-entity id (or an
 * array of them) rather than a literal. `column-generation.ts` marks these
 * with `cellType: 'badge-list'` plus `relationshipTargetEntity` /
 * `relationshipConfig`; other producers (e.g. `useChildRecordsProjection`)
 * set only `relationshipTargetEntity`. Detection keys off the resolved target
 * type because that — not the cell type — is what the option picker needs.
 */

import type { Column } from '../types'

/** Loose view of the relationship metadata various column producers attach. */
interface RelationshipColumnMeta {
  relationshipTargetEntity?: string | null
  targetEntityType?: string | null
  relationshipDisplayField?: string | null
  relationshipConfig?: {
    targetEntityType?: string | null
    displayField?: string | null
  } | null
}

export interface RelationshipTarget {
  targetEntityType: string
  displayField: string
}

/**
 * Resolve a column's relationship target, or `null` when the column is not a
 * relationship column (or is one whose target could not be derived — in which
 * case there is nothing to enumerate and the caller should fall back to a
 * free-text value).
 */
export function getRelationshipTarget(column: Column | null | undefined): RelationshipTarget | null {
  if (!column) return null
  const meta = column as Column & RelationshipColumnMeta
  const targetEntityType =
    meta.relationshipConfig?.targetEntityType || meta.relationshipTargetEntity || meta.targetEntityType
  if (!targetEntityType || typeof targetEntityType !== 'string') return null
  const displayField = meta.relationshipConfig?.displayField || meta.relationshipDisplayField || 'name'
  return { targetEntityType, displayField }
}

/** A relationship target referenced by the grid's currently-loaded rows. */
export interface InViewRelationshipOption {
  id: string
  name: string
}

/** Upper bound on distinct in-view options surfaced per column. */
const IN_VIEW_OPTION_CAP = 100

/**
 * Collect the distinct relationship targets actually referenced by the rows
 * the grid currently holds, keyed by column id.
 *
 * These are the values that can produce a non-empty result for the rows on
 * screen, so the filter builder leads with them before the full target-entity
 * list. Labels come from the substrate's join projection
 * (`rowData['<colId>__rel'] = Array<{id, name}>`, the same source the badge
 * renderer reads); when only bare ids are present the entry is still emitted
 * with an empty name and the picker resolves the label from its own option
 * window.
 *
 * Scans with `forEach`, which skips holes — `processedRows` is sparse in
 * substrate mode (length === server total, only the loaded window populated),
 * so this is O(loaded), not O(total).
 */
export function collectInViewRelationshipOptions(
  columns: ReadonlyArray<Column> | null | undefined,
  rows: ReadonlyArray<unknown> | null | undefined,
): Record<string, InViewRelationshipOption[]> {
  const out: Record<string, InViewRelationshipOption[]> = {}
  if (!columns || columns.length === 0 || !rows || rows.length === 0) return out

  const relationshipColumns = columns.filter((col) => getRelationshipTarget(col) !== null)
  if (relationshipColumns.length === 0) return out

  const byColumn = new Map<string, Map<string, string>>()
  for (const col of relationshipColumns) byColumn.set(col.id, new Map())

  ;(rows as unknown[]).forEach((row) => {
    if (!row || typeof row !== 'object') return
    const typed = row as { type?: string; data?: Record<string, unknown> }
    if (typed.type && typed.type !== 'data') return
    const rowData = (typed.data ?? row) as Record<string, unknown>

    for (const col of relationshipColumns) {
      const seen = byColumn.get(col.id)
      if (!seen || seen.size >= IN_VIEW_OPTION_CAP) continue

      // Preferred: the join projection's {id, name} pairs.
      const projected = rowData[`${col.id}__rel`]
      if (Array.isArray(projected)) {
        for (const entry of projected) {
          if (!entry || typeof entry !== 'object') continue
          const { id, name } = entry as { id?: unknown; name?: unknown }
          if (typeof id !== 'string' || id.length === 0) continue
          const label = typeof name === 'string' ? name : ''
          // A later row may carry the name a earlier one lacked.
          if (!seen.has(id) || (label && !seen.get(id))) seen.set(id, label)
        }
        continue
      }

      // Fallback: bare ids on the source row.
      const raw = rowData[col.id]
      const ids = Array.isArray(raw) ? raw : [raw]
      for (const id of ids) {
        if (typeof id !== 'string' || id.length === 0) continue
        if (!seen.has(id)) seen.set(id, '')
      }
    }
  })

  for (const [columnId, seen] of byColumn) {
    if (seen.size === 0) continue
    out[columnId] = Array.from(seen, ([id, name]) => ({ id, name }))
      .slice(0, IN_VIEW_OPTION_CAP)
      // Named entries first, then alphabetical — an unresolved id is the
      // least useful thing to show at the top of the list.
      .sort((a, b) => {
        if (!a.name && b.name) return 1
        if (a.name && !b.name) return -1
        return a.name.localeCompare(b.name)
      })
  }
  return out
}
