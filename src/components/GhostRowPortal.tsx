/**
 * GhostRowPortal - Portal-based Ghost Row Rendering
 *
 * GH#1658: Observes group headers in the DOM and renders ghost rows
 * as absolutely-positioned overlays within the VibeGrid container.
 * Follows the same MutationObserver portal pattern as ExpandedContentPortals.tsx.
 */

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { observer } from 'mobx-react-lite'
import { getLogger } from '@/shared/lib/logging'
import type { EditingStore } from '../stores/EditingStore'
import type { InlineCreationStore } from '../stores/InlineCreationStore'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { VisualStateStore } from '../stores/VisualStateStore'
import type { InteractionStore } from '../stores/InteractionStore'
import type { Column, GroupNode } from '../types'
import { extractGroupInheritedFields } from '../utils/inline-creation-utils'
import { GhostRow } from './GhostRow'

const logger = getLogger(['vibegrid', 'GhostRowPortal'])

// ====================================
// TYPES
// ====================================

export interface GhostRowPortalProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  inlineCreationStore: InlineCreationStore
  tableCoreStore: TableCoreStore
  visualStateStore: VisualStateStore
  interactionStore: InteractionStore
  editingStore: EditingStore
  entityDisplayName: string
  onInlineCreate?: (defaults: Record<string, unknown>) => Promise<string>
  onEscalate?: (groupId: string, inheritedFields: Record<string, unknown>) => void
}

interface TrackedGroup {
  groupId: string
  top: number
}

// ====================================
// COMPONENT
// ====================================

