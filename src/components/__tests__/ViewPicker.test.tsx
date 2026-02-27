/**
 * ViewPicker Component Tests
 *
 * GH#1570 P2.3: Entity View Customization - View Picker UI
 *
 * Tests cover:
 * 1. Component existence and exports
 * 2. Correct imports (Popover-based, not DropdownMenu for main picker)
 * 3. Props interface completeness
 * 4. Section structure (Pinned, My Views, Shared Views)
 * 5. Feature integrations (badge, star, context menu)
 * 6. Data fetching pattern
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const COMPONENT_PATH = join(__dirname, '../ViewPicker.tsx')

function getSourceCode(): string {
  if (!existsSync(COMPONENT_PATH)) {
    throw new Error('ViewPicker.tsx does not exist yet')
  }
  return readFileSync(COMPONENT_PATH, 'utf-8')
}

function componentExists(): boolean {
  return existsSync(COMPONENT_PATH)
}

// ====================================
// COMPONENT EXISTENCE
// ====================================

describe('ViewPicker Component Existence', () => {
  it('should have ViewPicker.tsx component file', () => {
    expect(componentExists()).toBe(true)
  })
})

// ====================================
// STRUCTURE TESTS
// ====================================

describe('ViewPicker Component Structure', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should export ViewPicker as named export', () => {
    expect(source).toContain('export const ViewPicker')
  })

  it('should export EntityViewRow type', () => {
    expect(source).toContain('export interface EntityViewRow')
  })

  it('should export EntityViewPinRow type', () => {
    expect(source).toContain('export interface EntityViewPinRow')
  })

  it('should export ViewPickerProps interface', () => {
    expect(source).toContain('export interface ViewPickerProps')
  })

  it('should be wrapped with observer from mobx-react-lite', () => {
    expect(source).toContain("import { observer } from 'mobx-react-lite'")
    expect(source).toContain('observer(function ViewPicker')
  })
})

// ====================================
// IMPORTS TESTS
// ====================================

describe('ViewPicker Imports', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should use Popover for main picker (not DropdownMenu)', () => {
    expect(source).toContain("from '@/shared/components/ui/popover'")
    expect(source).toContain('Popover')
    expect(source).toContain('PopoverTrigger')
    expect(source).toContain('PopoverContent')
  })

  it('should use DropdownMenu for context menu', () => {
    expect(source).toContain("from '@/shared/components/ui/dropdown-menu'")
    expect(source).toContain('DropdownMenu')
    expect(source).toContain('DropdownMenuContent')
    expect(source).toContain('DropdownMenuItem')
  })

  it('should import Badge for default view indicator', () => {
    expect(source).toContain("from '@/shared/components/ui/badge'")
  })

  it('should import Skeleton for loading state', () => {
    expect(source).toContain("from '@/shared/components/ui/skeleton'")
  })

  it('should import Button for trigger', () => {
    expect(source).toContain("from '@/shared/components/ui/button'")
  })

  it('should import orpcClient for data fetching', () => {
    expect(source).toContain("from '@/shared/data/orpc/client'")
  })

  it('should import Star icon for pin indicator', () => {
    expect(source).toContain('Star')
  })

  it('should import ChevronDown for trigger', () => {
    expect(source).toContain('ChevronDown')
  })
})

// ====================================
// PROPS INTERFACE TESTS
// ====================================

describe('ViewPicker Props Interface', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should include entityType prop', () => {
    expect(source).toContain('entityType: string')
  })

  it('should include orgId prop', () => {
    expect(source).toContain('orgId: string')
  })

  it('should include activeViewId prop', () => {
    expect(source).toContain('activeViewId: string | null')
  })

  it('should include hasUnsavedChanges prop', () => {
    expect(source).toContain('hasUnsavedChanges: boolean')
  })

  it('should include currentViewMode prop', () => {
    expect(source).toContain('currentViewMode: ViewMode')
  })

  it('should include onViewSelect callback', () => {
    expect(source).toContain('onViewSelect:')
  })

  it('should include onSaveView callback', () => {
    expect(source).toContain('onSaveView:')
  })

  it('should include onUnsavedSelect callback', () => {
    expect(source).toContain('onUnsavedSelect:')
  })

  it('should include userId prop', () => {
    expect(source).toContain('userId: string')
  })

  it('should include userRole prop', () => {
    expect(source).toContain('userRole: string')
  })
})

// ====================================
// SECTION STRUCTURE TESTS
// ====================================

describe('ViewPicker Section Structure', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should render Pinned section', () => {
    expect(source).toContain('Pinned')
  })

  it('should render My Views section', () => {
    expect(source).toContain('My Views')
  })

  it('should render Shared Views section', () => {
    expect(source).toContain('Shared Views')
  })

  it('should render "(Unsaved)" item in My Views', () => {
    expect(source).toContain('(Unsaved)')
  })

  it('should render "Save Current View" button at bottom', () => {
    expect(source).toContain('Save Current View')
  })

  it('should show empty state message', () => {
    expect(source).toContain('No saved views yet')
  })
})

// ====================================
// DATA FETCHING TESTS
// ====================================

describe('ViewPicker Data Fetching', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should call orpcClient.dataforge.views.list on open', () => {
    expect(source).toContain('orpcClient.dataforge.views.list')
  })

  it('should show loading skeleton during fetch', () => {
    expect(source).toContain('Skeleton')
    expect(source).toContain('view-picker-loading')
  })

  it('should show error state', () => {
    expect(source).toContain('view-picker-error')
  })
})

// ====================================
// CONTEXT MENU TESTS
// ====================================

describe('ViewPicker Context Menu', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should have Rename menu item for owner', () => {
    expect(source).toContain('Rename')
  })

  it('should have Duplicate menu item', () => {
    expect(source).toContain('Duplicate to My Views')
  })

  it('should have Set as Default menu item', () => {
    expect(source).toContain('Set as Default')
  })

  it('should have Delete menu item with destructive variant', () => {
    expect(source).toContain('Delete')
    expect(source).toContain('variant="destructive"')
  })
})

// ====================================
// DATA-TESTID TESTS
// ====================================

describe('ViewPicker Test IDs', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should have trigger test id', () => {
    expect(source).toContain('data-testid="view-picker-trigger"')
  })

  it('should have content test id', () => {
    expect(source).toContain('data-testid="view-picker-content"')
  })

  it('should have unsaved item test id', () => {
    expect(source).toContain('data-testid="view-picker-unsaved"')
  })

  it('should have save button test id', () => {
    expect(source).toContain('data-testid="view-picker-save-button"')
  })
})
