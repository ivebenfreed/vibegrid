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
import { AlertTriangle, Eye, Loader2 } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useAuth, useFeatureFlags, useOrganization } from '@/app/stores'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { TopNav } from '@/shared/components/layout/top-nav'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Progress } from '@/shared/components/ui/progress'
import { useStreamingEntityListData } from '@/shared/data/db/hooks/useStreamingEntityListData'
import { orpcClient } from '@/shared/data/orpc/client'
import { uploadQueryKeys } from '@/shared/data/orpc/query-utils'
import { useEntitySchema } from '@/shared/data/queries/entity-schemas.queries'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import { VibeGrid } from '@/systems/vibegrid'
import type { RowAction } from '@/systems/vibegrid'
import { ReorderConfirmationDialog } from '@/systems/vibegrid/components/ReorderConfirmationDialog'
import { SaveViewDialog } from '@/systems/vibegrid/components/SaveViewDialog'
import type { ViewVisibility } from '@/systems/vibegrid/components/SaveViewDialog'
import { VibeGridStoreProvider, useVibeGridStores } from '@/systems/vibegrid/stores/context'
import { COIReviewPanel } from '@/features/coi/components/COIReviewPanel'
import { coiStore } from '@/features/coi/stores/COIStore'
import { useEntityUpload } from '../hooks/useEntityUpload'
import { useViewUrlSync } from '../hooks/useViewUrlSync'
import { CreationModeButton } from './CreationModeButton'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { EntityUploadDialog, type EntityUploadDialogHandle } from './dialogs/EntityUploadDialog'
import { EntityBreadcrumbs } from './EntityBreadcrumbs'
import { EntityEmptyState } from './EntityEmptyState'
import { EntityListError } from './EntityListError'
import { EntityListSkeleton } from './EntityListSkeleton'
import { EntityNotFound } from './EntityNotFound'
import { EntityUploadDropzone } from './EntityUploadDropzone'
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
  hasUploadMode,
  enableInlineCreation,
  onInlineCreate,
  onEscalate,
}: {
  entityName: string
  orgId: string
  onCellClick: (rowId: string, columnId: string) => void
  hasUploadMode: boolean
  enableInlineCreation: boolean
  onInlineCreate: (defaults: Record<string, unknown>) => Promise<string>
  onEscalate: (groupId: string, inheritedFields: Record<string, unknown>) => void
}) {
  const stores = useVibeGridStores()
  const authStore = useAuth()

  const { copyLink, activeViewId, hasUnsavedChanges, selectView, clearView } = useViewUrlSync({
    entityType: entityName,
    orgId,
    stores,
  })

  // SaveViewDialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  const userId = authStore.user?.id ?? ''
  const userRole = authStore.session?.organization?.role ?? 'member'
  const isAdmin = userRole === 'admin' || userRole === 'owner'

  // Duplicate view: create a personal copy with "(copy)" suffix
  const handleDuplicateView = useCallback(
    async (view: { entity_type: string; name: string; config: Record<string, unknown> }) => {
      try {
        await orpcClient.dataforge.views.create({
          entity_type: entityName,
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
      childEntityConfig?: {
        childEntityType: string
        relationshipType: string
        direction: 'incoming' | 'outgoing'
      },
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
        // GH#1621: Include child entity config if provided
        ...(childEntityConfig ? { childEntityConfig } : {}),
      }

      await orpcClient.dataforge.views.create({
        entity_type: entityName,
        name,
        visibility,
        config,
      })

      toast.success('View saved')
    },
    [entityName, stores],
  )

  // Review bulk action — available for any uploaded entity.
  // Opens COI review panel in a full-screen dialog for side-by-side PDF + data review.
  const reviewRowActions = useMemo<RowAction[]>(
    () =>
      hasUploadMode
        ? [
            {
              id: 'review',
              label: 'Review',
              icon: Eye,
            },
          ]
        : [],
    [hasUploadMode],
  )

  // COI Review Panel state — batch review of selected entities
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false)
  const [reviewCoiIds, setReviewCoiIds] = useState<string[]>([])
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0)

  // Handle Review bulk action — open COI review panel for selected entities.
  const handleReviewAction = useCallback(
    async (actionId: string, rowIds: string[], _rowsData: any[]) => {
      if (actionId !== 'review' || rowIds.length === 0) return
      setReviewCoiIds(rowIds)
      setCurrentReviewIndex(0)
      await coiStore.loadCOI(rowIds[0])
      setIsReviewPanelOpen(true)
    },
    [],
  )

  // Navigate to next/previous COI in the batch
  const handleReviewNext = useCallback(async () => {
    const nextIndex = currentReviewIndex + 1
    if (nextIndex < reviewCoiIds.length) {
      setCurrentReviewIndex(nextIndex)
      await coiStore.loadCOI(reviewCoiIds[nextIndex])
    }
  }, [currentReviewIndex, reviewCoiIds])

  const handleReviewPrevious = useCallback(async () => {
    const prevIndex = currentReviewIndex - 1
    if (prevIndex >= 0) {
      setCurrentReviewIndex(prevIndex)
      await coiStore.loadCOI(reviewCoiIds[prevIndex])
    }
  }, [currentReviewIndex, reviewCoiIds])

  const handleReviewClose = useCallback(() => {
    setIsReviewPanelOpen(false)
    setReviewCoiIds([])
    setCurrentReviewIndex(0)
  }, [])

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

  return (
    <>
      <VibeGrid
        tableId={`entity-list-${entityName}`}
        entityType={entityName}
        height="calc(100vh - 280px)"
        enableSelectionColumn={true}
        enableGrouping={true}
        enableFiltering={true}
        enableSorting={true}
        enableDragAndDrop={true}
        enableDelete={true}
        enableInlineCreation={enableInlineCreation}
        onInlineCreate={onInlineCreate}
        onEscalate={onEscalate}
        onCellClick={onCellClick}
        onCopyLink={copyLink}
        viewPickerProps={viewPickerProps}
        rowActions={hasUploadMode && reviewRowActions.length > 0 ? reviewRowActions : undefined}
        onRowAction={hasUploadMode ? handleReviewAction : undefined}
      />
      <ReorderConfirmationDialog />

      {/* COI Review Panel Dialog — full-screen side-by-side PDF + data review */}
      <Dialog open={isReviewPanelOpen} onOpenChange={setIsReviewPanelOpen}>
        <DialogContent
          className="!fixed !inset-2 !w-[calc(100vw-1rem)] !max-w-none !h-[calc(100vh-1rem)] !translate-x-0 !translate-y-0 !top-2 !left-2 p-0 overflow-hidden flex flex-col"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Review Uploaded Document</DialogTitle>
          <DialogDescription className="sr-only">
            Review and approve or reject the uploaded document's extracted data.
          </DialogDescription>
          {coiStore.selectedCOI && (
            <COIReviewPanel
              coi={coiStore.selectedCOI}
              onClose={handleReviewClose}
              onApprove={() => {
                if (currentReviewIndex < reviewCoiIds.length - 1) {
                  handleReviewNext()
                } else {
                  handleReviewClose()
                }
              }}
              onReopen={() => {
                coiStore.loadCOI(reviewCoiIds[currentReviewIndex])
              }}
              onNext={handleReviewNext}
              onPrevious={handleReviewPrevious}
              canGoNext={currentReviewIndex < reviewCoiIds.length - 1}
              canGoPrevious={currentReviewIndex > 0}
              currentIndex={currentReviewIndex}
              totalCount={reviewCoiIds.length}
            />
          )}
        </DialogContent>
      </Dialog>

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
export const EntityListView = observer(function EntityListView(props: EntityListViewProps) {
  // Use prop if provided, otherwise read from route params
  const params = useParams({ strict: false })
  const entityName = props.entityName ?? (params as { entityName?: string }).entityName
  const navigate = useNavigate()
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId || ''

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const uploadDialogRef = useRef<EntityUploadDialogHandle>(null)

  // Page-level drag state for upload overlay
  const [isPageDragActive, setIsPageDragActive] = useState(false)
  const pageDragCounterRef = useRef(0)

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
  const primaryFileConfig = creationConfigQuery.data?.primaryFile

  // Upload orchestration hook (conditionally enabled based on schema config)
  const { store: uploadStore, handleFilesDropped } = useEntityUpload({
    entityName: resolvedName,
    acceptedMimeTypes: primaryFileConfig?.mimeTypes,
    maxFileSizeBytes: primaryFileConfig?.maxFileSizeBytes,
    enabled: hasUploadMode,
  })

  // GH#1658: Inline creation via ghost rows
  const featureFlags = useFeatureFlags()
  const authStore = useAuth()
  // Fail-secure: if session/org not yet loaded, treat as viewer (no write access)
  const userOrgRole = authStore.session?.organization?.role ?? 'viewer'
  const hasWriteAccess = userOrgRole !== 'viewer'
  const isInlineCreationEnabled =
    featureFlags.isEnabled('vibegrid.inline_creation') && hasWriteAccess

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
  const [quickCreateInheritedFields, setQuickCreateInheritedFields] = useState<
    Record<string, unknown>
  >({})

  const handleEscalate = useCallback(
    (_groupId: string, inheritedFields: Record<string, unknown>) => {
      setQuickCreateInheritedFields(inheritedFields)
      setQuickCreateOpen(true)
    },
    [],
  )

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

  if (!listResult.isReady && listResult.rows.length === 0) {
    return <EntityListSkeleton />
  }

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
          <EntityBreadcrumbs entityName={schema.entityName} />
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
        <CreateRecordDialog
          schema={schema}
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />

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

      {/* Main Content */}
      <Main className="flex flex-col gap-4 sm:gap-6">
        {/* Breadcrumbs */}
        <EntityBreadcrumbs entityName={schema.entityName} />

        {/* Review queue banner — entities appear in the grid with a Review action in the bulk toolbar */}
        {uploadStore.reviewRequiredCount > 0 && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription>
              {uploadStore.reviewRequiredCount} uploaded{' '}
              {uploadStore.reviewRequiredCount === 1 ? 'record' : 'records'} need review — select
              them in the grid below and click Review
            </AlertDescription>
          </Alert>
        )}

        {/* Page Header with Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {EntityNameUtils.toDisplayFormat(schema.entityName)}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {listResult.pagination.total}{' '}
                {listResult.pagination.total === 1 ? 'record' : 'records'}
              </p>
              {listResult.isStreaming && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading more...</span>
                </div>
              )}
            </div>
            {/* Streaming progress bar */}
            {listResult.isStreaming && listResult.streamProgress.batches > 0 && (
              <div className="mt-2 w-48">
                <Progress value={undefined} className="h-1" />
              </div>
            )}
          </div>
          <CreationModeButton
            entityName={schema.entityName}
            creationModes={creationModes}
            onCreateForm={() =>
              startTransition(() => {
                setCreateDialogOpen(true)
              })
            }
            onCreateUpload={() => uploadDialogRef.current?.open()}
            disabled={isTransitionPending}
          />
        </div>

        {/* Vibegrid Container — position:relative anchors QuickCreatePanel */}
        <div className="relative flex-1 overflow-hidden">
          <VibeGridStoreProvider tableId={`entity-list-${entityName}`} entityType={entityName}>
            <EntityListViewUrlSync
              entityName={entityName}
              orgId={orgId}
              hasUploadMode={hasUploadMode}
              enableInlineCreation={isInlineCreationEnabled}
              onInlineCreate={handleInlineCreate}
              onEscalate={handleEscalate}
              onCellClick={(rowId, _columnId) => {
                // CellActionRouter only fires onCellClick for navigate-affordance cells,
                // so navigate unconditionally — no column name check needed.
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
      <CreateRecordDialog
        schema={schema}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

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
    </>
  )
})
