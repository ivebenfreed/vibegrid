/**
 * KeyboardController - Global keyboard event coordinator for VibeGrid
 *
 * Single source of truth for all keyboard interactions to prevent event conflicts.
 * Follows the same pattern as MouseController for centralized event management.
 */

import { getLogger } from '@/shared/lib/logging'
import type { KeyboardNavigationController } from './KeyboardNavigationController'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'KeyboardController.ts'])

export interface KeyboardControllerOptions {
  container: HTMLElement
  keyboardNavController?: KeyboardNavigationController
  // For clipboard operations
  onCopy?: () => void
  onPaste?: () => void
  onCut?: () => void
  onUndo?: () => void
  onRedo?: () => void
}

export class KeyboardController {
  private container: HTMLElement
  private keyboardNavController?: KeyboardNavigationController
  private onCopy?: () => void
  private onPaste?: () => void
  private onCut?: () => void
  private onUndo?: () => void
  private onRedo?: () => void

  // Event listeners for cleanup
  private eventListeners: Array<{
    element: EventTarget
    event: string
    handler: EventListener
  }> = []

  constructor(options: KeyboardControllerOptions) {
    this.container = options.container
    this.keyboardNavController = options.keyboardNavController
    this.onCopy = options.onCopy
    this.onPaste = options.onPaste
    this.onCut = options.onCut
    this.onUndo = options.onUndo
    this.onRedo = options.onRedo

    this.setupKeyboardHandling()
  }

  /**
   * Setup centralized keyboard event handling
   */
  private setupKeyboardHandling(): void {
    fileLog.info('⌨️ Setting up centralized keyboard handling') // Keep: lifecycle

    const keydownHandler = (e: KeyboardEvent) => {
      const isCtrlKey = e.ctrlKey || e.metaKey
      const isShiftKey = e.shiftKey

      fileLog.debug('⌨️ Keyboard event', {
        key: e.key,
        shiftKey: isShiftKey,
        ctrlKey: isCtrlKey,
        target: (e.target as HTMLElement)?.tagName,
      })

      // First, try navigation/interaction keys (non-Ctrl)
      if (!isCtrlKey && this.keyboardNavController) {
        const handled = this.keyboardNavController.handleKeyDown(e)
        if (handled) {
          return // Event was handled by keyboard navigation
        }
      }

      // Handle Ctrl+key shortcuts
      if (isCtrlKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            e.preventDefault()
            this.onCopy?.()
            fileLog.debug('⌨️ Ctrl+C - Copy')
            break
          case 'v':
            e.preventDefault()
            this.onPaste?.()
            fileLog.debug('⌨️ Ctrl+V - Paste')
            break
          case 'x':
            e.preventDefault()
            this.onCut?.()
            fileLog.debug('⌨️ Ctrl+X - Cut')
            break
          case 'z':
            e.preventDefault()
            if (isShiftKey) {
              this.onRedo?.()
              fileLog.debug('⌨️ Ctrl+Shift+Z - Redo')
            } else {
              this.onUndo?.()
              fileLog.debug('⌨️ Ctrl+Z - Undo')
            }
            break
          case 'y':
            e.preventDefault()
            this.onRedo?.()
            fileLog.debug('⌨️ Ctrl+Y - Redo')
            break
          case 'a':
            // Let KeyboardNavigationController handle Ctrl+A
            if (this.keyboardNavController) {
              const handled = this.keyboardNavController.handleKeyDown(e)
              if (handled) {
                fileLog.debug('⌨️ Ctrl+A - Select All (delegated)')
                return
              }
            }
            break
        }
      }
    }

    this.addEventListenerTracked(this.container, 'keydown', keydownHandler as EventListener)

    // Make container focusable to receive keyboard events
    this.container.tabIndex = 0
    this.container.style.outline = 'none'

    // Focus the container initially to ensure keyboard events work
    this.container.focus()

    fileLog.info('✅ Centralized keyboard handling setup complete') // Keep: lifecycle
  }

  /**
   * Add event listener with tracking for cleanup
   */
  private addEventListenerTracked(
    element: EventTarget,
    event: string,
    handler: EventListener,
  ): void {
    element.addEventListener(event, handler)
    this.eventListeners.push({ element, event, handler })
  }

  /**
   * Update keyboard navigation controller reference
   */
  setKeyboardNavController(controller: KeyboardNavigationController): void {
    this.keyboardNavController = controller
    fileLog.debug('⌨️ Keyboard navigation controller updated')
  }

  /**
   * Ensure container has focus for keyboard events
   */
  ensureContainerFocus(): void {
    if (document.activeElement !== this.container) {
      this.container.focus()
      fileLog.debug('⌨️ Container focused for keyboard events')
    }
  }

  /**
   * Clean up all event listeners
   */
  destroy(): void {
    fileLog.info('🧹 Destroying KeyboardController') // Keep: lifecycle

    // Remove all tracked event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler)
      } catch (error) {
        fileLog.error('❌ Error removing keyboard event listener', { error })
      }
    })

    this.eventListeners = []
    fileLog.info('✅ KeyboardController destroyed') // Keep: lifecycle
  }
}
