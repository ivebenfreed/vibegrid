/**
 * Saved-views stale-while-revalidate cache (PR #3175 follow-up).
 *
 * Mirrors WarmthStore's shape exactly: a pure in-memory MobX singleton that
 * holds the last-known `views.list` response per entity type. Callers feed
 * values via `set()`; the store does NOT fetch, poll, or do any I/O.
 *
 * The matching async fetch helper lives in a sibling file:
 *
 *   apps/web/src/shared/data/orpc/domains/views-fetch.ts
 *
 *     const entry = await loadViews(entityName)   // stale-while-revalidate
 *     await refreshViews(entityName)              // after a mutation
 *
 * Consumers (`ViewPicker`, `useViewUrlSync`, the settings page) read the
 * cached entry synchronously via `viewsStore.get(entityName)` on first
 * paint, then `loadViews(entityName)` updates the entry in the background.
 *
 * Persistence: in-memory only. Resets on org switch via `clear()` (mirrors
 * how `warmthStore.clear()` + `clearServerCounts()` are wired). No
 * localStorage, no wa-sqlite, no BroadcastChannel.
 *
 * Why this doesn't violate the substrate's
 * "NEVER add a SWR / per-query cache on top of the hooks" rule from
 * `.claude/rules/substrate-architecture.md`: that rule targets DataForge
 * entity queries (`useEntityList`, `useEntityGrid`, `useEntityRecord`),
 * where wa-sqlite IS the cache. Saved views are platform metadata served
 * by `dataforge.views.list` — they don't flow through the substrate's
 * read hooks, the WhereAst predicate evaluator, or `row_content`. A
 * per-entity-type MobX cache for views is the canonical state-cache
 * shape used by WarmthStore + OptimisticMutationStore +
 * server-counts-cache for the same class of "metadata on the side"
 * data.
 */

import { makeAutoObservable } from 'mobx'

import type { EntityViewPinRow, EntityViewRow } from '@/systems/vibegrid/components/ViewPicker'

export interface ViewsEntry {
  views: EntityViewRow[]
  pins: EntityViewPinRow[]
  /**
   * Resolved default view config — `views.find(is_default)?.config ?? views[0]?.config ?? null`.
   * Stored on the entry so consumers (e.g. `useViewUrlSync`) read a single
   * source of truth instead of recomputing the derivation at every read.
   */
  defaultViewConfig: Record<string, unknown> | null
  /** Date.now() when the entry was last written via `set()`. */
  fetchedAt: number
}

export class ViewsStore {
  byEntity: Map<string, ViewsEntry> = new Map()

  constructor() {
    makeAutoObservable(this)
  }

  /**
   * Write the cache entry for `entityName`. Stamps `fetchedAt` with
   * `Date.now()` so callers can reason about staleness. Returns the new
   * entry so callers (the `loadViews` helper) can return it directly to
   * their awaiters.
   */
  set(entityName: string, entry: Omit<ViewsEntry, 'fetchedAt'>): ViewsEntry {
    const next: ViewsEntry = {
      ...entry,
      fetchedAt: Date.now(),
    }
    this.byEntity.set(entityName, next)
    // Return what the map will actually expose to consumers — MobX's
    // observable Map may proxy the inserted value, so the post-`set`
    // `get` is the canonical reference identity.
    const stored = this.byEntity.get(entityName)
    return stored ?? next
  }

  get(entityName: string): ViewsEntry | undefined {
    return this.byEntity.get(entityName)
  }

  clear(): void {
    this.byEntity.clear()
  }

  clearEntity(entityName: string): void {
    this.byEntity.delete(entityName)
  }
}

// Module-level singleton. Mirrors WarmthStore (single global instance per
// tab, reset on org switch via `clear()`).
export const viewsStore = new ViewsStore()
