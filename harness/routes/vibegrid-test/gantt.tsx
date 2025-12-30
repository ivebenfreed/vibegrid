/**
 * Mock VibeGrid Gantt Test Route
 *
 * Test route for VibeGrid Gantt view with mock data and dependencies.
 * Useful for testing Gantt features in isolation.
 *
 * @see planning/specs/415-vibegrid-component-testing-framework-wit.md
 */

import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import {
  MOCK_TASK_SCHEMA,
  createMockSchemaRegistry,
} from '@/shared/data/mock/mock-schema-registry'
import {
  clearMockStorage,
  type MockEntity,
  type MockDependency,
} from '@/shared/data/db/collections/mock-collections'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import {
  MockDataControls,
  SCENARIOS,
  type ScenarioName,
} from '@/systems/vibegrid/components/MockDataControls'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'

export const Route = createFileRoute('/_authenticated/debug/vibegrid-test/gantt')({
  beforeLoad: async () => {
    // Gate behind DEV mode only
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
  component: MockVibeGridGantt,
})

const STATUS_OPTIONS = ['open', 'in_progress', 'done', 'blocked'] as const
const DEPENDENCY_TYPES = ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'] as const

/**
 * Generate a single mock task with random data
 */
function generateMockTask(index: number, startOffsetDays: number = 0): MockEntity {
  const now = new Date()
  const startOffset = startOffsetDays + Math.floor(Math.random() * 7)
  const duration = Math.floor(Math.random() * 14) + 3
  const startDate = new Date(now.getTime() + startOffset * 24 * 60 * 60 * 1000)
  const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000)

  return {
    id: `mock-task-${Date.now()}-${index}`,
    name: `Task ${index}`,
    status: STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)],
    assigned_to: Math.random() > 0.3 ? `user-${Math.floor(Math.random() * 5) + 1}` : null,
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
    progress: Math.floor(Math.random() * 100),
    parent_id: null,
  }
}

/**
 * Generate mock tasks with sequential dates for Gantt view
 */
function generateMockTasksForGantt(count: number): MockEntity[] {
  const tasks: MockEntity[] = []
  let currentOffset = 0

  for (let i = 0; i < count; i++) {
    const task = generateMockTask(i + 1, currentOffset)
    tasks.push(task)
    // Stagger tasks for Gantt visualization
    currentOffset += Math.floor(Math.random() * 5) + 2
  }

  return tasks
}

/**
 * Generate mock dependencies between tasks
 */
function generateMockDependencies(tasks: MockEntity[], density: number = 0.3): MockDependency[] {
  const dependencies: MockDependency[] = []

  if (tasks.length < 2) return dependencies

  for (let i = 1; i < tasks.length; i++) {
    // Create dependency with probability based on density
    if (Math.random() < density) {
      // Link to a previous task (predecessor)
      const predecessorIndex = Math.floor(Math.random() * i)
      const dependency: MockDependency = {
        id: `dep-${Date.now()}-${i}`,
        sourceEntityType: 'MockTask',
        sourceEntityId: tasks[predecessorIndex].id,
        targetEntityType: 'MockTask',
        targetEntityId: tasks[i].id,
        relationshipType: 'depends_on',
        dependencyType: DEPENDENCY_TYPES[Math.floor(Math.random() * DEPENDENCY_TYPES.length)],
        createdAt: new Date().toISOString(),
      }
      dependencies.push(dependency)
    }
  }

  return dependencies
}

/**
 * Gantt Controls Component
 */
