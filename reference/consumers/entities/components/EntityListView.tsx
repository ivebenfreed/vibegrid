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
import { useNavigate, useParams } from '@tanstack/react-router'
import { AlertTriangle, ClipboardCheck, Download, Loader2, Play } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useAuth, useFeatureFlags, useOrganization } from '@/app/stores'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { TopNav } from '@/shared/components/layout/top-nav'
import { useStreamingEntityListData } from '@/shared/data/db/hooks/useStreamingEntityListData'
import { orpcClient } from '@/shared/data/orpc/client'
import { uploadQueryKeys } from '@/shared/data/orpc/query-utils'
import { useEntityRecordQuery } from '@/shared/data/queries/entity-data.queries'
import { useEntitySchema } from '@/shared/data/queries/entity-schemas.queries'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'

import { useReviewQueue } from '@/features/entity-review/hooks/useReviewQueue'
import type { EntityRecord } from '@/shared/types/dataforge'
import { VibeGrid, type RowAction } from '@/systems/vibegrid'
import type { SchemaFieldDescriptor } from '@/systems/vibegrid/modules/GridModule'
import type { ViewMode } from '@/systems/vibegrid/stores/ViewModeStore'
import { ReorderConfirmationDialog } from '@/systems/vibegrid/components/ReorderConfirmationDialog'
import { SaveViewDialog } from '@/systems/vibegrid/components/SaveViewDialog'
import type { ViewVisibility } from '@/systems/vibegrid/components/SaveViewDialog'
import { VibeGridStoreProvider, useVibeGridStores } from '@/systems/vibegrid/stores/context'
import { useEntityUpload } from '../hooks/useEntityUpload'
import { useViewUrlSync } from '../hooks/useViewUrlSync'
// GH#2641: side-effect import registers built-in list widgets + overview components
import '../lib/register-view-components'
import { getListWidget, type ListWidgetContext } from '../lib/widget-registry'
import { CreationModeButton } from './CreationModeButton'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { EntityUploadDialog, type EntityUploadDialogHandle } from './dialogs/EntityUploadDialog'
import { EntityBreadcrumbs } from './EntityBreadcrumbs'
import { EntityEmptyState } from './EntityEmptyState'
import { EntityListError } from './EntityListError'
import { EntityListSkeleton } from './EntityListSkeleton'
import { EntityNotFound } from './EntityNotFound'
import { EntityUploadDropzone } from './EntityUploadDropzone'
import { EntityDrawer } from './EntityDrawer'
import { QuickCreatePanel } from './QuickCreatePanel'

