/**
 * FilterValueInput behavior tests
 *
 * Focused edge cases that occur in real usage:
 * - Numeric zero values
 * - Clearing numeric values
 * - Empty operators that do not require values
 * - Missing/relationship column fallbacks
 * - Routing relationship columns to the entity picker
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The picker's own behavior is covered in FilterRelationshipValue.behavior.test.tsx;
// here we only care that FilterValueInput routes to it with the right props.
const relationshipValueSpy = vi.fn()
vi.mock('../FilterRelationshipValue', () => ({
  FilterRelationshipValue: (props: Record<string, unknown>) => {
    relationshipValueSpy(props)
    return <div data-testid={`vibegrid-filter-value-${props.index}`}>relationship-picker</div>
  },
}))

import { FilterValueInput } from '../FilterValueInput'
import type { Column, FilterOperator } from '../../types'

function makeColumn(overrides: Partial<Column>): Column {
  return {
    id: 'col',
    field: 'col',
    name: 'Column',
    label: 'Column',
    type: 'text',
    cellType: 'text',
    required: false,
    editable: true,
    width: 180,
    ...overrides,
  } as Column
}

describe('FilterValueInput behavior', () => {
  it('preserves numeric zero instead of coercing it to null', () => {
    const onChange = vi.fn()
    const numberColumn = makeColumn({ id: 'count', field: 'count', cellType: 'number' })

    render(
      <FilterValueInput
        column={numberColumn}
        operator={'equals' as FilterOperator}
        value={null}
        onChange={onChange}
        index={0}
      />,
    )

    const input = screen.getByTestId('vibegrid-filter-value-0') as HTMLInputElement
    fireEvent.change(input, { target: { value: '0' } })

    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('emits null when numeric input is cleared', () => {
    const onChange = vi.fn()
    const numberColumn = makeColumn({ id: 'count', field: 'count', cellType: 'number' })

    render(
      <FilterValueInput
        column={numberColumn}
        operator={'equals' as FilterOperator}
        value={12}
        onChange={onChange}
        index={1}
      />,
    )

    const input = screen.getByTestId('vibegrid-filter-value-1') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })

    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('renders no-value helper for is_empty operators', () => {
    const onChange = vi.fn()
    const textColumn = makeColumn({ id: 'title', field: 'title', cellType: 'text' })

    render(
      <FilterValueInput
        column={textColumn}
        operator={'is_empty' as FilterOperator}
        value={null}
        onChange={onChange}
        index={2}
      />,
    )

    expect(screen.getByTestId('vibegrid-filter-value-2').textContent).toContain('no value needed')
  })

  it('shows a disabled placeholder when no field is selected', () => {
    const onChange = vi.fn()

    render(
      <FilterValueInput
        column={null}
        operator={'equals' as FilterOperator}
        value={null}
        onChange={onChange}
        index={3}
      />,
    )

    const input = screen.getByTestId('vibegrid-filter-value-3') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.placeholder).toBe('Select field first')
  })

  it('falls back to text input for a relationship column with no resolvable target', () => {
    // Without a target entity there is nothing to enumerate, so a free-text
    // value is the honest degradation.
    const onChange = vi.fn()
    const relationshipColumn = makeColumn({
      id: 'assignee',
      field: 'assignee',
      cellType: 'badge-list-live',
    })

    render(
      <FilterValueInput
        column={relationshipColumn}
        operator={'equals' as FilterOperator}
        value={null}
        onChange={onChange}
        index={4}
      />,
    )

    const input = screen.getByTestId('filter-value') as HTMLInputElement
    expect(input.type).toBe('text')

    fireEvent.change(input, { target: { value: 'user-123' } })
    expect(onChange).toHaveBeenLastCalledWith('user-123')
  })

  it('routes a relationship column to the entity picker instead of a text box', () => {
    const relationshipColumn = makeColumn({
      id: 'project',
      field: 'project',
      cellType: 'badge-list',
      relationshipTargetEntity: 'Project',
      relationshipDisplayField: 'title',
    } as Partial<Column>)

    render(
      <FilterValueInput
        column={relationshipColumn}
        operator={'equals' as FilterOperator}
        value={null}
        onChange={vi.fn()}
        index={5}
      />,
    )

    expect(screen.getByTestId('vibegrid-filter-value-5').textContent).toBe('relationship-picker')
    expect(relationshipValueSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        targetEntityType: 'Project',
        displayField: 'title',
        multiSelect: false,
      }),
    )
  })

  it('hands the picker the in-view options for that column', () => {
    const relationshipColumn = makeColumn({
      id: 'project',
      field: 'project',
      cellType: 'badge-list',
      relationshipTargetEntity: 'Project',
    } as Partial<Column>)
    const inView = [{ id: 'p1', name: 'Apex' }]

    render(
      <FilterValueInput
        column={relationshipColumn}
        operator={'equals' as FilterOperator}
        value={null}
        onChange={vi.fn()}
        index={6}
        inViewRelationshipOptions={{ project: inView, other: [{ id: 'x', name: 'X' }] }}
      />,
    )

    expect(relationshipValueSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ inViewOptions: inView }),
    )
  })

  it('switches the picker to multi-select for set operators', () => {
    const relationshipColumn = makeColumn({
      id: 'project',
      field: 'project',
      cellType: 'badge-list',
      relationshipTargetEntity: 'Project',
    } as Partial<Column>)

    for (const operator of ['in', 'not_in'] as FilterOperator[]) {
      render(
        <FilterValueInput
          column={relationshipColumn}
          operator={operator}
          value={[]}
          onChange={vi.fn()}
          index={7}
        />,
      )
      expect(relationshipValueSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ multiSelect: true }),
      )
    }
  })

  it('still shows the no-value helper for is_empty on a relationship column', () => {
    const relationshipColumn = makeColumn({
      id: 'project',
      field: 'project',
      cellType: 'badge-list',
      relationshipTargetEntity: 'Project',
    } as Partial<Column>)

    render(
      <FilterValueInput
        column={relationshipColumn}
        operator={'is_empty' as FilterOperator}
        value={null}
        onChange={vi.fn()}
        index={8}
      />,
    )

    expect(screen.getByTestId('vibegrid-filter-value-8').textContent).toContain('no value needed')
  })
})
