/**
 * useRelationshipTargetCollections (GH#2786 follow-up)
 *
 * Bridges VibeGrid's relationship columns to the SharedWorker priority queue
 * (GH#2692) so cross-entity name resolution works without OOM'ing the tab.
 *
 * Two paths fire from this hook:
 *
 * 1. **Background-lane registration** (per-target child component): For each
 *    unique `relationshipTargetEntity` in the grid's columns, render a
 *    `RelationshipTargetSlot` child that calls
 *    `useEntityCollection(target, {priority:'background'})`. This synchronously
 *    registers the target collection in `collectionsCache` (so
 *    `getExistingEntityCollection` resolves) AND its `startEntityWarmup`
 *    enqueues a `warmEntity` request on the **background** lane of the
 *    SharedWorker priority queue. The page's own foreground entity preempts;
 *    no more 50,000-record paginations racing in parallel.
 *
 * 2. **Visible-cell bulk fetch**: Collect IDs from `tableCoreStore.processedRows`
 *    × relationship columns, dedupe per target type, debounce ~100ms, call
 *    `client.fetchEntityByIds({orgId, entityName, ids})` per target. Chunks at
 *    500 ids/call. The SharedWorker writes to SQLite + emits a single
 *    `entityBatch` per call → entity collection's existing reactivity picks
 *    up records → next render hits.
 *
 * On unmount of each slot, releases the entity-interest refcount via
 * `client.releaseEntityInterest`. SQLite rows persist (refCount release does
 * not delete data — see worker.ts releaseEntityInterest).
 *
 * Replaces the deleted `badge-list-live` JSX bridge: cross-entity resolution
 * happens through the existing `getExistingEntityCollection` lookup in
 * `slots/renderers/badge-list.ts`.
 */

import React, { useEffect, useRef, useState } from 'react'
import { reaction } from 'mobx'
import { useOrganization } from '@/app/stores'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getSQLiteClient } from '@/shared/data/db/sqlite/client'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'hooks', 'useRelationshipTargetCollections'])

/** System entity types that are not DataForge entities and shouldn't be hydrated as collections. */
const SYSTEM_ENTITY_NAMES = new Set(['Member', 'PlatformUser', 'PlatformOrganization'])

const FETCH_BY_IDS_CHUNK = 500
const VISIBLE_FETCH_DEBOUNCE_MS = 100

/**
 * Enumerate unique target entity types referenced by relationship columns.
 * Reads `relationshipTargetEntity` (set by column-generation.ts) and
 * `relationshipConfig.targetEntityType` as a fallback. Skips system entities
 * which are not DataForge collections.
 */
function getRelationshipTargets(columns: Column[]): string[] {
  const targets = new Set<string>()
  for (const col of columns) {
    const target =
      ((col as any).relationshipTargetEntity as string | undefined) ||
      ((col as any).relationshipConfig?.targetEntityType as string | undefined)
    if (!target) continue
    if (SYSTEM_ENTITY_NAMES.has(target)) continue
    targets.add(target)
  }
  return Array.from(targets).sort()
}

/**
 * Per-target slot: registers the entity collection in `collectionsCache`
 * (so `getExistingEntityCollection` resolves) and queues the bootstrap
 * warmup on the SharedWorker's **background** priority queue lane.
 *
 * `entityBatch` events from the SharedWorker are bridged into the
 * collection's in-memory map by the global handler installed in
 * `entity-batch-bridge.ts` — no per-slot subscription is needed.
 *
 * Releases the priority-queue refcount on unmount; SQLite rows persist.
 */
function RelationshipTargetSlotBase({
  targetEntityType,
  orgId,
}: {
  targetEntityType: string
  orgId: string
}): null {
  // Background lane: the page's own foreground entity bootstrap preempts.
  useEntityCollection(targetEntityType, { priority: 'background' })

  useEffect(() => {
    return () => {
      const client = getSQLiteClient()
      if (!client.initialized) return
      client
        .releaseEntityInterest({ orgId, entityName: targetEntityType })
        .catch(() => {
          // best-effort cleanup
        })
    }
  }, [targetEntityType, orgId])

  return null
}

const RelationshipTargetSlot = React.memo(RelationshipTargetSlotBase)

/**
 * Hook that returns one render-only `RelationshipTargetSlot` per unique
 * relationship target entity in the grid, plus runs a debounced
 * visible-cell bulk fetch via the SharedWorker priority queue.
 *
 * Caller renders the returned ReactNode in their JSX tree (see VibeGrid.tsx).
 */
