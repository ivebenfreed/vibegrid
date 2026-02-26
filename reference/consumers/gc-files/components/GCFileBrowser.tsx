/**
 * GCFileBrowser - Unified file browser for GC projects using VibeGrid
 *
 * Displays all file-type entities (GCFile, GCDrawing, GCPhoto) for a project
 * in a single unified grid. Uses the `files.listByProject` oRPC endpoint to
 * fetch all three entity types and pushes data directly to VibeGrid stores.
 *
 * Part of GH#1127: GC File Browser with PDF/Image Viewer
 * Updated in GH#1273: P2.1 - Unified file grid with all entity types
 * Updated in GH#1273: P2.2 - File type badges and row actions
 * Updated in GH#1273: P2.3 - Upload & CRUD operations
 */

import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useRef, useState } from 'react'
import { runInAction } from 'mobx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useScopeContext, useOrganization } from '@/app/stores'
import { VibeGrid } from '@/systems/vibegrid'
import type { RowAction } from '@/systems/vibegrid/VibeGrid'
import type { Column } from '@/systems/vibegrid/types'
import {
  VibeGridStoreProvider,
  useVibeGridStores,
  useTableCoreStore,
  useInitStore,
} from '@/systems/vibegrid/stores/context'
import { useEntityRecord } from '@/shared/data/db/hooks/useEntityRecord'
import { orpcClient } from '@/shared/data/orpc/client'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { Search } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { FileViewerModal } from './FileViewerModal'
import { fileViewerStore } from '../stores/FileViewerStore'
import { resolveFileUrl } from '../types'
import { Loader2, Files, Eye, Download, Upload, Trash2 } from 'lucide-react'
import type { GCFile } from '../types'

interface GCFileBrowserProps {
  projectId: string
  projectName?: string
}

// ====================================
// FILE TYPE COLUMN DEFINITION (P2.2)
// ====================================

/**
 * Custom column for _file_type field with colored badges.
 * Uses single-select cellType with predefined color options.
 * Inserted as the second column (after name) in the grid.
 */
const FILE_TYPE_COLUMN: Column = {
  id: '_file_type',
  field: '_file_type',
  name: 'Type',
  cellType: 'single-select',
  width: 120,
  minWidth: 80,
  maxWidth: 160,
  editable: false,
  options: [
    { value: 'document', label: 'Doc', color: '#ffffff', backgroundColor: '#3B82F6' },
    { value: 'photo', label: 'Photo', color: '#ffffff', backgroundColor: '#22C55E' },
    { value: 'drawing', label: 'Drawing', color: '#ffffff', backgroundColor: '#8B5CF6' },
  ],
}

// ====================================
// DOWNLOAD HELPER (P2.2)
// ====================================

/**
 * Triggers file download by opening the file path/URL or the download endpoint
 * in a new tab. Uses file_path or file_url if available, otherwise falls back to
 * the /api/files/download/:id endpoint.
 */
