/**
 * Mock VibeGrid Grouping Test Route
 *
 * Test route for VibeGrid grouping and hierarchy with mock data.
 * Useful for testing grouping, expand/collapse in isolation.
 *
 * @see planning/specs/415-vibegrid-component-testing-framework-wit.md
 */

import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { MOCK_TASK_SCHEMA, createMockSchemaRegistry } from '@/shared/data/mock/mock-schema-registry'
import {
  clearMockStorage,
  createMockEntityCollection,
  type MockEntity,
} from '@/shared/data/db/collections/mock-collections'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import {
  MockDataControls,
  SCENARIOS,
  type ScenarioName,
} from '@/systems/vibegrid/components/MockDataControls'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

export const Route = createFileRoute('/_authenticated/debug/vibegrid-test/grouping')({
  beforeLoad: async () => {
    // Gate behind DEV mode only
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
  component: MockVibeGridGrouping,
})

const STATUS_OPTIONS = ['open', 'in_progress', 'done', 'blocked'] as const
const GROUP_BY_OPTIONS = ['status', 'assigned_to', 'none'] as const

/**
 * Generate a single mock task with random data
 */
function generateMockTask(index: number, parentId: string | null = null): MockEntity {
  const now = new Date()
  const startOffset = Math.floor(Math.random() * 30)
  const duration = Math.floor(Math.random() * 14) + 1
  const startDate = new Date(now.getTime() + startOffset * 24 * 60 * 60 * 1000)
  const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000)

  return {
    id: `mock-task-${Date.now()}-${index}`,
    name: `Task ${index}${parentId ? ' (Child)' : ''}`,
    status: STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)],
    assigned_to: Math.random() > 0.3 ? `user-${Math.floor(Math.random() * 5) + 1}` : null,
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
    progress: Math.floor(Math.random() * 100),
    parent_id: parentId,
  }
}

/**
 * Generate mock tasks with hierarchy (parent/child relationships)
 */
function generateMockTasksWithHierarchy(count: number): MockEntity[] {
  const tasks: MockEntity[] = []
  const parentCount = Math.floor(count / 3)
  let taskIndex = 1

  // Generate parent tasks
  for (let i = 0; i < parentCount; i++) {
    const parentTask = generateMockTask(taskIndex++)
    tasks.push(parentTask)

    // Generate 1-3 children for each parent
    const childCount = Math.floor(Math.random() * 3) + 1
    for (let j = 0; j < childCount && tasks.length < count; j++) {
      const childTask = generateMockTask(taskIndex++, parentTask.id)
      tasks.push(childTask)
    }
  }

  // Fill remaining with top-level tasks
  while (tasks.length < count) {
    tasks.push(generateMockTask(taskIndex++))
  }

  return tasks
}

/**
 * Grouping Controls Component
 */
