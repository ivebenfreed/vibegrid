/**
 * ChildEntitySection - Embedded child entity grid within a parent detail view
 *
 * Renders a Card section containing:
 * - Section header with entity type label and record count badge
 * - Full VibeGrid with child records (filtered via systemPredicate)
 * - CRUD actions: create (with parent relationship auto-set), edit, delete
 * - Loading skeleton, empty state, error state
 *
 * GH#1621
 */

import { AlertCircle, PlusIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { orpcClient } from '@/shared/data/orpc/client'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import type { ChildEntityConfig } from '../hooks/useChildEntityData'
import { useChildEntityData } from '../hooks/useChildEntityData'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { DeleteConfirmDialog } from './dialogs/DeleteConfirmDialog'
import { EditRecordDialog } from './dialogs/EditRecordDialog'
import type { EntityRecord } from '@/shared/types/dataforge'

const logger = getLogger(['entities', 'ChildEntitySection'])

export interface ChildEntitySectionProps {
  parentEntityType: string
  parentRecordId: string
  childEntityConfig: ChildEntityConfig
}

export function ChildEntitySection({
  parentEntityType,
  parentRecordId,
  childEntityConfig,
}: ChildEntitySectionProps): React.ReactElement {
  const { childEntityType, relationshipType, direction } = childEntityConfig

  const { childRecords, childSchema, isLoading, error, retry } = useChildEntityData({
    parentEntityType,
    parentRecordId,
    childEntityConfig,
  })

  const displayName = EntityNameUtils.toDisplayFormat(childEntityType)

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<EntityRecord | null>(null)
  const [deleteRecord, setDeleteRecord] = useState<EntityRecord | null>(null)

  // Build a stable set of child IDs for the system predicate
  const childIdSet = useMemo(() => new Set(childRecords.map((r) => r.id)), [childRecords])

  // System predicate: only show rows that are in our child ID set
  const childFilterPredicate = useCallback(
    (row: Record<string, unknown>) => childIdSet.has(row.id as string),
    [childIdSet],
  )

  // Create child record and link to parent
  const handleCreateSuccess = async (recordId: string): Promise<void> => {
    // After creating the child record, create the relationship to the parent
    try {
      const relInput =
        direction === 'incoming'
          ? {
              sourceEntityType: childEntityType,
              sourceEntityId: recordId,
              targetEntityType: parentEntityType,
              targetEntityId: parentRecordId,
              relationshipType,
            }
          : {
              sourceEntityType: parentEntityType,
              sourceEntityId: parentRecordId,
              targetEntityType: childEntityType,
              targetEntityId: recordId,
              relationshipType,
            }

      await orpcClient.dataforge.relationships.create(relInput)
      toast.success(`${displayName} added`)
      // Trigger a refresh of child data by retrying
      retry()
    } catch (err) {
      logger.error('Failed to create parent relationship after child record creation', {
        error: err instanceof Error ? err.message : err,
        recordId,
        parentRecordId,
      })
      toast.error(`${displayName} created but failed to link to parent. Please refresh.`)
    }
    setCreateOpen(false)
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{displayName} Records</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Could not load {displayName} records</span>
              <Button variant="outline" size="sm" onClick={retry} className="ml-4 shrink-0">
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Schema not found
  if (!childSchema) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{displayName} Records</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Configuration error: child entity type &quot;{childEntityType}&quot; not found
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">{displayName} Records</CardTitle>
              <Badge variant="secondary" className="text-xs font-normal">
                {childRecords.length}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="h-3.5 w-3.5 mr-1" />
              Add {displayName}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {childRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <p className="text-sm mb-3">No {displayName} records yet</p>
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                <PlusIcon className="h-3.5 w-3.5 mr-1" />
                Add {displayName}
              </Button>
            </div>
          ) : (
            <div className="min-h-[200px]">
              <VibeGridStoreProvider
                tableId={`child-${childEntityType}-${parentRecordId}`}
                entityType={childEntityType}
              >
                <VibeGrid
                  tableId={`child-${childEntityType}-${parentRecordId}`}
                  entityType={childEntityType}
                  entityDisplayName={displayName}
                  height={Math.min(64 + childRecords.length * 40, 400)}
                  enableSelectionColumn={false}
                  enableGrouping={false}
                  enableFiltering={false}
                  enableSorting={true}
                  enableDragAndDrop={false}
                  showToolbar={false}
                  showPagination={false}
                  disableSearch={true}
                  systemPredicate={childFilterPredicate}
                  onCellClick={(rowId) => {
                    const record = childRecords.find((r) => r.id === rowId)
                    if (record) setEditRecord(record)
                  }}
                  rowActions={[
                    {
                      id: 'edit',
                      label: 'Edit',
                      onClick: (rowData: Record<string, unknown>) => {
                        const record = childRecords.find((r) => r.id === (rowData.id as string))
                        if (record) setEditRecord(record)
                      },
                    },
                    {
                      id: 'delete',
                      label: 'Delete',
                      destructive: true,
                      onClick: (rowData: Record<string, unknown>) => {
                        const record = childRecords.find((r) => r.id === (rowData.id as string))
                        if (record) setDeleteRecord(record)
                      },
                    },
                  ]}
                />
              </VibeGridStoreProvider>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      {childSchema && (
        <CreateRecordDialog
          schema={childSchema}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Edit Dialog */}
      {editRecord && childSchema && (
        <EditRecordDialog
          schema={childSchema}
          record={editRecord}
          open={!!editRecord}
          onOpenChange={(open) => {
            if (!open) setEditRecord(null)
          }}
        />
      )}

      {/* Delete Dialog */}
      {deleteRecord && childSchema && (
        <DeleteConfirmDialog
          schema={childSchema}
          record={deleteRecord}
          open={!!deleteRecord}
          onOpenChange={(open) => {
            if (!open) setDeleteRecord(null)
          }}
          onSuccess={() => {
            setDeleteRecord(null)
            // Refresh child data after deletion
            retry()
          }}
        />
      )}
    </>
  )
}
