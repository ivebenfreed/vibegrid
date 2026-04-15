/**
 * FilterValueInput behavior tests
 *
 * Focused edge cases that occur in real usage:
 * - Numeric zero values
 * - Clearing numeric values
 * - Empty operators that do not require values
 * - Missing/relationship column fallbacks
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it('falls back to text input for relationship types and forwards typed values', () => {
    const onChange = vi.fn()
    const relationshipColumn = makeColumn({
      id: 'assignee',
      field: 'assignee',
      cellType: 'reference-select',
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

    const input = screen.getByTestId('vibegrid-filter-value-4') as HTMLInputElement
    expect(input.type).toBe('text')

    fireEvent.change(input, { target: { value: 'user-123' } })
    expect(onChange).toHaveBeenLastCalledWith('user-123')
  })
})
