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
 * GH#3016 adds a `dropzone` mode: when the consumer passes a custom
 * `dropzoneContent` node, the empty state covers the FULL grid area (top: 0)
 * with a solid background so the column header strip is visually hidden, and
 * renders the consumer's content (typically an `<EntityUploadDropzone>`) in
 * place of the headline/body/cta. The aria semantics are preserved — a
 * screen-reader-only status output still announces the empty state.
 *
 * Markup is `<section>` (page landmark, accepts aria-labelledby) wrapping a
 * `<output role="status">` for the headline so screen readers announce the
 * empty state on appearance. The CTA sits as a sibling of `<output>`, NOT a
 * descendant — buttons must not be announced as part of the status update.
 */

import { useId } from 'react'

type Variant = 'empty' | 'search' | 'filter'
type Mode = 'default' | 'dropzone'

interface VibeGridEmptyStateProps {
  variant: Variant
  entityDisplayName?: string
  headline?: string
  body?: string
  cta?: React.ReactNode
  /**
   * GH#3016: Visual layout mode.
   * - `default` (omitted): centered message anchored below the column header strip.
   * - `dropzone`: full-bleed overlay (top:0) with a solid background that visually
   *   hides the column header strip. Renders `dropzoneContent` in place of the
   *   default headline/body/cta block.
   */
  mode?: Mode
  /**
   * Custom content rendered when `mode === 'dropzone'`. Typically an
   * `<EntityUploadDropzone>`. Ignored in default mode.
   */
  dropzoneContent?: React.ReactNode
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
  const isDropzoneMode = props.mode === 'dropzone'

  if (isDropzoneMode) {
    // Full-bleed overlay: covers column header strip AND grid body so the user
    // sees only the dropzone as the primary affordance. Solid bg-background
    // ensures the underlying column headers don't bleed through.
    return (
      <section
        data-testid="vibegrid-empty-state"
        data-empty-state-variant={props.variant}
        data-empty-state-mode="dropzone"
        aria-labelledby={headingId}
        className="bg-background"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          padding: '16px',
          pointerEvents: 'auto',
          zIndex: 2,
        }}
      >
        {/* Screen-reader-only status — keeps the empty state announced
            without a visible headline competing with the dropzone copy. */}
        <output id={headingId} className="sr-only">
          {headline}
        </output>
        <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
          {props.dropzoneContent}
        </div>
      </section>
    )
  }

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
