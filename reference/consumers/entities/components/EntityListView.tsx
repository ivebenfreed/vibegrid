/**
 * Entity List View Component
 *
 * Main container component for entity list pages
 * Shows breadcrumbs, header, and high-performance Vibegrid
 *
 * Supports adaptive creation modes (form, upload, or both) based on
 * schema configuration. Includes page-level drag-and-drop for upload
 * and async operation tracking in the header.
 *
 * Part of GH#1617: Entity Creation Modes - Phase 2.4
 */

import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ClipboardCheck, Download, Play, PlayCircle, Send } from 'lucide-react'
import { reaction } from 'mobx'
import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useAuth, useFeatureFlags, useOrganization } from '@/app/stores'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { TopNav } from '@/shared/components/layout/top-nav'
import { getSQLiteClient } from '@/shared/data/db/sqlite/client'
import { orpcClient } from '@/shared/data/orpc/client'
import { refreshViews } from '@/shared/data/orpc/domains/views-fetch'
import { uploadQueryKeys } from '@/shared/data/orpc/query-utils'
import { useEntityRecordQuery } from '@/shared/data/queries/entity-data.queries'
import { useEntitySchema, useEntitySchemasQuery } from '@/shared/data/queries/entity-schemas.queries'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import { cn } from '@/shared/lib/utils'

import { useReviewQueue } from '@/features/entity-review/hooks/useReviewQueue'
import {
  BULK_SEND_BATCH_SIZE,
  dispatchBulkSend,
} from '@/features/lien-waivers/bulk-send-action'
import type { EntityRecord } from '@/shared/types/dataforge'
import { VibeGrid, type RowAction } from '@/systems/vibegrid'
import type { SchemaFieldDescriptor } from '@/systems/vibegrid/modules/GridModule'
import type { ViewMode } from '@/systems/vibegrid/stores/ViewModeStore'
import { ReorderConfirmationDialog } from '@/systems/vibegrid/components/ReorderConfirmationDialog'
import { SaveViewDialog } from '@/systems/vibegrid/components/SaveViewDialog'
import type { ViewVisibility } from '@/systems/vibegrid/components/SaveViewDialog'
import type { EntityViewRow } from '@/systems/vibegrid/components/ViewPicker'
import { VibeGridStoreProvider, useVibeGridStores } from '@/systems/vibegrid/stores/context'
import { useEntityUpload } from '../hooks/useEntityUpload'
import { useViewUrlSync } from '../hooks/useViewUrlSync'
import {
  collectFailedDeleteIds,
  countRestoredAfterRefetch,
  describeOptimisticDeleteOutcome,
} from '../lib/coi-optimistic-delete'
import {
  buildPlaceholderRecord,
  collectRemovablePlaceholders,
  shouldOptimisticUpload,
} from '../lib/coi-optimistic-upload'
// GH#2641: side-effect import registers built-in list widgets + overview components
import '../lib/register-view-components'
// GH#2689 B7: list-view extra tabs registry (Scan Runs etc.)
import { getListTab } from '../lib/list-tab-registry'
import { getListWidget, type ListWidgetContext } from '../lib/widget-registry'
import { CreationModeButton } from './CreationModeButton'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { EntityUploadDialog, type EntityUploadDialogHandle } from './dialogs/EntityUploadDialog'
import { EntityListError } from './EntityListError'
import { EntityListSkeleton } from './EntityListSkeleton'
import { EntityNotFound } from './EntityNotFound'
import { EntityUploadDropzone } from './EntityUploadDropzone'
import { EntityDrawer } from './EntityDrawer'
import { QuickCreatePanel } from './QuickCreatePanel'

const logger = getLogger(['entity', 'EntityListView'])

/**
 * Header count chip — reads the server-authoritative entity count from the
 * substrate's `viewportStore.serverTotalRows` (set by `useSubstrateGridRows`
 * via the one-shot `dataforge.data.count` prefetch at mount, and kept in
 * sync via Math.max(prev, query.count) on subsequent substrate deltas).
 *
 * Lives inside the toolbar JSX, which is rendered as children inside
 * VibeGridStoreProvider — so `useVibeGridStores()` resolves to the same
 * store bundle the substrate writes the count into.
 *
 * GH#2848 follow-up: prior to this, the count chip read from
 * `listResult.pagination.total`, which had been hardcoded to 0 after Phase D
 * B32 retired the legacy `useEntityListData` call. The chip displayed "0"
 * indefinitely even though substrate had the truth.
 */
const EntityCountChip = observer(function EntityCountChip() {
  const { viewportStore } = useVibeGridStores()
  const total = viewportStore.serverTotalRows
  // `null` means the substrate prefetch hasn't landed yet — render nothing
  // rather than flashing a stale "0".
  if (total === null) return null
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">
      {total}
    </span>
  )
})

/**
 * Inner component that lives inside VibeGridStoreProvider context
 * to enable useViewUrlSync hook access to VibeGrid stores (GH#1570)
 */
