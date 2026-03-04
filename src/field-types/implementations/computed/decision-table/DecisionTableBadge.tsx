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

import type { DecisionTableFieldValue } from '@/server/domain/dataforge/services/ComputedDecisionFieldEvaluator'

interface DecisionTableBadgeProps {
  value: DecisionTableFieldValue | null | undefined
  onExpand?: () => void
}

export function DecisionTableBadge({ value, onExpand }: DecisionTableBadgeProps) {
  if (!value || value.passed === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-muted text-muted-foreground border-border">
        pending
      </span>
    )
  }

  if (value.passed === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
        pass{value.score !== null ? ` (${value.score})` : ''}
      </span>
    )
  }

  // passed === false
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
