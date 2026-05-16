/**
 * View mode ModuleErrorBoundary regression test
 *
 * Repro: switching to Gantt/Kanban while the table is still hydrating crashed
 * the app — the unhandled error bubbled to the route-level GeneralError
 * ("500 — Oops! Something went wrong") page.
 *
 * Fix (commit 86c70ad19): wrap the non-table view-module render (and the
 * Gantt toolbar) inside VibeGrid in:
 *   1. A readiness gate — `initStore.phase === 'painted'` — so non-table
 *      modules never even attempt to render against partially-hydrated
 *      substrate state.
 *   2. A `<ModuleErrorBoundary>` whose fallback renders `<ModuleErrorFallback>`
 *      locally (with a "Switch to Table View" recovery affordance wired to
 *      `onViewModeChange('table')`) instead of letting the throw propagate.
 *
 * This test reproduces the **exact JSX pattern** from VibeGrid.tsx in a
 * minimal harness so we exercise the integration without mounting the full
 * grid (which needs SQLite, MobX stores, contexts, useVibeGridData, etc.).
 *
 * @vitest-environment jsdom
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Match the mock shape used by modules/__tests__/integration.test.ts.
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Real production components — these are what VibeGrid.tsx imports.
import { ModuleErrorBoundary, ModuleErrorFallback } from '../components/ModuleErrorBoundary'
// Real production registry — same singleton VibeGrid.tsx consumes via
// `viewModeRegistry.get(effectiveViewMode).then((module) => setActiveModule(module))`.
import { viewModeRegistry } from '../modules'
import type { GridModule } from '../modules/GridModule'

// Silence the React "uncaught error in error boundary" console noise the
// boundary deliberately surfaces while propagating to componentDidCatch.
// (Re-applied in beforeEach since vitest may reset spies between files.)
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

// ============================================================================
// Test Harness — mirrors VibeGrid.tsx integration sites exactly
// ============================================================================

/**
 * Minimal `activeModule` shape — the production code calls
 *   activeModule.render({tableId, entityType, ...}, stores)
 * but for the boundary-integration test all that matters is that `render`
 * gets invoked (and may throw) inside the boundary.
 */
type HarnessActiveModule = {
  id: string
  render: () => React.ReactNode
} | null

/**
 * Mirrors the exact JSX shape from VibeGrid.tsx (lines 1502-1530):
 *
 *   {activeModule && activeModule.id !== 'table' && initStore.phase === 'painted' && (
 *     <ModuleErrorBoundary fallback={(error, reset) => (
 *       <ModuleErrorFallback error={error} onReset={reset}
 *         onSwitchToTable={onViewModeChange ? () => onViewModeChange('table') : undefined} />
 *     )}>
 *       {activeModule.render(...)}
 *     </ModuleErrorBoundary>
 *   )}
 */
function MiniHarness({
  initPhase,
  activeModule,
  onViewModeChange,
}: {
  initPhase: 'init' | 'painted'
  activeModule: HarnessActiveModule
  onViewModeChange?: (mode: 'table') => void
}) {
  return (
    <>
      {activeModule && activeModule.id !== 'table' && initPhase === 'painted' && (
        <ModuleErrorBoundary
          fallback={(error, reset) => (
            <ModuleErrorFallback
              error={error}
              onReset={reset}
              onSwitchToTable={onViewModeChange ? () => onViewModeChange('table') : undefined}
            />
          )}
        >
          {activeModule.render()}
        </ModuleErrorBoundary>
      )}
    </>
  )
}

/**
 * A throwing React component. Throws during its own render so the nearest
 * ancestor `<ModuleErrorBoundary>` can catch it — modeling a transient
 * store read (e.g. `kanbanViewStore.cards`) against partially-hydrated
 * substrate state.
 *
 * IMPORTANT: the throw MUST happen inside a descendant component, not at
 * the JSX evaluation site. VibeGrid.tsx writes
 *   <ModuleErrorBoundary>{activeModule.render(...)}</ModuleErrorBoundary>
 * — the call to `activeModule.render()` runs inside VibeGrid's render to
 * obtain a React element. If the call itself synchronously threw, the
 * throw would propagate through VibeGrid's render (past the boundary).
 * Production-safe modules return an element whose component throws.
 */
function Thrower({ message }: { message: string }): React.ReactElement {
  throw new Error(message)
}

