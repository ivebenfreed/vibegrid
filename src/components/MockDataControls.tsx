/**
 * MockDataControls Component
 *
 * Toolbar for managing mock data in VibeGrid test routes.
 * Provides scenario selection, row count display, and data manipulation.
 *
 * @see planning/specs/415-vibegrid-component-testing-framework-wit.md
 */

import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Plus, Trash2, RefreshCw, Download, RotateCcw } from 'lucide-react'

// Scenario types
export type ScenarioName = 'empty' | 'small' | 'medium' | 'large'

export const SCENARIOS: Record<
  ScenarioName,
  { name: string; description: string; rowCount: number }
> = {
  empty: { name: 'Empty', description: 'No data - test empty states', rowCount: 0 },
  small: { name: 'Small', description: 'Few rows - quick interaction testing', rowCount: 10 },
  medium: { name: 'Medium', description: 'Moderate data - typical usage', rowCount: 50 },
  large: { name: 'Large', description: 'Many rows - performance testing', rowCount: 200 },
}

export interface MockDataControlsProps {
  /** Add a new row with default values */
  onAddRow: () => void
  /** Remove a specific row by ID (currently unused in UI, but available for future) */
  onRemoveRow?: (id: string) => void
  /** Clear all data */
  onClear: () => void
  /** Load a predefined scenario */
  onLoadScenario: (scenario: ScenarioName) => void
  /** Reset to default state (clears localStorage) */
  onReset: () => void
  /** Generate custom number of rows */
  onGenerate?: (count: number) => void
  /** Current active scenario */
  currentScenario: ScenarioName
  /** Current row count */
  rowCount: number
  /** Custom row count input value */
  customCount?: number
  /** Custom row count change handler */
  onCustomCountChange?: (count: number) => void
}

/**
 * MockDataControls Component
 *
 * Provides UI controls for managing mock data in test routes.
 * Features:
 * - Scenario dropdown for quick data loading
 * - Add row button
 * - Clear all data
 * - Reset to defaults (clears localStorage)
 * - Custom row count generation
 */
export function MockDataControls({
  onAddRow,
  onClear,
  onLoadScenario,
  onReset,
  onGenerate,
  currentScenario,
  rowCount,
  customCount = 10,
  onCustomCountChange,
}: MockDataControlsProps) {
  return (
    <Card className="mb-4" data-testid="mock-data-controls">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Mock Data Controls</CardTitle>
        <CardDescription>Configure mock data for testing ({rowCount} rows)</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4 items-end">
        {/* Scenario Selection */}
        <div className="space-y-1.5">
          <Label htmlFor="scenario">Scenario</Label>
          <Select value={currentScenario} onValueChange={(v) => onLoadScenario(v as ScenarioName)}>
            <SelectTrigger id="scenario" className="w-[180px]" data-testid="scenario-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SCENARIOS).map(([key, { name, description }]) => (
                <SelectItem key={key} value={key} data-testid={`scenario-${key}`}>
                  {name} - {description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Row Count */}
        {onGenerate && onCustomCountChange && (
          <div className="space-y-1.5">
            <Label htmlFor="custom-count">Custom Count</Label>
            <div className="flex gap-2">
              <Input
                id="custom-count"
                type="number"
                value={customCount}
                onChange={(e) => onCustomCountChange(Number.parseInt(e.target.value) || 0)}
                className="w-24"
                min={0}
                max={1000}
                data-testid="custom-count-input"
              />
              <Button
                variant="outline"
                onClick={() => onGenerate(customCount)}
                data-testid="generate-button"
              >
                <Download className="h-4 w-4 mr-1" />
                Generate
              </Button>
            </div>
          </div>
        )}

        {/* Row Operations */}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={onAddRow} data-testid="add-row-button">
            <Plus className="h-4 w-4 mr-1" />
            Add Row
          </Button>
          <Button variant="outline" onClick={onClear} data-testid="clear-button">
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
          <Button variant="destructive" onClick={onReset} data-testid="reset-button">
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Re-export for convenience
export { SCENARIOS as MockDataScenarios }
