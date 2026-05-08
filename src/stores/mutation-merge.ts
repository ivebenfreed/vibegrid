/**
 * Mutation merge truth table for substrate optimistic writes (GH#2806 P5).
 *
 * Mirrors the structure of `@tanstack/db/src/transactions.ts:42–102`, but
 * specialized for the substrate's pending mutation set. When a same-row
 * mutation arrives while one is already in-flight, we merge the two into a
 * single mutation that captures the net effect — this preserves order and
 * avoids issuing two oRPC calls that would race each other.
 *
 * Six cases (per spec line 116):
 *   1. insert → update   → single insert with merged fields
 *   2. insert → delete   → null  (cancel both — never persisted)
 *   3. update → update   → single update with union of changes
 *   4. update → delete   → single delete (prior update dropped)
 *   5. delete → anything → invalid (delete is terminal — assert)
 *   6. same-kind same-field with the same value → no-op (caller can drop)
 *
 * Pure module — no MobX, no oRPC, no I/O. Caller is responsible for replacing
 * the in-flight entry with the merged result before issuing the next call.
 */

export interface InsertMutation {
  kind: 'create'
  rowId: string
  data: Record<string, unknown>
}

export interface UpdateMutation {
  kind: 'update'
  rowId: string
  /** Field-level changes. Merged via Object.assign in update→update merge. */
  changes: Record<string, unknown>
}

export interface DeleteMutation {
  kind: 'delete'
  rowId: string
}

export type Mutation = InsertMutation | UpdateMutation | DeleteMutation

/**
 * Merge two mutations targeting the same row. Returns:
 *   - a single replacement mutation for the in-flight slot, OR
 *   - null when the two mutations cancel out (insert + delete), OR
 *   - the symbolic `NO_OP` constant when the second mutation is a redundant
 *     no-op (same kind, same fields, same values) and the first one already
 *     captures it (caller should NOT replace the in-flight entry).
 *
 * Throws on the invalid `delete → *` chain — delete is terminal; the row no
 * longer exists locally so any subsequent mutation on the same `rowId` is a
 * programming error.
 */
export const NO_OP: unique symbol = Symbol('mutation-merge:no-op')
export type MergeResult = Mutation | null | typeof NO_OP

export function mergeMutations(prev: Mutation, next: Mutation): MergeResult {
  if (prev.rowId !== next.rowId) {
    throw new Error(
      `mergeMutations: rowId mismatch (prev=${prev.rowId}, next=${next.rowId}). ` +
        'Caller must only merge mutations targeting the same row.',
    )
  }

  // Case 5: delete → * is invalid. Delete is terminal — there's nothing to
  // update or recreate against an in-flight delete on the same row.
  if (prev.kind === 'delete') {
    throw new Error(
      `mergeMutations: prev=delete is terminal; cannot apply ${next.kind} on top. ` +
        `rowId=${prev.rowId}`,
    )
  }

  if (prev.kind === 'create') {
    // Case 1: insert → update. Single insert with merged fields.
    if (next.kind === 'update') {
      // Same-field-same-value short-circuit: if every changed field already
      // matches the in-flight insert's data, the update is a no-op.
      if (allFieldsAlreadyMatch(prev.data, next.changes)) {
        return NO_OP
      }
      return {
        kind: 'create',
        rowId: prev.rowId,
        data: { ...prev.data, ...next.changes },
      }
    }
    // Case 2: insert → delete. Cancels both — the row was never persisted.
    if (next.kind === 'delete') {
      return null
    }
    // insert → insert is a programming error (the caller would be re-creating
    // an already-pending row). Treat as terminal-style assertion.
    throw new Error(
      `mergeMutations: insert → insert is invalid for rowId=${prev.rowId}`,
    )
  }

  // prev.kind === 'update'
  if (next.kind === 'update') {
    // Case 3: update → update. Single update with union of changes.
    if (allFieldsAlreadyMatch(prev.changes, next.changes)) {
      return NO_OP
    }
    return {
      kind: 'update',
      rowId: prev.rowId,
      changes: { ...prev.changes, ...next.changes },
    }
  }
  if (next.kind === 'delete') {
    // Case 4: update → delete. Drop the update; only the delete persists.
    return { kind: 'delete', rowId: prev.rowId }
  }
  // update → create is a programming error.
  throw new Error(
    `mergeMutations: update → create is invalid for rowId=${prev.rowId}`,
  )
}

/**
 * True when every key in `nextChanges` is already present in `existing` with
 * an identical value (===). Used to detect the same-kind same-field same-value
 * no-op case (rule 6).
 */
function allFieldsAlreadyMatch(
  existing: Record<string, unknown>,
  nextChanges: Record<string, unknown>,
): boolean {
  const keys = Object.keys(nextChanges)
  if (keys.length === 0) return true
  for (const k of keys) {
    if (!(k in existing)) return false
    if (existing[k] !== nextChanges[k]) return false
  }
  return true
}
