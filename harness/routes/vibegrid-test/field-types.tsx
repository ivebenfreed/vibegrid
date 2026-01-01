/**
 * VibeGrid Field Type Test Route
 *
 * Test route for VibeGrid with all field types - no API calls required.
 * Used for E2E testing of field type-specific rendering and editing behaviors.
 *
 * @feature GH#488
 * @spec planning/specs/488-vibegrid-e2e-comprehensive-field-type-an.md
 */

import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from '@/shared/components/layout/header'
import { Main } from '@/shared/components/layout/main'
import { createMockSchemaRegistry } from '@/shared/data/mock/mock-schema-registry'
import { clearMockStorage, createMockEntityCollection } from '@/shared/data/db/collections/mock-collections'
import { VibeGrid } from '@/systems/vibegrid'
import { VibeGridStoreProvider } from '@/systems/vibegrid/stores/context'
import {
  MockDataControls,
  SCENARIOS,
  type ScenarioName,
} from '@/systems/vibegrid/components/MockDataControls'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'

import { FIELD_TYPE_TEST_SCHEMA, HIGH_PRIORITY_FIELDS, FIELD_CATEGORIES } from './_utils/field-type-schema'
import {
  generateFieldTypeTestEntities,
  generateFieldTypeTestFixtures,
  type FieldTypeTestEntity,
} from './_utils/field-type-generators'

