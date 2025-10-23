/**
 * useMobxSnapshot - MobX → React State Bridge
 *
 * This hook bridges MobX computed values to React state, creating stable
 * references for use in dependency arrays (like useLiveQuery).
 *
 * Why this is needed:
 * - MobX observables change frequently, but useLiveQuery needs stable deps
 * - Direct MobX values in deps array cause unnecessary re-runs
 * - This hook converts MobX computed → React state with autorun tracking
 *
 * Usage:
 * ```typescript
 * const filterSnapshot = useMobxSnapshot(() => tableCoreStore.filters)
 * const sortSnapshot = useMobxSnapshot(() => tableCoreStore.sortBy)
 *
 * const { data } = useLiveQuery((q) => {
 *   // Use stable snapshots in query
 *   filterSnapshot.forEach(filter => ...)
 * }, [filterSnapshot, sortSnapshot])
 * ```
 */

import { useState, useEffect, useCallback } from 'react'
import { autorun } from 'mobx'

/**
 * Bridge MobX computed value to React state with stable reference
 *
 * @param getValue - Function that returns the MobX computed value to track
 * @returns Stable React state value that updates when MobX value changes
 */
export function useMobxSnapshot<T>(getValue: () => T): T {
  // Initialize with current value
  const [snapshot, setSnapshot] = useState<T>(() => getValue())

  // Memoize the getValue function to prevent unnecessary autorun re-creates
  const stableGetValue = useCallback(getValue, [getValue])

  useEffect(() => {
    // Create MobX autorun that tracks getValue dependencies
    const disposer = autorun(() => {
      const newValue = stableGetValue()
      setSnapshot(newValue)
    })

    // Clean up autorun on unmount
    return disposer
  }, [stableGetValue])

  return snapshot
}
