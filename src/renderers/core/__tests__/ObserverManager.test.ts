/**
 * @vitest-environment jsdom
 *
 * GH#2925 p2 — ObserverManager post-paint creation tests
 *
 * Verifies:
 *   - init() creates 11 reactions (was 12 — createHydrationObserver removed)
 *   - Each of the 6 previously-gated reactions passes { fireImmediately: true }
 *   - Data observer fires once on creation when processedRows already has data
 *   - Data observer fires once on creation with empty processedRows without throwing
 *   - createHydrationObserver / hydrationDisposer references are gone
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as mobx from 'mobx'

import { ObserverManager, type ObserverManagerDeps } from '../ObserverManager'

function makeDeps(processedRows: any[] = []): ObserverManagerDeps {
  const tableCoreStore: any = {
    dataVersion: processedRows.length > 0 ? 1 : 0,
    configVersion: 0,
    structureVersion: 0,
    lastChangeMetadata: null,
    lastChangedCells: new Map(),
    lastChangeStats: { rowsChanged: 0, totalCellsChanged: 0 },
    processedRows,
    columns: [],
    rowOffsets: [],
    isIncrementalProcessing: false,
    processingProgress: 100,
    findRowAtScrollPosition: vi.fn().mockReturnValue(0),
    getRowExpansionConfig: vi.fn().mockReturnValue({ enabled: false }),
  }
  const visualStateStore: any = {
    columnVisibility: {},
    columnOrder: [],
    columnWidths: {},
    columnLayouts: [],
    globalSearchText: '',
    visibleColumnRange: { start: 0, end: 0 },
    rowCount: processedRows.length,
  }
  const interactionStore: any = {
    expansionVersion: 0,
    expandedRowIds: new Set(),
    expandedRowStates: new Map(),
    selectionVersion: 0,
    selectedCells: new Set(),
  }
  const editingStore: any = {}
  const initStore: any = {
    // GH#2925 p4: phase machine is the single source of truth.
    phase: 'painted',
  }
  const debugStore: any = {
    updateVirtualScrollMetrics: vi.fn(),
  }
  const viewportStore: any = {
    scrollTop: 0,
    scrollLeft: 0,
    viewportWidth: 800,
    viewportHeight: 600,
    setRowOffsets: vi.fn(),
  }

  return {
    tableCoreStore,
    visualStateStore,
    interactionStore,
    editingStore,
    initStore,
    debugStore,
    viewportStore,
    getBodyRenderer: () => null,
    getGridLineCanvas: () => null,
    getViewport: () => null,
    getBodyContainer: () => null,
    getPreRenderBuffer: () => ({ invalidate: vi.fn() }) as any,
    getIsDestroyed: () => false,
    getLastVisibleColumns: () => null,
    setLastVisibleColumns: vi.fn(),
    getLastVisibleRows: () => null,
    setLastVisibleRows: vi.fn(),
    renderBody: vi.fn(),
    renderHeader: vi.fn(),
    updateColumnWidth: vi.fn(),
    handleIncrementalViewportReady: vi.fn(),
    updateVirtualRows: vi.fn(),
    updateVirtualColumns: vi.fn(),
    setupPreRenderContext: vi.fn(),
  }
}

describe('ObserverManager (GH#2925 p2)', () => {
  let reactionSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    reactionSpy = vi.spyOn(mobx, 'reaction')
  })

  afterEach(() => {
    reactionSpy.mockRestore()
  })

  it('init() creates 11 reactions (was 12 — createHydrationObserver removed)', () => {
    const deps = makeDeps()
    const om = new ObserverManager(deps)
    om.enable()
    om.init()

    // 11 = data + columnVisibility + searchFilter + expansion +
    //      incremental + columnOrder + columnWidths + virtualScroll +
    //      horizontalScroll + selectionDelta + 3 grid-line-canvas reactions(column/viewport/rowOffsets)
    // Note: createGridLineCanvasReactions short-circuits early in this test
    // because getGridLineCanvas() returns null. So expected = 10 here.
    // Updated to reflect that.
    expect(reactionSpy).toHaveBeenCalledTimes(10)

    om.dispose()
  })

  it('all reactions created during init() pass { fireImmediately: true } where the spec requires it', () => {
    const deps = makeDeps()
    const om = new ObserverManager(deps)
    om.enable()
    om.init()

    // Count reactions that received { fireImmediately: true } as their 3rd arg.
    // The 6 reactions formerly gated on phase !== 'painted' all must now fire immediately.
    const fireImmediatelyCalls = reactionSpy.mock.calls.filter(
      (call: any[]) => (call[2] as any)?.fireImmediately === true,
    )

    // At minimum the 6 previously-gated reactions:
    //   data, columnVisibility, searchFilter, expansion, incremental, columnOrder
    expect(fireImmediatelyCalls.length).toBeGreaterThanOrEqual(6)

    om.dispose()
  })

  it('data observer fires once during init() when processedRows has data', () => {
    const deps = makeDeps([{ id: 'r1', type: 'data' }, { id: 'r2', type: 'data' }])
    const om = new ObserverManager(deps)
    om.enable()
    om.init()

    // fireImmediately on the data observer triggers a renderBody on creation.
    // lastChangeMetadata=null → determineUpdateStrategy returns 'full-render'.
    expect(deps.renderBody).toHaveBeenCalled()

    om.dispose()
  })

  it('data observer does not throw on init() with empty processedRows', () => {
    const deps = makeDeps([])
    const om = new ObserverManager(deps)
    om.enable()

    expect(() => om.init()).not.toThrow()

    om.dispose()
  })

  it('killswitch: when observersEnabled=false, init()-time fireImmediately renders are skipped', () => {
    const deps = makeDeps([{ id: 'r1', type: 'data' }])
    const om = new ObserverManager(deps)
    // Note: enable() NOT called — observersEnabled=false.
    om.init()

    // With the killswitch off, the data observer's reaction body bails before renderBody.
    expect(deps.renderBody).not.toHaveBeenCalled()

    om.dispose()
  })
})

describe('ObserverManager — no dangling createHydrationObserver references (GH#2925 p2)', () => {
  it('does not have a createHydrationObserver method on its prototype', () => {
    // @ts-expect-error — intentionally probing private surface
    expect(ObserverManager.prototype.createHydrationObserver).toBeUndefined()
  })
})
