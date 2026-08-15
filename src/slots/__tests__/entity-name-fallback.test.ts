/**
 * @vitest-environment jsdom
 *
 * Entity-name cell fallback tests.
 *
 * The entity-name renderer binds to the archetype's `name` column. Synced
 * records (Procore) frequently leave `name` empty while carrying their real
 * label under a domain-specific key, which rendered every such row as
 * "Untitled". render() and format() must both fall back to the row's
 * conventional label fields before showing the empty state.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { entityNameCellRenderer } from '../renderers/entity-name'
import type { Column } from '../../types'
import type { CellRendererContext } from '../SlotRegistry'

function nameColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: 'name',
    field: 'name',
    name: 'Name',
    cellType: 'entity-name',
    editable: true,
    ...overrides,
  } as Column
}

function ctx(rowData?: Record<string, unknown>): CellRendererContext {
  return { entityType: 'RFI', rowData } as CellRendererContext
}

function textOf(el: HTMLElement): string {
  return el.querySelector('.vibegridx-entity-name-text')?.textContent ?? ''
}

describe('entityNameCellRenderer fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the bound value when present', () => {
    const el = entityNameCellRenderer.render('Real Name', nameColumn(), ctx({ name: 'Real Name' }))
    expect(textOf(el)).toBe('Real Name')
  })

  it('falls back to a conventional label field when the bound value is empty', () => {
    const el = entityNameCellRenderer.render(null, nameColumn(), ctx({ name: null, subject: 'RFI about slab' }))
    expect(textOf(el)).toBe('RFI about slab')
  })

  it('falls back for each affected DEB entity shape', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ filename: 'IMG_4021.jpg' }, 'IMG_4021.jpg'],
      [{ sheet_title: 'Level 2 Plan' }, 'Level 2 Plan'],
      [{ contract_name: 'Prime — Tower A' }, 'Prime — Tower A'],
      [{ company_name: 'LTC Cleaning' }, 'LTC Cleaning'],
      [{ first_name: 'Yessica', last_name: 'Mendez' }, 'Yessica Mendez'],
    ]
    for (const [rowData, expected] of cases) {
      expect(textOf(entityNameCellRenderer.render(null, nameColumn(), ctx(rowData)))).toBe(expected)
    }
  })

  it('still shows Untitled when the row carries no usable label', () => {
    const el = entityNameCellRenderer.render(null, nameColumn(), ctx({ title: null, section_number: null }))
    expect(textOf(el)).toBe('Untitled')
    const textEl = el.querySelector('.vibegridx-entity-name-text') as HTMLElement
    expect(textEl.style.fontStyle).toBe('italic')
  })

  it('shows Untitled when no rowData is supplied at all', () => {
    expect(textOf(entityNameCellRenderer.render(null, nameColumn(), ctx(undefined)))).toBe('Untitled')
  })

  it('preserves the navigate/edit affordance contract when falling back', () => {
    const el = entityNameCellRenderer.render(null, nameColumn(), ctx({ subject: 'RFI about slab' }))
    expect(el.querySelector('[data-action="navigate"]')).toBeTruthy()
    expect(el.querySelector('[data-action="edit"]')).toBeTruthy()
  })

  it('format() resolves the same fallback so CSV export is not blank', () => {
    expect(entityNameCellRenderer.format(null, nameColumn(), ctx({ subject: 'RFI about slab' }))).toBe('RFI about slab')
    expect(entityNameCellRenderer.format('Real', nameColumn(), ctx({ name: 'Real' }))).toBe('Real')
    expect(entityNameCellRenderer.format(null, nameColumn(), ctx({}))).toBe('')
  })
})
