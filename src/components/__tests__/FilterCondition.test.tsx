/**
 * FilterCondition Component Tests - Phase 3
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * These tests are written FIRST (TDD) and should FAIL initially.
 * Implementation will make them pass.
 *
 * Tests cover:
 * 1. FilterCondition row component structure
 * 2. FilterFieldPicker component (searchable dropdown with columns)
 * 3. FilterOperatorPicker component (field-type aware operators)
 * 4. FilterValueInput component (field-type aware value inputs)
 * 5. Remove button functionality
 *
 * Test Approach:
 * Source code validation tests (components don't exist yet - TDD)
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Component paths
const FILTER_CONDITION_PATH = join(__dirname, '../FilterCondition.tsx')
const FILTER_FIELD_PICKER_PATH = join(__dirname, '../FilterFieldPicker.tsx')
const FILTER_OPERATOR_PICKER_PATH = join(__dirname, '../FilterOperatorPicker.tsx')
const FILTER_VALUE_INPUT_PATH = join(__dirname, '../FilterValueInput.tsx')

/**
 * Read component source code to verify implementation
 */
function getSource(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist yet - implement component to pass tests`)
  }
  return readFileSync(path, 'utf-8')
}

/**
 * Check if component file exists
 */
function componentExists(path: string): boolean {
  return existsSync(path)
}

// ====================================
// MOCK DATA FOR TYPE VERIFICATION
// ====================================

const mockColumns = [
  { id: 'title', name: 'Title', cellType: 'text' },
  { id: 'status', name: 'Status', cellType: 'status', options: [{ value: 'open', label: 'Open' }] },
  { id: 'priority', name: 'Priority', cellType: 'number' },
  { id: 'due_date', name: 'Due Date', cellType: 'date' },
  { id: 'completed', name: 'Completed', cellType: 'boolean' },
  { id: 'assignee', name: 'Assignee', cellType: 'user_reference' },
]

// ====================================
// FILTER CONDITION COMPONENT TESTS
// ====================================

describe('FilterCondition Component Existence', () => {
  it('should have FilterCondition.tsx component file', () => {
    // RED PHASE: Will FAIL until component is created
    expect(componentExists(FILTER_CONDITION_PATH)).toBe(true)
  })
})

describe('FilterCondition Component Structure', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_CONDITION_PATH)) return
    sourceCode = getSource(FILTER_CONDITION_PATH)
  })

  it('should export FilterCondition component', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toContain('export const FilterCondition')
  })

  it('should be wrapped with observer for MobX reactivity', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/observer\(function FilterCondition/)
  })

  it('should accept condition, index, columns, onChange, and onRemove props', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toContain('interface FilterConditionProps')
    expect(sourceCode).toMatch(/condition:\s*FilterConditionType/)
    expect(sourceCode).toMatch(/index:\s*number/)
    expect(sourceCode).toMatch(/columns:\s*Column/)
    expect(sourceCode).toMatch(/onChange:\s*\(/)
    expect(sourceCode).toMatch(/onRemove:\s*\(/)
  })

  it('should render a condition row container', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // Should have a container div with data-testid
    expect(sourceCode).toMatch(/data-testid="vibegrid-filter-condition-/)
  })

  it('should render FilterFieldPicker sub-component', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toContain('<FilterFieldPicker')
  })

  it('should render FilterOperatorPicker sub-component', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toContain('<FilterOperatorPicker')
  })

  it('should render FilterValueInput sub-component', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toContain('<FilterValueInput')
  })

  it('should have remove button with data-testid containing index', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // data-testid should include dynamic index: data-testid={`vibegrid-filter-remove-${index}`}
    expect(sourceCode).toMatch(/data-testid=\{[`'"]vibegrid-filter-remove-/)
  })

  it('should call onRemove when remove button clicked', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/onClick.*onRemove|onRemove.*onClick/)
  })

  it('should use X or Trash icon for remove button', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/<(X|Trash|Trash2)/)
  })

  it('should import observer from mobx-react-lite', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*observer.*from ['"]mobx-react-lite['"]/)
  })

  it('should import FilterCondition type from filter-types', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*FilterCondition.*from.*filter-types/)
  })
})

