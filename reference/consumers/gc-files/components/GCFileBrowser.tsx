/**
 * GCFileBrowser - File browser for GC projects using VibeGrid
 *
 * Displays GC file entities (GCFile, GCDrawing, GCPhoto) with folder grouping.
 * Uses VibeGrid for grid display and FileViewerModal for preview.
 * Part of GH#1127: GC File Browser with PDF/Image Viewer
 */

import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import { useProjectContext } from '@/app/stores'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider, useVibeGridStores } from '@/systems/vibegrid/stores/context'
import { useEntityRecordQuery } from '@/shared/data/queries/entity-data.queries'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { Search } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { ProfileDropdown } from '@/shared/components/profile-dropdown'
import { FileViewerModal } from './FileViewerModal'
import { fileViewerStore } from '../stores/FileViewerStore'
import { Loader2, Files } from 'lucide-react'
import type { GCFile } from '../types'

interface GCFileBrowserProps {
  projectId: string
  projectName?: string
  entityType?: 'GCFile' | 'GCDrawing' | 'GCPhoto'
}

/**
 * Inner component that handles file click events
 */
const FileGrid = observer(function FileGrid({
  tableId,
  entityType,
}: {
  tableId: string
  entityType: string
}) {
  const stores = useVibeGridStores()

  // Handle row click to open file viewer
  useEffect(() => {
    if (!stores?.visualStateStore) return

    const handleRowClick = (event: CustomEvent) => {
      const rowData = event.detail?.rowData as GCFile | undefined
      if (rowData) {
        fileViewerStore.openFile(rowData)
      }
    }

    // Subscribe to row click events
    const element = document.querySelector(`[data-table-id="${tableId}"]`)
    element?.addEventListener('vibegrid:rowclick', handleRowClick as EventListener)

    return () => {
      element?.removeEventListener('vibegrid:rowclick', handleRowClick as EventListener)
    }
  }, [stores, tableId])

  return (
    <VibeGrid
      tableId={tableId}
      entityType={entityType}
      height="100%"
      enableSelectionColumn={true}
      enableGrouping={true}
      enableFiltering={true}
      enableSorting={true}
    />
  )
})

export const GCFileBrowser = observer(function GCFileBrowser({
  projectId,
  projectName,
  entityType = 'GCFile',
}: GCFileBrowserProps) {
  const projectContext = useProjectContext()

  // Fetch project to get external_id for filtering
  const { data: project, isLoading: projectLoading } = useEntityRecordQuery('GCProject', projectId)

  // Update project context
  useEffect(() => {
    if (project && projectContext.currentProjectId !== projectId) {
      const name = project.name || project.display_name || projectName || 'Project'
      projectContext.selectProject(projectId, { name, status: project.status })
    }
  }, [projectId, project, projectName, projectContext])

  const tableId = `project-${projectId}-files`

  // Loading state
  if (projectLoading) {
    return (
      <>
        <Header>
          <Search />
          <div className="ms-auto flex items-center space-x-4">
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main fluid>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </Main>
      </>
    )
  }

  // Project not found
  if (!project) {
    return (
      <>
        <Header>
          <Search />
          <div className="ms-auto flex items-center space-x-4">
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main fluid>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Project not found</p>
          </div>
        </Main>
      </>
    )
  }

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full">
          <div className="pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Files className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Files</h2>
                <p className="text-muted-foreground">
                  Documents, drawings, and photos for {project.name || project.display_name}
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full min-h-[400px]">
            <VibeGridStoreProvider tableId={tableId} entityType={entityType}>
              <FileGrid tableId={tableId} entityType={entityType} />
            </VibeGridStoreProvider>
          </div>
        </div>
      </Main>

      {/* File Viewer Modal */}
      <FileViewerModal />
    </>
  )
})
