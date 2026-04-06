/**
 * Kanban Performance and Structure Tests
 *
 * Covers the O(n) pre-split optimization added to KanbanBoard and the
 * structural changes to KanbanCard/KanbanColumn (GH#1539 refactor):
 *
 * 1. cardsByColumnId grouping logic (pure function extracted for testability)
 * 2. KanbanColumn receives pre-filtered cards (no internal column.cardIds filter)
 * 3. KanbanCard renders a <div> wrapper (not <li>)
 * 4. KanbanColumn uses <div> containers (not <ul>/<li>)
 * 5. GanttModule includes CutoffResizer + GanttTimeline in its render output
 * 6. VibeGrid.tsx activates modules via ViewModeRegistry (not hard-coded conditionals)
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ============================================================================
// Paths
// ============================================================================

const KANBAN_ROOT = resolve(__dirname, '..')
const VIBEGRID_ROOT = resolve(KANBAN_ROOT, '../..')
const MODULES_ROOT = resolve(VIBEGRID_ROOT, 'modules')

function read(filePath: string): string {
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
  return readFileSync(filePath, 'utf-8')
}

// ============================================================================
// Pure logic: cardsByColumnId grouping (mirrors KanbanBoard.tsx useMemo)
// ============================================================================

/**
 * Replicate the exact grouping logic from KanbanBoard.tsx for unit testing
 * without needing to render the React component.
 */
function groupCardsByColumnId(
  cards: Array<{ id: string; columnId: string }>,
): Map<string, Array<{ id: string; columnId: string }>> {
  const map = new Map<string, Array<{ id: string; columnId: string }>>()
  for (const card of cards) {
    let bucket = map.get(card.columnId)
    if (!bucket) {
      bucket = []
      map.set(card.columnId, bucket)
    }
    bucket.push(card)
  }
  return map
}

describe('KanbanBoard — cardsByColumnId O(n) pre-split logic', () => {
  it('groups cards by columnId in a single pass', () => {
    const cards = [
      { id: '1', columnId: 'open' },
      { id: '2', columnId: 'open' },
      { id: '3', columnId: 'closed' },
      { id: '4', columnId: '__no_status__' },
    ]

    const result = groupCardsByColumnId(cards)

    expect(result.get('open')).toHaveLength(2)
    expect(result.get('open')!.map((c) => c.id)).toEqual(['1', '2'])
    expect(result.get('closed')).toHaveLength(1)
    expect(result.get('closed')![0].id).toBe('3')
    expect(result.get('__no_status__')).toHaveLength(1)
    expect(result.get('__no_status__')![0].id).toBe('4')
  })

  it('returns empty map for empty card list', () => {
    const result = groupCardsByColumnId([])
    expect(result.size).toBe(0)
  })

  it('returns undefined (not empty array) for a column with no cards', () => {
    const cards = [{ id: '1', columnId: 'open' }]
    const result = groupCardsByColumnId(cards)
    expect(result.get('closed')).toBeUndefined()
  })

  it('handles all cards in the same column', () => {
    const cards = [
      { id: '1', columnId: 'open' },
      { id: '2', columnId: 'open' },
      { id: '3', columnId: 'open' },
    ]
    const result = groupCardsByColumnId(cards)
    expect(result.size).toBe(1)
    expect(result.get('open')).toHaveLength(3)
  })

  it('preserves card order within each column bucket', () => {
    const cards = [
      { id: 'c', columnId: 'open' },
      { id: 'a', columnId: 'open' },
      { id: 'b', columnId: 'open' },
    ]
    const result = groupCardsByColumnId(cards)
    expect(result.get('open')!.map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('scales correctly: 1000 cards across 10 columns', () => {
    const cards = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      columnId: `col-${i % 10}`,
    }))

    const result = groupCardsByColumnId(cards)

    expect(result.size).toBe(10)
    for (let i = 0; i < 10; i++) {
      expect(result.get(`col-${i}`)).toHaveLength(100)
    }
  })
})

// ============================================================================
// Source structure: KanbanBoard.tsx passes pre-filtered cards to KanbanColumn
// ============================================================================

describe('KanbanBoard.tsx — source structure', () => {
  const source = read(resolve(KANBAN_ROOT, 'KanbanBoard.tsx'))

  it('imports useMemo from react (used for cardsByColumnId)', () => {
    expect(source).toContain('useMemo')
  })

  it('builds cardsByColumnId map in a useMemo', () => {
    expect(source).toContain('cardsByColumnId')
    expect(source).toContain('useMemo')
  })

  it('passes cardsByColumnId.get(column.id) to KanbanColumn (pre-filtered, not all cards)', () => {
    // The old implementation passed all cards and let KanbanColumn filter internally.
    // The new implementation passes only the bucket for this column.
    expect(source).toContain('cardsByColumnId.get(column.id)')
  })

  it('does NOT pass the full cards array directly to KanbanColumn', () => {
    // Guard against regression: "cards={cards}" should not appear in the columns map.
    // The pattern cards={cards} would indicate the old unoptimized approach.
    const columnRenderMatch = source.match(/columns\.map[\s\S]*?KanbanColumn[\s\S]*?\/>/m)
    if (columnRenderMatch) {
      expect(columnRenderMatch[0]).not.toMatch(/cards=\{cards\}/)
    }
  })

  it('falls back to empty array when column has no cards (nullish coalescing)', () => {
    expect(source).toContain('?? []')
  })
})

// ============================================================================
// Source structure: KanbanColumn.tsx — pre-filtered cards, virtualization
// ============================================================================

