import { use$, useObserve } from '@legendapp/state/react';
import { observe } from '@legendapp/state';
import { entities$, universeSchema$, universeLoading$, getEntity$ } from '@/legend-state/observables';
import React, { useCallback, useRef } from 'react';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/hooks/use-entity-row-changes.ts');

interface RowChange {
  rowId: string;
  changeType: 'added' | 'updated' | 'deleted';
  data: any;
  timestamp: number;
}

interface UseEntityRowChangesOptions {
  entityTableName: string;
  onRowChange?: (change: RowChange) => void;
  trackDeletes?: boolean;
  tableSend?: (event: any) => void; // Add table machine sender
}

export function useEntityRowChanges({ 
  entityTableName, 
  onRowChange,
  trackDeletes = false,
  tableSend
}: UseEntityRowChangesOptions) {
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

  // Follow UltraTable pattern: get all entities reactively, then access specific entity
  const allEntities = use$(entities$);
  const schema = use$(universeSchema$);
  const loading = use$(universeLoading$);
  
  // Get the specific entity observable from allEntities
  const entityObservable = allEntities && allEntities[entityTableName] ? allEntities[entityTableName] : null;
  
  // Get the actual entity data reactively
  const rawEntityData = use$(entityObservable);
  
  // Process data with proper fallbacks (same as UltraTable)
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
    
    // Apply change detection
    if (currentRows.length > 0) {
      handleChanges(currentRows);
    }
    
    return currentRows;
  }, [schema, loading, rawEntityData, handleChanges]);

  // OPTIMAL: Use Legend State observe() for atomic change detection
  // This replaces manual JSON.stringify comparison with Legend State's built-in reactivity
  React.useEffect(() => {
    if (!tableSend) return;

    // Create atomic observer that only tracks changes to this specific entity
    const disposeObserver = observe(() => {
      // ✅ CORRECT: Use getEntity$() instead of entities$.get()
      const entityObservable = getEntity$(entityTableName);
      if (!entityObservable || typeof entityObservable.get !== 'function') return;
      
      // CRITICAL: Use get() to track changes atomically - no manual comparison needed
      const entityData = entityObservable.get();
      
      if (!entityData) return;

      // Process the raw data efficiently
      let currentRows;
      if (typeof entityData === 'object' && !Array.isArray(entityData)) {
        currentRows = Object.values(entityData);
      } else {
        currentRows = Array.isArray(entityData) ? entityData : [];
      }
      
      if (currentRows.length > 0) {
        fileLog.info('🔄 useEntityRowChanges: Legend State observe() detected atomic change', {
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
        
        // Mark as initialized after first send
        if (!isInitializedRef.current) {
          isInitializedRef.current = true;
        }
      }
    });

    fileLog.info(`🔄 useEntityRowChanges: Atomic observer created for ${entityTableName}`);
    
    // Cleanup observer on unmount or dependencies change
    return disposeObserver;
  }, [tableSend, entityTableName]);

  return {
    rows,
    hasChanges: isInitializedRef.current
  };
}