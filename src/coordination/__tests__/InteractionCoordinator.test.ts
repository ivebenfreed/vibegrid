/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import { InteractionCoordinator } from '../InteractionCoordinator'
import { EditingStore } from '../../stores/EditingStore'
import { beforeEach } from 'vitest'

function createStore() {
  const tableCoreStore = {
    processedRows: [{ id: 'row-1', title: 'Initial value' }],
  } as any
  const visualStateStore = {
    columns: [{ id: 'title' }],
  } as any

  return { editingStore: new EditingStore(tableCoreStore, visualStateStore) }
}

function withMockColumn(options: Record<string, any> = {}) {
  return {
    id: 'title',
    field: 'title',
    cellType: 'text',
    fieldType: {
      interactionPolicy: {
        blurPolicy: 'commit',
      },
    },
    ...options,
  } as any
}

describe('InteractionCoordinator', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('does not blur editing when pointer is inside active editor portal', () => {
    const { editingStore } = createStore()
    const interactionStore = { clearSelection: vi.fn() }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const coordinator = new InteractionCoordinator(
      container,
      interactionStore as any,
      {} as any,
      {} as any,
      editingStore,
      { columns: [withMockColumn()] } as any,
      {} as any,
    )

    const handleBlurSpy = vi.spyOn(editingStore, 'handleBlur')
    editingStore.startEdit('row-1:title', withMockColumn())

    const portal = document.createElement('div')
    portal.className = 'vibegridx-editing-portal vibegridx-modal-editor vibegrid-long-text-editor-overlay'
    portal.setAttribute('data-cell-id', 'row-1:title')
    const button = document.createElement('button')
    portal.appendChild(button)
    document.body.appendChild(portal)

    coordinator.handleOutsidePointer({ target: button } as unknown as PointerEvent)

    expect(handleBlurSpy).not.toHaveBeenCalled()
    expect(editingStore.isEditing).toBe(true)
  })

  it('blurs editing when pointer is outside active editor portal', () => {
    const { editingStore } = createStore()
    const interactionStore = { clearSelection: vi.fn() }
    const col = withMockColumn()

    const container = document.createElement('div')
    document.body.appendChild(container)

    const coordinator = new InteractionCoordinator(
      container,
      interactionStore as any,
      {} as any,
      {} as any,
      editingStore,
      {} as any,
      {} as any,
    )

    const handleBlurSpy = vi.spyOn(editingStore, 'handleBlur').mockResolvedValue(undefined)
    editingStore.startEdit('row-1:title', col)

    const outside = document.createElement('div')
    document.body.appendChild(outside)

    coordinator.handleOutsidePointer({ target: outside } as unknown as PointerEvent)

    expect(handleBlurSpy).toHaveBeenCalledWith('outside-pointer')
  })

  it('does not intercept Enter for modal text editor', () => {
    const { editingStore } = createStore()
    const interactionStore = { clearSelection: vi.fn() }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const coordinator = new InteractionCoordinator(
      container,
      interactionStore as any,
      {} as any,
      {} as any,
      editingStore,
      { columns: [withMockColumn({ cellType: 'longtext' })] } as any,
      {} as any,
    )

    const commitSpy = vi
      .spyOn(editingStore, 'commitEdit')
      .mockImplementation(() => Promise.resolve(undefined) as Promise<void>)

    editingStore.startEdit('row-1:title', withMockColumn({ cellType: 'longtext' }))

    const handled = coordinator.handleKeyboardNavigation('Enter', {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    })

    expect(handled).toBe(false)
    expect(commitSpy).not.toHaveBeenCalled()
    expect(editingStore.isEditing).toBe(true)
  })

  it('does not intercept Tab for modal text editor', () => {
    const { editingStore } = createStore()
    const interactionStore = { clearSelection: vi.fn() }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const coordinator = new InteractionCoordinator(
      container,
      interactionStore as any,
      {} as any,
      {} as any,
      editingStore,
      { columns: [withMockColumn({ cellType: 'markdown' })] } as any,
      {} as any,
    )

    const commitSpy = vi
      .spyOn(editingStore, 'commitEdit')
      .mockImplementation(() => Promise.resolve(undefined) as Promise<void>)

    editingStore.startEdit('row-1:title', withMockColumn({ cellType: 'markdown' }))

    const handled = coordinator.handleKeyboardNavigation('Tab', {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    })

    expect(handled).toBe(false)
    expect(commitSpy).not.toHaveBeenCalled()
    expect(editingStore.isEditing).toBe(true)
  })

  it('keeps committing Enter for non-modal editors', () => {
    const { editingStore } = createStore()
    const interactionStore = { clearSelection: vi.fn() }

    const container = document.createElement('div')
    document.body.appendChild(container)

    const coordinator = new InteractionCoordinator(
      container,
      interactionStore as any,
      {} as any,
      {} as any,
      editingStore,
      { columns: [withMockColumn()] } as any,
      {} as any,
    )

    const commitSpy = vi
      .spyOn(editingStore, 'commitEdit')
      .mockImplementation(() => Promise.resolve(undefined) as Promise<void>)

    editingStore.startEdit('row-1:title', withMockColumn())

    const handled = coordinator.handleKeyboardNavigation('Enter', {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    })

    expect(handled).toBe(true)
    expect(commitSpy).toHaveBeenCalledWith('enter', undefined)
  })
})
