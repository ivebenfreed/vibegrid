/**
 * GH#2804 B10: Iterate currently-selected row ids without materializing a
 * Set when the selection is in marker mode.
 *
 * Modes:
 *   - explicit: yields each row id from `selection.rows`. (Today's path.)
 *   - all-with-exclusions: SHOULD page through `query` results, yielding any
 *     row id not in `selection.exclusions`. CURRENTLY NOT IMPLEMENTED — see
 *     the marker-mode handling below for context.
 *
 * Why marker-mode iteration is currently a TODO:
 *   The substrate `Query<Row>` class does not expose a paged-id-scan API
 *   (no `fetchIds({ start, size })` or `scanIds(...)` method). Adding one
 *   correctly requires a separate cursor-bounded SQL fetch that does NOT
 *   disturb the live query's cursor state — non-trivial enough that it's
 *   out of scope for wave 3b. Wave 3b ships the InteractionStore +
 *   SelectionController layer; the bulk-action path that activates marker-
 *   mode iteration lands in a follow-up.
 *
 * GH#2804 round-2 review fix (Critical 3): instead of throwing on marker
 * mode, the iterator now yields nothing and emits a one-time `console.warn`.
 * The primary caller (`ActionsBar.tsx`) already disables bulk-action buttons
 * when `selectionMarkerMode === 'all-with-exclusions'` with a tooltip, so
 * the no-throw path is never user-reachable today. The defensive yield-
 * nothing+warn behavior protects future callers that forget the marker-mode
 * disable from crashing the grid — a missed bulk action is a better failure
 * mode than an unhandled exception.
 *
 * Callers that explicitly want a hard fail can use the
 * `assertSelectionExplicit()` helper below.
 *
 * Spec reference: docs/planning/specs/2804-smart-100k-row-system.md B10
 *   "Implementation Hints — Selection marker model handling in bulk action"
 */

import type { Query } from '@/shared/data/query/query'
import type { SelectionState } from '@/systems/vibegrid/types'

export class SelectionMarkerIterationNotImplementedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SelectionMarkerIterationNotImplementedError'
  }
}

/**
 * Hard-fail variant for callers that want an exception when handed a marker-
 * mode selection. The default `iterateSelectedRowIds` path is permissive
 * (yields nothing + warns); use this assertion when the caller has already
 * validated upstream that marker mode should not occur.
 */
export function assertSelectionExplicit(
  selection: SelectionState,
): asserts selection is Extract<SelectionState, { mode: 'explicit' }> {
  if (selection.mode !== 'explicit') {
    throw new SelectionMarkerIterationNotImplementedError(
      'GH#2804 B10: assertSelectionExplicit invoked on a marker-mode selection. ' +
        'Substrate Query<Row> lacks a paged-id-scan API; bulk actions on ' +
        'select-all-minus-exclusions are out of scope for wave 3b.',
    )
  }
}

// Module-local one-shot guard for the marker-mode console.warn so we don't
// flood DevTools when the same caller iterates many times.
let markerWarnEmitted = false

/**
 * @internal test-only helper to reset the once-warning flag between tests.
 */
export function _resetMarkerWarnForTesting(): void {
  markerWarnEmitted = false
}

/**
 * Iterate selected row ids for the given selection state.
 *
 * Explicit mode: synchronous yield from `selection.rows` (still typed as
 * AsyncIterable for caller uniformity).
 *
 * Marker mode: yields nothing and emits a one-time `console.warn` instead
 * of throwing. See file-header note. The primary caller `ActionsBar.tsx`
 * already disables bulk actions in marker mode; this defensive path keeps
 * future callers from crashing on an unhandled exception if they forget the
 * upstream disable.
 *
 * @param selection - The current SelectionState (read from
 *   InteractionStore.selection — the discriminated union, NOT the legacy
 *   selectedRows Set).
 * @param query - The active substrate Query, only required in marker mode.
 *   Pass `null` for explicit-mode callers.
 */
export async function* iterateSelectedRowIds(
  selection: SelectionState,
  // biome-ignore lint/correctness/noUnusedFunctionParameters: reserved for marker mode follow-up
  query: Query<unknown> | null,
): AsyncIterable<string> {
  if (selection.mode === 'explicit') {
    for (const rowId of selection.rows) {
      yield rowId
    }
    return
  }

  // selection.mode === 'all-with-exclusions'
  if (!markerWarnEmitted) {
    markerWarnEmitted = true
    // biome-ignore lint/suspicious/noConsole: defensive one-shot warning is intentional
    console.warn(
      '[GH#2804 B10] iterateSelectedRowIds called in marker mode — yielding no ' +
        'ids. Substrate Query<Row> lacks a paged-id-scan API; bulk actions on ' +
        'select-all-minus-exclusions are out of scope for wave 3b. ActionsBar ' +
        'already disables bulk action buttons in marker mode. If you are seeing ' +
        'this warning, your caller forgot to check ' +
        "`selection.mode === 'explicit'` before iterating; use " +
        '`assertSelectionExplicit(selection)` for a hard fail.',
    )
  }
  // Yield nothing — bulk action receives an empty id stream and no-ops.
  return
}
