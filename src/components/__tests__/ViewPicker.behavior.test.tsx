/* @vitest-environment jsdom */

/**
 * ViewPicker behavioral tests (GH#3188)
 *
 * Validates the `onActiveViewDeleted` parent-notify wire that the
 * source-text companion in `ViewPicker.test.tsx` only checks at the
 * regex level. Specifically:
 *
 *   B1: deleting the currently-active view fires onActiveViewDeleted
 *   B2: deleting a non-active view does NOT fire onActiveViewDeleted
 *
 * These two cases are the load-bearing invariants that translate into
 * the user-visible bug (#3188): toolbar pill, dropdown active
 * indicator, and `?view=<UUID>` URL param all stay stale after the
 * active view is deleted unless this wire is correct.
 *
 * Convention break: the sibling source-text file uses a node env
 * directive because it only does fs/regex work. This file needs jsdom
 * for render() from @testing-library/react. Per canonical-patterns.md
 * "Add behavioral tests (not just source-text / regex) for any
 * load-bearing invariant" — extracted to a dedicated
 * `.behavior.test.tsx` file to keep the env split clean (mirrors
 * `FilterValueInput.behavior.test.tsx`).
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- hoisted spies -----------------------------------------------------------

const { deleteSpy, refreshViewsSpy, loadViewsSpy } = vi.hoisted(() => ({
  deleteSpy: vi.fn(),
  refreshViewsSpy: vi.fn(),
  loadViewsSpy: vi.fn(),
}))

// Mock orpcClient — only the surfaces we exercise. ViewPicker imports
// the full `orpcClient` but only calls `.dataforge.views.{delete, pin,
// unpin, setDefault, create, reorderPins}` in the delete codepath we
// care about, just `.dataforge.views.delete` fires.
vi.mock('@/shared/data/orpc/client', () => ({
  orpcClient: {
    dataforge: {
      views: {
        delete: deleteSpy,
        pin: vi.fn(),
        unpin: vi.fn(),
        setDefault: vi.fn(),
        create: vi.fn(),
        reorderPins: vi.fn(),
      },
    },
  },
}))

vi.mock('@/shared/data/orpc/domains/views-fetch', () => ({
  loadViews: loadViewsSpy,
  refreshViews: refreshViewsSpy,
}))

// ViewsStore — real implementation, since the picker reads it
// synchronously on render. We seed it with two views in beforeEach.
import { viewsStore } from '@/shared/data/stores/ViewsStore'
import {
  ViewPicker,
  type EntityViewPinRow,
  type EntityViewRow,
} from '../ViewPicker'

const ORG_ID = 'org-test'
const ENTITY_TYPE = 'TestEntity'
const USER_ID = 'user-test'

const ACTIVE_VIEW: EntityViewRow = {
  id: 'view-active',
  organization_id: ORG_ID,
  entity_type: ENTITY_TYPE,
  name: 'Active View',
  icon: null,
  color: null,
  created_by: USER_ID,
  visibility: 'personal',
  is_default: false,
  config: {},
  config_version: 1,
  created_at: '2026-05-23T00:00:00Z',
  updated_at: '2026-05-23T00:00:00Z',
}

const OTHER_VIEW: EntityViewRow = {
  ...ACTIVE_VIEW,
  id: 'view-other',
  name: 'Other View',
}

function seedViewsStore(views: EntityViewRow[] = [ACTIVE_VIEW, OTHER_VIEW]): void {
  viewsStore.set(ENTITY_TYPE, {
    views,
    pins: [] as EntityViewPinRow[],
    defaultViewConfig: null,
  })
}

function renderViewPicker(overrides: {
  activeViewId: string | null
  onActiveViewDeleted?: () => void
}) {
  return render(
    <ViewPicker
      entityType={ENTITY_TYPE}
      orgId={ORG_ID}
      activeViewId={overrides.activeViewId}
      activeViewName={
        overrides.activeViewId === ACTIVE_VIEW.id ? ACTIVE_VIEW.name : null
      }
      hasUnsavedChanges={false}
      currentViewMode="table"
      onViewSelect={vi.fn()}
      onSaveView={vi.fn()}
      onUnsavedSelect={vi.fn()}
      onActiveViewDeleted={overrides.onActiveViewDeleted}
      userId={USER_ID}
      userRole="admin"
    />,
  )
}

beforeEach(() => {
  deleteSpy.mockReset()
  deleteSpy.mockResolvedValue({ success: true })
  refreshViewsSpy.mockReset()
  refreshViewsSpy.mockResolvedValue({
    views: [ACTIVE_VIEW, OTHER_VIEW],
    pins: [],
    defaultViewConfig: null,
  })
  loadViewsSpy.mockReset()
  loadViewsSpy.mockResolvedValue({
    views: [ACTIVE_VIEW, OTHER_VIEW],
    pins: [],
    defaultViewConfig: null,
  })
  viewsStore.clear()
  seedViewsStore()
})

afterEach(() => {
  viewsStore.clear()
})

describe('ViewPicker delete callback wiring (GH#3188)', () => {
  // Helper: trigger the per-view Delete menu item and flush any
  // microtasks scheduled by handleDelete (awaits delete + refreshViews
  // before firing the parent callback).
  async function clickDelete(viewId: string): Promise<void> {
    await act(async () => {
      fireEvent.click(screen.getByTestId('view-picker-trigger'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId(`view-picker-menu-${viewId}`))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId(`view-picker-delete-${viewId}`))
    })
  }

  it('fires onActiveViewDeleted exactly once when the active view is deleted', async () => {
    const onActiveViewDeleted = vi.fn()
    renderViewPicker({
      activeViewId: ACTIVE_VIEW.id,
      onActiveViewDeleted,
    })

    await clickDelete(ACTIVE_VIEW.id)

    expect(deleteSpy).toHaveBeenCalledWith({ view_id: ACTIVE_VIEW.id })
    expect(onActiveViewDeleted).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onActiveViewDeleted when a non-active view is deleted', async () => {
    const onActiveViewDeleted = vi.fn()
    renderViewPicker({
      activeViewId: ACTIVE_VIEW.id,
      onActiveViewDeleted,
    })

    await clickDelete(OTHER_VIEW.id)

    expect(deleteSpy).toHaveBeenCalledWith({ view_id: OTHER_VIEW.id })
    expect(onActiveViewDeleted).not.toHaveBeenCalled()
  })

  it('does not throw when onActiveViewDeleted is undefined and the active view is deleted', async () => {
    renderViewPicker({
      activeViewId: ACTIVE_VIEW.id,
      // onActiveViewDeleted intentionally omitted — optional prop.
    })

    // Should not throw — handleDelete uses optional-chaining (`?.()`).
    await expect(clickDelete(ACTIVE_VIEW.id)).resolves.not.toThrow()

    expect(deleteSpy).toHaveBeenCalledWith({ view_id: ACTIVE_VIEW.id })
  })
})
