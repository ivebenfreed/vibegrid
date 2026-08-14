/**
 * LienEntityGrid — a real, self-contained VibeGrid for an entity type, embedded
 * as a tab on the PaymentCycle hub (replaces the lightweight EntityRecordsTable).
 *
 * Uses the same `VibeGridStoreProvider` + `collectionOverride` embedding pattern
 * as `ChildEntitySection`, but with an UNSCOPED data source (`useEntityListFetch`
 * over all records of the type) rather than a parent-scoped child fetch — the hub
 * shows every waiver request / payment line, not the children of one record.
 *
 * For LienWaiverRequest, clicking a row opens the globally-mounted
 * `LienWaiverReviewDrawer` via `?lwrReviewId=`, giving proper review (PDF
 * preview + extracted fields + close/reject + manual signed-waiver upload)
 * straight from the grid.
 */
import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'

import { VibeGrid } from '@/systems/vibegrid'
import { GRID_DIMENSIONS } from '@/systems/vibegrid/constants/grid-dimensions'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import type { SchemaFieldDescriptor } from '@/systems/vibegrid/modules/GridModule'
import { useEntitySchema } from '@/shared/data/queries/entity-schemas.queries'
import { useEntityListFetch } from '@/shared/data/db/hooks/useEntityListFetch'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import type { EntityRecord } from '@/shared/types/dataforge'

const LIST_LIMIT = 500

export interface LienEntityGridProps {
  entityName: string
  /** LienWaiverRequest → row click opens the review drawer (`?lwrReviewId=`). */
  enableReview?: boolean
  emptyMessage?: string
  testId?: string
}

export function LienEntityGrid({
  entityName,
  enableReview = false,
  emptyMessage = 'No records yet.',
  testId,
}: LienEntityGridProps): React.JSX.Element {
  const navigate = useNavigate()
  const schema = useEntitySchema(entityName)
  const { data: records, total, isLoading, error } = useEntityListFetch<EntityRecord>(entityName, {
    limit: LIST_LIMIT,
  })

  const rows = records ?? []
  const displayName = EntityNameUtils.toDisplayFormat(entityName)

  const collectionData = useMemo(
    () => ({ items: rows, count: total ?? rows.length }),
    [rows, total],
  )

  const schemaFields: SchemaFieldDescriptor[] | undefined = useMemo(
    () =>
      schema?.fields?.map((f) => ({
        fieldId: f.name,
        fieldType: f.type,
        label: f.label ?? f.name,
        slug: f.name,
      })),
    [schema],
  )

  const openReview = (rowId: string) => {
    // The drawer reads lwrReviewId off any route via useSearch({ strict:
    // false }); the per-route search type doesn't declare it, so cast the
    // options object — mirrors MyWorkPage.handleOpenLienWaiverReview.
    void navigate({
      search: (prev: any) => ({ ...prev, lwrReviewId: rowId }),
    } as any)
  }

  if (error) {
    return (
      <p className="p-4 text-sm text-red-600 dark:text-red-400">
        Failed to load {displayName}: {error.message}
      </p>
    )
  }

  if (isLoading && rows.length === 0) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    )
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{emptyMessage}</p>
  }

  const tableId = `lien-hub-${entityName}`

  return (
    <div className="min-h-[200px] p-2" data-testid={testId ?? `lien-grid-${entityName}`}>
      <VibeGridStoreProvider
        tableId={tableId}
        entityType={entityName}
        collectionOverride={collectionData}
      >
        <VibeGrid
          tableId={tableId}
          entityType={entityName}
          entityDisplayName={displayName}
          height={Math.min(
            112 + GRID_DIMENSIONS.HEADER_HEIGHT + rows.length * GRID_DIMENSIONS.ROW_HEIGHT + 16,
            560,
          )}
          enableSelectionColumn={true}
          enableGrouping={false}
          enableFiltering={true}
          enableSorting={true}
          schemaFields={schemaFields}
          showHeader={true}
          showPagination={false}
          disableSearch={false}
          skipDataFetching={true}
          onCellClick={
            enableReview
              ? (rowId: string) => {
                  if (rowId) openReview(rowId)
                }
              : undefined
          }
        />
      </VibeGridStoreProvider>
    </div>
  )
}
