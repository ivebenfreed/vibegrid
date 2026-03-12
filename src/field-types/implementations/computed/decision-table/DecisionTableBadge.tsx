/**
 * DecisionTableBadge Component
 *
 * Renders a pass/fail/pending badge for computed_decision_table field values.
 * Used by the VibeGrid cell renderer to display decision table results inline.
 *
 * States:
 * - pass (green badge + score)
 * - fail (red badge + score + expandable violations indicator)
 * - pending (gray badge, no score)
 */

/**
 * Actual shape from computed-field-helpers (ComputedFieldResult):
 *   { status: 'pass' | 'fail' | 'pending', score: number, violations: string[] }
 *
 * Legacy shape from DecisionResult (raw engine output):
 *   { passed: boolean | null, score: number, violations: { message: string, ... }[] }
 */
interface DecisionTableFieldValue {
  status?: 'pass' | 'fail' | 'pending'
  passed?: boolean | null
  score: number | null
  violations: Array<string | { message: string; [key: string]: unknown }>
}

interface DecisionTableBadgeProps {
  value: DecisionTableFieldValue | null | undefined
  onExpand?: () => void
}

function resolveStatus(value: DecisionTableFieldValue): 'pass' | 'fail' | 'pending' {
  if (value.status) return value.status
  if (value.passed === true) return 'pass'
  if (value.passed === false) return 'fail'
  return 'pending'
}

export function DecisionTableBadge({ value, onExpand }: DecisionTableBadgeProps) {
  if (!value) {
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-muted text-muted-foreground border-border">
        pending
      </span>
    )
  }

  const status = resolveStatus(value)

  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-muted text-muted-foreground border-border">
        pending
      </span>
    )
  }

  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
        pass{value.score !== null ? ` (${value.score})` : ''}
      </span>
    )
  }

  // fail
  return (
    <button
      type="button"
      onClick={onExpand}
      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50"
    >
      fail{value.score !== null ? ` (${value.score})` : ''}
      {value.violations.length > 0 && ' \u25BE'}
    </button>
  )
}
