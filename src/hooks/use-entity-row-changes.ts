/**
 * ⚠️ NOT MIGRATED TO MOBX - FILE DISABLED ⚠️
 *
 * This file has not been migrated from Legend State to MobX.
 * It is currently NOT USED anywhere in the codebase.
 *
 * Status: DISABLED - Do not import or use
 * Original: Available in archive/vibegrid/
 *
 * To re-enable:
 * 1. Migrate Legend State observables to MobX
 * 2. Update imports and reactive patterns
 * 3. Test thoroughly
 * 4. Remove this warning
 */

// This file is disabled and will throw errors if used
throw new Error('This file has not been migrated to MobX - see file header for details')

// TODO: This hook needs to be migrated to MobX + TanStack DB when it's needed
// Currently not used anywhere in the codebase
// import { use$, useObserve } from '@legendapp/state/react';
// import { observe } from '@legendapp/state';
// import { entities$, universeSchema$, universeLoading$, getEntity$ } from '@/legend-state/observables';
import React, { useCallback, useRef } from 'react'
import { getLogger } from '@/shared/lib/logging'

const fileLog = getLogger(['custom', 'vibegrid', 'hooks', 'use-entity-row-changes.ts'])

interface RowChange {
  rowId: string
  changeType: 'added' | 'updated' | 'deleted'
  data: any
  timestamp: number
}

interface UseEntityRowChangesOptions {
  entityTableName: string
  onRowChange?: (change: RowChange) => void
  trackDeletes?: boolean
  tableSend?: (event: any) => void // Add table machine sender
}

export function useEntityRowChanges({
  entityTableName,
  onRowChange,
  trackDeletes = false,
  tableSend,
}: UseEntityRowChangesOptions) {
  // TODO: This hook needs complete migration to MobX + TanStack DB
  // Migration pattern:
  // 1. Use useVibeGridData() hook to get entity data from TanStack DB
  // 2. Use MobX reaction() to observe changes
  // 3. Replace Legend State observe() with MobX autorun() or reaction()

  fileLog.warn('useEntityRowChanges is not yet migrated to MobX. Returning empty data.')

  return {
    rows: [] as any[],
    hasChanges: false,
  }

  /* ORIGINAL LEGEND STATE IMPLEMENTATION - TO BE MIGRATED
  const previousRowsRef = useRef<Map<string, any>>(new Map());
  const isInitializedRef = useRef(false);

  const handleChanges = useCallback((currentRows: any[]) => {
    if (!onRowChange) return;

    const currentRowMap = new Map(currentRows.map(row => [row.id, row]));
    const previousRowMap = previousRowsRef.current;
    const changes: RowChange[] = [];

    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      previousRowsRef.current = currentRowMap;
      return;
    }

    for (const [rowId, currentRow] of currentRowMap) {
      const previousRow = previousRowMap.get(rowId);

      if (!previousRow) {
        changes.push({
          rowId,
          changeType: 'added',
          data: currentRow,
          timestamp: Date.now()
        });
      } else if (JSON.stringify(previousRow) !== JSON.stringify(currentRow)) {
        changes.push({
          rowId,
          changeType: 'updated',
          data: currentRow,
          timestamp: Date.now()
        });
      }
    }

    if (trackDeletes) {
      for (const [rowId, previousRow] of previousRowMap) {
        if (!currentRowMap.has(rowId)) {
          changes.push({
            rowId,
            changeType: 'deleted',
            data: previousRow,
            timestamp: Date.now()
          });
        }
      }
    }

    changes.forEach(change => onRowChange(change));
    previousRowsRef.current = currentRowMap;
  }, [onRowChange, trackDeletes]);

  const allEntities = use$(entities$);
  const schema = use$(universeSchema$);
  const loading = use$(universeLoading$);

  const entityObservable = allEntities && allEntities[entityTableName] ? allEntities[entityTableName] : null;
  const rawEntityData = use$(entityObservable);

  const rows = React.useMemo(() => {
    if (!schema || loading || !rawEntityData) {
      return [];
    }

    let currentRows;
    if (typeof rawEntityData === 'object' && !Array.isArray(rawEntityData)) {
      currentRows = Object.values(rawEntityData);
    } else {
      currentRows = Array.isArray(rawEntityData) ? rawEntityData : [];
    }

    if (currentRows.length > 0) {
      handleChanges(currentRows);
    }

    return currentRows;
  }, [schema, loading, rawEntityData, handleChanges]);

  React.useEffect(() => {
    if (!tableSend) return;

    const disposeObserver = observe(() => {
      const entityObservable = getEntity$(entityTableName);
      if (!entityObservable || typeof entityObservable.get !== 'function') return;

      const entityData = entityObservable.get();

      if (!entityData) return;

      let currentRows;
      if (typeof entityData === 'object' && !Array.isArray(entityData)) {
        currentRows = Object.values(entityData);
      } else {
        currentRows = Array.isArray(entityData) ? entityData : [];
      }

      if (currentRows.length > 0) {
        fileLog.debug('🔄 useEntityRowChanges: Legend State observe() detected atomic change', {
          entityTableName,
          rowCount: currentRows.length,
          source: isInitializedRef.current ? 'legend_state_atomic_update' : 'initial_load',
          timestamp: Date.now()
        });

        tableSend({
          type: 'STORE_DATA_UPDATED',
          entities: currentRows,
          loading: false,
          source: isInitializedRef.current ? 'legend_state_atomic_update' : 'initial_load'
        });

        if (!isInitializedRef.current) {
          isInitializedRef.current = true;
        }
      }
    });

    fileLog.debug(`🔄 useEntityRowChanges: Atomic observer created for ${entityTableName}`);

    return disposeObserver;
  }, [tableSend, entityTableName]);

  return {
    rows,
    hasChanges: isInitializedRef.current
  };
  */
}
