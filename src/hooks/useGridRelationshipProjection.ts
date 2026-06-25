/**
 * useGridRelationshipProjection — attach `colId__rel: [{id, name}]` projections
 * to the main VibeGrid's substrate rows so relationship chips render entity
 * NAMES instead of raw IDs.
 *
 * Background (the bug this fixes): pre-GH#3119 the main entity-list grid got
 * its relationship-name projections from the unified server adapter
 * (`projectRow` + the server `_included` payload). GH#3119 P5 cut the grid over
 * to the substrate read hook `useEntityGrid`, which returns raw row content —
 * relationship fields are arrays of ID strings with NO `_included` projection.
 * The badge-list renderer's Path 1 (`rowData[colId__rel]`) is therefore empty,
 * and Path 2 (`getExistingEntityCollection`) is no longer populated post-3119,
 * so every chip fell back to rendering `#<idSuffix>`.
 *
 * This hook restores name resolution at the data layer — the same approach
 * `useChildRecordsProjection` uses for child sections — by bulk-fetching the
 * referenced target records (shared `useRelationshipTargetRecords` engine) and
 * projecting `colId__rel` onto each row via `projectRow`. The projected rows
 * carry the names inside `data` (`{id, data: {...fields, colId__rel}}`), which
 * is exactly the wrapped shape `tableCoreStore.setSparseRows` and the
 * badge-list renderer's `rowData` lookup expect.
 *
 * Reactivity: when target records land (initial fetch or `entityBatch`), the
 * lookup updates → the memoized projected-rows array gets a new identity →
 * `useVibeGridData`'s push-to-store effect re-runs and the names appear.
 */

import { useEffect, useMemo, useState } from 'react'
import { reaction } from 'mobx'
import type { RawRow } from '@/shared/data/query/types'
import {
  buildIncludedFromTargets,
  projectRow,
  type RelColumnDescriptor,
} from '@/shared/data/query/unified/project-row'
import { buildRelColDescriptors } from '@/shared/data/query/use-substrate-grid-rows/snapshot-wiring'
import { useRelationshipTargetRecords } from '@/shared/data/hooks/useRelationshipTargetRecords'
import type { TableCoreStore } from '../stores/TableCoreStore'

/** Stable content-key for a relCol list — used to skip no-op state updates. */
export function relColsKey(cols: ReadonlyArray<RelColumnDescriptor>): string {
  return cols
    .map((c) => `${c.id}:${c.relationshipTargetEntity}:${c.relationshipDisplayField}`)
    .join('|')
}

/**
 * Flatten a substrate row to the `{ id, ...fields }` shape `projectRow`
 * consumes. `useEntityGrid` returns flat records already; this is the inverse
 * of `wrapSubstrateRow` for the defensive case where a caller passes an
 * already-wrapped `{ id, data }` row.
 */
export function toFlatIdRow(row: Record<string, unknown>): Record<string, unknown> & { id: string } {
  const id = typeof row.id === 'string' ? row.id : ''
  const data = row.data
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.keys(row).length <= 2 // {id, data} → wrapped
  ) {
    return { ...(data as Record<string, unknown>), id }
  }
  return { ...row, id }
}

/**
 * Project `colId__rel` name lookups onto the grid's viewport rows.
 *
 * @param tableCoreStore - source of the live column set (relationship descriptors)
 * @param rows - the current viewport rows from `useEntityGrid` (flat records;
 *   `null` entries are skeleton placeholders and are preserved positionally)
 * @param orgId - active organization id (fetches are scoped to it)
 * @returns the same row array with each non-null row projected to the wrapped
 *   `{id, data:{...fields, colId__rel}}` shape; `null` positions preserved.
 */
export function useGridRelationshipProjection(
  tableCoreStore: TableCoreStore | null,
  rows: ReadonlyArray<Record<string, unknown> | null>,
  orgId: string | null,
): Array<RawRow | null> {
  // Derive relationship column descriptors from the live MobX columns. A
  // reaction keeps `relCols` in sync; the content-key guard bounds re-renders
  // (buildRelColDescriptors returns a fresh array each call).
  const [relCols, setRelCols] = useState<RelColumnDescriptor[]>([])

  useEffect(() => {
    if (!tableCoreStore) {
      setRelCols((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const dispose = reaction(
      () => buildRelColDescriptors(tableCoreStore),
      (next) => {
        setRelCols((prev) => (relColsKey(prev) === relColsKey(next) ? prev : next))
      },
      { fireImmediately: true },
    )
    return () => dispose()
  }, [tableCoreStore])

  // Flat (non-null) records feed the target-fetch engine.
  const flatRecords = useMemo(() => {
    const out: Array<Record<string, unknown>> = []
    for (const r of rows) {
      if (r !== null) out.push(r)
    }
    return out
  }, [rows])

  const targetsByType = useRelationshipTargetRecords({
    records: flatRecords,
    relCols,
    orgId: orgId ?? '',
  })

  const lookup = useMemo(
    () => buildIncludedFromTargets(relCols, targetsByType),
    [relCols, targetsByType],
  )

  return useMemo(
    () =>
      rows.map((r) =>
        r === null ? null : projectRow(toFlatIdRow(r), lookup, relCols),
      ),
    [rows, lookup, relCols],
  )
}
