/**
 * ChildEntitySection - Embedded child entity grid within a parent detail view
 *
 * Renders a Card section containing:
 * - Section header with entity type label and record count badge
 * - Full VibeGrid with child records (via collectionOverride)
 * - CRUD actions: create (with parent relationship auto-set), edit, delete
 * - Loading skeleton, empty state, error state
 *
 * GH#1621
 */

import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useOrganization } from '@/app/stores'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { orpcClient } from '@/shared/data/orpc/client'
import { uploadQueryKeys } from '@/shared/data/orpc/query-utils'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import type { ChildEntityConfig } from '../hooks/useChildEntityData'
import { useChildEntityData } from '../hooks/useChildEntityData'
import { useLinkedFieldEnrichment } from '../hooks/useLinkedFieldEnrichment'
import { useEntityUpload } from '../hooks/useEntityUpload'
import { CreationModeButton } from './CreationModeButton'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { CreateRelationshipDialog } from './dialogs/CreateRelationshipDialog'
import { DeleteConfirmDialog } from './dialogs/DeleteConfirmDialog'
import { EditRecordDialog } from './dialogs/EditRecordDialog'
import { EntityUploadDialog, type EntityUploadDialogHandle } from './dialogs/EntityUploadDialog'
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
  const { childEntityType, semanticTag } = childEntityConfig
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId || ''

  const { childRecords, childSchema, isLoading, error, retry, derivedDirection } =
    useChildEntityData({
      parentEntityType,
      parentRecordId,
      childEntityConfig,
    })

  const displayName = EntityNameUtils.toDisplayFormat(childEntityType)

  // GH#1861: Linked field enrichment for relationship archetypes
  const { enrichedRecords, linkedColumns } = useLinkedFieldEnrichment({
    childRecords,
    childSchema,
    includedLinkedFields: childEntityConfig.includedLinkedFields,
    derivedDirection,
  })

  const hasLinkedFields = linkedColumns.length > 0

  // Always use collectionOverride for embedded child grids.
  // useChildEntityData already filters records — no need for VibeGrid to re-fetch.
  // This eliminates a race condition where skipDataFetching toggles based on schema cache timing.
  const collectionData = useMemo(
    () => ({
      items: hasLinkedFields ? enrichedRecords : childRecords,
      count: hasLinkedFields ? enrichedRecords.length : childRecords.length,
    }),
    [hasLinkedFields, enrichedRecords, childRecords],
  )

  // Creation mode detection (same as EntityListView)
  const creationConfigQuery = useQuery({
    queryKey: uploadQueryKeys.creationConfig(orgId, childEntityType),
    queryFn: () => orpcClient.dataforge.upload.getCreationConfig({ entityName: childEntityType }),
    enabled: !!childEntityType && !!orgId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const creationModes = creationConfigQuery.data?.creationModes ?? ['form']
  const hasUploadMode = creationModes.includes('upload')
  const primaryFileConfig = creationConfigQuery.data?.primaryFile

  // Resolve relationship config: use explicit config values or derive from schema
  const resolvedRelationshipType =
    childEntityConfig.relationshipType ??
    (childSchema?.archetype === 'relationship' ? 'entity' : undefined)

  // Parent context for auto-linking uploaded entities
  const parentContext = useMemo(
    () => ({
      parent_entity_type: parentEntityType,
      parent_entity_id: parentRecordId,
      relationship_type: resolvedRelationshipType ?? 'entity',
      direction: derivedDirection ?? 'outgoing',
    }),
    [parentEntityType, parentRecordId, resolvedRelationshipType, derivedDirection],
  )

  // Upload orchestration
  const { handleFilesDropped } = useEntityUpload({
    entityName: childEntityType,
    acceptedMimeTypes: primaryFileConfig?.mimeTypes,
    maxFileSizeBytes: primaryFileConfig?.maxFileSizeBytes,
    enabled: hasUploadMode,
    parentContext,
  })

  const uploadDialogRef = useRef<EntityUploadDialogHandle>(null)

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<EntityRecord | null>(null)
  const [deleteRecord, setDeleteRecord] = useState<EntityRecord | null>(null)

  // GH#1741: Detect all-pending compliance (indicates computation error)
  useEffect(() => {
    if (childEntityType !== 'SubcontractorAssignment') return
    if (childRecords.length === 0) return

    const allPending = childRecords.every((record) => {
      const data = record.data as Record<string, unknown>
      const certCompliance = data?.cert_compliance as
        | { status?: string; score?: number }
        | undefined
      return certCompliance?.status === 'pending' && certCompliance?.score === 0
    })

    if (allPending) {
      toast.error('Could not compute compliance — please try again')
    }
  }, [childEntityType, childRecords])

  // Create child record and link to parent
  const handleCreateSuccess = async (recordId: string): Promise<void> => {
    // After creating the child record, create the relationship to the parent
    try {
      const semanticProps = semanticTag ? { semantic: semanticTag } : undefined
      const relType = resolvedRelationshipType ?? 'entity'
      const relInput =
        derivedDirection === 'incoming'
          ? {
              sourceEntityType: childEntityType,
              sourceEntityId: recordId,
              targetEntityType: parentEntityType,
              targetEntityId: parentRecordId,
              relationshipType: relType,
              properties: semanticProps,
            }
          : {
              sourceEntityType: parentEntityType,
              sourceEntityId: parentRecordId,
              targetEntityType: childEntityType,
              targetEntityId: recordId,
              relationshipType: relType,
              properties: semanticProps,
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
            <CreationModeButton
              entityName={childEntityType}
              displayName={displayName}
              creationModes={creationModes}
              onCreateForm={() => setCreateOpen(true)}
              onCreateUpload={() => uploadDialogRef.current?.open()}
              size="sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {childRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <p className="text-sm mb-3">No {displayName} records yet</p>
              <CreationModeButton
                entityName={childEntityType}
                displayName={displayName}
                creationModes={creationModes}
                onCreateForm={() => setCreateOpen(true)}
                onCreateUpload={() => uploadDialogRef.current?.open()}
                size="sm"
              />
            </div>
          ) : (
            <div className="min-h-[200px]">
              <VibeGridStoreProvider
                tableId={`child-${childEntityType}-${parentRecordId}`}
                entityType={childEntityType}
                collectionOverride={collectionData}
                appendColumns={linkedColumns.length > 0 ? linkedColumns : undefined}
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
                  showHeader={false}
                  showPagination={false}
                  disableSearch={true}
                  skipDataFetching={true}
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

      {/* Create Dialog - relationship archetypes get a specialized picker dialog */}
      {childSchema &&
        (childSchema.archetype === 'relationship' &&
        childSchema.businessMetadata?.relationship?.targetEntity ? (
          <CreateRelationshipDialog
            schema={childSchema}
            parentEntityType={parentEntityType}
            parentRecordId={parentRecordId}
            targetEntityType={childSchema.businessMetadata.relationship.targetEntity}
            semanticTag={semanticTag}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSuccess={handleCreateSuccess}
          />
        ) : (
          <CreateRecordDialog
            schema={childSchema}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSuccess={handleCreateSuccess}
          />
        ))}

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

      {/* Upload Dialog */}
      {hasUploadMode && (
        <EntityUploadDialog
          ref={uploadDialogRef}
          entityName={childEntityType}
          acceptedMimeTypes={primaryFileConfig?.mimeTypes}
          extractionTemplate={primaryFileConfig?.extractionTemplate}
          onFilesDropped={handleFilesDropped}
        />
      )}
    </>
  )
}
