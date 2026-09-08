/**
 * DisposerManager - Utility for managing MobX reactions and disposers
 *
 * Ensures all reactions, autorun, and other MobX subscriptions are properly cleaned up
 * when stores are disposed to prevent memory leaks.
 */

import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['stores', 'utils', 'disposer'])

export type Disposer = () => void

export class DisposerManager {
  private disposers: Set<Disposer> = new Set()

  /**
   * Add a disposer function to be called on cleanup
   */
  add(disposer: Disposer): void {
    this.disposers.add(disposer)
  }

  /**
   * Get count of registered disposers (useful for testing/debugging)
   */
  get count(): number {
    return this.disposers.size
  }

  /**
   * Dispose all registered disposers and clear the set
   */
  dispose(): void {
    this.disposers.forEach((disposer) => {
      try {
        disposer()
      } catch (error) {
        logger.error('Error disposing', { error })
      }
    })
    this.disposers.clear()
  }

  /**
   * Check if there are any disposers registered
   */
  get isEmpty(): boolean {
    return this.disposers.size === 0
  }

  /**
   * Remove a specific disposer
   */
  remove(disposer: Disposer): boolean {
    return this.disposers.delete(disposer)
  }
}