export const GhostRowPortal = observer(function GhostRowPortal({
  containerRef,
  inlineCreationStore,
  tableCoreStore,
  visualStateStore,
  interactionStore: _interactionStore,
  editingStore,
  entityDisplayName,
  onInlineCreate,
  onEscalate,
}: GhostRowPortalProps) {
  const [trackedGroups, setTrackedGroups] = useState<TrackedGroup[]>([])
  const trackedGroupsRef = useRef<TrackedGroup[]>([])
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Mobile guard: don't render on narrow viewports
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = (): void => {
      setIsMobile(window.innerWidth < 768)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Access MobX observables to trigger re-render on changes
  const _groupConfig = visualStateStore.groupConfig
  const _ghostRows = inlineCreationStore.ghostRows
  const _processedRows = tableCoreStore.processedRows

  // Build a Map<groupId, GroupNode> from all 'group' type virtual rows.
  // Note: collapsed groups are still present in processedRows — the map covers all groups.
  const allGroupNodesById = useMemo(() => {
    const map = new Map<string, GroupNode>()
    for (const row of _processedRows) {
      // processedRows is a SPARSE array under viewport virtualization — holes
      // (undefined) are normal while rows warm in. Guarding `row` is mandatory;
      // `row.type` on an undefined hole threw and crashed the whole grid to a
      // 500 for any org whose warming left a gap when this memo ran (GH#3214).
      if (row?.type === 'group' && row.data) {
        map.set(row.id, row.data as GroupNode)
      }
    }
    return map
  }, [_processedRows])
  // Keep a ref so the keyboard handler can read the latest map without being
  // in the heavy useEffect dep array (which would tear down the overlay on every data update)
  const allGroupNodesByIdRef = useRef(allGroupNodesById)
  useEffect(() => {
    allGroupNodesByIdRef.current = allGroupNodesById
  }, [allGroupNodesById])

  // ====================================
  // POSITION TRACKING
  // ====================================

  const computePositions = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const groupHeaders = container.querySelectorAll('.vibegridx-group-header[data-group-id]')
    const expandedGroups = visualStateStore.groupConfig?.expandedGroups

    const groups: TrackedGroup[] = []
    const containerRect = container.getBoundingClientRect()

    if (groupHeaders.length === 0) {
      // Ungrouped grid: show a single ghost row after the last data row (or at midpoint if empty)
      const allDataRows = container.querySelectorAll('.vibegridx-row:not(.vibegridx-group-header)')
      const viewport = container.querySelector('.vibegridx-viewport') ?? container
      let bottomPosition: number
      if (allDataRows.length > 0) {
        const lastRow = allDataRows[allDataRows.length - 1]
        const lastRowRect = lastRow.getBoundingClientRect()
        bottomPosition = lastRowRect.bottom - containerRect.top + (viewport as HTMLElement).scrollTop
      } else {
        bottomPosition = 0
      }
      groups.push({ groupId: '__root__', top: bottomPosition })
    } else {
      groupHeaders.forEach((header) => {
        const groupId = header.getAttribute('data-group-id')
        if (!groupId) return

        // If we have groupConfig, check if group is expanded
        // A group is expanded if it's in the expandedGroups set
        if (expandedGroups && !expandedGroups.has(groupId)) return

        const headerRect = header.getBoundingClientRect()

        // Find the last data row in this group to position ghost row after it
        const groupDataRows = container.querySelectorAll(
          `.vibegridx-row[data-group-id="${groupId}"]:not(.vibegridx-group-header)`,
        )

        let bottomPosition: number
        if (groupDataRows.length > 0) {
          const lastRow = groupDataRows[groupDataRows.length - 1]
          const lastRowRect = lastRow.getBoundingClientRect()
          const viewport = container.querySelector('.vibegridx-viewport') ?? container
          bottomPosition = lastRowRect.bottom - containerRect.top + (viewport as HTMLElement).scrollTop
        } else {
          // No data rows, position right after the header
          const viewport = container.querySelector('.vibegridx-viewport') ?? container
          bottomPosition = headerRect.bottom - containerRect.top + (viewport as HTMLElement).scrollTop
        }

        groups.push({
          groupId,
          top: bottomPosition,
        })
      })
    }

    setTrackedGroups(groups)
    trackedGroupsRef.current = groups
  }, [containerRef, visualStateStore.groupConfig?.expandedGroups])

  // ====================================
  // DOM OBSERVATION
  // ====================================

  useEffect(() => {
    const container = containerRef.current
    if (!container || isMobile) return

    // Create overlay div
    const overlay = document.createElement('div')
    overlay.style.position = 'absolute'
    overlay.style.top = '0'
    overlay.style.left = '0'
    overlay.style.width = '100%'
    overlay.style.height = '100%'
    overlay.style.pointerEvents = 'none'
    overlay.style.zIndex = '5'
    container.appendChild(overlay)
    overlayRef.current = overlay

    // Initial position compute
    computePositions()

    // MutationObserver for DOM changes (group headers appearing/disappearing)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const mutationObserver = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutation.type === 'childList') {
          return (
            Array.from(mutation.addedNodes).some(
              (node) =>
                node instanceof HTMLElement &&
                (node.classList.contains('vibegridx-group-header') || node.querySelector('.vibegridx-group-header')),
            ) ||
            Array.from(mutation.removedNodes).some(
              (node) =>
                node instanceof HTMLElement &&
                (node.classList.contains('vibegridx-group-header') || node.querySelector('.vibegridx-group-header')),
            )
          )
        }
        return false
      })

      if (hasRelevantMutation) {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          computePositions()
          debounceTimer = null
        }, 16) // One frame debounce
      }
    })

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    })

    // Scroll listener for position updates
    const viewport = container.querySelector('.vibegridx-viewport') ?? container
    const handleScroll = (): void => {
      computePositions()
    }
    viewport.addEventListener('scroll', handleScroll, { passive: true })

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      computePositions()
    })
    resizeObserver.observe(container)

    // Keyboard shortcut: 'n' opens ghost row for first tracked group.
    // Attached to document (not container) so it works even when the grid container
    // doesn't have DOM focus (e.g. after interacting with toolbar).
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Only lowercase 'n', no modifier keys
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      // Only fire when focus is inside this grid container or on the body/document
      const activeEl = document.activeElement
      if (activeEl && activeEl !== document.body && !container.contains(activeEl)) {
        return
      }

      // Don't fire when a cell is being edited
      if (editingStore.isEditing) return

      // Don't fire when focus is in an input, textarea, select, or contenteditable
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return
        if ((activeEl as HTMLElement).isContentEditable) return
      }

      // Open ghost for the first tracked group, or '__root__' if none
      // Use refs to avoid stale closure without adding to effect dep array
      const targetGroupId = trackedGroupsRef.current[0]?.groupId ?? '__root__'
      const currentMap = allGroupNodesByIdRef.current
      const targetGroupNode = currentMap.get(targetGroupId)
      const targetInheritedFields = targetGroupNode ? extractGroupInheritedFields(targetGroupNode, currentMap) : {}
      inlineCreationStore.openGhost(targetGroupId, targetInheritedFields)

      logger.debug('Keyboard shortcut "n" triggered ghost row', { targetGroupId })
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      mutationObserver.disconnect()
      viewport.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      document.removeEventListener('keydown', handleKeyDown)
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
      }
      overlayRef.current = null
    }
  }, [containerRef, isMobile, computePositions, editingStore, inlineCreationStore])

  // Recompute when group config or processed rows change
  // biome-ignore lint/correctness/useExhaustiveDependencies: _groupConfig and _processedRows are MobX-observed triggers; computePositions reads them via closures
  useEffect(() => {
    computePositions()
  }, [computePositions, _groupConfig, _processedRows])

  // ====================================
  // EVENT HANDLERS
  // ====================================

  const columns = tableCoreStore.columns as Column[]

  const handleCommit = useCallback(
    (groupId: string) => {
      const state = inlineCreationStore.getGhostState(groupId)

      if (!state || state.status === 'ghost') {
        // Currently in ghost state -> check escalation first, then open editing
        const groupNode = allGroupNodesById.get(groupId)
        const inheritedFields = groupNode ? extractGroupInheritedFields(groupNode, allGroupNodesById) : {}

        if (inlineCreationStore.needsEscalation(columns, Object.keys(inheritedFields))) {
          onEscalate?.(groupId, inheritedFields)
          return
        }

        inlineCreationStore.openGhost(groupId, inheritedFields)
        return
      }

      if (state.status === 'editing' || state.status === 'error') {
        // Currently editing -> commit
        inlineCreationStore.commitGhost(groupId, columns, onInlineCreate)
      }
    },
    [inlineCreationStore, columns, onInlineCreate, onEscalate, allGroupNodesById],
  )

  const handleCancel = useCallback(
    (groupId: string) => {
      inlineCreationStore.cancelGhost(groupId)
    },
    [inlineCreationStore],
  )

  const handleFieldChange = useCallback(
    (groupId: string, fieldId: string, value: unknown) => {
      inlineCreationStore.setFieldValue(groupId, fieldId, value)
    },
    [inlineCreationStore],
  )

  // ====================================
  // RENDER
  // ====================================

  if (isMobile || !overlayRef.current || trackedGroups.length === 0) {
    return null
  }

  // For ungrouped grids, show a single ghost row at the bottom
  // For grouped grids, show one per expanded group
  return createPortal(
    trackedGroups.map((group) => {
      const ghostState = inlineCreationStore.getGhostState(group.groupId)
      const status = ghostState?.status ?? 'ghost'
      const groupNode = allGroupNodesById.get(group.groupId)
      const inheritedFields = groupNode
        ? extractGroupInheritedFields(groupNode, allGroupNodesById)
        : (ghostState?.inheritedFields ?? {})
      const fieldValues = ghostState?.fieldValues ?? {}
      const validationErrors = ghostState?.validationErrors ?? {}
      const inlineColumns = inlineCreationStore.computeInlineFields(columns, Object.keys(inheritedFields))

      return (
        <div
          key={group.groupId}
          style={{
            position: 'absolute',
            left: 0,
            width: '100%',
            height: 40,
            top: group.top,
            pointerEvents: 'auto',
          }}
        >
          <GhostRow
            groupId={group.groupId}
            entityDisplayName={entityDisplayName}
            status={status}
            inlineColumns={inlineColumns}
            inheritedFields={inheritedFields as Record<string, unknown>}
            validationErrors={validationErrors}
            fieldValues={fieldValues as Record<string, unknown>}
            errorMessage={ghostState?.errorMessage}
            onFieldChange={(fieldId, value) => handleFieldChange(group.groupId, fieldId, value)}
            onCommit={() => handleCommit(group.groupId)}
            onCancel={() => handleCancel(group.groupId)}
          />
        </div>
      )
    }),
    overlayRef.current,
  )
})

export default GhostRowPortal
