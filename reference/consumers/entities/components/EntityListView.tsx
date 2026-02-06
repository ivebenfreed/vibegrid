/**
 * Entity List View Component
 *
 * Main container component for entity list pages
 * Shows breadcrumbs, header, and high-performance Vibegrid
 */

import { useNavigate, useParams } from '@tanstack/react-router'
import { Loader2, PlusIcon } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useState, useTransition } from 'react'
import { ConfigDrawer } from '@/shared/components/config-drawer'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { TopNav } from '@/shared/components/layout/top-nav'
import { ProfileDropdown } from '@/shared/components/profile-dropdown'
import { Search } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { Button } from '@/shared/components/ui/button'
import { Progress } from '@/shared/components/ui/progress'
import { useStreamingEntityListData } from '@/shared/data/db/hooks/useStreamingEntityListData'
import { useEntitySchema } from '@/shared/data/queries/entity-schemas.queries'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import { VibeGrid } from '@/systems/vibegrid'
import { ReorderConfirmationDialog } from '@/systems/vibegrid/components/ReorderConfirmationDialog'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { EntityBreadcrumbs } from './EntityBreadcrumbs'
import { EntityEmptyState } from './EntityEmptyState'
import { EntityListError } from './EntityListError'
import { EntityListSkeleton } from './EntityListSkeleton'
import { EntityNotFound } from './EntityNotFound'

const logger = getLogger(['entity', 'EntityListView'])

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

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // All hooks must be called unconditionally (React rules of hooks)
  const resolvedName = entityName ?? ''
  const schema = useEntitySchema(resolvedName)
  const [isTransitionPending, startTransition] = useTransition()
  const listResult = useStreamingEntityListData(resolvedName, {
    pagination: { pageIndex: 0, pageSize: 1000 },
    orderBy: 'created_at',
    orderDirection: 'desc',
  })

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
          <div className="ms-auto flex shrink-0 items-center space-x-2 sm:space-x-4">
            <Search />
            <ThemeSwitch />
            <ConfigDrawer />
            <ProfileDropdown />
          </div>
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
          <Search />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      {/* Main Content */}
      <Main className="flex flex-col gap-4 sm:gap-6">
        {/* Breadcrumbs */}
        <EntityBreadcrumbs entityName={schema.entityName} />

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
          <Button
            onClick={() =>
              startTransition(() => {
                setCreateDialogOpen(true)
              })
            }
            disabled={isTransitionPending}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            New {EntityNameUtils.toDisplayFormat(schema.entityName)}
          </Button>
        </div>

        {/* Vibegrid Container */}
        <div className="flex-1 overflow-hidden">
          <VibeGridStoreProvider tableId={`entity-list-${entityName}`} entityType={entityName}>
            <VibeGrid
              tableId={`entity-list-${entityName}`}
              entityType={entityName}
              height="calc(100vh - 280px)"
              enableSelectionColumn={true}
              enableGrouping={true}
              enableFiltering={true}
              enableSorting={true}
              enableDragAndDrop={true}
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
            <ReorderConfirmationDialog />
          </VibeGridStoreProvider>
        </div>
      </Main>

      {/* Create Record Dialog */}
      <CreateRecordDialog
        schema={schema}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  )
})