function downloadFile(file: {
  id: string
  file_path?: string
  file_url?: string
  name?: string
}): void {
  const url = resolveFileUrl(file, 'download')
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  if (file.name) {
    link.download = file.name
  }
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ====================================
// ROW ACTIONS (P2.2 + P2.3)
// ====================================

/**
 * Shared state for delete confirmation dialog.
 * Used by the row action to trigger the confirmation and by the
 * GCFileBrowser component to render the dialog.
 */
let _pendingDelete: {
  fileId: string
  entityType: 'GCFile' | 'GCPhoto' | 'GCDrawing'
  fileName: string
} | null = null
let _setDeleteOpen: ((open: boolean) => void) | null = null

/**
 * Row actions for the file browser grid.
 * Includes preview, download, and delete (P2.3).
 */
const FILE_ROW_ACTIONS: RowAction[] = [
  {
    id: 'preview',
    label: 'Preview',
    icon: Eye,
    onClick: (rowData) => {
      fileViewerStore.openFile(rowData as GCFile)
    },
  },
  {
    id: 'download',
    label: 'Download',
    icon: Download,
    onClick: (rowData) => {
      downloadFile(rowData as { id: string; file_path?: string; file_url?: string; name?: string })
    },
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    destructive: true,
    onClick: (rowData) => {
      const row = rowData as { id: string; entity_type?: string; name?: string }
      _pendingDelete = {
        fileId: row.id,
        entityType: (row.entity_type as 'GCFile' | 'GCPhoto' | 'GCDrawing') || 'GCFile',
        fileName: row.name || 'Untitled',
      }
      _setDeleteOpen?.(true)
    },
  },
]

// ====================================
// UPLOAD DIALOG (P2.3)
// ====================================

interface FileUploadDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Dialog for uploading files to a project.
 * Uses presigned URL flow: getUploadUrl -> PUT to R2 -> confirmUpload.
 */
const FileUploadDialog = observer(function FileUploadDialog({
  projectId,
  open,
  onOpenChange,
}: FileUploadDialogProps) {
  const queryClient = useQueryClient()
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setSelectedFiles(Array.from(files))
    }
  }, [])

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return
    setUploading(true)
    setUploadProgress('')

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setUploadProgress(`Uploading ${i + 1} of ${selectedFiles.length}: ${file.name}`)

      try {
        // Step 1: Get presigned URL
        const { uploadUrl, r2Key } = await orpcClient.files.getUploadUrl({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          projectId,
        })

        // Step 2: Upload to R2 via presigned URL
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`)
        }

        // Step 3: Confirm upload (create entity + relationships)
        await orpcClient.files.confirmUpload({
          r2Key,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          projectId,
        })

        successCount++
      } catch (error) {
        failCount++
        const msg = error instanceof Error ? error.message : 'Upload failed'
        toast.error(`Failed to upload ${file.name}: ${msg}`)
      }
    }

    setUploading(false)
    setUploadProgress('')

    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`)
      // Invalidate the files query to refresh the grid
      queryClient.invalidateQueries({ queryKey: ['files', 'listByProject', orgId, projectId] })
    }
    if (failCount === 0) {
      // Close dialog only if all files uploaded successfully
      setSelectedFiles([])
      onOpenChange(false)
    }
  }, [selectedFiles, projectId, orgId, queryClient, onOpenChange])

  const handleClose = useCallback(() => {
    if (!uploading) {
      setSelectedFiles([])
      setUploadProgress('')
      onOpenChange(false)
    }
  }, [uploading, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Select files to upload to this project. Files will be stored in R2 and associated with
            the project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Drop zone / file picker */}
          <button
            type="button"
            className="w-full border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Click to browse or drag files here</p>
          </button>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {selectedFiles.map((file, idx) => (
                  <li key={`${file.name}-${idx}`} className="truncate">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Upload progress */}
          {uploadProgress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{uploadProgress}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || selectedFiles.length === 0}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

// ====================================
// DELETE CONFIRMATION DIALOG (P2.3)
// ====================================

interface DeleteFileDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string
  entityType: 'GCFile' | 'GCPhoto' | 'GCDrawing'
  fileName: string
}

/**
 * Confirmation dialog for file deletion.
 * Calls deleteFile endpoint and refreshes the grid on success.
 */
const DeleteFileDialog = observer(function DeleteFileDialog({
  projectId,
  open,
  onOpenChange,
  fileId,
  entityType,
  fileName,
}: DeleteFileDialogProps) {
  const queryClient = useQueryClient()
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId
  const [deleting, setDeleting] = useState(false)

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await orpcClient.files.deleteFile({ fileId, entityType })
      toast.success(`"${fileName}" deleted`)
      queryClient.invalidateQueries({ queryKey: ['files', 'listByProject', orgId, projectId] })
      onOpenChange(false)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Delete failed'
      toast.error(`Failed to delete: ${msg}`)
    } finally {
      setDeleting(false)
    }
  }, [fileId, entityType, fileName, orgId, projectId, queryClient, onOpenChange])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete File</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{fileName}"? This will remove the file from storage.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
})

// ====================================
// INNER GRID COMPONENT
// ====================================

/**
 * Inner component that has access to VibeGrid stores via context.
 * Fetches unified file data and pushes it to tableCoreStore.
 *
 * Follows the same pattern as COIListInner (GH#1076):
 * - Use skipDataFetching={true} to bypass VibeGrid auto-fetch
 * - Push data to tableCoreStore.setRows() directly
 * - Use entityType="GCFile" for column schema (all file types share similar fields)
 */
