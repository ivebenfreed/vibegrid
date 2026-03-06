/**
 * Compliance Summary Banner
 *
 * GH#1693: computed_decision_table field type -- Phase 4
 *
 * Displays an inline summary bar with pass/fail/expiring-soon counts
 * for COI compliance. Only renders when a `decision_status` filter
 * operator is active in the current VibeGrid filter group.
 */

import { observer } from 'mobx-react-lite'
import { useMemo } from 'react'
import { useVisualStateStore, useTableCoreStore } from '@/systems/vibegrid/stores/context'
import type { FilterGroup } from '@/systems/vibegrid/types/filter-types'

// ============================================================================
// Helpers
// ============================================================================

interface FilterConditionLike {
  operator?: string
  conditions?: FilterConditionLike[]
}

/**
 * Recursively checks whether a FilterGroup (or nested groups) contains
 * at least one condition with operator === 'decision_status'.
 */
function hasDecisionStatusFilter(group: FilterConditionLike | null | undefined): boolean {
  if (!group) return false
  if (group.operator === 'decision_status') return true
  if (Array.isArray(group.conditions)) {
    return group.conditions.some((c) => hasDecisionStatusFilter(c))
  }
  return false
}

// ============================================================================
// Types
// ============================================================================

interface ComplianceCounts {
  passing: number
  failing: number
  expiringSoon: number
}

// ============================================================================
// Component
// ============================================================================

/**
 * Reads the VibeGrid processed rows and active filter group from MobX stores,
 * then renders a compact summary showing passing / expiring / failing counts.
 */
export const ComplianceSummaryBanner = observer(function ComplianceSummaryBanner() {
  const visualStateStore = useVisualStateStore()
  const tableCoreStore = useTableCoreStore()

  const filterGroup: FilterGroup | null = visualStateStore.filterGroup
  const isVisible = hasDecisionStatusFilter(filterGroup as FilterConditionLike | null)

  const rows = tableCoreStore.processedRows as Array<{
    type?: string
    data?: Record<string, unknown>
    [key: string]: unknown
  }>

  const counts: ComplianceCounts = useMemo(() => {
    if (!isVisible) return { passing: 0, failing: 0, expiringSoon: 0 }

    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    let passing = 0
    let failing = 0
    let expiringSoon = 0

    for (const row of rows) {
      // processedRows are VirtualRow objects: { type, id, data }
      const record = (row.data ?? row) as Record<string, unknown>
      const check = record.compliance_check as { status?: string } | null | undefined

      if (!check) continue

      if (check.status === 'pass') {
        passing++

        // Check whether the cert is expiring within 30 days
        const expiryRaw =
          (record.earliest_expiration as string | null | undefined) ??
          (record.expiration_date as string | null | undefined)

        if (expiryRaw) {
          const expiry = new Date(expiryRaw)
          if (expiry > now && expiry <= thirtyDaysFromNow) {
            expiringSoon++
          }
        }
      } else if (check.status === 'fail') {
        failing++
      }
    }

    return { passing, failing, expiringSoon }
  }, [rows, isVisible])

  if (!isVisible) return null

  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-foreground">
      <span className="font-medium text-muted-foreground">Compliance:</span>
      <span className="text-green-700 dark:text-green-400">{counts.passing} passing</span>
      <span className="text-yellow-700 dark:text-yellow-400">
        {counts.expiringSoon} expiring (30d)
      </span>
      <span className="text-red-700 dark:text-red-400">{counts.failing} failing</span>
    </div>
  )
})
