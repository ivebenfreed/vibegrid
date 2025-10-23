import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VibeGrid } from '@/components/vibegrid';
import { VibeGridStoreProvider } from '@/components/vibegrid/stores/context';

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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">VibeGrid POC</h2>
        <p className="text-muted-foreground">
          Test VibeGrid with new MobX stores + TanStack DB architecture
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>VibeGrid Instance</CardTitle>
          <CardDescription>Testing entity: {entityType}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden" style={{ height: '600px' }}>
            <VibeGridStoreProvider tableId="debug-grid-1">
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
        </CardContent>
      </Card>

    </div>
  );
}