const logger = getLogger(['entity', 'EntityListView'])

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
}) {
  const stores = useVibeGridStores()
  const authStore = useAuth()

  const { copyLink, activeViewId, hasUnsavedChanges, selectView, clearView } = useViewUrlSync({
    entityType: entityName,
    orgId,
    stores,
  })

  // GH#2641: Load the active view's config so we can render config-driven
  // widgets above the grid (listWidgets). Ref guard prevents duplicate fetches
  // when the effect re-fires during route transitions.
  const [activeViewConfig, setActiveViewConfig] = useState<Record<string, unknown> | null>(null)
  const viewsFetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!entityName || viewsFetchedRef.current === entityName) return
    viewsFetchedRef.current = entityName
    let cancelled = false
    orpcClient.dataforge.views
      .list({ entityName })
      .then((result) => {
        if (cancelled) return
        const defaultView = result.views.find((v: { is_default: boolean }) => v.is_default) ?? result.views[0] ?? null
        setActiveViewConfig(defaultView?.config ?? null)
      })
      .catch(() => {
        // Non-critical: widgets just won't render
      })
    return () => {
      cancelled = true
    }
  }, [entityName])

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

  // Duplicate view: create a personal copy with "(copy)" suffix
  const handleDuplicateView = useCallback(
    async (view: { entity_type: string; name: string; config: Record<string, unknown> }) => {
      try {
        await orpcClient.dataforge.views.create({
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
    [entityName],
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
        columnVisibility: { ...visualStateStore.columnVisibility },
        // GH#1677 P2.3: Include child entity tabs array
        ...(childEntityTabs.length > 0 ? { childEntityTabs } : {}),
        // Keep legacy childEntityConfig for backward compat with existing views
        ...(childEntityTabs.length === 1 ? { childEntityConfig: childEntityTabs[0] } : {}),
      }

      await orpcClient.dataforge.views.create({
        entityName,
        name,
        visibility,
        config,
      })

      toast.success('View saved')
    },
    [entityName, stores],
  )

  const viewPickerProps = {
    entityType: entityName,
    orgId,
    activeViewId,
    hasUnsavedChanges,
    onViewSelect: selectView,
    onSaveView: () => setSaveDialogOpen(true),
    onUnsavedSelect: clearView,
    onDuplicateView: handleDuplicateView,
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

  // Assemble row actions based on entity type
  const allRowActions: RowAction[] = [reviewAction]
  if (entityName === 'LienWaiverCycle') {
    allRowActions.push(startCycleAction, exportWaiversAction)
  }

  // GH#2641: Render widgets above the grid driven by entity_views.config.listWidgets.
  // Unknown widget keys are skipped with a console.warn — never break the page.
  const listWidgets = Array.isArray((activeViewConfig as any)?.listWidgets)
    ? ((activeViewConfig as any).listWidgets as Array<{ widget: string; props?: Record<string, unknown> }>)
    : []

  return (
    <>
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
        enableExport={true}
        enableInlineCreation={enableInlineCreation}
        onInlineCreate={onInlineCreate}
        onEscalate={onEscalate}
        onCellClick={onCellClick}
        onCopyLink={copyLink}
        viewPickerProps={viewPickerProps}
        toolbarLeading={toolbarLeading}
        toolbarTrailing={toolbarTrailing}
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
  const pageDragCounterRef = useRef(0)

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
  const [isTransitionPending, startTransition] = useTransition()

  const listResult = useStreamingEntityListData(resolvedName, {
    pagination: { pageIndex: 0, pageSize: 1000 },
    orderBy: 'created_at',
    orderDirection: 'desc',
  })

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
  const { store: uploadStore, handleFilesDropped } = useEntityUpload({
    entityName: resolvedName,
    acceptedMimeTypes: primaryFileConfig?.mimeTypes,
    maxFileSizeBytes: primaryFileConfig?.maxFileSizeBytes,
    enabled: hasUploadMode,
  })

  // GH#1843: Related entity drawer state for relationship badge clicks
  const [drawerState, setDrawerState] = useState<{
    open: boolean
    entityType: string
    entityId: string
  }>({ open: false, entityType: '', entityId: '' })


  const reviewQueueResult = useReviewQueue(resolvedName, hasReviewMode ? orgId || null : null)
  // Use backend count when loaded; fall back to upload store count while loading
  const reviewCount = reviewQueueResult.isLoading ? uploadStore.reviewRequiredCount : reviewQueueResult.total

  const handleOpenReview = useCallback((_rowIds: string[], rowsData: any[]) => {
    // GH#2326: Open review overlay via search params (page stays mounted underneath)
    const entities = rowsData.map((row) => (row?.data ?? row) as EntityRecord)
    const ids = entities.map((e) => e.id).join(',')
    navigate({
      search: (prev: any) => ({ ...prev, reviewEntity: resolvedName, reviewIds: ids }),
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
      pageDragCounterRef.current++
      if (e.dataTransfer?.types.includes('Files')) {
        setIsPageDragActive(true)
      }
    }

    const handleDragLeave = (e: DragEvent): void => {
      e.preventDefault()
      pageDragCounterRef.current--
      if (pageDragCounterRef.current === 0) {
        setIsPageDragActive(false)
      }
    }

    const handleDrop = (e: DragEvent): void => {
      e.preventDefault()
      pageDragCounterRef.current = 0
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

  if (import.meta.env.DEV && rows.length) {
    logger.debug('Sample row loaded', { row: rows[0] })
  }

  // Empty state - no records yet
  if (rows.length === 0) {
    return (
      <>
        <Header>
          <TopNav links={[]} />
        </Header>
        <Main>
          <EntityBreadcrumbs entityName={schema.entityName} displayName={schema.displayName} />
          <EntityEmptyState
            entityName={schema.entityName}
            creationModes={creationModes}
            onCreateForm={() =>
              startTransition(() => {
                setCreateDialogOpen(true)
              })
            }
            onCreateUpload={() => uploadDialogRef.current?.open()}
          />
        </Main>

        {/* Create Record Dialog */}
        <CreateRecordDialog schema={schema} open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

        {/* Upload Files Dialog */}
        {hasUploadMode && (
          <EntityUploadDialog
            ref={uploadDialogRef}
            entityName={resolvedName}
            acceptedMimeTypes={primaryFileConfig?.mimeTypes}
            extractionTemplate={primaryFileConfig?.extractionTemplate}
            onFilesDropped={handleFilesDropped}
          />
        )}
      </>
    )
  }

  // Success - render table with data
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
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <VibeGridStoreProvider tableId={`entity-list-${entityName}`} entityType={entityName}>
            <EntityListViewUrlSync
              entityName={entityName}
              orgId={orgId}
              enableInlineCreation={isInlineCreationEnabled}
              onInlineCreate={handleInlineCreate}
              onEscalate={handleEscalate}
              onOpenReview={handleOpenReview}
              hasReviewMode={hasReviewMode}
              schemaFields={schemaFields}
              toolbarLeading={
                <div className="flex items-center gap-2 border-r border-border pr-3 mr-1">
                  <h1 className="text-sm font-semibold whitespace-nowrap">{entityTitle}</h1>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {listResult.pagination.total}
                    {listResult.isStreaming && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                  </span>
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
          onFilesDropped={handleFilesDropped}
        />
      )}

      {/* Page-level upload dropzone overlay */}
      {isPageDragActive && hasUploadMode && (
        <EntityUploadDropzone
          entityName={resolvedName}
          acceptedMimeTypes={primaryFileConfig?.mimeTypes}
          onFilesDropped={(files) => {
            setIsPageDragActive(false)
            handleFilesDropped(files)
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
