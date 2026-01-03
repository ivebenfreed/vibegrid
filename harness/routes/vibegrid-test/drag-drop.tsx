/**
 * Mock VibeGrid Drag & Drop Test Route
 *
 * Test route for VibeGrid drag & drop features with mock data.
 * Useful for testing row reordering, fill handle in isolation.
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
import { Switch } from '@/shared/components/ui/switch'
import { Label } from '@/shared/components/ui/label'

export const Route = createFileRoute('/_authenticated/debug/vibegrid-test/drag-drop')({
  beforeLoad: async () => {
    // Gate behind DEV mode only
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
  component: MockVibeGridDragDrop,
})

const STATUS_OPTIONS = ['open', 'in_progress', 'done', 'blocked'] as const

/**
 * Generate a single mock task with random data
 */
function generateMockTask(index: number): MockEntity {
  const now = new Date()
  const startOffset = Math.floor(Math.random() * 30)
  const duration = Math.floor(Math.random() * 14) + 1
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
 * Generate mock tasks
 */
function generateMockTasks(count: number): MockEntity[] {
  const tasks: MockEntity[] = []
  for (let i = 0; i < count; i++) {
    tasks.push(generateMockTask(i + 1))
  }
  return tasks
}

/**
 * Drag & Drop Controls Component
 */
function DragDropControls({
  enableRowDrag,
  onToggleRowDrag,
  enableFillHandle,
  onToggleFillHandle,
  onShuffleRows,
}: {
  enableRowDrag: boolean
  onToggleRowDrag: () => void
  enableFillHandle: boolean
  onToggleFillHandle: () => void
  onShuffleRows: () => void
}) {
  return (
    <Card className="mb-4" data-testid="drag-drop-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Drag & Drop Controls</CardTitle>
        <CardDescription>Configure drag & drop features</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-6 items-center">
        <div className="flex items-center gap-2">
          <Switch
            id="row-drag"
            checked={enableRowDrag}
            onCheckedChange={onToggleRowDrag}
            data-testid="toggle-row-drag"
          />
          <Label htmlFor="row-drag">Row Drag</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="fill-handle"
            checked={enableFillHandle}
            onCheckedChange={onToggleFillHandle}
            data-testid="toggle-fill-handle"
          />
          <Label htmlFor="fill-handle">Fill Handle</Label>
        </div>
        <Button variant="outline" onClick={onShuffleRows} data-testid="shuffle-rows-button">
          Shuffle Rows
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Main component for Drag & Drop VibeGrid testing with mock data
 */
function MockVibeGridDragDrop() {
  const [scenario, setScenario] = useState<ScenarioName>('small')
  const [customCount, setCustomCount] = useState(10)
  const [dataVersion, setDataVersion] = useState(0)
  const [enableRowDrag, setEnableRowDrag] = useState(true)
  const [enableFillHandle, setEnableFillHandle] = useState(true)
  const [mockData, setMockData] = useState<MockEntity[]>(() =>
    generateMockTasks(SCENARIOS.small.rowCount),
  )

  // Expose test state for E2E testing
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as any).__VIBEGRID_TEST_STATE__ = {
        mockData,
        rowCount: mockData.length,
        enableRowDrag,
        enableFillHandle,
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
  }, [mockData, enableRowDrag, enableFillHandle, scenario, customCount, dataVersion])

  // Create mock schema registry
  const mockSchemaRegistry = useMemo(() => {
    return createMockSchemaRegistry([MOCK_TASK_SCHEMA])
  }, [])

  // Collection ID for localStorage
  const collectionId = `vibegrid-test-drag-drop`

  // Create mock collection for TanStack DB integration
  const mockCollection = useMemo(() => {
    return createMockEntityCollection(collectionId, mockData)
  }, [collectionId, dataVersion])

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
    setMockData(generateMockTasks(count))
    setDataVersion((v) => v + 1)
  }, [])

  // Generate custom count of rows
  const handleGenerate = useCallback((count: number) => {
    setMockData(generateMockTasks(count))
    setDataVersion((v) => v + 1)
  }, [])

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
    setScenario('small')
    setCustomCount(10)
    setEnableRowDrag(true)
    setEnableFillHandle(true)
    setMockData(generateMockTasks(SCENARIOS.small.rowCount))
    setDataVersion((v) => v + 1)
  }, [collectionId])

  // Shuffle rows
  const handleShuffleRows = useCallback(() => {
    setMockData((prev) => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
    setDataVersion((v) => v + 1)
  }, [])

  return (
    <>
      <Header>
        <h1 className="text-xl font-semibold">VibeGrid Test - Drag & Drop</h1>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full" data-testid="vibegrid-test-drag-drop">
          <div className="pb-4">
            <h2 className="text-2xl font-bold tracking-tight">Mock VibeGrid Drag & Drop Test</h2>
            <p className="text-muted-foreground">
              Test VibeGrid drag & drop with mock data - {mockData.length} rows
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

          <DragDropControls
            enableRowDrag={enableRowDrag}
            onToggleRowDrag={() => setEnableRowDrag((prev) => !prev)}
            enableFillHandle={enableFillHandle}
            onToggleFillHandle={() => setEnableFillHandle((prev) => !prev)}
            onShuffleRows={handleShuffleRows}
          />

          <div className="flex-1 w-full" data-testid="vibegrid-container">
            <VibeGridStoreProvider
              key={dataVersion}
              tableId={`mock-test-drag-drop-${dataVersion}`}
              entityType="MockTask"
              schemaRegistryOverride={mockSchemaRegistry}
              collectionOverride={mockCollection}
            >
              <VibeGrid
                tableId={`mock-test-drag-drop-${dataVersion}`}
                entityType="MockTask"
                height={600}
                enableSelectionColumn={true}
                enableSorting={true}
                data-testid="vibegrid-drag-drop"
              />
            </VibeGridStoreProvider>
          </div>
        </div>
      </Main>
    </>
  )
}
