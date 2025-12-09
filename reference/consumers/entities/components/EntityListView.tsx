/**
 * Entity List View Component
 *
 * Main container component for entity list pages
 * Shows breadcrumbs, header, and high-performance Vibegrid
 */

import { useNavigate, useParams } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
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
import { useEntityListData } from '@/shared/data/db/hooks/useEntityListData'
import { useEntitySchema } from '@/shared/data/queries/entity-schemas.queries'
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

/**
 * Entity List View Component
 * Fetches and displays entity records in a grid
 */
export const EntityListView = observer(() => {
  // Get entity name from route params
  const { entityName } = useParams({ strict: false })
  const navigate = useNavigate()

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  if (!entityName) {
    return <EntityNotFound entityName="unknown" />
  }

  // Fetch entity schema from cache (prefetched in route loader)
  const schema = useEntitySchema(entityName)

  const [isTransitionPending, startTransition] = useTransition()

  // Note: Vibegrid handles its own virtualization/pagination
  // This config is just for compatibility with useEntityListData
  const listResult = useEntityListData(entityName, {
    pagination: { pageIndex: 0, pageSize: 1000 },
  })

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
          <div className="ms-auto flex items-center space-x-4">
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
        <div className="ms-auto flex items-center space-x-4">
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
            <h1 className="text-2xl font-bold tracking-tight">{schema.entityName}</h1>
            <p className="text-sm text-muted-foreground">
              {listResult.pagination.total}{' '}
              {listResult.pagination.total === 1 ? 'record' : 'records'}
            </p>
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
            New {schema.entityName}
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
