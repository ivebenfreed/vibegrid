/**
 * VibegGrid Invariant Assertions
 *
 * Development-time assertions to catch bugs early.
 * These assertions help catch coordinator/DOM mismatches and other
 * subtle bugs during development.
 *
 * In production, violations are logged but do not throw errors.
 */

/**
 * Assert that a condition is true (invariant holds)
 *
 * If the condition is false, the invariant is violated:
 * - In development: Logs error and throws exception
 * - In production: Logs error but continues execution
 *
 * @param condition - The condition that must be true
 * @param message - Error message explaining the invariant violation
 *
 * @example
 * ```ts
 * assertInvariant(
 *   coordinator.getColumnCount() === visibleColumns.length,
 *   `Coordinator columns (${coordinator.getColumnCount()}) must match visible columns (${visibleColumns.length})`
 * )
 * ```
 */
export function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    const error = new Error(`VibegGrid Invariant Violation: ${message}`)
    console.error(error)

    // In dev, throw to catch bugs early
    // In prod, log but continue to avoid breaking user experience
    if (process.env.NODE_ENV !== 'production') {
      throw error
    }
  }
}
