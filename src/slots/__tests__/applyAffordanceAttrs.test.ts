/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import type { CellRenderer } from '../SlotRegistry'

function createMockElement(): HTMLElement {
  return document.createElement('div')
}

function createMockRenderer(overrides: Partial<CellRenderer> = {}): CellRenderer {
  return {
    type: 'test',
    render: () => {},
    affordanceGroup: undefined,
    interactionPolicy: undefined,
    ...overrides,
  } as CellRenderer
}

describe('applyAffordanceAttrs', () => {
  let element: HTMLElement

  beforeEach(() => {
    element = createMockElement()
  })

  it('sets data-editable to true by default', () => {
    const renderer = createMockRenderer()
    applyAffordanceAttrs(element, renderer)
    expect(element.getAttribute('data-editable')).toBe('true')
  })

  it('sets data-editable to false when isEditable is false', () => {
    const renderer = createMockRenderer()
    applyAffordanceAttrs(element, renderer, false)
    expect(element.getAttribute('data-editable')).toBe('false')
  })

  it('sets data-affordance-group when renderer has affordanceGroup', () => {
    const renderer = createMockRenderer({
      affordanceGroup: { group: 'navigable-badge' } as any,
    })
    applyAffordanceAttrs(element, renderer)
    expect(element.getAttribute('data-affordance-group')).toBe('navigable-badge')
  })

  it('sets data-affordance="navigate" and aria-roledescription="link" for navigate action', () => {
    const renderer = createMockRenderer({
      interactionPolicy: { defaultAction: 'navigate' } as any,
    })
    applyAffordanceAttrs(element, renderer)
    expect(element.getAttribute('data-affordance')).toBe('navigate')
    expect(element.getAttribute('aria-roledescription')).toBe('link')
  })

  it('sets data-affordance="edit" and aria-roledescription="editable cell" for edit action', () => {
    const renderer = createMockRenderer({
      interactionPolicy: { defaultAction: 'edit' } as any,
    })
    applyAffordanceAttrs(element, renderer)
    expect(element.getAttribute('data-affordance')).toBe('edit')
    expect(element.getAttribute('aria-roledescription')).toBe('editable cell')
  })

  it('sets data-affordance="none" without aria-roledescription for none action', () => {
    const renderer = createMockRenderer({
      interactionPolicy: { defaultAction: 'none' } as any,
    })
    applyAffordanceAttrs(element, renderer)
    expect(element.getAttribute('data-affordance')).toBe('none')
    expect(element.getAttribute('aria-roledescription')).toBeNull()
  })

  it('does not set data-affordance when no interactionPolicy', () => {
    const renderer = createMockRenderer()
    applyAffordanceAttrs(element, renderer)
    expect(element.getAttribute('data-affordance')).toBeNull()
    expect(element.getAttribute('aria-roledescription')).toBeNull()
  })
})
