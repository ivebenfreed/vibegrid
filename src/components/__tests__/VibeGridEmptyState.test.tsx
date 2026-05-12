/**
 * VibeGridEmptyState Component Tests
 *
 * GH#2934: Discriminated variants (empty / search / filter), ARIA shape, and
 * optional CTA slot. Built-in copy for search/filter; consumer-overridable
 * copy for empty.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { VibeGridEmptyState } from '../VibeGridEmptyState'

describe('VibeGridEmptyState', () => {
  describe('empty variant', () => {
    it('renders consumer-supplied headline, body, and CTA', () => {
      render(
        <VibeGridEmptyState
          variant="empty"
          headline="No projects yet"
          body="Create your first one."
          cta={<button type="button">Create Project</button>}
        />,
      )
      const root = screen.getByTestId('vibegrid-empty-state')
      expect(root).toHaveAttribute('data-empty-state-variant', 'empty')
      expect(within(root).getByText('No projects yet')).toBeInTheDocument()
      expect(within(root).getByText('Create your first one.')).toBeInTheDocument()
      expect(within(root).getByRole('button', { name: 'Create Project' })).toBeInTheDocument()
    })

    it('derives headline from entityDisplayName when no headline prop is provided', () => {
      render(<VibeGridEmptyState variant="empty" entityDisplayName="Projects" />)
      expect(screen.getByText('No Projects yet')).toBeInTheDocument()
    })

    it('falls back to a default noun when entityDisplayName is missing', () => {
      render(<VibeGridEmptyState variant="empty" />)
      expect(screen.getByText('No records yet')).toBeInTheDocument()
    })

    it('omits body element when body prop is not provided', () => {
      render(<VibeGridEmptyState variant="empty" headline="Empty" />)
      const root = screen.getByTestId('vibegrid-empty-state')
      // Only the <output> headline, no <p> body
      expect(root.querySelector('p')).toBeNull()
    })
  })

  describe('search variant', () => {
    it('uses built-in copy and ignores body prop', () => {
      render(<VibeGridEmptyState variant="search" body="custom body" />)
      const root = screen.getByTestId('vibegrid-empty-state')
      expect(root).toHaveAttribute('data-empty-state-variant', 'search')
      expect(within(root).getByText('No results found')).toBeInTheDocument()
      expect(within(root).getByText('Try different search terms or clear filters')).toBeInTheDocument()
      expect(within(root).queryByText('custom body')).toBeNull()
    })

    it('does NOT render the CTA slot', () => {
      render(
        <VibeGridEmptyState variant="search" cta={<button type="button">Should not appear</button>} />,
      )
      const root = screen.getByTestId('vibegrid-empty-state')
      expect(within(root).queryByRole('button')).toBeNull()
    })
  })

  describe('filter variant', () => {
    it('uses built-in copy', () => {
      render(<VibeGridEmptyState variant="filter" />)
      const root = screen.getByTestId('vibegrid-empty-state')
      expect(root).toHaveAttribute('data-empty-state-variant', 'filter')
      expect(within(root).getByText('No results match these filters')).toBeInTheDocument()
      expect(within(root).getByText('Try adjusting or clearing filters')).toBeInTheDocument()
    })

    it('does NOT render the CTA slot', () => {
      render(
        <VibeGridEmptyState variant="filter" cta={<button type="button">Should not appear</button>} />,
      )
      const root = screen.getByTestId('vibegrid-empty-state')
      expect(within(root).queryByRole('button')).toBeNull()
    })
  })

  describe('ARIA shape', () => {
    it('uses <section> as the root with aria-labelledby pointing to the <output id>', () => {
      render(<VibeGridEmptyState variant="empty" headline="Empty" />)
      const root = screen.getByTestId('vibegrid-empty-state')
      expect(root.tagName).toBe('SECTION')

      const labelledBy = root.getAttribute('aria-labelledby')
      expect(labelledBy).toBeTruthy()

      const output = root.querySelector('output')
      expect(output).not.toBeNull()
      expect(output?.id).toBe(labelledBy)
      expect(output?.textContent).toBe('Empty')
    })

    it('renders pointer-events: auto on the root (so CTA clicks work)', () => {
      render(<VibeGridEmptyState variant="empty" />)
      const root = screen.getByTestId('vibegrid-empty-state')
      expect(root.style.pointerEvents).toBe('auto')
    })

    it('renders the CTA as a sibling of <output>, not a descendant', () => {
      render(
        <VibeGridEmptyState
          variant="empty"
          headline="Empty"
          cta={<button type="button">Action</button>}
        />,
      )
      const root = screen.getByTestId('vibegrid-empty-state')
      const output = root.querySelector('output')
      const button = within(root).getByRole('button', { name: 'Action' })
      // The button must not be inside the <output>
      expect(output?.contains(button)).toBe(false)
      // Both must share the section as parent (or near-parent)
      expect(root.contains(output)).toBe(true)
      expect(root.contains(button)).toBe(true)
    })
  })
})