// ====================================
// FILTER FIELD PICKER TESTS
// ====================================

describe('FilterFieldPicker Component Existence', () => {
  it('should have FilterFieldPicker.tsx component file', () => {
    expect(componentExists(FILTER_FIELD_PICKER_PATH)).toBe(true)
  })
})

describe('FilterFieldPicker Component Structure', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) return
    sourceCode = getSource(FILTER_FIELD_PICKER_PATH)
  })

  it('should export FilterFieldPicker component', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    expect(sourceCode).toContain('export const FilterFieldPicker')
  })

  it('should accept columns, selectedField, index, and onChange props', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    expect(sourceCode).toContain('interface FilterFieldPickerProps')
    expect(sourceCode).toMatch(/columns:\s*Column/)
    expect(sourceCode).toMatch(/selectedField:\s*string/)
    expect(sourceCode).toMatch(/index:\s*number/)
    expect(sourceCode).toMatch(/onChange:\s*\(/)
  })

  it('should have data-testid with index', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/data-testid=\{[`'"]vibegrid-filter-field-/)
  })

  it('should implement searchable dropdown using Combobox or Popover+Command', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    // Should use either Combobox or Popover+Command pattern for searchable dropdown
    expect(sourceCode).toMatch(/Popover|Combobox|Command/)
  })

  it('should have search input for filtering columns', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/CommandInput|searchValue|filterValue|filter.*column/)
  })

  it('should display column name in dropdown options', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/column\.name|col\.name/)
  })

  it('should filter columns based on search text', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/filter|Filter|includes|toLowerCase/)
  })

  it('should call onChange with selected field', () => {
    if (!componentExists(FILTER_FIELD_PICKER_PATH)) {
      throw new Error('FilterFieldPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/onChange\(.*\)|onSelect.*onChange/)
  })
})

// ====================================
// FILTER OPERATOR PICKER TESTS
// ====================================

describe('FilterOperatorPicker Component Existence', () => {
  it('should have FilterOperatorPicker.tsx component file', () => {
    expect(componentExists(FILTER_OPERATOR_PICKER_PATH)).toBe(true)
  })
})

describe('FilterOperatorPicker Component Structure', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) return
    sourceCode = getSource(FILTER_OPERATOR_PICKER_PATH)
  })

  it('should export FilterOperatorPicker component', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    expect(sourceCode).toContain('export const FilterOperatorPicker')
  })

  it('should accept fieldType, selectedOperator, index, and onChange props', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    expect(sourceCode).toContain('interface FilterOperatorPickerProps')
    expect(sourceCode).toMatch(/fieldType:\s*string/)
    expect(sourceCode).toMatch(/selectedOperator:\s*FilterOperator/)
    expect(sourceCode).toMatch(/index:\s*number/)
    expect(sourceCode).toMatch(/onChange:\s*\(/)
  })

  it('should have data-testid with index', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/data-testid=\{[`'"]vibegrid-filter-operator-/)
  })

  it('should use Select component for operator dropdown', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*Select.*from/)
    expect(sourceCode).toContain('<Select')
  })
})

