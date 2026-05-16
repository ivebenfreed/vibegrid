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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth, useOrganization } from '@/app/stores'
import { Alert, AlertDescription } from '@/shared/components/ui/alert'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useEntityRecord } from '@/shared/data/db/hooks/useEntityRecord'
import { useEntityListFetch } from '@/shared/data/db/hooks/useEntityListFetch'
import { orpcClient } from '@/shared/data/orpc/client'
import { uploadQueryKeys } from '@/shared/data/orpc/query-utils'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import { VibeGrid } from '@/systems/vibegrid'
import { GRID_DIMENSIONS } from '@/systems/vibegrid/constants/grid-dimensions'
import type { SchemaFieldDescriptor } from '@/systems/vibegrid/modules/GridModule'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import type { ViewMode } from '@/systems/vibegrid/stores/ViewModeStore'
import type { Column } from '@/systems/vibegrid/types'
import { useEntitySchema } from '@/shared/data/queries/entity-schemas.queries'
import type { ChildEntityConfig } from '../hooks/useChildEntityData'
import { useChildEntityData } from '../hooks/useChildEntityData'
import { useLinkedFieldEnrichment } from '../hooks/useLinkedFieldEnrichment'
import { useEntityUpload } from '../hooks/useEntityUpload'
import { CreationModeButton } from './CreationModeButton'
import type { CoiRequestIntent } from './dialogs/coi-request-templates'
import { CoiRequestModal } from './dialogs/CoiRequestModal'
import { CreateRecordDialog } from './dialogs/CreateRecordDialog'
import { CreateRelationshipDialog } from './dialogs/CreateRelationshipDialog'
import { DeleteConfirmDialog } from './dialogs/DeleteConfirmDialog'
import { EditRecordDialog } from './dialogs/EditRecordDialog'
import { EntityUploadDialog, type EntityUploadDialogHandle } from './dialogs/EntityUploadDialog'
import type { EntityRecord } from '@/shared/types/dataforge'

const logger = getLogger(['entities', 'ChildEntitySection'])

/**
 * GH#2786 (F') P4 helper — find the forward-direction relationship-source
 * field on a schema for a given (relationshipType, targetEntityType) pair.
 *
 * Used by `handleCreateSuccess` to resolve the field name to write via
 * `data.update` dispatch when linking a newly-created child to its
 * parent. Returns `undefined` when no matching field is on the schema
 * (e.g. legacy generic 'entity' relType, or a Rel_* schema that was
 * never injected).
 */
