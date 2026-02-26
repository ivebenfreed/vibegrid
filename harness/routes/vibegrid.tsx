import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { VibeGrid } from '@/systems/vibegrid'
import {
  VibeGridStoreProvider,
  useTableCoreStore,
  useInitStore,
} from '@/systems/vibegrid/stores/context'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { Search } from '@/shared/components/search'
import { ThemeSwitch } from '@/shared/components/theme-switch'
import { MOCK_TASK_SCHEMA, createMockSchemaRegistry } from '@/shared/data/mock/mock-schema-registry'
import { createMockEntityCollection } from '@/shared/data/db/collections/mock-collections'
import type { ViewMode } from '@/systems/vibegrid/stores/ViewModeStore'
import { DataControls } from './_components/DataControls'
import { createSmallScenario, getScenarioById, type TestScenario } from './_mock-data/scenarios'
import type { MockTask } from './_mock-data/generators'

export const Route = createFileRoute('/_authenticated/debug/vibegrid')({
  component: DebugVibeGridPage,
})

function DebugVibeGridPage() {
  const [entityType] = useState('WorkTask')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [useMockData, setUseMockData] = useState(false)
  const [scenario, setScenario] = useState<TestScenario | null>(null)
  const [mockTasks, setMockTasks] = useState<MockTask[]>([])

  // Initialize with small scenario
  useEffect(() => {
    if (useMockData && !scenario) {
      const initialScenario = createSmallScenario()
      setScenario(initialScenario)
      setMockTasks(initialScenario.tasks)
    }
  }, [useMockData, scenario])

  const handleToggleMockData = useCallback(
    (useMock: boolean) => {
      setUseMockData(useMock)
      if (useMock && !scenario) {
        const initialScenario = createSmallScenario()
        setScenario(initialScenario)
        setMockTasks(initialScenario.tasks)
      }
    },
    [scenario],
  )

  const handleScenarioChange = useCallback((newScenario: TestScenario) => {
    setScenario(newScenario)
    setMockTasks(newScenario.tasks)
  }, [])

  const handleAddRow = useCallback((task: MockTask) => {
    setMockTasks((prev) => [...prev, task])
  }, [])

  const handleRemoveLastRow = useCallback(() => {
    setMockTasks((prev) => prev.slice(0, -1))
  }, [])

  const handleRefreshData = useCallback(() => {
    if (scenario) {
      const refreshed = getScenarioById(scenario.id)
      if (refreshed) {
        setMockTasks(refreshed.tasks)
      }
    }
  }, [scenario])

  // Mock schema registry so column-generation.ts can find MockTask schema
  const mockSchemaRegistry = useMemo(() => createMockSchemaRegistry([MOCK_TASK_SCHEMA]), [])

  // Mock collection so VibeGrid data layer works without API calls
  const mockCollection = useMemo(
    () => (useMockData ? createMockEntityCollection('debug-grid-mock', mockTasks) : undefined),
    [useMockData, mockTasks],
  )

  return (
    <>
      <Header>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
        </div>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full">
          <div className="pb-4">
            <h2 className="text-2xl font-bold tracking-tight">VibeGrid Testing</h2>
            <p className="text-muted-foreground">
              {useMockData
                ? 'Mock data mode - no database connection required'
                : `Live data mode - ${entityType}`}
            </p>
          </div>

          {/* Data Controls */}
          <div className="pb-4">
            <DataControls
              useMockData={useMockData}
              onToggleMockData={handleToggleMockData}
              scenario={scenario}
              onScenarioChange={handleScenarioChange}
              onAddRow={handleAddRow}
              onRemoveLastRow={handleRemoveLastRow}
              onRefreshData={handleRefreshData}
              rowCount={useMockData ? mockTasks.length : 0}
            />
          </div>

          <div className="flex-1 w-full" data-testid="vibegrid-container">
            <VibeGridStoreProvider
              key={useMockData ? 'mock' : 'live'}
              tableId="debug-grid-1"
              entityType={useMockData ? 'MockTask' : entityType}
              schemaRegistryOverride={useMockData ? mockSchemaRegistry : undefined}
              collectionOverride={useMockData ? mockCollection : undefined}
            >
              {useMockData ? (
                <MockDataInjector tasks={mockTasks}>
                  <VibeGrid
                    tableId="debug-grid-1"
                    entityType="MockTask"
                    height={600}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    enableSelectionColumn={true}
                    enableGrouping={true}
                    enableFiltering={true}
                    enableSorting={true}
                    enableKanban={true}
                    skipDataFetching={true}
                  />
                </MockDataInjector>
              ) : (
                <VibeGrid
                  tableId="debug-grid-1"
                  entityType={entityType}
                  height={600}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  enableSelectionColumn={true}
                  enableGrouping={true}
                  enableFiltering={true}
                  enableSorting={true}
                />
              )}
            </VibeGridStoreProvider>
          </div>
        </div>
      </Main>
    </>
  )
}

/**
 * Component that injects mock data into VibeGrid stores
 */
const MockDataInjector = observer(function MockDataInjector({
  tasks,
  children,
}: {
  tasks: MockTask[]
  children: React.ReactNode
}) {
  const tableCoreStore = useTableCoreStore()
  const initStore = useInitStore()

  // Inject mock data into store whenever tasks change
  useEffect(() => {
    tableCoreStore.setRows(tasks)

    // Mark as ready if not already
    if (!initStore.hydrationState.entityDataLoaded) {
      initStore.markReady('entityDataLoaded')
    }
  }, [tasks, tableCoreStore, initStore])

  return <>{children}</>
})