describe('FilterOperatorPicker Operators by Field Type', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) return
    sourceCode = getSource(FILTER_OPERATOR_PICKER_PATH)
  })

  it('should define text field operators', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    // Text fields should support: equals, not_equals, contains, not_contains, starts_with, ends_with, is_empty, is_not_empty, regex
    expect(sourceCode).toContain("'equals'")
    expect(sourceCode).toContain("'not_equals'")
    expect(sourceCode).toContain("'contains'")
    expect(sourceCode).toContain("'not_contains'")
    expect(sourceCode).toContain("'starts_with'")
    expect(sourceCode).toContain("'ends_with'")
    expect(sourceCode).toContain("'is_empty'")
    expect(sourceCode).toContain("'is_not_empty'")
    expect(sourceCode).toContain("'regex'")
  })

  it('should define number field operators', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    // Number fields should support: equals, not_equals, greater_than, less_than, is_empty, is_not_empty
    expect(sourceCode).toContain("'greater_than'")
    expect(sourceCode).toContain("'less_than'")
  })

  it('should define date field operators', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    // Date fields should support: equals, not_equals, greater_than (after), less_than (before), is_empty, is_not_empty
    // Same as number operators - already checked above
    expect(sourceCode).toMatch(/date.*greater_than|greater_than.*date/i)
  })

  it('should define boolean field operators', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    // Boolean fields should support: equals, is_empty, is_not_empty
    expect(sourceCode).toMatch(/boolean|BOOLEAN/)
  })

  it('should define status/enum field operators', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    // Status/enum fields should support: equals, not_equals, in, not_in, is_empty, is_not_empty
    expect(sourceCode).toContain("'in'")
    expect(sourceCode).toContain("'not_in'")
  })

  it('should define relationship field operators', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    // Relationship fields (user_reference, entity_reference) should support same as status: equals, not_equals, in, not_in, is_empty, is_not_empty
    expect(sourceCode).toMatch(/user_reference|entity_reference|relationship/i)
  })

  it('should have getOperatorsForFieldType function or similar', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    // Should have logic to determine operators based on field type
    expect(sourceCode).toMatch(
      /getOperatorsFor|OPERATORS_BY_TYPE|operatorsForType|switch.*fieldType|fieldType.*switch/,
    )
  })

  it('should export OPERATORS_BY_FIELD_TYPE constant or getOperatorsForFieldType function', () => {
    if (!componentExists(FILTER_OPERATOR_PICKER_PATH)) {
      throw new Error('FilterOperatorPicker.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/export.*OPERATORS|export.*getOperators/)
  })
})

// ====================================
// FILTER VALUE INPUT TESTS
// ====================================

describe('FilterValueInput Component Existence', () => {
  it('should have FilterValueInput.tsx component file', () => {
    expect(componentExists(FILTER_VALUE_INPUT_PATH)).toBe(true)
  })
})

