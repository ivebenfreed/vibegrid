/**
 * VibeGrid Header (MobX Version)
 *
 * Complete header with all child components migrated to MobX.
 * Includes: Entity Add, Grouping Config, and Column Visibility controls.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import type { VibeGridStores } from '../stores/context';
import { VibeGridEntityAdd } from './VibeGridEntityAdd';
import { GroupConfigDropdownPure } from './GroupConfigDropdownPure';
import { VibeGridXColumnVisibilityPure } from './VibeGridXColumnVisibilityPure';

interface VibeGridXHeaderPureProps {
  stores: VibeGridStores;
  enableGrouping?: boolean;
  className?: string;
  entityName?: string;
  orgId?: string;
  createEntity: (data: Record<string, any>) => void;
}

export const VibeGridXHeaderPure = observer(function VibeGridXHeaderPure({
  stores,
  enableGrouping = false,
  className = '',
  entityName,
  orgId,
  createEntity
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
        {/* Entity Add Component */}
        {entityName && (
          <VibeGridEntityAdd
            stores={stores}
            entityName={entityName}
            orgId={orgId}
            createEntity={createEntity}
          />
        )}

        {/* Group By Dropdown */}
        {enableGrouping && <GroupConfigDropdownPure stores={stores} />}

        {/* Column Visibility Dropdown */}
        <VibeGridXColumnVisibilityPure stores={stores} />
      </div>
    </div>
  );
});
