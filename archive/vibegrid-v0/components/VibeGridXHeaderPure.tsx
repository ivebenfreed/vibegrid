import React from 'react';
import { observer } from '@legendapp/state/react';
import { VibeGridXColumnVisibilityPure } from './VibeGridXColumnVisibilityPure';
import { GroupConfigDropdownPure } from './GroupConfigDropdownPure';
import type { TableCore$, TableInteraction$ } from '../stores/pure-observables';

interface VibeGridXHeaderPureProps {
  tableCore$: TableCore$;
  tableInteraction$: TableInteraction$;
  // Group by functionality (optional)
  enableGrouping?: boolean;
  className?: string;
}

export const VibeGridXHeaderPure = observer(function VibeGridXHeaderPure({
  tableCore$,
  tableInteraction$,
  enableGrouping = false,
  className = ''
}: VibeGridXHeaderPureProps) {
  // Get reactive data from observables
  const columns = tableCore$.columns.get();
  const hiddenColumnCount = tableCore$.hiddenColumnCount.get();

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
        {enableGrouping && (
          <GroupConfigDropdownPure
            tableCore$={tableCore$}
            tableInteraction$={tableInteraction$}
          />
        )}
        <VibeGridXColumnVisibilityPure
          tableCore$={tableCore$}
          tableInteraction$={tableInteraction$}
        />
      </div>
    </div>
  );
});