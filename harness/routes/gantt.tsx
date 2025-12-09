import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { ProfileDropdown } from '@/shared/components/profile-dropdown'
import { Search } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'

export const Route = createFileRoute('/_authenticated/debug/gantt')({
  component: DebugGanttPage,
})

function DebugGanttPage() {
  const [entityType] = useState('GanttDemo')

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full">
          <div className="pb-4">
            <h2 className="text-2xl font-bold tracking-tight">Gantt View Debug</h2>
            <p className="text-muted-foreground">
              Test VibeGrid Gantt mode with split pane layout - {entityType}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Use the Table/Gantt toggle in the grid header to switch views. Drag the divider to
              resize panes.
            </p>
          </div>

          <div className="flex-1 w-full">
            <VibeGridStoreProvider tableId="debug-gantt-1" entityType={entityType}>
              <VibeGrid
                tableId="debug-gantt-1"
                entityType={entityType}
                height={600}
                enableSelectionColumn={true}
                enableGrouping={false}
                enableFiltering={true}
                enableSorting={true}
                enableGantt={true}
              />
            </VibeGridStoreProvider>
          </div>
        </div>
      </Main>
    </>
  )
}