export function useRelationshipTargetCollections(
  tableCoreStore: TableCoreStore | null,
): React.ReactNode {
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId

  // Track the relationship target list as derived from MobX columns. We
  // re-render the hook when the target *set* changes; shallow-equal checks
  // bound the renders.
  const [targets, setTargets] = useState<string[]>([])

  useEffect(() => {
    if (!tableCoreStore) return
    const dispose = reaction(
      () => getRelationshipTargets(tableCoreStore.columns ?? []),
      (next) => {
        setTargets((prev) => {
          if (prev.length === next.length && prev.every((v, i) => v === next[i])) {
            return prev
          }
          return next
        })
      },
      { fireImmediately: true },
    )
    return () => dispose()
  }, [tableCoreStore])

  // -----------------------------------------------------------------------
  // Visible-cell bulk fetch (debounced)
  // -----------------------------------------------------------------------
  // Re-runs on processedRows / columns / orgId change. Per target, dedupe ids
  // and chunk at FETCH_BY_IDS_CHUNK per call. Each call hits the SharedWorker
  // → one oRPC data.query → writeRecordIfNewer per row → one entityBatch
  // emission. The collection's reactive read path picks up the records.

  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchKeyRef = useRef<string>('')

  useEffect(() => {
    if (!tableCoreStore || !orgId) return

    const dispose = reaction(
      () => {
        const t = getRelationshipTargets(tableCoreStore.columns ?? [])
        const rows = tableCoreStore.processedRows ?? []
        return { targets: t, rowCount: rows.length }
      },
      ({ targets: t, rowCount }) => {
        if (t.length === 0 || rowCount === 0) return

        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
        fetchTimerRef.current = setTimeout(() => {
          fetchTimerRef.current = null
          runVisibleFetch({
            tableCoreStore,
            orgId,
            targets: t,
            lastFetchKeyRef,
          })
        }, VISIBLE_FETCH_DEBOUNCE_MS)
      },
      { fireImmediately: true },
    )

    return () => {
      dispose()
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current)
        fetchTimerRef.current = null
      }
    }
  }, [tableCoreStore, orgId])

  if (!orgId || targets.length === 0) return null

  return (
    <>
      {targets.map((target) => (
        <RelationshipTargetSlot
          key={`${target}-${orgId}`}
          targetEntityType={target}
          orgId={orgId}
        />
      ))}
    </>
  )
}

/**
 * Internal: collect ids from visible processedRows × relationship columns,
 * dedupe, and chunk-fetch via client.fetchEntityByIds. SharedWorker writes
 * to SQLite + emits a by-id entityBatch which routes into the target
 * collection's reactive read path.
 */
function runVisibleFetch(args: {
  tableCoreStore: TableCoreStore
  orgId: string
  targets: string[]
  lastFetchKeyRef: { current: string }
}): void {
  const { tableCoreStore, orgId, targets, lastFetchKeyRef } = args

  const client = getSQLiteClient()
  if (!client.initialized) return

  const rows = tableCoreStore.processedRows ?? []
  if (rows.length === 0) return

  // target → field names that map to that target
  const columns = tableCoreStore.columns ?? []
  const targetToFields = new Map<string, string[]>()
  for (const col of columns) {
    const target =
      ((col as any).relationshipTargetEntity as string | undefined) ||
      ((col as any).relationshipConfig?.targetEntityType as string | undefined)
    if (!target || SYSTEM_ENTITY_NAMES.has(target)) continue
    if (!targets.includes(target)) continue
    const list = targetToFields.get(target) ?? []
    const field =
      ((col as any).field as string | undefined) ??
      ((col as any).id as string | undefined)
    if (field) list.push(field)
    targetToFields.set(target, list)
  }

  // Per target, collect ids referenced by visible rows.
  const idsByTarget = new Map<string, Set<string>>()
  for (const target of targets) idsByTarget.set(target, new Set<string>())

  for (const vrow of rows) {
    if (!vrow || (vrow as any).type !== 'data') continue
    const rowData = (vrow as any).data ?? vrow
    if (!rowData || typeof rowData !== 'object') continue
    for (const [target, fields] of targetToFields) {
      const set = idsByTarget.get(target)
      if (!set) continue
      for (const field of fields) {
        const value = (rowData as Record<string, unknown>)[field]
        if (Array.isArray(value)) {
          for (const v of value) if (typeof v === 'string' && v.length > 0) set.add(v)
        } else if (typeof value === 'string' && value.length > 0) {
          set.add(value)
        }
      }
    }
  }

  // Stable key — skip when nothing has changed since the last run.
  const keyParts: string[] = []
  for (const target of targets) {
    const set = idsByTarget.get(target)
    if (!set || set.size === 0) continue
    keyParts.push(`${target}:${set.size}`)
  }
  const fetchKey = keyParts.sort().join('|')
  if (fetchKey === lastFetchKeyRef.current) return
  lastFetchKeyRef.current = fetchKey

  for (const target of targets) {
    const set = idsByTarget.get(target)
    if (!set || set.size === 0) continue
    const ids = Array.from(set)
    for (let i = 0; i < ids.length; i += FETCH_BY_IDS_CHUNK) {
      const chunk = ids.slice(i, i + FETCH_BY_IDS_CHUNK)
      client
        .fetchEntityByIds({ orgId, entityName: target, ids: chunk })
        .then((res) => {
          if (res.written > 0) {
            // Bump the grid's config version so cell renderers re-run and
            // pick up resolved names from the now-populated target collection.
            try {
              tableCoreStore.incrementConfigVersion()
            } catch {
              // best effort
            }
          }
        })
        .catch((err) => {
          logger.warn('relationship target fetchEntityByIds failed', {
            target,
            chunkSize: chunk.length,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }
  }
}
