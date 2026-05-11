/**
 * VibeGridEmptyState Component Tests
 *
 * GH#2925 (p3): Empty-state rendered when the grid has fully painted, data is
 * known complete, and no search/filter is active.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VibeGridEmptyState } from '../VibeGridEmptyState'

describe('VibeGridEmptyState', () => {
  it('renders with data-testid', () => {
    render(<VibeGridEmptyState entityDisplayName="Projects" />)
    expect(screen.getByTestId('vibegrid-empty-state')).toBeInTheDocument()
  })

  it('renders entityDisplayName in body text', () => {
    render(<VibeGridEmptyState entityDisplayName="Projects" />)
    expect(screen.getByText(/projects/i)).toBeInTheDocument()
  })

  it('falls back to a default noun when entityDisplayName is missing', () => {
    render(<VibeGridEmptyState />)
    expect(screen.getByTestId('vibegrid-empty-state')).toBeInTheDocument()
    expect(screen.getByText(/records/i)).toBeInTheDocument()
  })

  it('has aria-label containing the entity name', () => {
    render(<VibeGridEmptyState entityDisplayName="Projects" />)
    expect(screen.getByLabelText('Empty state for Projects')).toBeInTheDocument()
  })
})
