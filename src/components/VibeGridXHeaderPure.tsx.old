import React from 'react';
import { observer } from '@legendapp/state/react';
import { VibeGridXColumnVisibilityPure } from './VibeGridXColumnVisibilityPure';
import { GroupConfigDropdownPure } from './GroupConfigDropdownPure';
import { VibeGridEntityAdd } from './VibeGridEntityAdd';
import type { TableCore$ } from '../stores/data-state';
import type { TableInteraction$ } from '../stores/interaction-state';
import { createVibeGridVisualState } from '../stores/visual-state';

interface VibeGridXHeaderPureProps {
  tableCore$: TableCore$;
  tableInteraction$: TableInteraction$;
  // Group by functionality (optional)
  enableGrouping?: boolean;
  className?: string;
  visualState: ReturnType<typeof createVibeGridVisualState>;
  // Entity information for add functionality
  entityName?: string;
  orgId?: string;
}

export const VibeGridXHeaderPure = observer(function VibeGridXHeaderPure({
  tableCore$,
  tableInteraction$,
  enableGrouping = false,
  className = '',
  visualState,
  entityName,
  orgId
}: VibeGridXHeaderPureProps) {
  // Visual state is passed from parent VibeGrid component

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
        {entityName && (
          <VibeGridEntityAdd
            tableCore$={tableCore$}
            visualState={visualState}
            entityName={entityName}
            orgId={orgId}
          />
        )}
        {enableGrouping && (
          <GroupConfigDropdownPure
            tableCore$={tableCore$}
            tableInteraction$={tableInteraction$}
            visualState={visualState}
          />
        )}
        <VibeGridXColumnVisibilityPure
          tableCore$={tableCore$}
          tableInteraction$={tableInteraction$}
          visualState={visualState}
        />
      </div>
    </div>
  );
});