function GroupingControls({
  groupBy,
  onGroupByChange,
  hasHierarchy,
  onToggleHierarchy,
}: {
  groupBy: string
  onGroupByChange: (groupBy: string) => void
  hasHierarchy: boolean
  onToggleHierarchy: () => void
}) {
  return (
    <Card className="mb-4" data-testid="grouping-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Grouping Controls</CardTitle>
        <CardDescription>Configure grouping and hierarchy</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-4 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="group-by">Group By</Label>
          <Select
            value={groupBy}
            onValueChange={(value) => {
              if (value !== null) onGroupByChange(value)
            }}
          >
            <SelectTrigger id="group-by" className="w-[180px]" data-testid="group-by-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} data-testid={`group-by-${option}`}>
                  {option === 'none' ? 'No Grouping' : option.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={hasHierarchy ? 'default' : 'outline'}
          onClick={onToggleHierarchy}
          data-testid="toggle-hierarchy-button"
        >
          {hasHierarchy ? 'Hierarchy On' : 'Hierarchy Off'}
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Main component for Grouping VibeGrid testing with mock data
 */
function MockVibeGridGrouping() {
  const [scenario, setScenario] = useState<ScenarioName>('medium')
  const [customCount, setCustomCount] = useState(50)
  const [dataVersion, setDataVersion] = useState(0)
  const [hasHierarchy, setHasHierarchy] = useState(true)
  const [groupBy, setGroupBy] = useState('status')
  const [mockData, setMockData] = useState<MockEntity[]>(() =>
    generateMockTasksWithHierarchy(SCENARIOS.medium.rowCount),
  )

  // Expose test state for E2E testing
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as any).__VIBEGRID_TEST_STATE__ = {
        mockData,
        rowCount: mockData.length,
        hasHierarchy,
        groupBy,
        scenario,
        customCount,
        dataVersion,
      }
    }
    return () => {
      if (import.meta.env.DEV) {
        delete (window as any).__VIBEGRID_TEST_STATE__
      }
    }
  }, [mockData, hasHierarchy, groupBy, scenario, customCount, dataVersion])

  // Create mock schema registry
  const mockSchemaRegistry = useMemo(() => {
    return createMockSchemaRegistry([MOCK_TASK_SCHEMA])
  }, [])

  // Collection ID for localStorage
  const collectionId = `vibegrid-test-grouping`

  // Create mock collection for TanStack DB integration
  const mockCollection = useMemo(() => {
    return createMockEntityCollection(collectionId, mockData)
  }, [mockData])

  // Add a new row
  const handleAddRow = useCallback(() => {
    const newTask = generateMockTask(mockData.length + 1)
    setMockData((prev) => [...prev, newTask])
    setDataVersion((v) => v + 1)
  }, [mockData.length])

  // Load a scenario
  const handleLoadScenario = useCallback(
    (newScenario: ScenarioName) => {
      setScenario(newScenario)
      const count = SCENARIOS[newScenario].rowCount
      setCustomCount(count)
      const newTasks = hasHierarchy
        ? generateMockTasksWithHierarchy(count)
        : Array.from({ length: count }, (_, i) => generateMockTask(i + 1))
      setMockData(newTasks)
      setDataVersion((v) => v + 1)
    },
    [hasHierarchy],
  )

  // Generate custom count of rows
  const handleGenerate = useCallback(
    (count: number) => {
      const newTasks = hasHierarchy
        ? generateMockTasksWithHierarchy(count)
        : Array.from({ length: count }, (_, i) => generateMockTask(i + 1))
      setMockData(newTasks)
      setDataVersion((v) => v + 1)
    },
    [hasHierarchy],
  )

  // Clear all data
  const handleClear = useCallback(() => {
    setScenario('empty')
    setCustomCount(0)
    setMockData([])
    setDataVersion((v) => v + 1)
  }, [])

  // Reset to defaults
  const handleReset = useCallback(() => {
    clearMockStorage(collectionId)
    setScenario('medium')
    setCustomCount(50)
    setHasHierarchy(true)
    setGroupBy('status')
    setMockData(generateMockTasksWithHierarchy(SCENARIOS.medium.rowCount))
    setDataVersion((v) => v + 1)
  }, [])

  // Toggle hierarchy
  const handleToggleHierarchy = useCallback(() => {
    setHasHierarchy((prev) => {
      const newHasHierarchy = !prev
      // Regenerate data with/without hierarchy
      const newTasks = newHasHierarchy
        ? generateMockTasksWithHierarchy(mockData.length)
        : Array.from({ length: mockData.length }, (_, i) => generateMockTask(i + 1))
      setMockData(newTasks)
      setDataVersion((v) => v + 1)
      return newHasHierarchy
    })
  }, [mockData.length])

  // Count hierarchy levels
  const hierarchyStats = useMemo(() => {
    const parents = mockData.filter((t) => t.parent_id === null).length
    const children = mockData.filter((t) => t.parent_id !== null).length
    return { parents, children }
  }, [mockData])

  return (
    <>
      <Header>
        <h1 className="text-xl font-semibold">VibeGrid Test - Grouping</h1>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full" data-testid="vibegrid-test-grouping">
          <div className="pb-4">
            <h2 className="text-2xl font-bold tracking-tight">Mock VibeGrid Grouping Test</h2>
            <p className="text-muted-foreground">
              Test VibeGrid grouping with mock data - {mockData.length} rows
              {hasHierarchy &&
                ` (${hierarchyStats.parents} parents, ${hierarchyStats.children} children)`}
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

          <GroupingControls
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            hasHierarchy={hasHierarchy}
            onToggleHierarchy={handleToggleHierarchy}
          />

          <div className="flex-1 w-full" data-testid="vibegrid-container">
            <VibeGridStoreProvider
              key={dataVersion}
              tableId={`mock-test-grouping-${dataVersion}`}
              entityType="MockTask"
              schemaRegistryOverride={mockSchemaRegistry}
              collectionOverride={mockCollection}
            >
              <VibeGrid
                tableId={`mock-test-grouping-${dataVersion}`}
                entityType="MockTask"
                height={600}
                enableSelectionColumn={true}
                enableGrouping={true}
                enableFiltering={true}
                enableSorting={true}
                data-testid="vibegrid-grouping"
              />
            </VibeGridStoreProvider>
          </div>
        </div>
      </Main>
    </>
  )
}