const FileGrid = observer(function FileGrid({
  tableId,
  projectId,
}: {
  tableId: string
  projectId: string
}) {
  const stores = useVibeGridStores()
  const tableCoreStore = useTableCoreStore()
  const initStore = useInitStore()
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId

  // Fetch unified file data from the new listByProject endpoint
  const { data } = useQuery({
    queryKey: ['files', 'listByProject', orgId, projectId],
    queryFn: () =>
      orpcClient.files.listByProject({
        projectId,
        limit: 200,
        sortBy: 'name',
        sortDir: 'asc',
      }),
    enabled: !!orgId && !!projectId,
    staleTime: 60 * 1000, // 1 minute
  })

  // Inject _file_type column after schema columns load (P2.2)
  // This adds the colored badge column as the second column (after name)
  useEffect(() => {
    if (!tableCoreStore || !stores?.visualStateStore) return
    if (!tableCoreStore.isSchemaLoaded) return

    // Check if the column is already injected
    const hasFileTypeColumn = tableCoreStore.columns.some((col) => col.id === '_file_type')
    if (hasFileTypeColumn) return

    runInAction(() => {
      // Find the index of the 'name' column to insert after it
      const nameIndex = tableCoreStore.columns.findIndex((col) => col.id === 'name')
      const insertIndex = nameIndex >= 0 ? nameIndex + 1 : 0

      // Insert the _file_type column into tableCoreStore
      const updatedColumns = [...tableCoreStore.columns]
      updatedColumns.splice(insertIndex, 0, FILE_TYPE_COLUMN)
      tableCoreStore.columns = updatedColumns

      // Also update VisualStateStore columns, widths, visibility, and order
      const vs = stores.visualStateStore
      const vsColumns = [...vs.columns]
      const vsNameIndex = vsColumns.findIndex((col) => col.id === 'name')
      const vsInsertIndex = vsNameIndex >= 0 ? vsNameIndex + 1 : 0
      vsColumns.splice(vsInsertIndex, 0, FILE_TYPE_COLUMN)
      vs.columns = vsColumns

      // Add column width, visibility, and order entry
      vs.columnWidths = { ...vs.columnWidths, _file_type: FILE_TYPE_COLUMN.width || 120 }
      vs.columnVisibility = { ...vs.columnVisibility, _file_type: true }
      if (!vs.columnOrder.includes('_file_type')) {
        const orderInsertIndex = vs.columnOrder.indexOf('name')
        const updatedOrder = [...vs.columnOrder]
        if (orderInsertIndex >= 0) {
          updatedOrder.splice(orderInsertIndex + 1, 0, '_file_type')
        } else {
          updatedOrder.unshift('_file_type')
        }
        vs.columnOrder = updatedOrder
      }
    })
  }, [tableCoreStore, tableCoreStore?.isSchemaLoaded, stores?.visualStateStore])

  // Push data to VibeGrid stores when it arrives
  useEffect(() => {
    if (!tableCoreStore || !data) return

    runInAction(() => {
      tableCoreStore.setRows(data.items)
    })

    // Mark entity data as loaded to complete hydration
    if (!initStore.hydrationState.entityDataLoaded) {
      initStore.markReady('entityDataLoaded')
    }
  }, [tableCoreStore, initStore, data])

  const handleCellClick = useCallback(
    (rowId: string, _columnId: string) => {
      const rowData = data?.items.find((item) => item.id === rowId) as GCFile | undefined
      if (rowData) {
        fileViewerStore.openFile(rowData)
      }
    },
    [data],
  )

  return (
    <VibeGrid
      tableId={tableId}
      entityType="GCFile"
      height="100%"
      enableSelectionColumn={true}
      enableGrouping={true}
      enableFiltering={true}
      enableSorting={true}
      skipDataFetching={true}
      onCellClick={handleCellClick}
      rowActions={FILE_ROW_ACTIONS}
      searchableColumns={['name', '_file_type', 'entity_type', 'mime_type', 'status']}
      searchPlaceholder="Search files, photos, drawings..."
    />
  )
})

export const GCFileBrowser = observer(function GCFileBrowser({
  projectId,
  projectName,
}: GCFileBrowserProps) {
  const scopeContext = useScopeContext()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    fileId: string
    entityType: 'GCFile' | 'GCPhoto' | 'GCDrawing'
    fileName: string
  } | null>(null)

  // Wire up the delete dialog trigger from row actions
  useEffect(() => {
    _setDeleteOpen = (open: boolean) => {
      if (open && _pendingDelete) {
        setDeleteTarget(_pendingDelete)
        setDeleteOpen(true)
        _pendingDelete = null
      } else {
        setDeleteOpen(false)
      }
    }
    return () => {
      _setDeleteOpen = null
    }
  }, [])

  // Fetch project to get external_id for filtering
  const { record: project, isReady: projectReady } = useEntityRecord('GCProject', projectId)

  // Update scope context
  useEffect(() => {
    if (project && scopeContext.currentEntityId !== projectId) {
      const name = project.name || project.display_name || projectName || 'Project'
      scopeContext.selectEntity({ id: projectId, name, type: 'project', status: project.status })
    }
  }, [projectId, project, projectName, scopeContext])

  const tableId = `project-${projectId}-files`

  // Loading state
  if (!projectReady) {
    return (
      <>
        <Header>
          <Search />
          <div className="ms-auto flex items-center space-x-4">
            <ThemeSwitch />
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
        </div>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full">
          <div className="pb-4">
            <div className="flex items-center justify-between">
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
              {/* Upload button (P2.3) */}
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </div>
          </div>
          <div className="flex-1 w-full min-h-[400px]">
            <VibeGridStoreProvider tableId={tableId} entityType="GCFile">
              <FileGrid tableId={tableId} projectId={projectId} />
            </VibeGridStoreProvider>
          </div>
        </div>
      </Main>

      {/* File Viewer Modal */}
      <FileViewerModal />

      {/* Upload Dialog (P2.3) */}
      <FileUploadDialog projectId={projectId} open={uploadOpen} onOpenChange={setUploadOpen} />

      {/* Delete Confirmation Dialog (P2.3) */}
      {deleteTarget && (
        <DeleteFileDialog
          projectId={projectId}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          fileId={deleteTarget.fileId}
          entityType={deleteTarget.entityType}
          fileName={deleteTarget.fileName}
        />
      )}
    </>
  )
})
