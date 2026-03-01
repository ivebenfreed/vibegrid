/**
 * GhostRow Component Tests
 *
 * GH#1658: Inline Creation Ghost Row for VibeGrid
 *
 * Tests cover:
 * 1. Ghost state rendering (muted placeholder with + icon)
 * 2. Editing state rendering (FormFieldValue per column)
 * 3. Saving state rendering (Loader2 spinner with locked fields)
 * 4. Error state rendering (border-destructive + error message)
 * 5. Keyboard interactions (Enter, Escape, Tab)
 * 6. Validation error display
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Column } from '../../types'

// Mock FormFieldValue to avoid FieldTypeRegistry complexity
vi.mock('../FormFieldValue', () => ({
  FormFieldValue: ({ fieldId }: { fieldId: string }) => <input data-testid={`field-${fieldId}`} />,
}))

// Mock mobx-react-lite observer to pass through
vi.mock('mobx-react-lite', () => ({
  observer: (fn: Function) => fn,
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Plus: (props: Record<string, unknown>) => <span data-testid="plus-icon" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="loader-icon" {...props} />,
}))

import { GhostRow } from '../GhostRow'

// ====================================
// HELPERS
// ====================================

function makeColumn(id: string): Column {
  return {
    id,
    field: id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    type: 'text',
    cellType: 'text',
  } as Column
}

const defaultProps = {
  groupId: 'group-1',
  entityDisplayName: 'Task',
  inlineColumns: [makeColumn('name'), makeColumn('status')],
  inheritedFields: {},
  validationErrors: {},
  fieldValues: {},
  onFieldChange: vi.fn(),
  onCommit: vi.fn(),
  onCancel: vi.fn(),
}

// ====================================
// GHOST STATE TESTS
// ====================================

describe('GhostRow - ghost state', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders muted text with + icon', () => {
    render(<GhostRow {...defaultProps} status="ghost" />)

    expect(screen.getByText('+ New Task')).toBeInTheDocument()
    expect(screen.getByTestId('plus-icon')).toBeInTheDocument()
  })

  it('renders a button element', () => {
    render(<GhostRow {...defaultProps} status="ghost" />)

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'button')
  })

  it('has opacity-50 class for muted appearance', () => {
    render(<GhostRow {...defaultProps} status="ghost" />)

    const button = screen.getByRole('button')
    expect(button.className).toContain('opacity-50')
  })

  it('clicking ghost row calls onCommit', () => {
    const onCommit = vi.fn()
    render(<GhostRow {...defaultProps} status="ghost" onCommit={onCommit} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})

// ====================================
// EDITING STATE TESTS
// ====================================

describe('GhostRow - editing state', () => {
  beforeEach(() => vi.clearAllMocks())
  it('renders FormFieldValue per column', () => {
    render(<GhostRow {...defaultProps} status="editing" />)

    expect(screen.getByTestId('field-name')).toBeInTheDocument()
    expect(screen.getByTestId('field-status')).toBeInTheDocument()
  })

  it('has vibegridx-ghost-row--editing class', () => {
    const { container } = render(<GhostRow {...defaultProps} status="editing" />)

    const row = container.querySelector('.vibegridx-ghost-row--editing')
    expect(row).toBeInTheDocument()
  })

  it('Enter keydown calls onCommit', () => {
    const onCommit = vi.fn()
    const { container } = render(
      <GhostRow {...defaultProps} status="editing" onCommit={onCommit} />,
    )

    const row = container.querySelector('.vibegridx-ghost-row--editing')!
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('Escape keydown calls onCancel', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <GhostRow {...defaultProps} status="editing" onCancel={onCancel} />,
    )

    const row = container.querySelector('.vibegridx-ghost-row--editing')!
    fireEvent.keyDown(row, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Tab on last field calls onCommit', () => {
    const onCommit = vi.fn()
    const { container } = render(
      <GhostRow {...defaultProps} status="editing" onCommit={onCommit} />,
    )

    // Focus the last input so Tab on it triggers commit
    const lastInput = screen.getByTestId('field-status')
    lastInput.focus()
    expect(document.activeElement).toBe(lastInput)

    const row = container.querySelector('.vibegridx-ghost-row--editing')!
    fireEvent.keyDown(row, { key: 'Tab' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('Tab on non-last field does not call onCommit', () => {
    const onCommit = vi.fn()
    const { container } = render(
      <GhostRow {...defaultProps} status="editing" onCommit={onCommit} />,
    )

    // Focus the first field — Tab should not commit
    const firstInput = screen.getByTestId('field-name')
    firstInput.focus()
    expect(document.activeElement).toBe(firstInput)

    const row = container.querySelector('.vibegridx-ghost-row--editing')!
    fireEvent.keyDown(row, { key: 'Tab' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('Shift+Tab does not call onCommit even on last field', () => {
    const onCommit = vi.fn()
    const { container } = render(
      <GhostRow {...defaultProps} status="editing" onCommit={onCommit} />,
    )

    const lastInput = screen.getByTestId('field-status')
    lastInput.focus()
    expect(document.activeElement).toBe(lastInput)

    const row = container.querySelector('.vibegridx-ghost-row--editing')!
    fireEvent.keyDown(row, { key: 'Tab', shiftKey: true })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('validation errors render field-level border-destructive and message', () => {
    const { container } = render(
      <GhostRow {...defaultProps} status="editing" validationErrors={{ name: 'required' }} />,
    )

    expect(screen.getByText('Fill required fields to save')).toBeInTheDocument()
    const destructiveCell = container.querySelector('.border-destructive')
    expect(destructiveCell).toBeInTheDocument()
  })
})

// ====================================
// SAVING STATE TESTS
// ====================================

describe('GhostRow - saving state', () => {
  beforeEach(() => vi.clearAllMocks())
  it('has vibegridx-ghost-row--saving class', () => {
    const { container } = render(<GhostRow {...defaultProps} status="saving" />)

    const row = container.querySelector('.vibegridx-ghost-row--saving')
    expect(row).toBeInTheDocument()
  })

  it('shows Loader2 spinner with animate-spin class', () => {
    render(<GhostRow {...defaultProps} status="saving" />)

    const loader = screen.getByTestId('loader-icon')
    expect(loader).toBeInTheDocument()
    expect(loader.className).toContain('animate-spin')
  })

  it('renders fields as present', () => {
    render(<GhostRow {...defaultProps} status="saving" />)

    expect(screen.getByTestId('field-name')).toBeInTheDocument()
    expect(screen.getByTestId('field-status')).toBeInTheDocument()
  })
})

// ====================================
// ERROR STATE TESTS
// ====================================

describe('GhostRow - error state', () => {
  beforeEach(() => vi.clearAllMocks())
  it('has vibegridx-ghost-row--error class', () => {
    const { container } = render(
      <GhostRow {...defaultProps} status="error" errorMessage="Network error" />,
    )

    const row = container.querySelector('.vibegridx-ghost-row--error')
    expect(row).toBeInTheDocument()
  })

  it('shows error message text', () => {
    render(<GhostRow {...defaultProps} status="error" errorMessage="Network error" />)

    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders fields as re-editable', () => {
    render(
      <GhostRow
        {...defaultProps}
        status="error"
        inlineColumns={[makeColumn('name')]}
        errorMessage="Save failed"
      />,
    )

    expect(screen.getByTestId('field-name')).toBeInTheDocument()
  })

  it('Enter keydown calls onCommit in error state', () => {
    const onCommit = vi.fn()
    const { container } = render(
      <GhostRow {...defaultProps} status="error" errorMessage="Save failed" onCommit={onCommit} />,
    )

    const row = container.querySelector('.vibegridx-ghost-row--error')!
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('Escape keydown calls onCancel in error state', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <GhostRow {...defaultProps} status="error" errorMessage="Save failed" onCancel={onCancel} />,
    )

    const row = container.querySelector('.vibegridx-ghost-row--error')!
    fireEvent.keyDown(row, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
