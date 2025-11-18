import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { VibeGrid } from '@/systems/vibegrid';
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context';

export const Route = createFileRoute('/_authenticated/debug/vibegrid')({
  component: DebugVibeGridPage
});

function DebugVibeGridPage() {
  const [entityType] = useState('WorkTask');
  const [stats, setStats] = useState({
    renders: 0,
    selections: 0,
    edits: 0
  });

  return (
    <div className="flex flex-col h-full w-full">
      <div className="p-6 border-b">
        <h2 className="text-2xl font-bold tracking-tight">VibeGrid POC</h2>
        <p className="text-muted-foreground">
          Test VibeGrid with new MobX stores + TanStack DB architecture - {entityType}
        </p>
      </div>

      <div className="flex-1 w-full">
        <VibeGridStoreProvider tableId="debug-grid-1" entityType={entityType}>
          <VibeGrid
            tableId="debug-grid-1"
            entityType={entityType}
            height={600}
          enableSelectionColumn={true}
          enableGrouping={true}
          enableFiltering={true}
          enableSorting={true}
          onSelectionChange={(selections) => {
            setStats(s => ({ ...s, selections: selections.size }));
          }}
          onEditingChange={(editing) => {
            if (editing) {
              setStats(s => ({ ...s, edits: s.edits + 1 }));
            }
          }}
          onPerformanceUpdate={(metrics) => {
            setStats(s => ({ ...s, renders: s.renders + 1 }));
          }}
          />
        </VibeGridStoreProvider>
      </div>
    </div>
  );
}