const EntityListViewUrlSync = observer(function EntityListViewUrlSync({
  entityName,
  orgId,
  onCellClick,
  enableInlineCreation,
  onInlineCreate,
  onEscalate,
  onOpenReview,
  hasReviewMode,
  schemaFields,
  toolbarLeading,
  toolbarTrailing,
  emptyStateCta,
  emptyStateHeadline,
  emptyStateBody,
  emptyStateMode,
  emptyStateContent,
  onDelete,
}: {
  entityName: string
  orgId: string
  onCellClick: (rowId: string, columnId: string, event?: MouseEvent) => void
  enableInlineCreation: boolean
  onInlineCreate: (defaults: Record<string, unknown>) => Promise<string>
  onEscalate: (groupId: string, inheritedFields: Record<string, unknown>) => void
  onOpenReview: (_rowIds: string[], rowsData: EntityRecord[]) => void
  hasReviewMode: boolean
  schemaFields?: SchemaFieldDescriptor[]
  toolbarLeading?: React.ReactNode
  toolbarTrailing?: React.ReactNode
  emptyStateCta?: React.ReactNode
  emptyStateHeadline?: string
  emptyStateBody?: string
  emptyStateMode?: 'default' | 'dropzone'
  emptyStateContent?: React.ReactNode
  onDelete?: (rowIds: string[], rowsData: any[]) => Promise<void>
}) {
  const stores = useVibeGridStores()
  const authStore = useAuth()
  const navigate = useNavigate()
  // GH#3120: ui_config (widgets, list-extra tabs, overviewComponent, detail
  // extra tabs, child-entity tabs) now lives at the schema level. The inner
  // EntityListViewUrlSync is the component that renders list widgets + extra
  // tabs, so we resolve schema here — the outer EntityListView resolves it
  // again for unrelated paint paths; both calls hit the same TanStack DB
  // collection cache so the duplication is cheap.
  const innerSchema = useEntitySchema(entityName)

  const { copyLink, activeViewId, activeViewName, hasUnsavedChanges, selectView, clearView, defaultViewConfig: activeViewConfig } = useViewUrlSync({
    entityType: entityName,
    orgId,
    stores,
  })

  // GH#2139: Wire viewModeStore to VibeGrid props for view switching
  const { viewModeStore } = stores
  const currentViewMode: ViewMode = viewModeStore.mode
  const handleViewModeChange = useCallback((mode: ViewMode) => viewModeStore.setMode(mode), [viewModeStore])

  // SaveViewDialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  const userId = authStore.user?.id ?? ''
  const userRole = authStore.session?.organization?.role ?? 'member'
  const isAdmin = userRole === 'admin' || userRole === 'owner'
  const hasWriteAccess = userRole !== 'viewer'

  // GH#3188: extract the create+activate pattern so Save and Duplicate
  // share a single source of truth. After creating a view server-side,
  // we re-prime the SWR cache (so the picker dropdown repaints) and then
  // call selectView(created) — but inside queueMicrotask so any open
  // dialog (e.g. SaveViewDialog) has a chance to finish its close
  // animation before the URL nav fires. Without selectView, the toolbar
  // pill, dropdown active indicator, and `?view=<UUID>` URL param all
  // stay stale (issue surfaces as "Save / Duplicate looks like a no-op").
  const createAndActivateView = useCallback(
    async (input: {
      entityName: string
      name: string
      visibility: ViewVisibility
      config: Record<string, unknown>
    }) => {
      const created = await orpcClient.dataforge.views.create(input)
      // PR #3175: re-prime the saved-views cache so the picker repaints.
      await refreshViews(input.entityName)
      // GH#3188: activate the newly-created view so the URL `?view=<id>`,
      // toolbar pill, and dropdown active indicator all flip together.
      // queueMicrotask defers the nav by one task so any closing dialog
      // (SaveViewDialog) doesn't visibly race the URL change.
      queueMicrotask(() => selectView(created as EntityViewRow))
      return created
    },
    [selectView],
  )

  // Duplicate view: create a personal copy with "(copy)" suffix
  const handleDuplicateView = useCallback(
    async (view: { entity_type: string; name: string; config: Record<string, unknown> }) => {
      try {
        await createAndActivateView({
          entityName,
          name: `${view.name} (copy)`,
          visibility: 'personal',
          config: view.config,
        })
        toast.success('View duplicated to My Views')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to duplicate view'
        toast.error(msg)
      }
    },
    [entityName, createAndActivateView],
  )

  // Save current view config to server
  const handleSaveView = useCallback(
    async (
      name: string,
      visibility: ViewVisibility,
      childEntityTabs: Array<{
        childEntityType: string
        relationshipType: string
        direction: 'incoming' | 'outgoing'
      }>,
    ) => {
      const { visualStateStore, viewModeStore } = stores

      // Snapshot the current VibeGrid state as the view config
      const config: Record<string, unknown> = {
        sortBy: visualStateStore.sortBy.slice(),
        filters: visualStateStore.filters.slice(),
        // GH#3119 follow-up: also persist `filterGroup`. The FilterBuilder
        // UI writes the user's applied filter into `filterGroup` and
        // explicitly clears the legacy `filters[]` array — so saving a
        // view without `filterGroup` silently drops every UI-applied
        // filter, leading to "No filters applied" when the view is
        // re-selected.
        filterGroup: visualStateStore.filterGroup,
        groupConfig: visualStateStore.groupConfig
          ? {
              fields: visualStateStore.groupConfig.fields,
              sortBy: visualStateStore.groupConfig.sortBy,
              sortDirection: visualStateStore.groupConfig.sortDirection,
              aggregations: visualStateStore.groupConfig.aggregations,
            }
          : null,
        viewMode: viewModeStore.mode,
        globalSearchText: visualStateStore.globalSearchText,
        // GH#3180 B1: persist column order so drag-reorder survives save → re-select.
        // Empty array when uninitialized — the apply path treats absent + empty
        // identically (B3 leaves the live order untouched in both cases).
        columnOrder: visualStateStore.columnOrder.slice(),
        // GH#3180 B2: rebuild a fresh visibility record keyed by the LIVE schema
        // columns (rather than spreading the MobX observable) so the snapshot is
        // guaranteed to be a plain JSON object with one boolean per current
        // column id — robust against any future MobX-observable-shape drift and
        // forward-compatible with new schema columns that appear after save.
        columnVisibility: Object.fromEntries(
          visualStateStore.columns.map((c) => [
            c.id,
            visualStateStore.columnVisibility[c.id] !== false,
          ]),
        ),
        // GH#1677 P2.3: Include child entity tabs array
        ...(childEntityTabs.length > 0 ? { childEntityTabs } : {}),
        // Keep legacy childEntityConfig for backward compat with existing views
        ...(childEntityTabs.length === 1 ? { childEntityConfig: childEntityTabs[0] } : {}),
      }

      await createAndActivateView({
        entityName,
        name,
        visibility,
        config,
      })

      toast.success('View saved')
    },
    [entityName, stores, createAndActivateView],
  )

  const viewPickerProps = {
    entityType: entityName,
    orgId,
    activeViewId,
    activeViewName,
    hasUnsavedChanges,
    onViewSelect: selectView,
    onSaveView: () => setSaveDialogOpen(true),
    onUnsavedSelect: clearView,
    onDuplicateView: handleDuplicateView,
    // GH#3188: when ViewPicker deletes the active view, flip the toolbar
    // back to "(Unsaved)" and strip `?view=<id>` from the URL. Without
    // this the pill keeps showing the deleted view's name and the URL
    // still references its UUID until next manual nav.
    onActiveViewDeleted: clearView,
    userId,
    userRole,
  }

  // GH#1534: Review action for entities with extraction_metadata
  const reviewAction: RowAction = {
    id: 'review-selected',
    label: 'Review',
    icon: ClipboardCheck,
    hidden: () => !hasReviewMode,
  }

  // GH#1926 Phase 4: LienWaiverCycle-specific entity actions
  const startCycleAction: RowAction = {
    id: 'start-cycle',
    label: 'Start Cycle',
    icon: Play,
    hidden: (rowData: any) => {
      // Only show for LienWaiverCycle entities in 'open' status
      const status = rowData?.status ?? rowData?.data?.status
      return entityName !== 'LienWaiverCycle' || status !== 'open'
    },
  }

  const exportWaiversAction: RowAction = {
    id: 'export-waivers',
    label: 'Export Waivers',
    icon: Download,
    hidden: (rowData: any) => {
      // Only show for LienWaiverCycle entities in 'complete' or 'closed' status
      const status = rowData?.status ?? rowData?.data?.status
      return entityName !== 'LienWaiverCycle' || (status !== 'complete' && status !== 'closed')
    },
  }

  // GH#2561 Track C C5: PaymentLine bulk "Mark sent + send waiver" action.
  // Hidden when:
  //   - Wrong entity type (PaymentLine only)
  //   - User lacks write access (viewer role) — server enforces; UI hides
  //     for clarity. When CASL #2564 lands, swap to
  //     `useCan('bulk_import', 'Payment')`.
  //   - ANY selected line has a status outside the re-sendable set
  //     (`imported`, `manual_rejected`). Per-row check: ActionsBar treats
  //     the action as visible only when no row triggers `hidden`.
  const SENDABLE_PAYMENT_LINE_STATUSES = new Set(['imported', 'manual_rejected'])
  const sendLienWaiverAction: RowAction = {
    id: 'send-lien-waiver',
    label: 'Mark sent + send waiver',
    icon: Send,
    hidden: (rowData: any) => {
      if (entityName !== 'PaymentLine') return true
      if (!hasWriteAccess) return true
      const status = rowData?.status ?? rowData?.data?.status
      return !SENDABLE_PAYMENT_LINE_STATUSES.has(status)
    },
  }

  // Assemble row actions based on entity type
  const allRowActions: RowAction[] = [reviewAction]
  if (entityName === 'LienWaiverCycle') {
    allRowActions.push(startCycleAction, exportWaiversAction)
  }
  if (entityName === 'PaymentLine') {
    allRowActions.push(sendLienWaiverAction)
  }

  // GH#2641 + GH#3120: Render widgets above the grid driven by
  // entity_schemas.business_metadata.ui_config.list.widgets. Unknown widget
  // keys are skipped with a console.warn — never break the page.
  const listWidgets = (innerSchema?.businessMetadata?.ui_config?.list?.widgets ?? []) as Array<{
    widget: string
    props?: Record<string, unknown>
  }>

  // GH#2689 B7 + GH#3120: Render the list-view tab strip from
  // entity_schemas.business_metadata.ui_config.list.extraTabs. Default tab is
  // the grid; selecting a non-grid tab replaces the VibeGrid pane with the
  // registered list-tab component. Tab id syncs to URL via `?tab=<id>`
  // (TanStack Router search params validated by route schema), so reload +
  // deep-link preserve state.
  const listExtraTabs: Array<{ id: string; label: string; icon?: string; componentSlug?: string }> =
    innerSchema?.businessMetadata?.ui_config?.list?.extraTabs ?? []
  // Use a `select` so this hook only re-fires when the `tab` param actually
  // changes. Without `select`, every search-param change re-renders this
  // component (notably the review overlay's reviewEntity/reviewIds churn,
  // which in turn re-renders VibeGrid).
  const requestedTab = (useSearch({
    strict: false,
    select: (s) => (typeof (s as { tab?: unknown }).tab === 'string' ? (s as { tab: string }).tab : 'grid'),
  }) as string) ?? 'grid'
  const knownTabIds = ['grid', ...listExtraTabs.map((t) => t.id)]
  // Fall back to grid when the URL contains an unknown tab id (stale config, deleted tab, etc.)
  const activeTab = knownTabIds.includes(requestedTab) ? requestedTab : 'grid'
  const setActiveTab = useCallback(
    (next: string) => {
      // Use replace so tab switching doesn't pollute the back stack — matches the
      // detail-view tab pattern in EntityDetailTabShell.
      navigate({
        search: (prev: any) => ({ ...prev, tab: next === 'grid' ? undefined : next }),
        replace: true,
      } as any)
    },
    [navigate],
  )
  const activeListTabEntry = listExtraTabs.find((t) => t.id === activeTab)
  const ActiveListTabComponent =
    activeTab !== 'grid' && activeListTabEntry?.componentSlug
      ? getListTab(activeListTabEntry.componentSlug)
      : undefined

  return (
    <>
      {listExtraTabs.length > 0 && (
        <div
          data-testid="list-tab-strip"
          role="tablist"
          aria-label="List view tabs"
          className="flex items-center gap-1 border-b bg-background px-3"
        >
          <ListTabButton
            id="grid"
            label="Grid"
            active={activeTab === 'grid'}
            onSelect={setActiveTab}
          />
          {listExtraTabs.map((tab) => (
            <ListTabButton
              key={tab.id}
              id={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onSelect={setActiveTab}
            />
          ))}
        </div>
      )}

      {listWidgets.map((entry, idx) => {
        const Widget = getListWidget(entry.widget)
        if (!Widget) {
          logger.warn('Unknown list widget in view config', { widget: entry.widget, entityName })
          return null
        }
        const ctx: ListWidgetContext = {
          entityName,
          organizationId: orgId,
          props: entry.props,
        }
        return (
          <div key={`${entry.widget}-${idx}`} data-testid={`list-widget-${entry.widget}`}>
            <Widget {...ctx} />
          </div>
        )
      })}

      {/* GH#2689 B7: when a non-grid list-view tab is active, swap the VibeGrid pane out
          for the registered tab component. The tab content occupies the same flex-1 box. */}
      {activeTab !== 'grid' && ActiveListTabComponent && (
        <div
          data-testid={`list-tab-${activeTab}`}
          className="flex-1 min-h-0 overflow-auto"
          role="tabpanel"
          aria-label={activeListTabEntry?.label ?? activeTab}
        >
          <ActiveListTabComponent entityName={entityName} organizationId={orgId} />
        </div>
      )}
      {activeTab !== 'grid' && !ActiveListTabComponent && (
        <div
          data-testid={`list-tab-${activeTab}`}
          className="flex-1 min-h-0 overflow-auto p-6 text-sm text-muted-foreground"
          role="tabpanel"
        >
          <p>
            Tab "{activeListTabEntry?.label ?? activeTab}" is configured but its component is not
            registered. This is likely a stale config — falling back to the grid is recommended.
          </p>
        </div>
      )}

      {/* Wrap VibeGrid in a flex-1 min-h-0 sizing box so its height="100%" resolves to
          the remaining space after listWidgets — not 100% of the parent container, which
          would cause the grid (and its absolutely-positioned ActionsBar) to overflow. */}
      <div
        data-testid="list-tab-grid"
        className={cn('relative flex-1 min-h-0', activeTab !== 'grid' && 'hidden')}
      >
        <VibeGrid
          tableId={`entity-list-${entityName}`}
          entityType={entityName}
          schemaFields={schemaFields}
          height="100%"
          viewMode={currentViewMode}
          onViewModeChange={handleViewModeChange}
          enableSelectionColumn={true}
          enableGrouping={true}
          enableFiltering={true}
          enableSorting={true}
          readOnly={!hasWriteAccess}
          enableDragAndDrop={hasWriteAccess}
          enableDelete={hasWriteAccess}
          onDelete={onDelete}
          enableExport={true}
          enableInlineCreation={enableInlineCreation}
          onInlineCreate={onInlineCreate}
          onEscalate={onEscalate}
          onCellClick={onCellClick}
          onCopyLink={copyLink}
          viewPickerProps={viewPickerProps}
          toolbarLeading={toolbarLeading}
          toolbarTrailing={toolbarTrailing}
          emptyStateCta={emptyStateCta}
          emptyStateHeadline={emptyStateHeadline}
          emptyStateBody={emptyStateBody}
          emptyStateMode={emptyStateMode}
          emptyStateContent={emptyStateContent}
          rowActions={allRowActions}
          onRowAction={(actionId, rowIds, rowsData) => {
            if (actionId === 'review-selected') {
              onOpenReview(rowIds, rowsData)
            }
            // GH#1926: Lien waiver cycle actions trigger workflows
            if (actionId === 'start-cycle' && rowIds.length > 0) {
              // Trigger lien-waiver-start-cycle workflow via status change to in_progress
              const record = rowsData[0]?.data ?? rowsData[0]
              const recordId = record?.id ?? rowIds[0]
              if (recordId) {
                orpcClient.dataforge.data
                  .update({
                    entityName: 'LienWaiverCycle',
                    recordId,
                    data: { status: 'in_progress' },
                  })
                  .then(() => {
                    toast.success('Cycle started — waiver requests are being created')
                  })
                  .catch((err: Error) => {
                    toast.error(`Failed to start cycle: ${err.message}`)
                  })
              }
            }
            // GH#2561 Track C C5+C6: PaymentLine bulk "Mark sent + send waiver".
            // Pages on the client side (≤100 ids per HTTP call, see D5 cap)
            // and surfaces per-batch progress + final aggregate via toast.
            if (actionId === 'send-lien-waiver' && rowIds.length > 0) {
              const totalCount = rowIds.length
              const willBatch = totalCount > BULK_SEND_BATCH_SIZE
              const initialMessage = willBatch
                ? `Sending in ${Math.ceil(totalCount / BULK_SEND_BATCH_SIZE)} batches…`
                : `Sending ${totalCount} ${totalCount === 1 ? 'waiver' : 'waivers'}…`
              const toastId = toast.loading(initialMessage)

              dispatchBulkSend(rowIds, {
                onBatchProgress: (batchIndex, batchCount) => {
                  if (batchCount > 1) {
                    toast.loading(
                      `Sending in ${batchCount} batches… (${batchIndex}/${batchCount})`,
                      { id: toastId },
                    )
                  }
                },
              })
                .then((result) => {
                  const summary = `Sent ${result.sent} ${result.sent === 1 ? 'waiver' : 'waivers'} (skipped ${result.skipped})`
                  if (result.errors.length > 0) {
                    // Surface up to 5 error lines as a toast detail block.
                    // Sonner's `description` accepts strings; long lists get
                    // truncated rather than overflowing the viewport.
                    const sample = result.errors
                      .slice(0, 5)
                      .map((e) => `• ${e.line_id}: ${e.message}`)
                      .join('\n')
                    const more = result.errors.length > 5 ? `\n…and ${result.errors.length - 5} more` : ''
                    toast.error(
                      `${summary} — ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`,
                      {
                        id: toastId,
                        description: `${sample}${more}`,
                        duration: 8000,
                      },
                    )
                  } else {
                    toast.success(summary, { id: toastId })
                  }
                })
                .catch((err: Error) => {
                  toast.error(`Failed to send waivers: ${err.message}`, { id: toastId })
                })
            }
            if (actionId === 'export-waivers' && rowIds.length > 0) {
              // Trigger export by changing status to closed (fires lien-waiver-export workflow)
              const record = rowsData[0]?.data ?? rowsData[0]
              const recordId = record?.id ?? rowIds[0]
              if (recordId) {
                orpcClient.dataforge.data
                  .update({
                    entityName: 'LienWaiverCycle',
                    recordId,
                    data: { status: 'closed' },
                  })
                  .then(() => {
                    toast.success('Export started — document will be available shortly')
                  })
                  .catch((err: Error) => {
                    toast.error(`Failed to export waivers: ${err.message}`)
                  })
              }
            }
          }}
        />
      </div>
      <ReorderConfirmationDialog />

      {/* SaveViewDialog (GH#1570 P2.3) */}
      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        entityType={entityName}
        onSave={handleSaveView}
        isAdmin={isAdmin}
      />
    </>
  )
})

interface EntityListViewProps {
  /** Override entity name (used by directory routes that don't have :entityName param) */
  entityName?: string
}

/**
 * Entity List View Component
 * Fetches and displays entity records in a grid
 */
export const EntityListView = observer(function EntityListView(props: EntityListViewProps): React.JSX.Element | null {
  // Use prop if provided, otherwise read from route params
  const params = useParams({ strict: false }) as { entityName?: string }
  const entityName = props.entityName ?? params.entityName
  const navigate = useNavigate()
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId || ''

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const uploadDialogRef = useRef<EntityUploadDialogHandle>(null)

  // Page-level drag state for upload overlay
  const [isPageDragActive, setIsPageDragActive] = useState(false)

  // Track whether the grid has been shown at least once.
  // Prevents VibGrid from unmounting on transient data state changes
  // (e.g., TanStack Router re-renders, liveQuery re-subscriptions)
  // which caused a visible double render on fresh page load.
  const hasShownGridRef = useRef(false)
  const prevEntityRef = useRef(entityName)
  if (prevEntityRef.current !== entityName) {
    prevEntityRef.current = entityName
    hasShownGridRef.current = false
  }

  // All hooks must be called unconditionally (React rules of hooks)
  const resolvedName = entityName ?? ''
  const schema = useEntitySchema(resolvedName)
  // GH#2848 follow-up: cold-load shimmer needs the schemas query's loading
  // state, since `useEntitySchema()` only returns `EntitySchema | undefined`
  // and can't distinguish "still loading" from "doesn't exist".
  const schemasQuery = useEntitySchemasQuery()
  const [isTransitionPending, startTransition] = useTransition()

  // GH#2848 Phase D B32: substrate fully owns the page-entity data path,
  // so the legacy TanStack DB collection bootstrap is permanently retired
  // for the VibeGrid page entity. The substrate's own ready/total drives
  // the grid; the synthesized listResult below only feeds the loading +
  // total-count UI shell. `useEntityListData` is no longer called for the
  // page entity (it would call `useEntityCollection(resolvedName)` and
  // race substrate's read path).
  //
  // GH#2848 follow-up — cold-load shimmer: the previous cutover hardcoded
  // `isReady: true` here, which made the EntityListSkeleton branch below
  // dead code. The page rendered blank until VibeGrid mounted and its
  // internal TableSkeleton overlay painted. Restore proper page-level
  // shimmer by deriving readiness from the schema + count queries — the
  // two server round-trips that gate which branch (skeleton / empty
  // state / grid) we ultimately render. Once both have resolved, the
  // VibeGrid mounts and owns its own loading overlay from there on.
  const listResult = {
    rows: [] as any[],
    isReady: !schemasQuery.isLoading,
    error: null as Error | null,
    pagination: { total: 0, pageIndex: 0, pageSize: 1000 },
  }

  // Fetch creation mode configuration for this entity type
  const creationConfigQuery = useQuery({
    queryKey: uploadQueryKeys.creationConfig(orgId, resolvedName),
    queryFn: () => orpcClient.dataforge.upload.getCreationConfig({ entityName: resolvedName }),
    enabled: !!resolvedName && !!orgId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const creationModes = creationConfigQuery.data?.creationModes ?? ['form']
  const hasUploadMode = creationModes.includes('upload')
  // Review mode: enabled by 'upload' (entities created from files) or 'review' (entities with review queue but form-created)
  const hasReviewMode = hasUploadMode || (creationModes as string[]).includes('review')
  const primaryFileConfig = creationConfigQuery.data?.primaryFile

  // Upload orchestration hook (conditionally enabled based on schema config)
  // GH#2985: forward primaryFile.intent so non-OCR uploads (e.g. CSV imports)
  // route to their workflow via CSV_INTENT_TO_WORKFLOW in the workflows worker.
  const { store: uploadStore, handleFilesDropped } = useEntityUpload({
    entityName: resolvedName,
    acceptedMimeTypes: primaryFileConfig?.mimeTypes,
    maxFileSizeBytes: primaryFileConfig?.maxFileSizeBytes,
    intent: primaryFileConfig?.intent,
    enabled: hasUploadMode,
  })

  // COI optimistic upload-row carve-out: tempId per dropped file, keyed by
  // file.name. Populated synchronously on drop; entries removed when the
  // matching uploadStore op gets an entity_id (or terminates with error).
  const coiPlaceholderMapRef = useRef<Map<string, string>>(new Map())

  // COI carve-out: insert an optimistic placeholder row per dropped file BEFORE
  // the upload starts so the grid shows "Processing" rows immediately. The
  // placeholder uses a client-generated UUID id; the real entity (different
  // UUID, server-assigned) arrives later via the substrate event flow. The
  // reaction below removes each placeholder once its op picks up an entity_id.
  const coiAwareHandleFilesDropped = useCallback(
    async (files: File[]) => {
      if (!shouldOptimisticUpload({ resolvedEntityName: resolvedName, orgId })) {
        return handleFilesDropped(files)
      }
      const sqlite = getSQLiteClient()
      const inserts: Array<Promise<unknown>> = []
      for (const file of files) {
        const tempId = crypto.randomUUID()
        coiPlaceholderMapRef.current.set(file.name, tempId)
        inserts.push(
          sqlite.insertOptimisticPlaceholder({
            orgId,
            entityName: 'CertificateOfInsurance',
            record: buildPlaceholderRecord({ tempId, fileName: file.name }),
          }),
        )
      }
      // Fire placeholders in parallel; don't block file processing on them.
      void Promise.allSettled(inserts)
      return handleFilesDropped(files)
    },
    [resolvedName, orgId, handleFilesDropped],
  )

  // Remove COI optimistic placeholders when the real entity is known (or
  // the upload errored). Keyed by file.name → tempId; we don't care which
  // fileId/op observed the change, only that the file's terminal state is
  // reached. Reaction only fires for COI carve-out.
  useEffect(() => {
    if (!shouldOptimisticUpload({ resolvedEntityName: resolvedName, orgId })) return
    const dispose = reaction(
      () =>
        uploadStore.operations.map((op) => ({
          fileName: op.fileName,
          hasEntity: !!op.entityId,
          status: op.status,
        })),
      (snapshots) => {
        const sqlite = getSQLiteClient()
        const removable = collectRemovablePlaceholders(
          snapshots,
          coiPlaceholderMapRef.current,
        )
        if (removable.length === 0) return
        void Promise.allSettled(
          removable.map((id) =>
            sqlite.localDeleteEntity({
              orgId,
              entityName: 'CertificateOfInsurance',
              recordId: id,
            }),
          ),
        )
      },
      { fireImmediately: true },
    )
    return dispose
  }, [resolvedName, orgId, uploadStore])

  // GH#1843: Related entity drawer state for relationship badge clicks
  const [drawerState, setDrawerState] = useState<{
    open: boolean
    entityType: string
    entityId: string
  }>({ open: false, entityType: '', entityId: '' })


  const reviewQueueResult = useReviewQueue(resolvedName, hasReviewMode ? orgId || null : null)
  // Use backend count when loaded; fall back to upload store count while loading
  const reviewCount = reviewQueueResult.isLoading ? uploadStore.reviewRequiredCount : reviewQueueResult.total

  const handleOpenReview = useCallback((rowIds: string[], _rowsData: any[]) => {
    // GH#2326: Open review overlay via search params (page stays mounted underneath).
    //
    // GH#2848 follow-up: use the `rowIds` argument directly. Previously we
    // derived ids via `rowsData.map((r) => (r.data ?? r).id)`, which only
    // worked while TanStack DB collections populated each VirtualRow's
    // `data` payload with the full entity record (including `id`). Under
    // the substrate row stream, `processedRows[i].data` is the column
    // payload from SQLite and does not necessarily expose an `id` field —
    // so the join produced an empty string and the URL ended up with
    // `reviewIds=` (empty), which `EntityReviewOverlay.getReviewParams`
    // reads as zero ids and renders nothing. The grid passes the actual
    // row ids as the first argument; that's our source of truth.
    if (rowIds.length === 0) return
    navigate({
      search: (prev: any) => ({ ...prev, reviewEntity: resolvedName, reviewIds: rowIds.join(',') }),
    } as any)
  }, [navigate, resolvedName])

  // GH#1658: Inline creation via ghost rows
  const featureFlags = useFeatureFlags()
  const authStore = useAuth()
  // Fail-secure: if session/org not yet loaded, treat as viewer (no write access)
  const userOrgRole = authStore.session?.organization?.role ?? 'viewer'
  const hasWriteAccess = userOrgRole !== 'viewer'
  const isInlineCreationEnabled = featureFlags.isEnabled('vibegrid.inline_creation') && hasWriteAccess

  const handleInlineCreate = useCallback(
    async (defaults: Record<string, unknown>): Promise<string> => {
      const response = (await orpcClient.dataforge.data.create({
        entityName: resolvedName,
        data: defaults,
      })) as { success: boolean; data: { id: string } }
      return response.data?.id ?? ''
    },
    [resolvedName],
  )

  // COI optimistic delete carve-out: fire local SQLite delete (instant grid
  // update via entityBatch) without awaiting the SharedWorker IPC, and await
  // the server delete which is the source of truth. On any per-row failure,
  // refetch the row by id to restore it from the server. Toast distinguishes
  // "restored" (server still has the row) from a plain failure (server
  // actually deleted it, but a downstream cascade failed).
  //
  // The local-delete IPC must not gate the dialog: the SharedWorker handler
  // emits its entityBatch delete synchronously before sending the ack, so the
  // grid drops the row regardless of when the ack arrives. Awaiting the ack
  // used to wedge "Deleting…" for up to DEFAULT_TIMEOUT (30s) when the leader
  // tab was busy or stale (GH#3107), and worse, it deferred the server delete
  // request from being fired at all.
  const coiOptimisticDelete = useCallback(
    async (rowIds: string[], _rowsData: any[]): Promise<void> => {
      if (entityName !== 'CertificateOfInsurance') return
      if (!orgId || rowIds.length === 0) return
      const sqlite = getSQLiteClient()
      // 1. Fire local SQLite removals best-effort — don't await. The
      // SharedWorker handler emits its entityBatch delete synchronously
      // before sending the IPC ack, so the grid drops the row instantly.
      for (const id of rowIds) {
        sqlite
          .localDeleteEntity({ orgId, entityName: 'CertificateOfInsurance', recordId: id })
          .catch(() => {})
      }
      // 2. Server delete + reconciliation runs in the background. We
      // resolve the caller's Promise immediately so the confirm dialog
      // closes without waiting on the round-trip. The server-side cascade
      // can run into the multi-minute range against staging (separate bug
      // to chase server-side); blocking the dialog on that is what users
      // reported as "delete hangs while it shows deleted properly on
      // refresh" — the row was already removed locally + server-side, the
      // dialog was just sitting on the slow HTTP response.
      void (async () => {
        try {
          const serverResults = await Promise.allSettled(
            rowIds.map((id) =>
              orpcClient.dataforge.data.delete({
                entityName: 'CertificateOfInsurance',
                recordId: id,
              }),
            ),
          )
          const failedIds = collectFailedDeleteIds(rowIds, serverResults)
          if (failedIds.length === 0) return
          const refetchResults = await Promise.allSettled(
            failedIds.map((id) =>
              sqlite.fetchEntityById({
                orgId,
                entityName: 'CertificateOfInsurance',
                recordId: id,
              }),
            ),
          )
          const restored = countRestoredAfterRefetch(refetchResults)
          const outcome = describeOptimisticDeleteOutcome(failedIds.length, restored)
          if (outcome.kind !== 'none') toast.error(outcome.message)
        } catch (err) {
          logger.error('COI background delete reconciliation threw', {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    },
    [entityName, orgId],
  )

  // GH#1658: QuickCreatePanel state for escalation from ghost rows
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateInheritedFields, setQuickCreateInheritedFields] = useState<Record<string, unknown>>({})

  const handleEscalate = useCallback((_groupId: string, inheritedFields: Record<string, unknown>) => {
    setQuickCreateInheritedFields(inheritedFields)
    setQuickCreateOpen(true)
  }, [])

  // Page-level drag detection for upload overlay
  useEffect(() => {
    if (!hasUploadMode) return

    const handleDragEnter = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) {
        setIsPageDragActive(true)
      }
    }

    // Counter pattern (enter++ / leave-- / unmount at 0) races React 18's
    // per-handler render cadence: crossing child boundaries (e.g. the
    // overlay's inner border-dashed card) fires dragleave + dragenter as
    // separate events, each committing before the next handler runs —
    // flicker. Use viewport bounds instead: only deactivate when the cursor
    // truly leaves the window.
    const handleDragLeave = (e: DragEvent): void => {
      e.preventDefault()
      if (
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setIsPageDragActive(false)
      }
    }

    const handleDrop = (e: DragEvent): void => {
      e.preventDefault()
      setIsPageDragActive(false)
    }

    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault()
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    document.addEventListener('dragover', handleDragOver)

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
      document.removeEventListener('dragover', handleDragOver)
    }
  }, [hasUploadMode])

  if (!entityName) {
    return <EntityNotFound entityName="unknown" />
  }

  if (!listResult.isReady && listResult.rows.length === 0 && !hasShownGridRef.current) {
    return <EntityListSkeleton />
  }

  // Once we pass the skeleton guard, mark the grid as shown so transient
  // data state resets (from router re-renders, query re-subscriptions) don't
  // unmount VibGrid and cause a visible double render.
  hasShownGridRef.current = true

  // Entity not found - schema doesn't exist
  if (!schema) {
    return <EntityNotFound entityName={entityName} />
  }

  if (listResult.error) {
    logger.error('Failed to load entity list', {
      entityName,
      error: listResult.error.message,
    })

    return (
      <EntityListError
        error={listResult.error}
        entityName={entityName}
        onRetry={() => {
          // Reload the collection
          window.location.reload()
        }}
      />
    )
  }

  const rows = listResult.rows
  const entityTitle = schema.displayName || EntityNameUtils.toDisplayFormat(schema.entityName)

  // Derive schema field descriptors for smart view gating (GH#2139)
  const schemaFields: SchemaFieldDescriptor[] | undefined = schema?.fields.map((f) => ({
    fieldId: f.name,
    fieldType: f.type,
    label: f.label ?? f.name,
    slug: f.name,
  }))

  // GH#3016 follow-up: the moment an upload starts (R2 PUT begins), the
  // dropzone empty-state must yield to the regular grid chrome so the user
  // immediately sees "drop received, table is filling in". Without this, the
  // dropzone stays visible for 1-3s until the server confirms entity
  // creation and the substrate reconciles a row.
  //
  // `EntityListView` is wrapped in `observer(...)` at the bottom of this
  // file, so reading `uploadStore.hasAnyInFlight` / `uploadStore.inFlightCount`
  // here participates in MobX reactivity — no extra observer boundary needed.
  const isUploadInFlight = uploadStore.hasAnyInFlight
  const inFlightCount = uploadStore.inFlightCount
  const emptyStateMode: 'default' | 'dropzone' =
    hasUploadMode && hasWriteAccess && !isUploadInFlight ? 'dropzone' : 'default'
  const baseEmptyStateHeadline = `No ${entityTitle} records yet`
  const baseEmptyStateBody = 'Get started by creating your first record.'
  const emptyStateHeadlineEffective = isUploadInFlight
    ? `Processing ${inFlightCount} file${inFlightCount === 1 ? '' : 's'}…`
    : baseEmptyStateHeadline
  const emptyStateBodyEffective = isUploadInFlight
    ? 'Rows will appear as extraction completes.'
    : baseEmptyStateBody

  if (import.meta.env.DEV && rows.length) {
    logger.debug('Sample row loaded', { row: rows[0] })
  }

  // GH#2934 (p3): the server-COUNT short-circuit + EntityEmptyState branch is
  // removed. VibeGrid renders the empty-state in-grid via VibeGridEmptyState
  // with the page-supplied `emptyStateCta` (CreationModeButton).

  // Render table with data (or substrate-driven empty state inside the grid)
  return (
    <>
      {/* Top Header Bar */}
      <Header>
        <TopNav links={[]} />
        <div className="ms-auto flex shrink-0 items-center space-x-2 sm:space-x-4"></div>
      </Header>

      {/* Main Content — compact layout: title merged into grid toolbar */}
      <Main fluid className="flex flex-col gap-0 px-4 py-3">
        {/* Review queue banner — clickable, opens all pending records in batch (GH#1534) */}
        {reviewCount > 0 && (
          <button
            type="button"
            onClick={() => {
              // Open the review overlay with every pending entity as a batch.
              // reviewQueueResult.entities already holds the rows from the
              // /review/list endpoint, each with a top-level id — no need to
              // round-trip through the grid's row selection.
              const ids = reviewQueueResult.entities.map((e) => e.id).filter(Boolean).join(',')
              if (!ids) return
              navigate({
                search: (prev: any) => ({ ...prev, reviewEntity: resolvedName, reviewIds: ids }),
              } as any)
            }}
            disabled={reviewQueueResult.isLoading || reviewQueueResult.entities.length === 0}
            className="flex w-full items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-left text-sm transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
            aria-label={`Review ${reviewCount} ${reviewCount === 1 ? 'record' : 'records'} pending`}
            data-testid="review-queue-banner"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="font-medium">
              Review {reviewCount} {reviewCount === 1 ? 'record' : 'records'}
            </span>
            <span className="text-muted-foreground">— click to open</span>
          </button>
        )}

        {/* Vibegrid Container — position:relative anchors QuickCreatePanel */}
        {/* flex flex-col: ensures list widgets + grid stack properly so VibeGrid consumes
            remaining space (not 100% of parent) — otherwise the grid overflows below the
            parent by the list-widget height, which pushes the ActionsBar off-screen. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <VibeGridStoreProvider tableId={`entity-list-${entityName}`} entityType={entityName}>
            {/* key={entityName}: remount on entity change so useViewUrlSync state (activeViewName, defaultViewConfig, initialSearchRef) does not leak across routes. */}
            <EntityListViewUrlSync
              key={entityName}
              entityName={entityName}
              orgId={orgId}
              enableInlineCreation={isInlineCreationEnabled}
              onInlineCreate={handleInlineCreate}
              onEscalate={handleEscalate}
              onOpenReview={handleOpenReview}
              onDelete={entityName === 'CertificateOfInsurance' ? coiOptimisticDelete : undefined}
              hasReviewMode={hasReviewMode}
              schemaFields={schemaFields}
              toolbarLeading={
                <div className="flex items-center gap-2 border-r border-border pr-3 mr-1">
                  <h1 className="text-sm font-semibold whitespace-nowrap">{entityTitle}</h1>
                  <EntityCountChip />
                </div>
              }
              toolbarTrailing={
                hasWriteAccess ? (
                  <CreationModeButton
                    entityName={schema.entityName}
                    displayName={entityTitle}
                    creationModes={creationModes}
                    onCreateForm={() =>
                      startTransition(() => {
                        setCreateDialogOpen(true)
                      })
                    }
                    onCreateUpload={() => uploadDialogRef.current?.open()}
                    disabled={isTransitionPending}
                    size="sm"
                  />
                ) : undefined
              }
              emptyStateHeadline={emptyStateHeadlineEffective}
              emptyStateBody={emptyStateBodyEffective}
              emptyStateCta={
                hasWriteAccess ? (
                  <CreationModeButton
                    entityName={schema.entityName}
                    displayName={entityTitle}
                    creationModes={creationModes}
                    onCreateForm={() =>
                      startTransition(() => {
                        setCreateDialogOpen(true)
                      })
                    }
                    onCreateUpload={() => uploadDialogRef.current?.open()}
                    disabled={isTransitionPending}
                  />
                ) : undefined
              }
              // GH#3016: When the entity supports upload-based creation AND the
              // user has write access, replace the centered empty-state message
              // with a full-bleed inline dropzone. The dropzone reuses the same
              // `handleFilesDropped` from `useEntityUpload` so the batch summary
              // toast (D4 / PR #3014) fires for inline-drop uploads too. Stays
              // visible during filter-empty so users can still drop files.
              //
              // GH#3016 follow-up: the moment an upload starts
              // (`uploadStore.hasAnyInFlight === true`), revert to the default
              // empty-state mode so the dropzone disappears immediately,
              // column headers become visible, and the centered "Processing N
              // file(s)…" status (set on emptyStateHeadline/Body above)
              // signals that drops were received while substrate reconciles
              // the new rows.
              emptyStateMode={emptyStateMode}
              emptyStateContent={
                hasUploadMode && hasWriteAccess ? (
                  <EntityUploadDropzone
                    entityName={resolvedName}
                    acceptedMimeTypes={primaryFileConfig?.mimeTypes}
                    onFilesDropped={coiAwareHandleFilesDropped}
                    className="h-full w-full"
                  />
                ) : undefined
              }
              onCellClick={(rowId, _columnId, event) => {
                // GH#1843: Check if click originated from a relationship badge — open drawer for referenced entity
                if (event) {
                  const badge = (event.target as HTMLElement).closest<HTMLElement>(
                    '[data-action="navigate"][data-entity-type][data-entity-id], [data-affordance="navigate"][data-entity-type][data-entity-id]',
                  )
                  if (badge) {
                    const targetEntityType = badge.dataset.entityType
                    const targetEntityId = badge.dataset.entityId
                    if (targetEntityType && targetEntityId) {
                      event.preventDefault()
                      setDrawerState({
                        open: true,
                        entityType: targetEntityType,
                        entityId: targetEntityId,
                      })
                      return
                    }
                  }
                }

                // Default: navigate to the row's own entity detail page
                if (entityName === 'Document') {
                  navigate({
                    to: '/documents/$id',
                    params: { id: rowId } as any,
                  })
                } else {
                  navigate({
                    to: '/entities/$entityName/$id',
                    params: { entityName, id: rowId } as any,
                  })
                }
              }}
            />
          </VibeGridStoreProvider>

          {/* GH#1658: QuickCreatePanel — escalation from ghost rows */}
          {schema && (
            <QuickCreatePanel
              schema={schema}
              inheritedFields={quickCreateInheritedFields}
              open={quickCreateOpen}
              onClose={() => setQuickCreateOpen(false)}
              onSuccess={(recordId) => {
                setQuickCreateOpen(false)
                logger.debug('QuickCreatePanel created record', { recordId })
              }}
            />
          )}
        </div>
      </Main>

      {/* Create Record Dialog */}
      <CreateRecordDialog schema={schema} open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Upload Files Dialog — owns its own open state via ref to avoid VibeGrid re-render */}
      {hasUploadMode && (
        <EntityUploadDialog
          ref={uploadDialogRef}
          entityName={resolvedName}
          acceptedMimeTypes={primaryFileConfig?.mimeTypes}
          extractionTemplate={primaryFileConfig?.extractionTemplate}
          onFilesDropped={coiAwareHandleFilesDropped}
        />
      )}

      {/* Page-level upload dropzone overlay */}
      {isPageDragActive && hasUploadMode && (
        <EntityUploadDropzone
          entityName={resolvedName}
          acceptedMimeTypes={primaryFileConfig?.mimeTypes}
          onFilesDropped={(files) => {
            setIsPageDragActive(false)
            coiAwareHandleFilesDropped(files)
          }}
          isPageLevel={true}
        />
      )}



      {/* GH#1843: Related entity drawer for relationship badge clicks */}
      {drawerState.entityType && (
        <RelatedEntityDrawer
          entityType={drawerState.entityType}
          entityId={drawerState.entityId}
          open={drawerState.open}
          onOpenChange={(open) => setDrawerState((s) => ({ ...s, open }))}
          onNavigate={() => {
            setDrawerState((s) => ({ ...s, open: false }))
            navigate({
              to: '/entities/$entityName/$id',
              params: { entityName: drawerState.entityType, id: drawerState.entityId } as any,
            })
          }}
        />
      )}
    </>
  )
})

/**
 * Thin wrapper that fetches schema + record for a referenced entity,
 * then renders EntityDrawer. Keeps data fetching out of the main component.
 */
function RelatedEntityDrawer({
  entityType,
  entityId,
  open,
  onOpenChange,
  onNavigate,
}: {
  entityType: string
  entityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: () => void
}) {
  const drawerSchema = useEntitySchema(entityType)
  const { data: record } = useEntityRecordQuery(entityType, entityId, {
    enabled: open && !!entityId,
  })

  if (!drawerSchema) return null

  return (
    <EntityDrawer
      schema={drawerSchema}
      record={(record as EntityRecord) ?? null}
      open={open}
      onOpenChange={onOpenChange}
      onNavigate={onNavigate}
    />
  )
}

/**
 * GH#2689 B7: List-view tab strip button. Stateless presentational component;
 * the active-tab state and URL sync are managed by the parent.
 */
function ListTabButton({
  id,
  label,
  icon,
  active,
  onSelect,
}: {
  id: string
  label: string
  icon?: string
  active: boolean
  onSelect: (id: string) => void
}) {
  // Icon-name → Lucide component lookup. Keep narrow; matches the
  // `extraTabs` icon contract from `archetype-tab-defaults.ts`.
  // Currently the only declared icon is 'PlayCircle' (Scan Runs).
  const IconComponent = icon === 'PlayCircle' ? PlayCircle : null
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={`list-tab-${id}`}
      onClick={() => onSelect(id)}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {IconComponent && <IconComponent aria-hidden="true" className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </button>
  )
}