export const Route = createFileRoute('/_authenticated/debug/vibegrid-test/field-types')({
  beforeLoad: async () => {
    // Gate behind DEV mode only
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
  component: FieldTypeTestRoute,
})

type DataMode = 'random' | 'fixtures'

/**
 * Main component for field type testing
 */
function FieldTypeTestRoute() {
  const [scenario, setScenario] = useState<ScenarioName>('small')
  const [customCount, setCustomCount] = useState(10)
  const [dataVersion, setDataVersion] = useState(0)
  const [dataMode, setDataMode] = useState<DataMode>('random')
  const [mockData, setMockData] = useState<FieldTypeTestEntity[]>(() =>
    generateFieldTypeTestEntities(SCENARIOS.small.rowCount, { seed: 12345 })
  )

  // Expose test state for E2E testing
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as any).__VIBEGRID_TEST_STATE__ = {
        mockData,
        rowCount: mockData.length,
        scenario,
        customCount,
        dataVersion,
        dataMode,
        // Field type specific info
        fieldCategories: FIELD_CATEGORIES,
        highPriorityFields: HIGH_PRIORITY_FIELDS,
        schema: FIELD_TYPE_TEST_SCHEMA,
      }
    }
    return () => {
      if (import.meta.env.DEV) {
        delete (window as any).__VIBEGRID_TEST_STATE__
      }
    }
  }, [mockData, scenario, customCount, dataVersion, dataMode])

  // Create mock schema registry with field type schema
  const mockSchemaRegistry = useMemo(() => {
    return createMockSchemaRegistry([FIELD_TYPE_TEST_SCHEMA])
  }, [])

  // Collection ID for localStorage
  const collectionId = `vibegrid-test-field-types`

  // Create mock collection for TanStack DB integration
  const mockCollection = useMemo(() => {
    return createMockEntityCollection(collectionId, mockData as any)
  }, [collectionId, dataVersion])

  // Add a new row
  const handleAddRow = useCallback(() => {
    const newEntity = generateFieldTypeTestEntities(1, { seed: Date.now() })[0]
    newEntity.name = `New Item ${mockData.length + 1}`
    setMockData((prev) => [...prev, newEntity])
    setDataVersion((v) => v + 1)
  }, [mockData.length])

  // Load a scenario
  const handleLoadScenario = useCallback((newScenario: ScenarioName) => {
    setScenario(newScenario)
    setDataMode('random')
    const count = SCENARIOS[newScenario].rowCount
    setCustomCount(count)
    setMockData(generateFieldTypeTestEntities(count, { seed: 12345 + count }))
    setDataVersion((v) => v + 1)
  }, [])

  // Generate custom count of rows
  const handleGenerate = useCallback((count: number) => {
    setDataMode('random')
    setMockData(generateFieldTypeTestEntities(count, { seed: Date.now() }))
    setDataVersion((v) => v + 1)
  }, [])

  // Clear all data
  const handleClear = useCallback(() => {
    setScenario('empty')
    setDataMode('random')
    setCustomCount(0)
    setMockData([])
    setDataVersion((v) => v + 1)
  }, [])

  // Reset to defaults
  const handleReset = useCallback(() => {
    clearMockStorage(collectionId)
    setScenario('small')
    setDataMode('random')
    setCustomCount(10)
    setMockData(generateFieldTypeTestEntities(SCENARIOS.small.rowCount, { seed: 12345 }))
    setDataVersion((v) => v + 1)
  }, [collectionId])

  // Load test fixtures (known values for E2E assertions)
  const handleLoadFixtures = useCallback(() => {
    setDataMode('fixtures')
    setScenario('empty') // Not a standard scenario
    const fixtures = generateFieldTypeTestFixtures()
    setCustomCount(fixtures.length)
    setMockData(fixtures)
    setDataVersion((v) => v + 1)
  }, [])

  return (
    <>
      <Header>
        <h1 className="text-xl font-semibold">VibeGrid Test - Field Types</h1>
      </Header>
      <Main fluid>
        <div className="flex flex-col h-full w-full" data-testid="vibegrid-test-field-types">
          <div className="pb-4">
            <h2 className="text-2xl font-bold tracking-tight">Field Type Test</h2>
            <p className="text-muted-foreground">
              Test all 16 field types - {mockData.length} rows
              {dataMode === 'fixtures' && (
                <Badge variant="secondary" className="ml-2">Fixtures Mode</Badge>
              )}
            </p>
          </div>

          {/* Standard controls */}
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

          {/* Field type specific controls */}
          <div className="flex items-center gap-2 mb-4" data-testid="field-type-controls">
            <Button
              variant={dataMode === 'fixtures' ? 'default' : 'outline'}
              size="sm"
              onClick={handleLoadFixtures}
              data-testid="load-fixtures-btn"
            >
              Load Test Fixtures
            </Button>
            <div className="text-sm text-muted-foreground">
              High priority fields:
              {HIGH_PRIORITY_FIELDS.map((field) => (
                <Badge key={field} variant="outline" className="ml-1">
                  {field}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex-1 w-full" data-testid="vibegrid-container">
            <VibeGridStoreProvider
              key={dataVersion}
              tableId={`field-type-test-${dataVersion}`}
              entityType="FieldTypeTest"
              schemaRegistryOverride={mockSchemaRegistry}
              collectionOverride={mockCollection}
            >
              <VibeGrid
                tableId={`field-type-test-${dataVersion}`}
                entityType="FieldTypeTest"
                height={600}
                enableSelectionColumn={true}
                enableGrouping={true}
                enableFiltering={true}
                enableSorting={true}
                data-testid="vibegrid-field-types"
              />
            </VibeGridStoreProvider>
          </div>

          {/* Field type legend */}
          <div className="mt-4 p-4 bg-muted rounded-lg" data-testid="field-type-legend">
            <h3 className="font-semibold mb-2">Field Types in Schema</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <strong>Text:</strong>
                <ul className="list-disc list-inside text-muted-foreground">
                  {FIELD_CATEGORIES.text.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
              <div>
                <strong>Numeric:</strong>
                <ul className="list-disc list-inside text-muted-foreground">
                  {FIELD_CATEGORIES.numeric.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
              <div>
                <strong>Date/Time:</strong>
                <ul className="list-disc list-inside text-muted-foreground">
                  {FIELD_CATEGORIES.datetime.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
              <div>
                <strong>Choice:</strong>
                <ul className="list-disc list-inside text-muted-foreground">
                  {FIELD_CATEGORIES.choice.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Main>
    </>
  )
}
