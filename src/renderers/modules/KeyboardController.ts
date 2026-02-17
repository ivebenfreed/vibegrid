/**
 * KeyboardController - Document-level keyboard event coordinator for VibeGrid
 *
 * PHASE 3 REFACTOR:
 * - Document-level binding (survives focus changes)
 * - Edit mode vs navigation mode routing
 * - Native editor shortcuts allowed during editing
 * - Outside click handling wired to EditingStore
 *
 * Replaces container-focused binding to fix:
 * - Issue #2: Editor input loses keyboard when focused
 * - Issue #7: Overlapping commit/cancel handlers (band-aid flags removed)
 *
 * Single source of truth for all keyboard interactions to prevent event conflicts.
 */

import { getLogger } from '@/shared/lib/logging'
import type { EditingStore } from '../../stores/EditingStore'
import type { InteractionCoordinator } from '../../coordination/InteractionCoordinator'
import type { KeyboardNavigationController } from './KeyboardNavigationController'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'KeyboardController.ts'])

export interface KeyboardControllerOptions {
  container: HTMLElement
  editingStore: EditingStore
  interactionCoordinator?: InteractionCoordinator
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
  private editingStore: EditingStore
  private interactionCoordinator?: InteractionCoordinator
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
    useCapture?: boolean
  }> = []

  constructor(options: KeyboardControllerOptions) {
    this.container = options.container
    this.editingStore = options.editingStore
    this.interactionCoordinator = options.interactionCoordinator
    this.keyboardNavController = options.keyboardNavController
    this.onCopy = options.onCopy
    this.onPaste = options.onPaste
    this.onCut = options.onCut
    this.onUndo = options.onUndo
    this.onRedo = options.onRedo

    this.setupKeyboardHandling()
    this.setupOutsideClickHandling()
  }

  /**
   * Setup document-level keyboard event handling with capture phase
   *
   * PHASE 3: Document-level binding survives focus changes
   */
  private setupKeyboardHandling(): void {
    fileLog.info('⌨️ Setting up document-level keyboard handling with capture phase')

    const keydownHandler = (e: Event) => {
      const event = e as KeyboardEvent
      // Check if event is for this grid
      if (!this.isEventForGrid(event)) {
        return
      }

      const isEditing = this.editingStore.isEditing
      const modifiers = {
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey,
      }

      // Route all keyboard events through coordinator when available.
      // Fall back to legacy handling when coordinator declines.
      if (this.interactionCoordinator) {
        const handled = this.interactionCoordinator.handleKeyboardNavigation(
          event.key,
          modifiers,
          event,
        )
        if (handled) {
          return
        }
      }

      fileLog.debug('⌨️ Keyboard event', {
        key: event.key,
        isEditing,
        target: (event.target as HTMLElement)?.tagName,
        activeElement: document.activeElement?.tagName,
      })

      // Route based on editing state
      if (isEditing) {
        this.handleEditModeKey(event)
      } else {
        this.handleNavigationModeKey(event)
      }
    }

    // CRITICAL: Document-level with capture phase
    // Runs before editor gets the event, allowing us to intercept
    this.addEventListenerTracked(document, 'keydown', keydownHandler as EventListener, true)

    // Make container focusable to receive keyboard events
    this.container.tabIndex = 0
    this.container.style.outline = 'none'

    // Focus the container initially to ensure keyboard events work
    this.container.focus()

    fileLog.info('✅ Document-level keyboard handling setup complete')
  }

  /**
   * Setup outside click handling
   *
   * PHASE 3: Wire outside click to EditingStore.handleOutsideClick()
   * Fixes Issue #6: Dropdown editors now close on outside click
   */
  private setupOutsideClickHandling(): void {
    fileLog.info('🖱️ Setting up outside click handling')

    const clickHandler = (e: MouseEvent) => {
      if (!this.editingStore.isEditing) {
        return
      }

      const target = e.target as HTMLElement

      // Check if click is outside the grid container
      if (!this.container.contains(target)) {
        fileLog.debug('Outside click detected', {
          target: target.tagName,
          editingCell: this.editingStore.editingCell,
        })
        this.editingStore.handleOutsideClick(target)
      }
    }

    // Document-level click listener
    this.addEventListenerTracked(document, 'click', clickHandler as EventListener, true)

    fileLog.info('✅ Outside click handling setup complete')
  }

  /**
   * Check if keyboard event is for this grid
   *
   * Returns true if:
   * - Event target is inside grid container
   * - OR currently editing (editor may be outside container)
   * - OR container has focus
   */
  private isEventForGrid(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement
    const isInsideContainer = this.container.contains(target)
    const isEditing = this.editingStore.isEditing
    const containerHasFocus = document.activeElement === this.container

    return isInsideContainer || isEditing || containerHasFocus
  }

  /**
   * Handle keyboard events in edit mode
   *
   * PHASE 3: Allows native editor shortcuts, blocks grid shortcuts
   */
  private handleEditModeKey(event: KeyboardEvent): void {
    const key = event.key
    const _isCtrlKey = event.ctrlKey || event.metaKey

    // Allow native editor shortcuts (don't steal from editor)
    if (this.isNativeEditorShortcut(event)) {
      fileLog.debug('⌨️ Native editor shortcut - letting editor handle', { key })
      return // Let editor handle
    }

    // Handle edit mode keys
    switch (key) {
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        fileLog.debug('⌨️ Escape - Cancel edit')
        this.editingStore.cancelEdit('escape')
        // Restore focus to container for keyboard navigation
        this.container.focus()
        break

      case 'Enter':
        // Allow Shift+Enter for new line in editor
        if (!event.shiftKey) {
          event.preventDefault()
          event.stopPropagation()
          fileLog.debug('⌨️ Enter - Commit edit')
          this.editingStore.commitEdit('enter')
          // Restore focus to container for keyboard navigation
          this.container.focus()
        }
        break

      case 'Tab':
        event.preventDefault()
        event.stopPropagation()
        fileLog.debug('⌨️ Tab - Commit and navigate')
        this.editingStore.commitEdit('tab')
        // Restore focus to container for keyboard navigation
        this.container.focus()
        // Then navigate
        if (this.keyboardNavController) {
          // Simulate arrow right/left for Tab navigation
          const direction = event.shiftKey ? 'left' : 'right'
          const arrowEvent = new KeyboardEvent('keydown', {
            key: `Arrow${direction.charAt(0).toUpperCase()}${direction.slice(1)}`,
            bubbles: true,
            cancelable: true,
          })
          this.keyboardNavController.handleKeyDown(arrowEvent)
        }
        break

      default:
        // All other keys go to editor
        fileLog.debug('⌨️ Key during editing - letting editor handle', { key })
        break
    }
  }

  /**
   * Handle keyboard events in navigation mode
   *
   * PHASE 3: Routes to KeyboardNavigationController or clipboard operations
   */
  private handleNavigationModeKey(event: KeyboardEvent): void {
    const isCtrlKey = event.ctrlKey || event.metaKey
    const isShiftKey = event.shiftKey

    // First, try navigation/interaction keys (non-Ctrl)
    if (!isCtrlKey && this.keyboardNavController) {
      const handled = this.keyboardNavController.handleKeyDown(event)
      if (handled) {
        return // Event was handled by keyboard navigation
      }
    }

    // Handle Ctrl+key shortcuts
    if (isCtrlKey) {
      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault()
          this.onCopy?.()
          fileLog.debug('⌨️ Ctrl+C - Copy')
          break
        case 'v':
          event.preventDefault()
          this.onPaste?.()
          fileLog.debug('⌨️ Ctrl+V - Paste')
          break
        case 'x':
          event.preventDefault()
          this.onCut?.()
          fileLog.debug('⌨️ Ctrl+X - Cut')
          break
        case 'z':
          event.preventDefault()
          if (isShiftKey) {
            this.onRedo?.()
            fileLog.debug('⌨️ Ctrl+Shift+Z - Redo')
          } else {
            this.onUndo?.()
            fileLog.debug('⌨️ Ctrl+Z - Undo')
          }
          break
        case 'y':
          event.preventDefault()
          this.onRedo?.()
          fileLog.debug('⌨️ Ctrl+Y - Redo')
          break
        case 'a':
          // Let KeyboardNavigationController handle Ctrl+A
          if (this.keyboardNavController) {
            const handled = this.keyboardNavController.handleKeyDown(event)
            if (handled) {
              fileLog.debug('⌨️ Ctrl+A - Select All (delegated)')
              return
            }
          }
          break
      }
    }
  }

  /**
   * Check if event is a native editor shortcut
   *
   * PHASE 3: Allows native shortcuts during editing
   * Returns true for: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+A, Ctrl+Y
   */
  private isNativeEditorShortcut(event: KeyboardEvent): boolean {
    const { key, ctrlKey, metaKey } = event
    const modKey = ctrlKey || metaKey

    // Allow native: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+A, Ctrl+Y
    if (modKey && ['c', 'v', 'x', 'z', 'a', 'y'].includes(key.toLowerCase())) {
      return true
    }

    return false
  }

  /**
   * Add event listener with tracking for cleanup
   */
  private addEventListenerTracked(
    element: EventTarget,
    event: string,
    handler: EventListener,
    useCapture: boolean = false,
  ): void {
    element.addEventListener(event, handler, useCapture)
    this.eventListeners.push({ element, event, handler, useCapture })
  }

  /**
   * Update keyboard navigation controller reference
   */
  setKeyboardNavController(controller: KeyboardNavigationController): void {
    this.keyboardNavController = controller
    fileLog.debug('⌨️ Keyboard navigation controller updated')
  }

  /**
   * Update interaction coordinator reference
   */
  setInteractionCoordinator(coordinator: InteractionCoordinator): void {
    this.interactionCoordinator = coordinator
    fileLog.debug('⌨️ Interaction coordinator updated')
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
    fileLog.info('🧹 Destroying KeyboardController')

    // Remove all tracked event listeners
    this.eventListeners.forEach(({ element, event, handler, useCapture }) => {
      try {
        element.removeEventListener(event, handler, useCapture)
      } catch (error) {
        fileLog.error('❌ Error removing keyboard event listener', { error })
      }
    })

    this.eventListeners = []
    fileLog.info('✅ KeyboardController destroyed')
  }
}