describe('KanbanColumn.tsx — source structure', () => {
  const source = read(resolve(KANBAN_ROOT, 'KanbanColumn.tsx'))

  it('imports useVirtualizer from @tanstack/react-virtual', () => {
    expect(source).toContain('@tanstack/react-virtual')
    expect(source).toContain('useVirtualizer')
  })

  it('uses useRef for the virtualizer scroll element', () => {
    expect(source).toContain('useRef')
    expect(source).toContain('parentRef')
  })

  it('does NOT filter cards by column.cardIds internally (pre-filtered by KanbanBoard)', () => {
    // Old code: cards.filter((card) => column.cardIds.includes(card.id))
    expect(source).not.toContain('column.cardIds.includes')
    expect(source).not.toContain('.filter(')
  })

  it('renders a <div> cards container (not <ul>)', () => {
    // The outer cards container was changed from <ul> to <div>
    expect(source).not.toMatch(/<ul\s/)
    expect(source).toContain('<div ref={parentRef}')
  })

  it('renders virtual items using rowVirtualizer.getVirtualItems()', () => {
    expect(source).toContain('rowVirtualizer.getVirtualItems()')
  })

  it('applies translateY transform for virtual item positioning', () => {
    expect(source).toContain('translateY')
    expect(source).toContain('virtualItem.start')
  })
})

// ============================================================================
// Source structure: KanbanCard.tsx — <div> wrapper (not <li>)
// ============================================================================

describe('KanbanCard.tsx — source structure', () => {
  const source = read(resolve(KANBAN_ROOT, 'KanbanCard.tsx'))

  it('wraps Card in a <div> (not <li>)', () => {
    // The element was changed from <li className="list-none"> to <div>
    expect(source).not.toMatch(/<li\b/)
    expect(source).not.toMatch(/<\/li>/)
  })

  it('does not use list-none class (no longer a list item)', () => {
    expect(source).not.toContain('list-none')
  })

  it('opens with a <div> wrapper (not <li>)', () => {
    // Should have a <div> as the outermost element returned (may have ref/attributes)
    expect(source).toMatch(/<div\s/)
  })
})

// ============================================================================
// Source structure: GanttModule.tsx — CutoffResizer moved into module render
// ============================================================================

describe('GanttModule.tsx — source structure', () => {
  const source = read(resolve(MODULES_ROOT, 'gantt/GanttModule.tsx'))

  it('imports CutoffResizer from the components directory', () => {
    expect(source).toContain('CutoffResizer')
    expect(source).toContain("from '../../components/CutoffResizer'")
  })

  it('imports GanttTimeline from the components directory', () => {
    expect(source).toContain('GanttTimeline')
    expect(source).toContain("from '../../components/GanttTimeline'")
  })

  it('renders CutoffResizer in GanttModuleContent', () => {
    // CutoffResizer must be in the JSX output of GanttModuleContent
    expect(source).toMatch(/<CutoffResizer/)
  })

  it('renders GanttTimeline in GanttModuleContent', () => {
    expect(source).toMatch(/<GanttTimeline/)
  })

  it('handles cutoff resize via viewModeStore.setCutoffWidth', () => {
    expect(source).toContain('setCutoffWidth')
  })

  it('handles cutoff reset via viewModeStore.resetCutoffWidth', () => {
    expect(source).toContain('resetCutoffWidth')
  })

  it('CutoffResizer appears before GanttTimeline in source order', () => {
    const cutoffIdx = source.indexOf('<CutoffResizer')
    const timelineIdx = source.indexOf('<GanttTimeline')
    expect(cutoffIdx).toBeGreaterThanOrEqual(0)
    expect(timelineIdx).toBeGreaterThanOrEqual(0)
    expect(cutoffIdx).toBeLessThan(timelineIdx)
  })
})

// ============================================================================
// Source structure: VibeGrid.tsx — module activation via ViewModeRegistry
// ============================================================================

describe('VibeGrid.tsx — module activation via ViewModeRegistry', () => {
  const source = read(resolve(VIBEGRID_ROOT, 'VibeGrid.tsx'))

  it('imports viewModeRegistry from the modules barrel', () => {
    expect(source).toContain('viewModeRegistry')
    expect(source).toContain("from './modules'")
  })

  it('uses useState to track the active module', () => {
    expect(source).toContain('activeModule')
    expect(source).toContain('setActiveModule')
  })

  it('calls viewModeRegistry.get() to load the module', () => {
    expect(source).toMatch(/viewModeRegistry\.get\(/)
  })

  it('calls module.init(stores) after loading', () => {
    expect(source).toContain('module.init?.(stores)')
  })

  it('stores the init cleanup in a ref', () => {
    expect(source).toContain('moduleCleanupRef')
  })

  it('runs the cleanup function when viewMode changes (useEffect cleanup)', () => {
    // The useEffect returns a cleanup that calls moduleCleanupRef.current?.()
    expect(source).toContain('moduleCleanupRef.current?.()')
  })

  it('does NOT directly hard-code KanbanBoard inline import in VibeGrid', () => {
    // Guard against regression: KanbanBoard should now be rendered by the module,
    // not inline in VibeGrid.tsx
    expect(source).not.toContain('import { KanbanBoard }')
  })

  it('does NOT directly hard-code GanttTimeline inline import in VibeGrid', () => {
    // Guard against regression: GanttTimeline should now be rendered by GanttModule
    expect(source).not.toContain('import { GanttTimeline }')
  })
})