function GanttControls({
  dependencyCount,
  onGenerateDependencies,
  onClearDependencies,
}: {
  dependencyCount: number
  onGenerateDependencies: () => void
  onClearDependencies: () => void
}) {
  return (
    <Card className="mb-4" data-testid="gantt-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Gantt Controls</CardTitle>
        <CardDescription>Manage dependencies ({dependencyCount} dependencies)</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-4">
        <Button
          variant="outline"
          onClick={onGenerateDependencies}
          data-testid="generate-dependencies-button"
        >
          Generate Dependencies
        </Button>
        <Button
          variant="outline"
          onClick={onClearDependencies}
          data-testid="clear-dependencies-button"
        >
          Clear Dependencies
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Main component for Gantt VibeGrid testing with mock data
 */
function MockVibeGridGantt() {
  const [scenario, setScenario] = useState<ScenarioName>('small')
  const [customCount, setCustomCount] = useState(10)
  const [dataVersion, setDataVersion] = useState(0)
  const [mockData, setMockData] = useState<MockEntity[]>(() =>
    generateMockTasksForGantt(SCENARIOS.small.rowCount)
  )
  const [dependencies, setDependencies] = useState<MockDependency[]>([])

  // Create mock schema registry
  const mockSchemaRegistry = useMemo(() => {
    return createMockSchemaRegistry([MOCK_TASK_SCHEMA])
  }, [])

  // Collection ID for localStorage
  const collectionId = `vibegrid-test-gantt`

  // Add a new row
  const handleAddRow = useCallback(() => {
    const newTask = generateMockTask(mockData.length + 1)
    setMockData((prev) => [...prev, newTask])
    setDataVersion((v) => v + 1)
  }, [mockData.length])

  // Load a scenario
  const handleLoadScenario = useCallback((newScenario: ScenarioName) => {
    setScenario(newScenario)
    const count = SCENARIOS[newScenario].rowCount
    setCustomCount(count)
    const newTasks = generateMockTasksForGantt(count)
    setMockData(newTasks)
    setDependencies([])
    setDataVersion((v) => v + 1)
  }, [])

  // Generate custom count of rows
  const handleGenerate = useCallback((count: number) => {
    setMockData(generateMockTasksForGantt(count))
    setDependencies([])
    setDataVersion((v) => v + 1)
  }, [])

  // Clear all data
  const handleClear = useCallback(() => {
    setScenario('empty')
    setCustomCount(0)
    setMockData([])
    setDependencies([])
    setDataVersion((v) => v + 1)
  }, [])

  // Reset to defaults
  const handleReset = useCallback(() => {
    clearMockStorage(collectionId)
    setScenario('small')
    setCustomCount(10)
    setMockData(generateMockTasksForGantt(SCENARIOS.small.rowCount))
    setDependencies([])
    setDataVersion((v) => v + 1)
  }, [collectionId])

  // Generate dependencies
  const handleGenerateDependencies = useCallback(() => {
    const newDeps = generateMockDependencies(mockData, 0.4)
    setDependencies(newDeps)
    setDataVersion((v) => v + 1)
  }, [mockData])

  // Clear dependencies
  const handleClearDependencies = useCallback(() => {
    setDependencies([])
    setDataVersion((v) => v + 1)
  }, [])

  return (
    <>
      <Header>
        <h1 className="text-xl font-semibold">VibeGrid Test - Gantt</h1>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full" data-testid="vibegrid-test-gantt">
          <div className="pb-4">
            <h2 className="text-2xl font-bold tracking-tight">Mock VibeGrid Gantt Test</h2>
            <p className="text-muted-foreground">
              Test VibeGrid Gantt view with mock data - {mockData.length} rows, {dependencies.length} dependencies
            </p>
          </div>

          <MockDataControls
            onAddRow={handleAddRow}
            onClear={handleClear}
            onLoadScenario={handleLoadScenario}
            onReset={handleReset}
            onGenerate={handleGenerate}
            currentScenario={scenario}
            rowCount={mockData.length}
            customCount={customCount}
            onCustomCountChange={setCustomCount}
          />

          <GanttControls
            dependencyCount={dependencies.length}
            onGenerateDependencies={handleGenerateDependencies}
            onClearDependencies={handleClearDependencies}
          />

          <div className="flex-1 w-full" data-testid="vibegrid-container">
            <VibeGridStoreProvider
              key={dataVersion}
              tableId={`mock-test-gantt-${dataVersion}`}
              entityType="MockTask"
              schemaRegistryOverride={mockSchemaRegistry}
            >
              <VibeGrid
                tableId={`mock-test-gantt-${dataVersion}`}
                entityType="MockTask"
                height={600}
                enableSelectionColumn={true}
                viewMode="gantt"
                enableSorting={true}
                data-testid="vibegrid-gantt"
              />
            </VibeGridStoreProvider>
          </div>
        </div>
      </Main>
    </>
  )
}
