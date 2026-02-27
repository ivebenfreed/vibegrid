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
import { AlertTriangle, Loader2 } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useAuth, useFeatureFlags, useOrganization } from '@/app/stores'
import { ConfigDrawer } from '@/shared/components/config-drawer'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { TopNav } from '@/shared/components/layout/top-nav'
import { Search } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Progress } from '@/shared/components/ui/progress'
import { useStreamingEntityListData } from '@/shared/data/db/hooks/useStreamingEntityListData'
import { orpcClient } from '@/shared/data/orpc/client'
import { uploadQueryKeys } from '@/shared/data/orpc/query-utils'
import { useEntitySchema } from '@/shared/data/queries/entity-schemas.queries'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import { VibeGrid } from '@/systems/vibegrid'
import { ReorderConfirmationDialog } from '@/systems/vibegrid/components/ReorderConfirmationDialog'
import { SaveViewDialog } from '@/systems/vibegrid/components/SaveViewDialog'
import type { ViewVisibility } from '@/systems/vibegrid/components/SaveViewDialog'
import { VibeGridStoreProvider, useVibeGridStores } from '@/systems/vibegrid/stores/context'
import { useEntityUpload } from '../hooks/useEntityUpload'
import { useViewUrlSync } from '../hooks/useViewUrlSync'
import { AsyncOperationTracker } from './AsyncOperationTracker'
import { CreationModeButton } from './CreationModeButton'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { EntityBreadcrumbs } from './EntityBreadcrumbs'
import { EntityEmptyState } from './EntityEmptyState'
import { EntityListError } from './EntityListError'
import { EntityListSkeleton } from './EntityListSkeleton'
import { EntityNotFound } from './EntityNotFound'
import { EntityUploadDropzone } from './EntityUploadDropzone'

const logger = getLogger(['entity', 'EntityListView'])

/**
 * Inner component that lives inside VibeGridStoreProvider context
 * to enable useViewUrlSync hook access to VibeGrid stores (GH#1570)
 */
const EntityListViewUrlSync = observer(function EntityListViewUrlSync({
  entityName,
  orgId,
  onCellClick,
}: {
  entityName: string
  orgId: string
  onCellClick: (rowId: string, columnId: string) => void
}) {
  const stores = useVibeGridStores()
  const authStore = useAuth()
  const featureFlagsStore = useFeatureFlags()
  const isViewsEnabled = featureFlagsStore.isEnabled('feature.entity-views.enabled')

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

  // Save current view config to server
  const handleSaveView = useCallback(
    async (name: string, visibility: ViewVisibility) => {
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

  // Build viewPickerProps when feature flag is enabled
  const viewPickerProps = isViewsEnabled
    ? {
        entityType: entityName,
        orgId,
        activeViewId,
        hasUnsavedChanges,
        onViewSelect: selectView,
        onSaveView: () => setSaveDialogOpen(true),
        onUnsavedSelect: clearView,
        userId,
        userRole,
      }
    : undefined

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
        onCellClick={onCellClick}
        onCopyLink={copyLink}
        viewPickerProps={viewPickerProps}
      />
      <ReorderConfirmationDialog />

      {/* SaveViewDialog (GH#1570 P2.3) */}
      {isViewsEnabled && (
        <SaveViewDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          entityType={entityName}
          onSave={handleSaveView}
          isAdmin={isAdmin}
        />
      )}
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

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

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

  // Hidden file input for "Upload Files" button click
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        handleFilesDropped(files)
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [handleFilesDropped],
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
          <EntityEmptyState entityName={schema.entityName} />
        </Main>
      </>
    )
  }

  // Success - render table with data
  return (
    <>
      {/* Top Header Bar */}
      <Header>
        <TopNav links={[]} />
        <div className="ms-auto flex shrink-0 items-center space-x-2 sm:space-x-4">
          {/* Async upload tracker - visible when there are operations */}
          <AsyncOperationTracker
            store={uploadStore}
            onRetry={(entityId) => uploadStore.retryUpload(entityId)}
          />
          <Search />
          <ThemeSwitch />
          <ConfigDrawer />
        </div>
      </Header>

      {/* Main Content */}
      <Main className="flex flex-col gap-4 sm:gap-6">
        {/* Breadcrumbs */}
        <EntityBreadcrumbs entityName={schema.entityName} />

        {/* Review queue banner */}
        {uploadStore.reviewRequiredCount > 0 && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                {uploadStore.reviewRequiredCount} uploaded{' '}
                {uploadStore.reviewRequiredCount === 1 ? 'record' : 'records'} need review
              </span>
              <Button variant="link" size="sm" className="text-amber-700 dark:text-amber-300">
                View pending reviews
              </Button>
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
            onCreateUpload={handleUploadClick}
            disabled={isTransitionPending}
          />
        </div>

        {/* Vibegrid Container */}
        <div className="flex-1 overflow-hidden">
          <VibeGridStoreProvider tableId={`entity-list-${entityName}`} entityType={entityName}>
            <EntityListViewUrlSync
              entityName={entityName}
              orgId={orgId}
              onCellClick={(rowId, columnId) => {
                // Modern UX: Click name/title field to navigate to detail page
                if (columnId === 'name' || columnId === 'title') {
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
                }
              }}
            />
          </VibeGridStoreProvider>
        </div>
      </Main>

      {/* Create Record Dialog */}
      <CreateRecordDialog
        schema={schema}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Hidden file input for upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={primaryFileConfig?.mimeTypes?.join(',') || undefined}
        className="hidden"
        onChange={handleFileInputChange}
      />

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
