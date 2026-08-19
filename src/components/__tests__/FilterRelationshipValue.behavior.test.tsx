/**
 * FilterRelationshipValue behavior
 *
 * The relationship filter control replaces a raw-UUID text box. What matters:
 * the options offered, which group leads, and that selection emits the target
 * entity id (not its label).
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useEntityOptions = vi.fn()
const useUserOptions = vi.fn()

vi.mock('@/shared/components/ui/picker', () => ({
  useEntityOptions: (...args: unknown[]) => useEntityOptions(...args),
  useUserOptions: () => useUserOptions(),
}))
vi.mock('@/app/stores', () => ({
  useSchemaRegistry: () => ({ schemas: { byName: {} } }),
}))
vi.mock('@/shared/lib/entity-type-color', () => ({
  getEntityTypeColor: () => '#4f46e5',
}))

import { FilterRelationshipValue } from '../FilterRelationshipValue'

const ALL_OPTIONS = [
  { value: 'p-apex', label: 'Apex Tower' },
  { value: 'p-beacon', label: 'Beacon Plaza' },
  { value: 'p-civic', label: 'Civic Center' },
]

function openPanel() {
  fireEvent.click(screen.getByTestId('vibegrid-filter-value-0'))
  return screen.getByTestId('vibegrid-filter-value-options-0')
}

beforeEach(() => {
  vi.clearAllMocks()
  useEntityOptions.mockReturnValue({ options: ALL_OPTIONS, isLoading: false })
  useUserOptions.mockReturnValue({ options: [], isLoading: false })
})

describe('FilterRelationshipValue', () => {
  it('renders a picker trigger, not a free-text input', () => {
    render(
      <FilterRelationshipValue targetEntityType="Project" value={null} onChange={vi.fn()} index={0} />,
    )
    const trigger = screen.getByTestId('vibegrid-filter-value-0')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.textContent).toContain('Select Project...')
  })

  it('lists in-view options first, under their own group heading', () => {
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={null}
        onChange={vi.fn()}
        index={0}
        inViewOptions={[{ id: 'p-civic', name: 'Civic Center' }]}
      />,
    )
    const panel = openPanel()
    expect(within(panel).getByText('In this view')).toBeTruthy()
    expect(within(panel).getByText('All Project')).toBeTruthy()

    const optionIds = Array.from(panel.querySelectorAll('[role="option"]')).map((el) =>
      el.getAttribute('data-testid'),
    )
    // In-view value leads and is not repeated in the full list below it.
    expect(optionIds).toEqual([
      'picker-option-p-civic',
      'picker-option-p-apex',
      'picker-option-p-beacon',
    ])
  })

  it('offers the full option set — not only what the view has loaded', () => {
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={null}
        onChange={vi.fn()}
        index={0}
        inViewOptions={[{ id: 'p-civic', name: 'Civic Center' }]}
      />,
    )
    const panel = openPanel()
    expect(within(panel).getByTestId('picker-option-p-apex')).toBeTruthy()
    expect(within(panel).getByTestId('picker-option-p-beacon')).toBeTruthy()
  })

  it('omits group headings when there is nothing in view', () => {
    render(
      <FilterRelationshipValue targetEntityType="Project" value={null} onChange={vi.fn()} index={0} />,
    )
    const panel = openPanel()
    expect(within(panel).queryByText('In this view')).toBeNull()
    expect(within(panel).queryByText('All Project')).toBeNull()
    expect(panel.querySelectorAll('[role="option"]').length).toBe(3)
  })

  it('emits the entity id — not the label — on selection', () => {
    const onChange = vi.fn()
    render(
      <FilterRelationshipValue targetEntityType="Project" value={null} onChange={onChange} index={0} />,
    )
    const panel = openPanel()
    fireEvent.pointerDown(within(panel).getByTestId('picker-option-p-beacon'))
    expect(onChange).toHaveBeenCalledWith('p-beacon')
  })

  it('closes after a single-select choice', () => {
    render(
      <FilterRelationshipValue targetEntityType="Project" value={null} onChange={vi.fn()} index={0} />,
    )
    const panel = openPanel()
    fireEvent.pointerDown(within(panel).getByTestId('picker-option-p-apex'))
    expect(screen.queryByTestId('vibegrid-filter-value-options-0')).toBeNull()
  })

  it('accumulates a set in multi-select mode and stays open', () => {
    const onChange = vi.fn()
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={['p-apex']}
        onChange={onChange}
        multiSelect
        index={0}
      />,
    )
    const panel = openPanel()
    fireEvent.pointerDown(within(panel).getByTestId('picker-option-p-beacon'))
    expect(onChange).toHaveBeenCalledWith(['p-apex', 'p-beacon'])
    expect(screen.queryByTestId('vibegrid-filter-value-options-0')).not.toBeNull()
  })

  it('deselects an already-selected value in multi-select mode', () => {
    const onChange = vi.fn()
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={['p-apex', 'p-beacon']}
        onChange={onChange}
        multiSelect
        index={0}
      />,
    )
    const panel = openPanel()
    fireEvent.pointerDown(within(panel).getByTestId('picker-option-p-apex'))
    expect(onChange).toHaveBeenCalledWith(['p-beacon'])
  })

  it('shows the selected record label on the trigger, not the raw id', () => {
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value="p-beacon"
        onChange={vi.fn()}
        index={0}
      />,
    )
    expect(screen.getByTestId('vibegrid-filter-value-0').textContent).toContain('Beacon Plaza')
  })

  it('pushes the typed search down to the option query', () => {
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        displayField="title"
        value={null}
        onChange={vi.fn()}
        index={0}
      />,
    )
    openPanel()
    fireEvent.change(screen.getByTestId('vibegrid-filter-value-search-0'), { target: { value: 'bea' } })
    expect(useEntityOptions).toHaveBeenLastCalledWith('Project', 'title', 'bea')
  })

  it('filters the in-view group by the search text too', () => {
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={null}
        onChange={vi.fn()}
        index={0}
        inViewOptions={[
          { id: 'p-civic', name: 'Civic Center' },
          { id: 'p-dock', name: 'Dockside' },
        ]}
      />,
    )
    const panel = openPanel()
    fireEvent.change(screen.getByTestId('vibegrid-filter-value-search-0'), { target: { value: 'dock' } })
    expect(within(panel).queryByTestId('picker-option-p-civic')).toBeNull()
    expect(within(panel).getByTestId('picker-option-p-dock')).toBeTruthy()
  })

  it('selects the highlighted option on Enter', () => {
    const onChange = vi.fn()
    render(
      <FilterRelationshipValue targetEntityType="Project" value={null} onChange={onChange} index={0} />,
    )
    openPanel()
    const search = screen.getByTestId('vibegrid-filter-value-search-0')
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('p-beacon')
  })

  it('reads User targets from the member list, not a DataForge entity', () => {
    useUserOptions.mockReturnValue({
      options: [{ value: 'u-1', label: 'Ada Lovelace' }],
      isLoading: false,
    })
    render(<FilterRelationshipValue targetEntityType="User" value={null} onChange={vi.fn()} index={0} />)
    const panel = openPanel()
    expect(within(panel).getByTestId('picker-option-u-1')).toBeTruthy()
    // The DataForge query is short-circuited — `User` is a Better Auth account.
    expect(useEntityOptions).toHaveBeenLastCalledWith('', undefined, '')
  })

  it('labels every in-view row from the same source, in or out of the option window', () => {
    // The option query is a 200-row alphabetical window. Preferring its
    // schema-formatted label where available made the in-view list read half
    // "260143 - BMO Brentwood Renovation" and half "CS San Mateo TI" — the
    // format depended on whether a record happened to land in the window.
    useEntityOptions.mockReturnValue({
      // p-beacon IS in the window (long form); p-solo is not.
      options: [{ value: 'p-beacon', label: '260143 - Beacon Plaza' }],
      isLoading: false,
    })
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={null}
        onChange={vi.fn()}
        index={0}
        inViewOptions={[
          { id: 'p-beacon', name: 'Beacon Plaza' },
          { id: 'p-solo', name: 'Solo Project' },
        ]}
      />,
    )
    const panel = openPanel()
    expect(within(panel).getByTestId('picker-option-p-beacon').textContent).toBe('Beacon Plaza')
    expect(within(panel).getByTestId('picker-option-p-solo').textContent).toBe('Solo Project')
  })

  it('carries that same name onto the trigger', () => {
    useEntityOptions.mockReturnValue({
      options: [{ value: 'p-beacon', label: '260143 - Beacon Plaza' }],
      isLoading: false,
    })
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value="p-beacon"
        onChange={vi.fn()}
        index={0}
        inViewOptions={[{ id: 'p-beacon', name: 'Beacon Plaza' }]}
      />,
    )
    expect(screen.getByTestId('vibegrid-filter-value-0').textContent).toContain('Beacon Plaza')
    expect(screen.getByTestId('vibegrid-filter-value-0').textContent).not.toContain('260143')
  })

  it('gives two in-view picks the same treatment on the trigger', () => {
    useEntityOptions.mockReturnValue({
      options: [{ value: 'p-beacon', label: '260143 - Beacon Plaza' }],
      isLoading: false,
    })
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={['p-beacon', 'p-solo']}
        onChange={vi.fn()}
        multiSelect
        index={0}
        inViewOptions={[
          { id: 'p-beacon', name: 'Beacon Plaza' },
          { id: 'p-solo', name: 'Solo Project' },
        ]}
      />,
    )
    expect(screen.getByTestId('vibegrid-filter-value-0').textContent).toContain('Beacon Plaza, Solo Project')
  })

  it('keeps the name stable when typing narrows the option window past it', () => {
    useEntityOptions.mockReturnValue({
      options: [{ value: 'p-beacon', label: '260143 - Beacon Plaza' }],
      isLoading: false,
    })
    const { rerender } = render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={null}
        onChange={vi.fn()}
        index={0}
        inViewOptions={[{ id: 'p-beacon', name: 'Beacon Plaza' }]}
      />,
    )
    openPanel()
    useEntityOptions.mockReturnValue({ options: [], isLoading: false })
    rerender(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={null}
        onChange={vi.fn()}
        index={0}
        inViewOptions={[{ id: 'p-beacon', name: 'Beacon Plaza' }]}
      />,
    )
    const panel = screen.getByTestId('vibegrid-filter-value-options-0')
    expect(within(panel).getByTestId('picker-option-p-beacon').textContent).toBe('Beacon Plaza')
  })

  it('borrows a label from the option query only when the projection has none', () => {
    // Target row not yet loaded under the grid's filter — the projection
    // emits an empty name, so anything is better than the id.
    useEntityOptions.mockReturnValue({
      options: [{ value: 'p-beacon', label: '260143 - Beacon Plaza' }],
      isLoading: false,
    })
    render(
      <FilterRelationshipValue
        targetEntityType="Project"
        value={null}
        onChange={vi.fn()}
        index={0}
        inViewOptions={[{ id: 'p-beacon', name: '' }]}
      />,
    )
    const panel = openPanel()
    expect(within(panel).getByTestId('picker-option-p-beacon').textContent).toBe('260143 - Beacon Plaza')
  })

  it('reports an empty result rather than an empty panel', () => {
    useEntityOptions.mockReturnValue({ options: [], isLoading: false })
    render(
      <FilterRelationshipValue targetEntityType="Project" value={null} onChange={vi.fn()} index={0} />,
    )
    expect(within(openPanel()).getByText('No results found.')).toBeTruthy()
  })
})
