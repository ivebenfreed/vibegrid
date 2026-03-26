/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest'
import { EditingStore } from '../EditingStore'

function createStore() {
  const tableCoreStore = {
    processedRows: [{ id: 'row-1', title: 'Initial value' }],
  } as any
  const visualStateStore = {} as any

  return new EditingStore(tableCoreStore, visualStateStore)
}

function withMockColumn(options: Record<string, any> = {}) {
  return {
    id: 'title',
    field: 'title',
    fieldType: {
      interactionPolicy: {
        blurPolicy: 'commit',
      },
    },
    ...options,
  } as any
}

describe('EditingStore', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('commits edit when clicking outside active editing portal', async () => {
    const store = createStore()

    store.startEdit('row-1:title', withMockColumn())

    const portal = document.createElement('div')
    portal.className = 'vibegridx-editing-portal'
    portal.setAttribute('data-cell-id', 'row-1:title')
    document.body.appendChild(portal)

    const outside = document.createElement('div')
    document.body.appendChild(outside)

    await store.handleOutsideClick(outside)

    expect(store.isEditing).toBe(false)
  })

  it('keeps editing when clicking inside active editing portal', async () => {
    const store = createStore()

    store.startEdit('row-1:title', withMockColumn())

    const portal = document.createElement('div')
    portal.className = 'vibegridx-editing-portal'
    portal.setAttribute('data-cell-id', 'row-1:title')
    const button = document.createElement('button')
    portal.appendChild(button)
    document.body.appendChild(portal)

    await store.handleOutsideClick(button)

    expect(store.isEditing).toBe(true)
  })

  it('keeps editing when clicking inside later matching modal portal', async () => {
    const store = createStore()

    store.startEdit('row-1:title', withMockColumn())

    const stalePortal = document.createElement('div')
    stalePortal.className = 'vibegridx-editing-portal'
    stalePortal.setAttribute('data-cell-id', 'row-1:title')
    const staleButton = document.createElement('button')
    stalePortal.appendChild(staleButton)
    document.body.appendChild(stalePortal)

    const activePortal = document.createElement('div')
    activePortal.className = 'vibegridx-editing-portal vibegridx-modal-editor vibegrid-long-text-editor-overlay'
    activePortal.setAttribute('data-cell-id', 'row-1:title')
    const activeButton = document.createElement('button')
    activePortal.appendChild(activeButton)
    document.body.appendChild(activePortal)

    await store.handleOutsideClick(activeButton)

    expect(store.isEditing).toBe(true)
  })

  it('keeps editing when clicking inside modal text editor portal', async () => {
    const store = createStore()

    store.startEdit('row-1:title', withMockColumn())

    const modalPortal = document.createElement('div')
    modalPortal.className = 'vibegridx-editing-portal vibegridx-modal-editor vibegrid-long-text-editor-overlay'
    modalPortal.setAttribute('data-cell-id', 'row-1:title')
    const button = document.createElement('button')
    modalPortal.appendChild(button)
    document.body.appendChild(modalPortal)

    await store.handleOutsideClick(button)

    expect(store.isEditing).toBe(true)
  })

  it('handles missing portal elements and still applies blur policy', async () => {
    const store = createStore()

    store.startEdit('row-1:title', withMockColumn())

    const outside = document.createElement('div')
    document.body.appendChild(outside)

    await store.handleOutsideClick(outside)

    expect(store.isEditing).toBe(false)
  })

  it('detects modal text editors by column cell type', () => {
    const store = createStore()

    store.startEdit('row-1:title', {
      ...withMockColumn(),
      cellType: 'longtext',
    })

    expect(store.isActiveModalTextEditor).toBe(true)
  })

  it('detects modal text editors by column type fallback', () => {
    const store = createStore()

    store.startEdit('row-1:title', {
      ...withMockColumn(),
      cellType: undefined,
      type: 'rich-text',
    })

    expect(store.isActiveModalTextEditor).toBe(true)
  })
})