describe('FilterValueInput Component Structure', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) return
    sourceCode = getSource(FILTER_VALUE_INPUT_PATH)
  })

  it('should export FilterValueInput component', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('export const FilterValueInput')
  })

  it('should accept fieldType, column, operator, value, index, and onChange props', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('interface FilterValueInputProps')
    expect(sourceCode).toMatch(/fieldType:\s*string/)
    expect(sourceCode).toMatch(/column:\s*Column/)
    expect(sourceCode).toMatch(/operator:\s*FilterOperator/)
    expect(sourceCode).toMatch(/value:\s*any/)
    expect(sourceCode).toMatch(/index:\s*number/)
    expect(sourceCode).toMatch(/onChange:\s*\(/)
  })

  it('should have data-testid with index', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/data-testid=\{[`'"]vibegrid-filter-value-/)
  })
})

describe('FilterValueInput Field-Type Specific Inputs', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) return
    sourceCode = getSource(FILTER_VALUE_INPUT_PATH)
  })

  it('should render text input for text fields', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/<Input|<input|type="text"/)
  })

  it('should render number input for number fields', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/type="number"|type='number'|inputMode="numeric"/)
  })

  it('should render date picker for date fields', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/type="date"|DatePicker|Calendar|Popover.*Calendar/)
  })

  it('should render toggle/checkbox for boolean fields', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/Checkbox|Switch|Toggle|type="checkbox"/)
  })

  it('should render option picker for status/enum fields', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    // Should use Select or Combobox for enum/status fields
    expect(sourceCode).toMatch(/Select|Combobox|options\.map|column\.options/)
  })

  it('should render entity picker for relationship fields', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    // Should handle user_reference and entity_reference with appropriate picker
    expect(sourceCode).toMatch(/entity_reference|user_reference|EntityPicker|UserPicker|Combobox/)
  })

  it('should hide value input when operator is is_empty or is_not_empty', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    // When operator is is_empty or is_not_empty, no value input is needed
    expect(sourceCode).toMatch(/is_empty|is_not_empty|operator.*empty|null.*return/)
  })

  it('should support multiple value selection for in/not_in operators', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    // in/not_in operators require multi-select
    expect(sourceCode).toMatch(/in'|not_in|multiple|multi.*select|isMulti/)
  })

  it('should have switch/if logic for different field types', () => {
    if (!componentExists(FILTER_VALUE_INPUT_PATH)) {
      throw new Error('FilterValueInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/switch.*fieldType|if.*fieldType|fieldType.*===/)
  })
})

// ====================================
// INTEGRATION TESTS (Props Flow)
// ====================================

describe('FilterCondition Props Integration', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_CONDITION_PATH)) return
    sourceCode = getSource(FILTER_CONDITION_PATH)
  })

  it('should pass correct props to FilterFieldPicker', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // FilterFieldPicker should receive columns and selectedField
    expect(sourceCode).toMatch(/FilterFieldPicker.*columns=/)
    expect(sourceCode).toMatch(/FilterFieldPicker.*selectedField=|FilterFieldPicker.*value=/)
  })

  it('should pass correct props to FilterOperatorPicker', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // FilterOperatorPicker should receive fieldType and selectedOperator
    expect(sourceCode).toMatch(/FilterOperatorPicker.*fieldType=|FilterOperatorPicker.*type=/)
    expect(sourceCode).toMatch(
      /FilterOperatorPicker.*selectedOperator=|FilterOperatorPicker.*operator=/,
    )
  })

  it('should pass correct props to FilterValueInput', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // FilterValueInput should receive column, operator, and value
    expect(sourceCode).toMatch(/FilterValueInput.*column=/)
    expect(sourceCode).toMatch(/FilterValueInput.*operator=/)
    expect(sourceCode).toMatch(/FilterValueInput.*value=/)
  })

  it('should handle field change and reset operator/value when field type changes', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // When field changes, if the field type is different, operator should reset to default
    expect(sourceCode).toMatch(/handleFieldChange|onFieldChange|field.*change/)
  })

  it('should handle operator change and potentially reset value for certain operators', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/handleOperatorChange|onOperatorChange|operator.*change/)
  })

  it('should call parent onChange with updated condition', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // Should call onChange prop when any part of condition changes
    expect(sourceCode).toMatch(/onChange\(\{.*\}\)|onChange\(.*condition/)
  })
})

// ====================================
// LOGGING TESTS
// ====================================

describe('FilterCondition Logging', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_CONDITION_PATH)) return
    sourceCode = getSource(FILTER_CONDITION_PATH)
  })

  it('should import getLogger for logging', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*getLogger.*from/)
  })

  it('should create logger with vibegrid namespace', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/getLogger\(\[['"]vibegrid['"]/)
  })
})

// ====================================
// TYPE IMPORTS TESTS
// ====================================

describe('FilterCondition Type Imports', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists(FILTER_CONDITION_PATH)) return
    sourceCode = getSource(FILTER_CONDITION_PATH)
  })

  it('should import Column type from types', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*Column.*from/)
  })

  it('should import FilterCondition type from filter-types (aliased)', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    // Should import as FilterConditionType or similar to avoid naming conflict with component
    expect(sourceCode).toMatch(
      /import.*FilterCondition.*as.*from.*filter-types|import.*type.*\{.*FilterCondition.*as/,
    )
  })

  it('should import FilterOperator type from types', () => {
    if (!componentExists(FILTER_CONDITION_PATH)) {
      throw new Error('FilterCondition.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*FilterOperator.*from/)
  })
})
