/**
 * View mode ModuleErrorBoundary regression test
 *
 * Repro: switching to Gantt/Kanban while the table is still fetching crashes
 * the app — the unhandled error bubbles to the route-level GeneralError
 * ("500 — Oops! Something went wrong") page.
 *
 * Fix: wrap the non-table view-module render (and the Gantt toolbar) inside
 * VibeGrid in a ModuleErrorBoundary so transient renders against
 * partially-hydrated substrate state are caught locally and offer a
 * "Switch to Table View" recovery path.
 *
 * This test takes the focused-component approach allowed by the spec —
 * mount the boundary directly with a throwing child rather than wiring a
 * full VibeGrid mount (which requires SQLite, MobX stores, contexts, and
 * the entity data layer).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ModuleErrorBoundary, ModuleErrorFallback } from '../components/ModuleErrorBoundary'

// Silence the React error-boundary "uncaught error" console noise so test
// output stays clean; the boundary's own logger is also exercised by the
// component but is wired through getLogger() which is a no-op in tests.
vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

function Thrower({ message }: { message: string }): never {
  throw new Error(message)
}

describe('VibeGrid view-mode ModuleErrorBoundary integration', () => {
  it('catches a render-time throw from the view module and renders the fallback heading instead of letting it bubble', () => {
    render(
      <ModuleErrorBoundary
        fallback={(error, reset) => <ModuleErrorFallback error={error} onReset={reset} />}
      >
        <Thrower message="kanbanViewStore.cards read on null substrate" />
      </ModuleErrorBoundary>,
    )

    // The fallback heading the user actually sees instead of the route's
    // GeneralError "500 — Oops! Something went wrong" page.
    expect(screen.getByText('View mode failed to load')).toBeInTheDocument()
    // The thrown message surfaces in the fallback body so the user has a
    // hint of what went wrong.
    expect(screen.getByText('kanbanViewStore.cards read on null substrate')).toBeInTheDocument()
  })

  it('offers a "Switch to Table View" recovery affordance when onViewModeChange is wired', () => {
    const onViewModeChange = vi.fn()

    render(
      <ModuleErrorBoundary
        fallback={(error, reset) => (
          <ModuleErrorFallback
            error={error}
            onReset={reset}
            onSwitchToTable={() => onViewModeChange('table')}
          />
        )}
      >
        <Thrower message="ganttViewStore.barPositions read during hydration" />
      </ModuleErrorBoundary>,
    )

    const switchButton = screen.getByRole('button', { name: 'Switch to Table View' })
    fireEvent.click(switchButton)

    expect(onViewModeChange).toHaveBeenCalledTimes(1)
    expect(onViewModeChange).toHaveBeenCalledWith('table')
  })

  it('omits the "Switch to Table View" button when no onViewModeChange is provided', () => {
    render(
      <ModuleErrorBoundary
        fallback={(error, reset) => <ModuleErrorFallback error={error} onReset={reset} />}
      >
        <Thrower message="boom" />
      </ModuleErrorBoundary>,
    )

    expect(screen.queryByRole('button', { name: 'Switch to Table View' })).toBeNull()
    // The "Try Again" affordance should still be present.
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })
})
