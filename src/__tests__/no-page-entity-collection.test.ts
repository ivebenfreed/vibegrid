/**
 * Regression test: page-entity `useEntityCollection` must NOT be called
 * from the VibeGrid page-entity render path (GH#2848 Phase D B33).
 *
 * Substrate (the SQLite-backed reactive query path in
 * `shared/data/db/sqlite/`) is the canonical data source for VibeGrid
 * since the GH#2806 cutover. After Phase D B30/B31/B32 migrations, the
 * `useEntityCollection` hook is reserved for these surviving callers
 * (~11 sites, none in the VibeGrid page-entity flow):
 *
 *   - 2 Documents detail view (not a VibeGrid path)
 *   - 2 cross-entity name resolution (background lane only)
 *   - 4 d-KEEP low-volume hooks (ReminderActivityPanel,
 *     useAgentOrchSessions, useChildEntityData, useEntityListData)
 *   - 3 convenience wrappers (useProjectsCollection, useUsersCollection,
 *     useTasksCollection)
 *
 * If a future PR re-introduces a `useEntityCollection(<page-entity>)`
 * call to `EntityListView`, `VibeGrid`, or any sibling page-entity
 * entry point, this test fails — making the regression visible at CI
 * time rather than at production-debug time.
 *
 * Why structural source assertions instead of a full VibeGrid mount?
 * Mounting VibeGrid for entity 'RFI' requires the SharedWorker, MobX
 * stores, oRPC client, schema collection, and a populated DOM — far
 * too heavy for a fast unit suite. The structural assertion catches
 * the same regression (any `useEntityCollection(resolvedName)` /
 * `useEntityCollection(entityName)` / `useEntityCollection(entityType)`
 * pattern in the page-entity files) at near-zero cost.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = resolve(__dirname, '../../..')

/** Read a source file under apps/web/src by relative path. */
function readSource(rel: string): string {
  return readFileSync(resolve(WEB_SRC, rel), 'utf-8')
}

/**
 * Strip `//` and `/* ... *\/` comments so the assertion only inspects
 * executable code. (Comments often reference removed APIs as historical
 * context — those are not regressions.)
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, (_match, prefix) => prefix)
}

describe('No page-entity useEntityCollection in VibeGrid flow (GH#2848 B33)', () => {
  // ----------------------------------------------------------
  // The page-entity entry points: VibeGrid + EntityListView
  // ----------------------------------------------------------

  describe('apps/web/src/systems/vibegrid/VibeGrid.tsx', () => {
    const path = 'systems/vibegrid/VibeGrid.tsx'

    it('does not call useEntityCollection with the page entityType', () => {
      const code = stripComments(readSource(path))
      // Must not call useEntityCollection(entityType) or
      // useEntityCollection(props.entityType) or any direct page-entity
      // string literal.
      expect(code).not.toMatch(/useEntityCollection\s*\(\s*entityType\b/)
      expect(code).not.toMatch(/useEntityCollection\s*\(\s*resolvedName\b/)
      expect(code).not.toMatch(/useEntityCollection\s*\(\s*entityName\b/)
      expect(code).not.toMatch(/useEntityCollection\s*\(\s*['"]RFI['"]/)
    })

    it('does not import the no-collections URL flag pattern', () => {
      const code = readSource(path)
      expect(code).not.toContain('no-collections')
    })
  })

  describe('apps/web/src/features/entities/components/EntityListView.tsx', () => {
    const path = 'features/entities/components/EntityListView.tsx'

    it('does not call useEntityCollection or useEntityListData with page entityName', () => {
      const code = stripComments(readSource(path))
      // EntityListView is the page-entity entry route. It must not call
      // useEntityCollection on the dynamic page entity (which would fan
      // out to a 50k cursor-pagination race against substrate).
      expect(code).not.toMatch(/useEntityCollection\s*\(\s*resolvedName\b/)
      expect(code).not.toMatch(/useEntityCollection\s*\(\s*entityName\b/)
      // useEntityListData wraps useEntityCollection internally; calling
      // it with a non-empty page-entity name reintroduces the regression.
      expect(code).not.toMatch(/useEntityListData\s*\(\s*resolvedName\b/)
      expect(code).not.toMatch(/useEntityListData\s*\(\s*entityName\b/)
    })

    it('does not import the no-collections URL flag pattern', () => {
      const code = readSource(path)
      expect(code).not.toContain('no-collections')
    })
  })

  // ----------------------------------------------------------
  // The cap-warning emit path is gone (B33 removal)
  // ----------------------------------------------------------

  describe('apps/web/src/shared/data/db/collections/entity-collections.ts', () => {
    const path = 'shared/data/db/collections/entity-collections.ts'

    it('does not emit the "collection ... capped at" cap warning', () => {
      const code = readSource(path)
      // GH#2848 B33: removed the cap-warning emit path. No surviving
      // caller hits the 50k cap (substrate owns the page entity), so
      // the warning is dead code by definition.
      expect(code).not.toContain('capped at')
      expect(code).not.toContain('Collection bootstrap capped')
    })
  })

  // ----------------------------------------------------------
  // useEntityCollection.ts retains its empty-string defensive
  // guard (callers may still pass '' to short-circuit)
  // ----------------------------------------------------------

  describe('apps/web/src/shared/data/db/hooks/useEntityCollection.ts', () => {
    const path = 'shared/data/db/hooks/useEntityCollection.ts'

    it('retains the empty-string short-circuit guard', () => {
      const code = readSource(path)
      // The guard `if (!entityName) return null` prevents phantom
      // collection registration when callers pass '' to skip. Removing
      // the guard would cause warmEntity('') to fail with
      // "entityName is required".
      expect(code).toMatch(/if\s*\(\s*!\s*entityName\s*\)\s*return\s+null/)
    })
  })
})
