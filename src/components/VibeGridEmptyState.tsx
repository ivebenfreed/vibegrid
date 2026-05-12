/**
 * VibeGrid Empty State
 *
 * GH#2925 (p3): Rendered when the grid has fully painted, the entity data load
 * is known complete, and no rows exist. GH#2934 extends it with discriminated
 * variants so search/filter empties flow through this same component:
 *
 *   - empty:  consumer-overridable headline/body + optional CTA slot
 *   - search: built-in "No results found" copy, no CTA
 *   - filter: built-in "No results match these filters" copy, no CTA
 *
 * Markup is `<section>` (page landmark, accepts aria-labelledby) wrapping a
 * `<output role="status">` for the headline so screen readers announce the
 * empty state on appearance. The CTA sits as a sibling of `<output>`, NOT a
 * descendant — buttons must not be announced as part of the status update.
 */

import { useId } from 'react'

type Variant = 'empty' | 'search' | 'filter'

interface VibeGridEmptyStateProps {
  variant: Variant
  entityDisplayName?: string
  headline?: string
  body?: string
  cta?: React.ReactNode
}

export function VibeGridEmptyState(props: VibeGridEmptyStateProps) {
  const headingId = useId()
  const noun = props.entityDisplayName ?? 'records'

  let headline: string
  let body: string | undefined

  if (props.variant === 'search') {
    headline = 'No results found'
    body = 'Try different search terms or clear filters'
  } else if (props.variant === 'filter') {
    headline = 'No results match these filters'
    body = 'Try adjusting or clearing filters'
  } else {
    headline = props.headline ?? `No ${noun} yet`
    body = props.body
  }

  const showCta = props.variant === 'empty' && Boolean(props.cta)

  return (
    <section
      data-testid="vibegrid-empty-state"
      data-empty-state-variant={props.variant}
      aria-labelledby={headingId}
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
        pointerEvents: 'auto',
        zIndex: 1,
      }}
    >
      <output id={headingId} style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>
        {headline}
      </output>
      {body && (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, marginTop: 4, opacity: 0.7 }}>
          {body}
        </p>
      )}
      {showCta && <div style={{ marginTop: 16 }}>{props.cta}</div>}
    </section>
  )
}
