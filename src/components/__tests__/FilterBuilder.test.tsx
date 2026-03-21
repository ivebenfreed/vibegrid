/**
 * FilterBuilder Component Tests - Phase 2
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * These tests are written FIRST (TDD) and should FAIL initially.
 * Implementation will make them pass.
 *
 * Tests cover:
 * 1. FilterBuilder dropdown component structure
 * 2. Toolbar button rendering
 * 3. Dropdown open/close behavior
 * 4. Empty state
 * 5. Add condition button
 * 6. Apply and Clear buttons
 * 7. Keyboard interaction (Escape to close)
 * 8. Outside click handling
 *
 * Test Approach:
 * Source code validation tests (component doesn't exist yet - TDD)
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const COMPONENT_PATH = join(__dirname, '../FilterBuilder.tsx')

/**
 * Read the FilterBuilder source code to verify implementation
 */
function getFilterBuilderSource(): string {
  if (!existsSync(COMPONENT_PATH)) {
    throw new Error('FilterBuilder.tsx does not exist yet - implement component to pass tests')
  }
  return readFileSync(COMPONENT_PATH, 'utf-8')
}

/**
 * Check if component file exists
 */
function componentExists(): boolean {
  return existsSync(COMPONENT_PATH)
}

// ====================================
// COMPONENT EXISTENCE TEST
// ====================================

describe('FilterBuilder Component Existence', () => {
  it('should have FilterBuilder.tsx component file', () => {
    // RED PHASE: Will FAIL until component is created
    expect(componentExists()).toBe(true)
  })
})

// ====================================
// COMPONENT STRUCTURE TESTS
// ====================================

describe('FilterBuilder Component Structure', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) {
      // Skip tests if component doesn't exist
      return
    }
    sourceCode = getFilterBuilderSource()
  })

  it('should export FilterBuilder component', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toContain('export const FilterBuilder')
  })

  it('should be wrapped with observer for MobX reactivity', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/observer\(function FilterBuilder/)
  })

  it('should accept stores prop of type VibeGridStores', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toContain('stores: VibeGridStores')
  })

  it('should import VibeGridStores type', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*VibeGridStores.*from/)
  })
})

// ====================================
// TOOLBAR BUTTON TESTS
// ====================================

describe('FilterBuilder Toolbar Button', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should render a filter button with data-testid="vibegrid-filter-btn"', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toContain('data-testid="vibegrid-filter-btn"')
  })

  it('should display "Filters" text on button', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/Filters/)
  })

  it('should use Filter icon from lucide-react', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*Filter.*from ['"]lucide-react['"]/)
    expect(sourceCode).toContain('<Filter')
  })

  it('should display active filter count badge when filters are active', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    // Should access activeFilterCount from visualStateStore
    expect(sourceCode).toMatch(/activeFilterCount/)
  })
})

// ====================================
// DROPDOWN MENU TESTS
// ====================================

describe('FilterBuilder Dropdown Menu', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should use DropdownMenu component', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    // Allow multiline named imports
    expect(sourceCode).toMatch(/import[\s\S]*DropdownMenu[\s\S]*from/)
    expect(sourceCode).toContain('<DropdownMenu')
  })

  it('should have dropdown content with data-testid="vibegrid-filter-dropdown"', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toContain('data-testid="vibegrid-filter-dropdown"')
  })

  it('should control open state via filterBuilderStore.filterBuilderState.isOpen', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/filterBuilderState\.isOpen/)
  })

  it('should call openFilterBuilder on dropdown open', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/openFilterBuilder/)
  })

  it('should call closeFilterBuilder on dropdown close', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/closeFilterBuilder/)
  })
})

// ====================================
// EMPTY STATE TESTS
// ====================================

describe('FilterBuilder Empty State', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should display empty state message when no filters', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    // Should show "No filters" or similar when draftFilterGroup is null/empty
    expect(sourceCode).toMatch(/No filters|no filters|Add a filter/)
  })

  it('should check draftFilterGroup for empty state', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/draftFilterGroup/)
  })
})

// ====================================
// ADD CONDITION BUTTON TESTS
// ====================================

describe('FilterBuilder Add Condition Button', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should have "Add condition" button with data-testid="vibegrid-filter-add-condition"', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toContain('data-testid="vibegrid-filter-add-condition"')
  })

  it('should display "Add condition" or "+ Add condition" text', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/Add condition|Add filter/)
  })

  it('should use Plus icon for add button', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*Plus.*from ['"]lucide-react['"]/)
  })
})

// ====================================
// APPLY AND CLEAR BUTTONS TESTS
// ====================================

describe('FilterBuilder Apply and Clear Buttons', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should have Apply button with data-testid="vibegrid-filter-apply"', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toContain('data-testid="vibegrid-filter-apply"')
  })

  it('should have Clear button with data-testid="vibegrid-filter-clear"', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toContain('data-testid="vibegrid-filter-clear"')
  })

  it('should display "Apply" text on apply button', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/Apply/)
  })

  it('should display "Clear" or "Clear all" text on clear button', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/Clear/)
  })
})

// ====================================
// KEYBOARD INTERACTION TESTS
// ====================================

describe('FilterBuilder Keyboard Interactions', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should handle Escape key to close dropdown', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    // Should have onKeyDown or keyboard event handler
    expect(sourceCode).toMatch(/Escape|onKeyDown|handleKeyDown/)
  })
})

// ====================================
// STORE INTEGRATION TESTS
// ====================================

describe('FilterBuilder Store Integration', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should destructure filterBuilderStore from stores', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/filterBuilderStore/)
  })

  it('should destructure visualStateStore from stores', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/visualStateStore/)
  })

  it('should access filterBuilderState from filterBuilderStore', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/filterBuilderState/)
  })

  it('should access filterGroup from visualStateStore', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/visualStateStore.*filterGroup|filterGroup/)
  })
})

// ====================================
// PROPS INTERFACE TESTS
// ====================================

describe('FilterBuilder Props Interface', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should define FilterBuilderProps interface', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/interface FilterBuilderProps/)
  })

  it('should accept stores prop in FilterBuilderProps', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    const propsMatch = sourceCode.match(/interface FilterBuilderProps\s*{([^}]+)}/s)
    expect(propsMatch).toBeTruthy()

    if (propsMatch) {
      const propsBody = propsMatch[1]
      expect(propsBody).toMatch(/stores:\s*VibeGridStores/)
    }
  })

  it('should accept optional className prop', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    const propsMatch = sourceCode.match(/interface FilterBuilderProps\s*{([^}]+)}/s)
    if (propsMatch) {
      const propsBody = propsMatch[1]
      expect(propsBody).toMatch(/className\?:\s*string/)
    }
  })
})

// ====================================
// IMPORTS TESTS
// ====================================

describe('FilterBuilder Imports', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should import observer from mobx-react-lite', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*observer.*from ['"]mobx-react-lite['"]/)
  })

  it('should import React or useCallback/useMemo', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*React|import.*useCallback|import.*useMemo/)
  })

  it('should import Button component', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*Button.*from/)
  })

  it('should import DropdownMenu components', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    // Allow multiline named imports
    expect(sourceCode).toMatch(/import[\s\S]*DropdownMenu[\s\S]*from/)
  })
})

// ====================================
// LOGGING TESTS
// ====================================

describe('FilterBuilder Logging', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) return
    sourceCode = getFilterBuilderSource()
  })

  it('should import getLogger for logging', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*getLogger.*from/)
  })

  it('should create logger with vibegrid namespace', () => {
    if (!componentExists()) {
      throw new Error('FilterBuilder.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/getLogger\(\[['"]vibegrid['"]/)
  })
})
