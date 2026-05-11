/**
 * VibeGrid Empty State
 *
 * GH#2925 (p3): Rendered when the grid has fully painted, the entity data load
 * is known complete, no rows exist, and there is no active search/filter that
 * would explain the empty result set.
 *
 * Mutually exclusive with the inline search/filter empty-state in VibeGrid.tsx.
 */

interface VibeGridEmptyStateProps {
  entityDisplayName?: string
}

export function VibeGridEmptyState({ entityDisplayName }: VibeGridEmptyStateProps) {
  const noun = entityDisplayName ?? 'records'
  return (
    <div
      data-testid="vibegrid-empty-state"
      aria-label={`Empty state for ${noun}`}
      style={{
        position: 'absolute',
        top: 48,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <p style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>No {noun.toLowerCase()} yet</p>
    </div>
  )
}