function makeThrowingModule(id: string, message: string): NonNullable<HarnessActiveModule> {
  return {
    id,
    render: () => <Thrower message={message} />,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('VibeGrid view-mode ModuleErrorBoundary integration', () => {
  it('does NOT mount the activeModule before initStore.phase === "painted" (readiness gate)', () => {
    // Even if the module would throw, the gate prevents the render from
    // happening — so no fallback, no console error, nothing.
    const kanban = makeThrowingModule(
      'kanban',
      'kanbanViewStore.cards read on null substrate',
    )

    render(
      <MiniHarness
        initPhase="init"
        activeModule={kanban}
        onViewModeChange={vi.fn()}
      />,
    )

    // No fallback heading — the module never even attempted to render.
    expect(screen.queryByText('View mode failed to load')).toBeNull()
    // And no Switch-to-Table button leaked in.
    expect(screen.queryByRole('button', { name: 'Switch to Table View' })).toBeNull()
  })

  it('catches the activeModule render throw once painted and surfaces the local fallback instead of letting it bubble', () => {
    const kanban = makeThrowingModule(
      'kanban',
      'kanbanViewStore.cards read on null substrate',
    )

    render(
      <MiniHarness
        initPhase="painted"
        activeModule={kanban}
        onViewModeChange={vi.fn()}
      />,
    )

    // The user sees the local boundary fallback, NOT the route-level
    // GeneralError "500 — Oops! Something went wrong" page.
    expect(screen.getByText('View mode failed to load')).toBeInTheDocument()
    expect(
      screen.getByText('kanbanViewStore.cards read on null substrate'),
    ).toBeInTheDocument()
  })

  it('wires "Switch to Table View" recovery to onViewModeChange("table")', () => {
    const onViewModeChange = vi.fn<(mode: 'table') => void>()
    const gantt = makeThrowingModule(
      'gantt',
      'ganttViewStore.barPositions read during hydration',
    )

    render(
      <MiniHarness
        initPhase="painted"
        activeModule={gantt}
        onViewModeChange={onViewModeChange}
      />,
    )

    const switchButton = screen.getByRole('button', { name: 'Switch to Table View' })
    fireEvent.click(switchButton)

    expect(onViewModeChange).toHaveBeenCalledTimes(1)
    expect(onViewModeChange).toHaveBeenCalledWith('table')
  })

  it('omits "Switch to Table View" when onViewModeChange is not provided, keeping "Try Again"', () => {
    const kanban = makeThrowingModule('kanban', 'boom')

    render(<MiniHarness initPhase="painted" activeModule={kanban} />)

    expect(screen.queryByRole('button', { name: 'Switch to Table View' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })
})

// ============================================================================
// Bonus alignment — registry pathway mirrors VibeGrid.tsx
// ============================================================================
//
// VibeGrid.tsx loads modules via:
//   viewModeRegistry.get(effectiveViewMode).then((module) => setActiveModule(module))
// So the test also proves the boundary catches a throw from a module
// resolved through the real registry singleton.

const THROWING_MODULE_ID = 'kanban-test-throw'

describe('viewModeRegistry → MiniHarness end-to-end (real registry)', () => {
  afterEach(() => {
    // Don't leak the test module across the rest of the suite.
    viewModeRegistry.unregister(THROWING_MODULE_ID)
  })

  it('catches a throw from a module loaded via viewModeRegistry.get() once painted', async () => {
    viewModeRegistry.register(
      THROWING_MODULE_ID,
      async (): Promise<GridModule> => ({
        id: THROWING_MODULE_ID,
        displayName: 'Throwing Test Module',
        // GridModule.render returns a React element whose own component
        // throws during render — same pattern as the inline tests above
        // and what real modules do (return an element, not throw on call).
        render: () => <Thrower message="substrate not ready (registry path)" />,
      }),
      { displayName: 'Throwing Test Module' },
    )

    const loaded = await viewModeRegistry.get(THROWING_MODULE_ID)
    expect(loaded.id).toBe(THROWING_MODULE_ID)

    // Wrap the loaded module in the same harness shape VibeGrid.tsx uses:
    //   {activeModule.render({...}, stores)}
    const harnessModule = {
      id: loaded.id,
      render: () => loaded.render({ tableId: 't', entityType: 'E' } as never, {} as never),
    }

    render(
      <MiniHarness
        initPhase="painted"
        activeModule={harnessModule}
        onViewModeChange={vi.fn()}
      />,
    )

    expect(screen.getByText('View mode failed to load')).toBeInTheDocument()
    expect(screen.getByText('substrate not ready (registry path)')).toBeInTheDocument()
  })
})