function findForwardRelationshipField(
  schema: { fields?: ReadonlyArray<unknown> } | null | undefined,
  relationshipType: string,
  targetEntityType: string,
): string | undefined {
  // Schemas come in with typed FieldDefinition[]; coerce each entry to
  // a structural record so we can read the relationship-injected props
  // without depending on the FieldDefinition type from another package.
  const fields = schema?.fields ?? []
  for (const raw of fields) {
    const f = raw as Record<string, unknown> | null | undefined
    if (
      f &&
      f.source === 'relationship' &&
      f.relationshipType === relationshipType &&
      f.targetEntityType === targetEntityType &&
      (f.direction === 'source' || f.direction === undefined) &&
      f.inline_ids !== false &&
      !f.deleted &&
      typeof f.name === 'string'
    ) {
      return f.name as string
    }
  }
  return undefined
}

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

  const { childRecords, childSchema, isLoading, error, retry, derivedDirection } = useChildEntityData({
    parentEntityType,
    parentRecordId,
    childEntityConfig,
  })

  // GH#2786 (F') P4: parent schema needed for outgoing-direction
  // dispatch (parent is the source row of the Rel_* edge, so the
  // forward-direction relationship-source field lives on the parent).
  // useEntitySchema reads from the cached schemas query — no extra
  // network call when the parent schema is already loaded by the
  // route's data dependencies.
  const parentSchema = useEntitySchema(parentEntityType)

  const displayName = EntityNameUtils.toDisplayFormat(childEntityType)
  // GH#2599: honor the admin-configured `label` override from
  // entity_views.config.childEntityTabs as the CardTitle. Falls back to
  // the derived "<entity> Records" when no override is set.
  const sectionTitle = childEntityConfig.label ?? `${displayName} Records`

  // GH#1861: Linked field enrichment for relationship archetypes
  const { enrichedRecords, linkedColumns } = useLinkedFieldEnrichment({
    childRecords,
    childSchema,
    includedLinkedFields: childEntityConfig.includedLinkedFields,
    derivedDirection,
  })

  const hasLinkedFields = linkedColumns.length > 0

  // GH#3045 P4 (B15): Subcontractors-tab pending-broker pill.
  //
  // Open Q#2 (spec resolution): resolve pill data client-side via the
  // canonical `useEntityListFetch` reactive list-fetch rather than a
  // server-side virtual column on the SubcontractorAssignment view.
  // - Lower blast radius (no entity_view config change)
  // - Real-time updates via entityBatch reactivity — when the inbound
  //   handler flips status='responded', the pill disappears without a
  //   refetch on the parent
  // - Reuses the canonical TanStack DB read path per
  //   `.claude/rules/tanstack-db.md`
  //
  // We pre-populate (option (a) in the spec): augment each child row's
  // data with `open_coi_request: <CoiRequest | null>` so the existing
  // VibeGrid pipeline can route it to `OpenCoiRequestPillRenderer`
  // without needing a React-context bridge.
  const isSubcontractorAssignmentTab = childEntityType === 'SubcontractorAssignment'
  const { data: openCoiRequests } = useEntityListFetch<EntityRecord>('CoiRequest', {
    enabled: isSubcontractorAssignmentTab && childRecords.length > 0,
    limit: 500,
    // `status` field lives in entity_records.data — the dataforge query
    // builder extracts via data->>'status' for non-system columns.
    where: { status: { $in: ['sent', 'replied_no_attachment'] } },
  })

  // Map keyed on the SubcontractorAssignment id this request belongs to.
  // CoiRequest.subcontractor_assignment_id is the link (see
  // server/orpc/routers/coi-requests.ts:129). The dataforge `data.query`
  // response flattens the JSONB `data` column onto the top-level row
  // (RecordRepository.toResponseShape) — so `record.status`,
  // `record.subcontractor_assignment_id`, etc. all live at the top.
  const openCoiRequestBySaId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    if (!isSubcontractorAssignmentTab || !openCoiRequests) return map
    for (const record of openCoiRequests) {
      const row = record as unknown as Record<string, unknown>
      // Defensive: handle both flattened and nested-data shapes. Some
      // callers (older worker paths) may still return `{ data: {...} }`.
      const nested = (row.data as Record<string, unknown> | undefined) ?? {}
      const saId =
        (row.subcontractor_assignment_id as string | undefined) ??
        (nested.subcontractor_assignment_id as string | undefined)
      if (!saId) continue
      // Shape consumed by OpenCoiRequestPillRenderer.normalize:
      //   { id, status, created_at }
      const status =
        (row.status as string | undefined) ??
        (nested.status as string | undefined) ??
        ''
      const createdAt =
        (row.created_at as string | undefined) ??
        (row.createdAt as string | undefined) ??
        (nested.created_at as string | undefined) ??
        ''
      map.set(saId, {
        id: (row.id as string | undefined) ?? '',
        status,
        created_at: createdAt,
      })
    }
    return map
  }, [isSubcontractorAssignmentTab, openCoiRequests])

  const hasAnyOpenCoiRequest = openCoiRequestBySaId.size > 0

  // Augment child rows with `open_coi_request` so the cell renderer can
  // pick it up via the standard data-flow path. Wrapped in a useMemo so
  // the augmented array identity is stable across re-renders that don't
  // touch the inputs.
  const recordsWithCoiRequest = useMemo(() => {
    if (!isSubcontractorAssignmentTab || !hasAnyOpenCoiRequest) {
      return hasLinkedFields ? enrichedRecords : childRecords
    }
    const baseRows = hasLinkedFields ? enrichedRecords : childRecords
    return baseRows.map((record) => {
      const saId = record.id
      const openReq = openCoiRequestBySaId.get(saId) ?? null
      return { ...record, open_coi_request: openReq } as EntityRecord
    })
  }, [
    isSubcontractorAssignmentTab,
    hasAnyOpenCoiRequest,
    hasLinkedFields,
    enrichedRecords,
    childRecords,
    openCoiRequestBySaId,
  ])

  // Virtual column for the pill. Only appended when at least one row
  // actually has a pending request — avoids a permanent empty column on
  // tabs that never see a broker request. The column is keyed on
  // `open_coi_request` so the OpenCoiRequestPillRenderer's `canHandle`
  // matches; `cellType: 'json'` is a stable placeholder (the slot is
  // matched by column id, not cell type).
  const coiRequestColumn = useMemo<Column | null>(() => {
    if (!isSubcontractorAssignmentTab || !hasAnyOpenCoiRequest) return null
    return {
      id: 'open_coi_request',
      field: 'open_coi_request' as any,
      name: 'Status',
      label: 'Status',
      cellType: 'json' as any,
      type: 'json',
      width: 200,
      editable: false,
      sortable: false,
      filterable: false,
      resizable: true,
    } as Column
  }, [isSubcontractorAssignmentTab, hasAnyOpenCoiRequest])

  // Combine linked-field columns and the CoiRequest virtual column; the
  // pill renders to the right of any linked columns.
  const appendColumns = useMemo<Column[] | undefined>(() => {
    const out: Column[] = []
    if (linkedColumns.length > 0) out.push(...linkedColumns)
    if (coiRequestColumn) out.push(coiRequestColumn)
    return out.length > 0 ? out : undefined
  }, [linkedColumns, coiRequestColumn])

  // Always use collectionOverride for embedded child grids.
  // useChildEntityData already filters records — no need for VibeGrid to re-fetch.
  // This eliminates a race condition where skipDataFetching toggles based on schema cache timing.
  const collectionData = useMemo(
    () => ({
      items: recordsWithCoiRequest,
      count: recordsWithCoiRequest.length,
    }),
    [recordsWithCoiRequest],
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
    childEntityConfig.relationshipType ?? (childSchema?.archetype === 'relationship' ? 'entity' : undefined)

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

  // GH#3040: Subcontractors-tab outbound actions ("Request reissue" /
  // "Send onboarding"). Open state stores the row + intent; the modal
  // resolves vendor + project names via useEntityRecord lookups before
  // the user sends. Modal stays unmounted while this is null so the
  // lookups don't run on every parent render.
  const [coiRequestState, setCoiRequestState] = useState<{
    intent: CoiRequestIntent
    subcontractorAssignmentId: string
    vendorId: string
  } | null>(null)

  // GH#3040: COI request actions are scoped to admin/owner roles on the
  // Subcontractors tab only. The bridge (#3016) is already DEB-scoped
  // via the Postgres trigger; no additional org guard is needed here.
  const authStore = useAuth()
  const orgRole = authStore.currentOrganization?.role
  const isOrgAdmin = orgRole === 'admin' || orgRole === 'owner'
  const showCoiRequestActions = isOrgAdmin && childEntityType === 'SubcontractorAssignment'

  // GH#2139: View mode switching in child entity tabs
  const [childViewMode, setChildViewMode] = useState<ViewMode>('table')
  const handleViewModeChange = useCallback((mode: ViewMode) => setChildViewMode(mode), [])

  // GH#2139: Derive schemaFields from child schema for smart gating
  const childSchemaFields: SchemaFieldDescriptor[] | undefined = useMemo(
    () =>
      childSchema?.fields.map((f) => ({
        fieldId: f.name,
        fieldType: f.type,
        label: f.label ?? f.name,
        slug: f.name,
      })),
    [childSchema],
  )

  // GH#1741: Detect all-pending compliance (indicates computation error)
  useEffect(() => {
    if (childEntityType !== 'SubcontractorAssignment') return
    if (childRecords.length === 0) return

    const allPending = childRecords.every((record) => {
      const data = record.data as Record<string, unknown>
      const certCompliance = data?.cert_compliance as { status?: string; score?: number } | undefined
      return certCompliance?.status === 'pending' && certCompliance?.score === 0
    })

    if (allPending) {
      toast.error('Could not compute compliance — please try again')
    }
  }, [childEntityType, childRecords])

  // GH#2786 (F') P4: Create child record and link to parent via the
  // schema-aware data.update dispatch (replaces the previous direct
  // `urs.create` call). The dispatch routes the relationship-source
  // field write through URS in the same Tx and (P2 dual-write) updates
  // the source row's inline target IDs JSONB. There is no urs.* call
  // from this component anymore.
  //
  // Branching:
  // - If the child is the SOURCE side of the relationship (incoming
  //   direction), `data.update` the child with the full target-ID
  //   array — single ID since cardinality on the child side is 'one'.
  // - If the parent is the SOURCE side (outgoing direction), `data.get`
  //   the parent's current children-array, append the new child ID,
  //   and `data.update` the parent with the full new array. This is
  //   the LWW-on-full-array contract from spec B3.
  //
  // Field-name resolution: scan the source schema for a relationship-
  // source field matching (relationshipType, targetEntityType,
  // direction === 'source'). When no typed Rel_* schema exists for
  // this child config (e.g. legacy 'entity' fallback), linking is
  // skipped with a warning toast — the previous urs.create call would
  // have thrown `UnknownRelationshipTypeError` on the same input.
  const handleCreateSuccess = async (recordId: string): Promise<void> => {
    try {
      const relType = resolvedRelationshipType
      if (!relType) {
        // Generic 'entity' fallback path was non-functional under URS
        // type validation. Surface this clearly rather than silently
        // creating an unlinked record.
        logger.warn('No relationshipType resolved for child entity config; skipping parent link', {
          recordId,
          parentRecordId,
          childEntityType,
        })
        toast.success(`${displayName} added (not linked — config missing relationshipType)`)
        setCreateOpen(false)
        return
      }

      if (derivedDirection === 'incoming') {
        // Child is the SOURCE of Rel_<Child>_<Parent>_<relType>.
        // The child schema has the forward-direction field — find it.
        const childField = findForwardRelationshipField(childSchema, relType, parentEntityType)
        if (!childField) {
          logger.warn(
            'Could not resolve child-side relationship field; child created but not linked',
            { recordId, childEntityType, relType, parentEntityType },
          )
          toast.success(`${displayName} added (link field not found on child schema)`)
        } else {
          await orpcClient.dataforge.data.update({
            entityName: childEntityType,
            recordId,
            data: { [childField]: [parentRecordId] },
          })
          toast.success(`${displayName} added`)
        }
      } else {
        // Parent is the SOURCE. The parent schema is loaded above via
        // useEntitySchema (cached). Find the forward field name there.
        const parentField = findForwardRelationshipField(parentSchema, relType, childEntityType)
        if (!parentField) {
          logger.warn(
            'Could not resolve parent-side relationship field; child created but not linked',
            { recordId, parentEntityType, relType, childEntityType },
          )
          toast.success(`${displayName} added (link field not found on parent schema)`)
        } else {
          // Read current children array — LWW on full array per spec B3.
          const parentRecord = await orpcClient.dataforge.data.get({
            entityName: parentEntityType,
            recordId: parentRecordId,
          })
          const parentData = ((parentRecord as { record?: Record<string, unknown> })?.record ?? {}) as Record<
            string,
            unknown
          >
          const currentArr = Array.isArray(parentData[parentField])
            ? (parentData[parentField] as string[])
            : []
          // Idempotency: don't add a duplicate ID if it's somehow already there.
          const newArr = currentArr.includes(recordId) ? currentArr : [...currentArr, recordId]
          await orpcClient.dataforge.data.update({
            entityName: parentEntityType,
            recordId: parentRecordId,
            data: { [parentField]: newArr },
          })
          toast.success(`${displayName} added`)
        }
      }
      // Trigger a refresh of child data
      retry()
    } catch (err) {
      logger.error('Failed to link child to parent via data.update dispatch', {
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
          <CardTitle className="text-sm font-semibold">{sectionTitle}</CardTitle>
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
          <CardTitle className="text-sm font-semibold">{sectionTitle}</CardTitle>
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
              <CardTitle className="text-sm font-semibold">{sectionTitle}</CardTitle>
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
                appendColumns={appendColumns}
              >
                <VibeGrid
                  tableId={`child-${childEntityType}-${parentRecordId}`}
                  entityType={childEntityType}
                  entityDisplayName={displayName}
                  height={Math.min(
                    // Chrome above data rows: view-mode tabs + toolbar (filter/column picker)
                    // + grid header row + a little breathing room below.
                    // Previously 64 + 40/row, which under-allocated — single-row grids
                    // clipped the first data row.
                    112 + GRID_DIMENSIONS.HEADER_HEIGHT + childRecords.length * GRID_DIMENSIONS.ROW_HEIGHT + 16,
                    500,
                  )}
                  enableSelectionColumn={false}
                  enableGrouping={false}
                  enableFiltering={false}
                  enableSorting={true}
                  enableDragAndDrop={childViewMode === 'kanban'}
                  viewMode={childViewMode}
                  onViewModeChange={handleViewModeChange}
                  schemaFields={childSchemaFields}
                  showHeader={true}
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
                    ...(showCoiRequestActions
                      ? [
                          {
                            id: 'coi-request-reissue',
                            label: 'Request reissue',
                            onClick: (rowData: Record<string, unknown>) => {
                              const recordId = rowData.id as string
                              const data = rowData.data as Record<string, unknown> | undefined
                              const vendorId = (data?.target_entity_id ?? rowData.target_entity_id) as
                                | string
                                | undefined
                              if (!recordId || !vendorId) return
                              setCoiRequestState({
                                intent: 'reissue',
                                subcontractorAssignmentId: recordId,
                                vendorId,
                              })
                            },
                          },
                          {
                            id: 'coi-request-onboarding',
                            label: 'Send onboarding',
                            onClick: (rowData: Record<string, unknown>) => {
                              const recordId = rowData.id as string
                              const data = rowData.data as Record<string, unknown> | undefined
                              const vendorId = (data?.target_entity_id ?? rowData.target_entity_id) as
                                | string
                                | undefined
                              if (!recordId || !vendorId) return
                              setCoiRequestState({
                                intent: 'onboarding',
                                subcontractorAssignmentId: recordId,
                                vendorId,
                              })
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              </VibeGridStoreProvider>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog - relationship archetypes get a specialized picker dialog */}
      {childSchema &&
        (childSchema.archetype === 'relationship' && childSchema.businessMetadata?.relationship?.targetEntity ? (
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

      {/* GH#3040: COI request modal — only mounted when a row action fires */}
      {coiRequestState && (
        <CoiRequestModalLoader
          intent={coiRequestState.intent}
          subcontractorAssignmentId={coiRequestState.subcontractorAssignmentId}
          vendorId={coiRequestState.vendorId}
          projectId={parentRecordId}
          onClose={() => setCoiRequestState(null)}
        />
      )}
    </>
  )
}

/**
 * GH#3040: small wrapper around `CoiRequestModal` that resolves the
 * vendor (Company) and project (Project) display names via
 * `useEntityRecord` before mounting the modal. The lookups happen lazily
 * — only when the user opens the modal — so the parent component stays
 * cheap to render even when row actions are visible.
 */
interface CoiRequestModalLoaderProps {
  intent: CoiRequestIntent
  subcontractorAssignmentId: string
  vendorId: string
  projectId: string
  onClose: () => void
}

function CoiRequestModalLoader({
  intent,
  subcontractorAssignmentId,
  vendorId,
  projectId,
  onClose,
}: CoiRequestModalLoaderProps): React.ReactElement {
  const vendor = useEntityRecord('Company', vendorId)
  const project = useEntityRecord('Project', projectId)

  const vendorName = resolveDisplayName(vendor.record, vendor.isReady) ?? 'this vendor'
  const projectName = resolveDisplayName(project.record, project.isReady) ?? 'this project'

  return (
    <CoiRequestModal
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      intent={intent}
      subcontractorAssignmentId={subcontractorAssignmentId}
      vendorId={vendorId}
      vendorName={vendorName}
      projectName={projectName}
    />
  )
}

function resolveDisplayName(record: EntityRecord | null, isReady: boolean): string | null {
  if (!isReady || !record) return null
  const top = record as Record<string, unknown>
  const data = (top.data as Record<string, unknown> | undefined) ?? top
  const displayName = data.display_name ?? top.display_name
  if (typeof displayName === 'string' && displayName.trim()) return displayName
  const name = data.name ?? top.name
  if (typeof name === 'string' && name.trim()) return name
  return null
}
