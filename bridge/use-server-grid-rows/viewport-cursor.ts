/**
 * GH#3119 P1.4 — viewport→cursor reaction with containment dedup.
 *
 * Houses the `viewportStore.visibleRowRange` MobX reaction + debounce
 * timer for `handle.patch({ cursor })` dispatch. Containment dedup skips
 * the round-trip when the new window is fully covered by the previous
 * request; only a new window (start change OR size growth past prev.end)
 * patches.
 *
 * Behavior is identical to the pre-split (and later renamed) grid-rows hook;
 * this file is a mechanical extraction.
 *
 * Spec reference: 3119-substrate-sqlite-system-simplification-s.md
 * §B12 (god-file-modularization-gate).
 */

import type { MutableRefObject } from 'react'
import { reaction } from 'mobx'
import type { ViewportStore } from '@/systems/vibegrid/stores/ViewportStore'
import type { SubscriptionHandle } from '../unified/query'
import type { Logger } from '@/shared/lib/logging'

/**
 * Substrate cursor overscan. The substrate window extends 50 rows above and
 * below the visible render window so micro-scrolls don't round-trip the
 * SharedWorker. ViewportStore.BUFFER_ROWS (10) is the render overscan; the
 * substrate overscan must be larger to avoid skeleton flashes during rapid
 * back-and-forth scroll.
 */
export const CURSOR_OVERSCAN = 50

/**
 * Debounce window before a settled scroll triggers a cursor patch.
 *
 * GH#2806 perf — dropped from 150ms → 50ms after the composite index
 * `(entity_type_id, id)` made evaluateQuery flat across the row range.
 * 50ms is short enough to feel responsive (one frame tail at 20fps) but
 * long enough to coalesce a rapid wheel-burst into one patch rather than
 * firing per-event.
 */
export const CURSOR_PATCH_DEBOUNCE_MS = 50

export interface ViewportCursorCtx {
  viewportStore: ViewportStore
  getHandle: () => SubscriptionHandle | null
  getCancelled: () => boolean
  lastRequestedCursorRef: MutableRefObject<{ start: number; size: number } | null>
  debug: Record<string, unknown> | undefined
  logger: Logger
}

/**
 * Install the viewport→cursor MobX reaction. Returns a dispose function
 * that tears down the reaction AND clears any pending debounce timer.
 */
export function setupViewportCursor(ctx: ViewportCursorCtx): () => void {
  const {
    viewportStore,
    getHandle,
    getCancelled,
    lastRequestedCursorRef,
    debug,
    logger,
  } = ctx

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const dispose = reaction(
    () => viewportStore.visibleRowRange,
    (range) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const handle = getHandle()
        if (getCancelled() || !handle) return
        const start = Math.max(0, range.start - CURSOR_OVERSCAN)
        const size = Math.max(1, range.end - range.start + 2 * CURSOR_OVERSCAN)
        const next = { start, size }
        // Containment-based dedup: skip the round-trip when the new
        // window is fully covered by the previous request. Strict
        // scroll behavior preserved: a new window (start change OR
        // size growth past prev.end) is NOT contained, so it
        // patches as before.
        const prev = lastRequestedCursorRef.current
        if (
          prev &&
          next.start >= prev.start &&
          next.start + next.size <= prev.start + prev.size
        ) {
          return
        }
        lastRequestedCursorRef.current = next
        if (debug) debug.lastCursor = { ...next }
        logger.debug('handle.patch send (scroll)', {
          t: performance.now(),
          cursor: next,
        })
        void handle.patch({ cursor: next })
      }, CURSOR_PATCH_DEBOUNCE_MS)
    },
    { fireImmediately: false },
  )

  return () => {
    dispose()
    if (debounceTimer) clearTimeout(debounceTimer)
  }
}
