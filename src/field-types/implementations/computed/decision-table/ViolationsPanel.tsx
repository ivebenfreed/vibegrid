/**
 * ViolationsPanel Component
 *
 * Displays an expandable list of violations from a computed_decision_table result.
 * Each violation shows a severity icon and message text.
 *
 * Used inside row expansion or popover when a "fail" badge is clicked.
 */

/**
 * Violations can be plain strings (from ComputedFieldResult)
 * or objects with { ruleId, ruleName, severity, message } (from raw DecisionResult).
 */
type Violation = string | { ruleId?: string; ruleName?: string; severity?: string; message: string }

interface ViolationsPanelProps {
  violations: Violation[]
}

export function ViolationsPanel({ violations }: ViolationsPanelProps) {
  if (violations.length === 0) return null

  return (
    <div className="flex flex-col gap-1 py-1 pl-4 pr-2 text-xs">
      {violations.map((v, i) => {
        const key = typeof v === 'string' ? v : (v.ruleId ?? i)
        if (typeof v === 'string') {
          return (
            <div key={key} className="flex items-start gap-2">
              <span className="text-red-600 dark:text-red-400">{'\u2717'}</span>
              <span className="text-muted-foreground">{v}</span>
            </div>
          )
        }
        return (
          <div key={key} className="flex items-start gap-2">
            <span
              className={
                v.severity === 'warning'
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400'
              }
            >
              {v.severity === 'warning' ? '\u26A0' : '\u2717'}
            </span>
            <span className="text-muted-foreground">
              {v.ruleName ? `${v.ruleName}: ${v.message}` : v.message}
            </span>
          </div>
        )
      })}
    </div>
  )
}
