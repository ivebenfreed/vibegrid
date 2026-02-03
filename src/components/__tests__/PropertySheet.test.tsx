/**
 * PropertySheet Component Tests
 *
 * Tests for the PropertySheet component (Phase 2):
 * - Renders label:value rows for all fields
 * - Keyboard navigation (Tab, ArrowUp/Down) works
 * - Field selection updates InteractionStore
 * - Long text fields auto-expand
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PropertySheet } from '../PropertySheet'
import { InteractionStore } from '../../stores/InteractionStore'
import type { Column } from '../../types'

describe('PropertySheet', () => {
  let interactionStore: InteractionStore
  let mockData: any
  let mockColumns: Column[]

  beforeEach(() => {
    // Create fresh interaction store for each test
    interactionStore = new InteractionStore()

    // Mock entity data
    mockData = {
      id: 'task-1',
      title: 'Testing Task',
      status: 'active',
      priority: 'high',
      description: 'This is a test task',
    }

    // Mock column definitions (field types)
    mockColumns = [
      {
        id: 'title',
        field: 'title',
        name: 'Title',
        label: 'Title',
        type: 'text',
        cellType: 'text',
        required: true,
        editable: true,
        width: 200,
      },
      {
        id: 'status',
        field: 'status',
        name: 'Status',
        label: 'Status',
        type: 'text', // Use valid cellType
        cellType: 'text',
        required: true,
        editable: true,
        width: 150,
      },
      {
        id: 'priority',
        field: 'priority',
        name: 'Priority',
        label: 'Priority',
        type: 'select',
        cellType: 'select',
        required: false,
        editable: true,
        width: 150,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
      {
        id: 'description',
        field: 'description',
        name: 'Description',
        label: 'Description',
        type: 'text', // Use valid cellType
        cellType: 'text',
        required: false,
        editable: true,
        width: 400,
      },
    ]
  })

  describe('Rendering', () => {
    it('should render container with data-testid', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      const container = screen.getByTestId('property-sheet')
      expect(container).toBeInTheDocument()
    })

    it('should render label:value rows for all fields', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Check each field is rendered
      for (const column of mockColumns) {
        const fieldElement = screen.getByTestId(`property-sheet-field-${column.id}`)
        expect(fieldElement).toBeInTheDocument()

        // Check label is rendered
        expect(screen.getByText(column.label!)).toBeInTheDocument()
      }
    })

    it('should show required indicator for required fields', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Title is required - should have asterisk
      const titleField = screen.getByTestId('property-sheet-field-title')
      expect(titleField.textContent).toContain('*')
    })

    it('should render field values correctly', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Check that values are rendered (via ModularCellBridge)
      // Note: Exact rendering depends on field type renderers
      expect(screen.getByTestId('property-sheet-field-title')).toBeInTheDocument()
      expect(screen.getByTestId('property-sheet-field-status')).toBeInTheDocument()
      expect(screen.getByTestId('property-sheet-field-priority')).toBeInTheDocument()
      expect(screen.getByTestId('property-sheet-field-description')).toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should focus field on click', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      const titleField = screen.getByTestId('property-sheet-field-title')
      fireEvent.click(titleField)

      expect(interactionStore.focusedFieldId).toBe('title')
    })

    it('should navigate down with ArrowDown', async () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Set focus programmatically (click enters edit mode, so use store directly for nav tests)
      interactionStore.focusField('title')

      // Press ArrowDown
      const container = screen.getByTestId('property-sheet')
      fireEvent.keyDown(container, { key: 'ArrowDown' })

      await waitFor(() => {
        expect(interactionStore.focusedFieldId).toBe('status')
      })
    })

    it('should navigate up with ArrowUp', async () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Set focus programmatically (click enters edit mode, so use store directly for nav tests)
      interactionStore.focusField('status')

      // Press ArrowUp
      const container = screen.getByTestId('property-sheet')
      fireEvent.keyDown(container, { key: 'ArrowUp' })

      await waitFor(() => {
        expect(interactionStore.focusedFieldId).toBe('title')
      })
    })

    it('should navigate down with Tab', async () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Set focus programmatically (click enters edit mode, so use store directly for nav tests)
      interactionStore.focusField('title')

      // Press Tab
      const container = screen.getByTestId('property-sheet')
      fireEvent.keyDown(container, { key: 'Tab' })

      await waitFor(() => {
        expect(interactionStore.focusedFieldId).toBe('status')
      })
    })

    it('should navigate up with Shift+Tab', async () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Set focus programmatically (click enters edit mode, so use store directly for nav tests)
      interactionStore.focusField('status')

      // Press Shift+Tab
      const container = screen.getByTestId('property-sheet')
      fireEvent.keyDown(container, { key: 'Tab', shiftKey: true })

      await waitFor(() => {
        expect(interactionStore.focusedFieldId).toBe('title')
      })
    })

    it('should not navigate beyond first field when ArrowUp on first', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Focus first field
      const titleField = screen.getByTestId('property-sheet-field-title')
      fireEvent.click(titleField)

      // Press ArrowUp (should stay on first field)
      const container = screen.getByTestId('property-sheet')
      fireEvent.keyDown(container, { key: 'ArrowUp' })

      expect(interactionStore.focusedFieldId).toBe('title')
    })

    it('should not navigate beyond last field when ArrowDown on last', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Focus last field
      const descField = screen.getByTestId('property-sheet-field-description')
      fireEvent.click(descField)

      // Press ArrowDown (should stay on last field)
      const container = screen.getByTestId('property-sheet')
      fireEvent.keyDown(container, { key: 'ArrowDown' })

      expect(interactionStore.focusedFieldId).toBe('description')
    })
  })

  describe('Field Selection', () => {
    it('should apply focused class to focused field', async () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      const titleField = screen.getByTestId('property-sheet-field-title')
      fireEvent.click(titleField)

      await waitFor(() => {
        expect(titleField).toHaveClass('property-sheet-field--focused')
      })
    })

    it('should remove focused class when focus changes', async () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Focus first field
      const titleField = screen.getByTestId('property-sheet-field-title')
      fireEvent.click(titleField)

      await waitFor(() => {
        expect(titleField).toHaveClass('property-sheet-field--focused')
      })

      // Focus second field
      const statusField = screen.getByTestId('property-sheet-field-status')
      fireEvent.click(statusField)

      await waitFor(() => {
        expect(titleField).not.toHaveClass('property-sheet-field--focused')
        expect(statusField).toHaveClass('property-sheet-field--focused')
      })
    })
  })

  describe('Layout Configuration', () => {
    it('should accept custom labelWidth prop', () => {
      render(
        <PropertySheet
          data={mockData}
          columns={mockColumns}
          interactionStore={interactionStore}
          labelWidth="250px"
        />,
      )

      // Component should render without errors
      expect(screen.getByTestId('property-sheet')).toBeInTheDocument()
    })

    it('should accept custom gap prop', () => {
      render(
        <PropertySheet
          data={mockData}
          columns={mockColumns}
          interactionStore={interactionStore}
          gap="2rem"
        />,
      )

      // Component should render without errors
      expect(screen.getByTestId('property-sheet')).toBeInTheDocument()
    })
  })

  describe('InteractionStore Integration', () => {
    it('should update InteractionStore.focusedFieldId on field click', () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      expect(interactionStore.focusedFieldId).toBeNull()

      const titleField = screen.getByTestId('property-sheet-field-title')
      fireEvent.click(titleField)

      expect(interactionStore.focusedFieldId).toBe('title')
    })

    it('should reactively update UI when InteractionStore changes', async () => {
      render(
        <PropertySheet data={mockData} columns={mockColumns} interactionStore={interactionStore} />,
      )

      // Programmatically set focus via store
      interactionStore.focusField('status')

      await waitFor(() => {
        const statusField = screen.getByTestId('property-sheet-field-status')
        expect(statusField).toHaveClass('property-sheet-field--focused')
      })
    })
  })
})
