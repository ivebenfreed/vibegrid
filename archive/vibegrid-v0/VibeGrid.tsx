import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPureObservables } from './stores/pure-observables';
import { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer';
import { VibeGridXHeaderPure } from './components/VibeGridXHeaderPure';
import type { Column } from './types';
import { log } from '@/logger';

// Import VibeGrid CSS styles
import './vibegridx.css';

const fileLog = log('components/VibeGrid');

// ====================================
// COMPONENT PROPS
// ====================================

interface VibeGridProps<T = any> {
  tableId: string;  // Unique identifier for this table instance (required for persistence)
  entityType: string;  // Entity type (required - determines data source)
  
  // Column configuration (required - no more auto-generation)
  columns: Column<T>[];  // Explicit columns with type checking
  
  // Common options
  className?: string;
  height?: number | string;
  width?: number | string;
  
  // Event handlers (all optional)
  onCellClick?: (rowId: string, columnId: string) => void;
  onCellDoubleClick?: (rowId: string, columnId: string) => void;
  onSelectionChange?: (selectedCells: Set<string>) => void;
  onEditingChange?: (editingCell: { rowId: string; columnId: string } | null) => void;
  onPerformanceUpdate?: (metrics: any) => void;
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
  onBatchEntityUpdate?: (updates: Array<{ id: string; updates: Record<string, any> }>) => Promise<void> | void;
  
  // Performance options
  enableVirtualScrolling?: boolean;
  bufferSize?: number;
  
  // Feature flags
  enableGrouping?: boolean;
  enableFiltering?: boolean;
  enableSorting?: boolean;
  enableDragAndDrop?: boolean;
  enableSelectionColumn?: boolean;
}

// ====================================
// MAIN COMPONENT
// ====================================

export function VibeGrid<T extends Record<string, any> = any>(
  props: VibeGridProps<T>
): React.ReactElement {
  
  const {
    tableId,
    entityType,
    columns,
    className = '',
    height = 600,
    width = '100%',
    enableSelectionColumn = false,
    onCellClick,
    onCellDoubleClick,
    onSelectionChange,
    onEditingChange,
    onPerformanceUpdate,
    onEntityUpdate,
    onBatchEntityUpdate,
    enableVirtualScrolling = true,
    bufferSize = 10,
    enableGrouping = true,
    enableFiltering = true,
    enableSorting = true,
    enableDragAndDrop = true,
  } = props;

  // ====================================
  // REFS AND STATE
  // ====================================

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SimplePassiveRenderer | null>(null);
  const observablesRef = useRef<{
    tableCore$: any;
    tableCoreSync$: any;
    tableInteraction$: any;
    tableViewport$: any;
  } | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPersistLoaded, setIsPersistLoaded] = useState(false);

  // ====================================
  // INITIALIZATION
  // ====================================

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      fileLog.info('🚀 Initializing VibeGrid', {
        tableId,
        entityType,
        columnCount: columns.length
      });

      // Create the three-layer observables
      const observables = createPureObservables(entityType, columns);
      observablesRef.current = observables;

      fileLog.debug('✅ Created pure observables', { entityType });

      // Wait for persistence to load before initializing renderer
      const checkPersistLoaded = () => {
        const isLoaded = observables.tableCoreSync$.isPersistLoaded?.get();
        fileLog.debug('🔄 Checking persistence loaded state', { 
          entityType, 
          isPersistLoaded: isLoaded 
        });
        
        if (isLoaded) {
          fileLog.debug('✅ Persistence loaded, initializing renderer', { entityType });
          
          // Create the SimplePassiveRenderer with enhanced selection
          const renderer = new SimplePassiveRenderer({
            container: containerRef.current,
            tableCore$: observables.tableCore$,
            tableInteraction$: observables.tableInteraction$,
            tableViewport$: observables.tableViewport$,
            enableSelectionColumn,
            bufferSize,
            onEntityUpdate,
            onBatchEntityUpdate
          });

          rendererRef.current = renderer;
          setIsInitialized(true);
          setIsPersistLoaded(true);
          setError(null);

          fileLog.debug('✅ SimplePassiveRenderer initialized successfully');

          // Set up event handlers after renderer is created
          if (onSelectionChange) {
            // Subscribe to selection changes
            const unsubscribe = observables.tableInteraction$.selectedCells.onChange(() => {
              const selectedCells = observables.tableInteraction$.selectedCells.get();
              onSelectionChange(selectedCells);
            });

            // Store unsubscribe function
            (renderer as any).selectionUnsubscribe = unsubscribe;
          }

          if (onEditingChange) {
            // Subscribe to editing changes
            const unsubscribe = observables.tableInteraction$.editingCell.onChange(() => {
              const editingCell = observables.tableInteraction$.editingCell.get();
              if (editingCell) {
                const [rowId, columnId] = editingCell.split(':');
                onEditingChange({ rowId, columnId });
              } else {
                onEditingChange(null);
              }
            });

            // Store unsubscribe function
            (renderer as any).editingUnsubscribe = unsubscribe;
          }

          // Update viewport when container size changes
          const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              observables.tableViewport$.updateViewport(rect.width, rect.height);
            }
          });

          resizeObserver.observe(containerRef.current);
          (renderer as any).resizeObserver = resizeObserver;

          // Initial viewport update
          const rect = containerRef.current.getBoundingClientRect();
          observables.tableViewport$.updateViewport(rect.width, rect.height);

        } else {
          // Keep checking until persistence loads
          setTimeout(checkPersistLoaded, 50);
        }
      };

      // Start checking for persistence loaded state
      checkPersistLoaded();

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      fileLog.error('❌ Failed to initialize VibeGrid', err);
      setError(errorMsg);
    }

    // Cleanup
    return () => {
      if (rendererRef.current) {
        fileLog.debug('🧹 Cleaning up VibeGrid');

        // Cleanup event subscriptions
        if ((rendererRef.current as any).selectionUnsubscribe) {
          (rendererRef.current as any).selectionUnsubscribe();
        }
        if ((rendererRef.current as any).editingUnsubscribe) {
          (rendererRef.current as any).editingUnsubscribe();
        }
        if ((rendererRef.current as any).resizeObserver) {
          (rendererRef.current as any).resizeObserver.disconnect();
        }

        rendererRef.current.destroy();
        rendererRef.current = null;
      }

      observablesRef.current = null;
      setIsInitialized(false);
      setIsPersistLoaded(false);
    };
  }, [tableId, entityType]); // Only re-initialize if table identity changes


  // ====================================
  // PUBLIC API METHODS
  // ====================================

  const api = useMemo(() => {
    if (!observablesRef.current) return null;

    const { tableCore$, tableInteraction$, tableViewport$ } = observablesRef.current;

    return {
      // Data manipulation
      toggleSort: (field: string) => tableCore$.toggleSort(field),
      setFilter: (field: string, value: any, operator: string) => tableCore$.setFilter(field, value, operator),
      clearFilters: () => tableCore$.clearFilters(),
      toggleColumn: (columnId: string) => tableCore$.toggleColumn(columnId),
      showAllColumns: () => tableCore$.showAllColumns(),
      hideAllColumns: () => tableCore$.hideAllColumns(),

      // Selection
      selectCell: (cellId: string, isMulti?: boolean) => tableInteraction$.selectCell(cellId, isMulti),
      selectRow: (rowId: string, isMulti?: boolean) => tableInteraction$.selectRow(rowId, isMulti),
      clearSelection: () => tableInteraction$.clearSelection(),
      getSelectedCells: () => tableInteraction$.selectedCells.get(),
      getSelectedRows: () => tableInteraction$.selectedRows.get(),

      // Editing
      startEdit: (cellId: string, initialValue: any) => tableInteraction$.startEdit(cellId, initialValue),
      saveEdit: () => tableInteraction$.saveEdit(),
      cancelEdit: () => tableInteraction$.cancelEdit(),

      // Viewport
      scrollTo: (top: number, left?: number) => {
        if (containerRef.current) {
          const scrollContainer = containerRef.current.querySelector('.vibegrid-viewport');
          if (scrollContainer) {
            scrollContainer.scrollTop = top;
            if (left !== undefined) {
              scrollContainer.scrollLeft = left;
            }
          }
        }
      },

      // Data access
      getProcessedRows: () => tableCore$.processedRows.get(),
      getVisibleRange: () => tableViewport$.visibleRange.get(),
    };
  }, [isInitialized]);

  // ====================================
  // RENDER
  // ====================================

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading table structure...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`vibegridx-container ${className}`}
      data-testid={`vibegrid-pure-${tableId}`}
      data-entity-type={entityType}
      style={{
        width,
        height,
        position: 'relative',
        outline: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Status indicator */}
      {error && (
        <div className="p-2 mb-2 bg-red-100 text-red-700 rounded text-sm">
          Error: {error}
        </div>
      )}
      
      {!isPersistLoaded && !error && (
        <div className="p-2 mb-2 bg-yellow-100 text-yellow-700 rounded text-sm">
          🔄 Loading table state persistence...
        </div>
      )}
      
      {isInitialized && isPersistLoaded && !error && (
        <div className="p-2 mb-2 bg-green-100 text-green-700 rounded text-sm">
          ✅ Pure Observable VibeGrid initialized with persistence ({entityType})
        </div>
      )}

      {/* Header with menu components */}
      {isInitialized && isPersistLoaded && !error && observablesRef.current && (
        <VibeGridXHeaderPure
          tableCore$={observablesRef.current.tableCore$}
          tableInteraction$={observablesRef.current.tableInteraction$}
          enableGrouping={enableGrouping}
        />
      )}

      {/* Main table container */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        <div
          ref={containerRef}
          className="vibegrid-pure-renderer h-full w-full"
          data-testid={`vibegrid-pure-renderer-${tableId}`}
          style={{ 
            width: '100%', 
            height: '100%',
            position: 'relative'
          }}
        />
      </div>

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && isInitialized && (
        <div className="p-2 border-t bg-muted/50 text-xs space-y-1">
          <p><strong>Architecture:</strong> Pure Observables (Legend State)</p>
          <p><strong>Renderer:</strong> PassiveTableRenderer with granular observers</p>
          <p><strong>Event Binding:</strong> Direct DOM → Observable methods</p>
          <p><strong>XState:</strong> ❌ Removed (no state machines)</p>
        </div>
      )}
    </div>
  );
}

export default VibeGrid;
export type { VibeGridProps };