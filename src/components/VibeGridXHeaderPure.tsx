/**
 * VibeGrid Header (MobX Version)
 *
 * Minimal working header for Day 7-8 migration.
 * Child components (column visibility, grouping, entity add) will be migrated in later phases.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import type { VibeGridStores } from '../stores/context';

interface VibeGridXHeaderPureProps {
  stores: VibeGridStores;
  enableGrouping?: boolean;
  className?: string;
  entityName?: string;
  orgId?: string;
}

export const VibeGridXHeaderPure = observer(function VibeGridXHeaderPure({
  stores,
  enableGrouping = false,
  className = '',
  entityName,
  orgId
}: VibeGridXHeaderPureProps) {
  const { visualStateStore } = stores;

  // Calculate hidden column count
  const hiddenColumnCount = visualStateStore.columns.filter(
    col => visualStateStore.columnVisibility[col.id] === false
  ).length;

  return (
    <div className={`vibegridx-header-toolbar flex items-center justify-between p-2 border-b bg-muted/50 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Table View</span>
        {hiddenColumnCount > 0 && (
          <span className="text-xs text-muted-foreground">
            ({hiddenColumnCount} columns hidden)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* TODO (Day 9): Add VibeGridEntityAdd */}
        {/* TODO (Day 9): Add GroupConfigDropdownPure */}
        {/* TODO (Day 9): Add VibeGridXColumnVisibilityPure */}
        <span className="text-xs text-muted-foreground">
          {visualStateStore.columns.length} columns
        </span>
      </div>
    </div>
  );
});
