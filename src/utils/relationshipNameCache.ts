/**
 * Scoped per-(orgId, entityType) cache of (id → display name) for the
 * relationship name resolver. Bypasses TanStack DB / SQLite — the entries
 * here come from the by-ID `data.query` batch fetch driven by
 * `useRelationshipTargetCollections`.
 *
 * Lives outside the entity collection registry on purpose: subscribing the
 * full target collection triggers the 50k-record warmup, which OOMs on
 * cross-entity grids referencing high-cardinality entities like User /
 * Drawing / File. We only need names, not full records.
 */
type EntityKey = string // `${orgId}:${entityType}`

const nameCache = new Map<EntityKey, Map<string, string>>()

function makeKey(orgId: string, entityType: string): EntityKey {
  return `${orgId}:${entityType}`
}

export function getCachedName(orgId: string, entityType: string, id: string): string | undefined {
  return nameCache.get(makeKey(orgId, entityType))?.get(id)
}

export function setCachedNames(
  orgId: string,
  entityType: string,
  records: Array<{
    id: string
    name?: string | null
    title?: string | null
    display_name?: string | null
  }>,
): number {
  const key = makeKey(orgId, entityType)
  let map = nameCache.get(key)
  if (!map) {
    map = new Map()
    nameCache.set(key, map)
  }
  let added = 0
  for (const r of records) {
    if (!r || typeof r.id !== 'string') continue
    const name = (r.display_name || r.name || r.title) as string | undefined
    if (typeof name !== 'string' || name.length === 0) continue
    if (!map.has(r.id)) added++
    map.set(r.id, name)
  }
  return added
}

export function clearNameCache(orgId?: string): void {
  if (!orgId) {
    nameCache.clear()
    return
  }
  for (const key of Array.from(nameCache.keys())) {
    if (key.startsWith(`${orgId}:`)) nameCache.delete(key)
  }
}

export function debugSnapshot(): { totalKeys: number; totalIds: number } {
  let ids = 0
  for (const m of nameCache.values()) ids += m.size
  return { totalKeys: nameCache.size, totalIds: ids }
}
