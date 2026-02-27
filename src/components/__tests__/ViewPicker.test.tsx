/**
 * ViewPicker Component Tests
 *
 * GH#1570 P2.3: Entity View Customization - View Picker UI
 * GH#1570 P2.4: Sharing & Permissions
 *
 * Tests cover:
 * 1. Component existence and exports
 * 2. Correct imports (Popover-based, not DropdownMenu for main picker)
 * 3. Props interface completeness
 * 4. Section structure (Pinned, My Views, Shared Views)
 * 5. Feature integrations (badge, star, context menu)
 * 6. Data fetching pattern
 * 7. Permission enforcement (P2.4)
 * 8. Lock icon for locked views (P2.4)
 * 9. Duplicate to My Views action (P2.4)
 * 10. onDuplicateView prop (P2.4)
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

// ====================================
// P2.4: PERMISSION ENFORCEMENT TESTS
// ====================================

describe('ViewPicker Permission Enforcement (P2.4)', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should import Lock icon for locked view indicator', () => {
    expect(source).toContain('Lock')
    expect(source).toMatch(/import\s*\{[^}]*Lock[^}]*\}\s*from\s*'lucide-react'/)
  })

  it('should render Lock icon for locked views with data-testid', () => {
    expect(source).toContain('view-picker-lock-')
    expect(source).toContain('isLocked')
  })

  it('should compute canRename based on lock status and role', () => {
    // Locked views: only admin can rename. Non-locked: owner can rename
    expect(source).toContain('canRename')
    expect(source).toMatch(/isLocked\s*\?\s*isAdmin\s*:\s*isOwner/)
  })

  it('should conditionally show Rename based on canRename', () => {
    expect(source).toContain('canRename')
    expect(source).toContain('Rename')
  })

  it('should have onDuplicateView optional prop in ViewPickerProps', () => {
    expect(source).toContain('onDuplicateView?:')
  })

  it('should have handleDuplicate that calls onDuplicateView or creates via API', () => {
    expect(source).toContain('handleDuplicate')
    expect(source).toContain('onDuplicateView')
    // Should create a copy with "(copy)" suffix via API as fallback
    expect(source).toContain('(copy)')
    expect(source).toContain("visibility: 'personal'")
  })

  it('should call handleDuplicate from ViewItem onDuplicate prop', () => {
    // Each ViewItem should wire onDuplicate to handleDuplicate(view)
    expect(source).toContain('handleDuplicate(view)')
  })

  it('should show duplicate action with data-testid', () => {
    expect(source).toContain('view-picker-duplicate-')
  })

  it('should show rename action with data-testid', () => {
    expect(source).toContain('view-picker-rename-')
  })

  it('should show delete action with data-testid', () => {
    expect(source).toContain('view-picker-delete-')
  })

  it('should show set-default action with data-testid', () => {
    expect(source).toContain('view-picker-set-default-')
  })

  it('should compute canDelete as isOwner or isAdmin', () => {
    expect(source).toContain('const canDelete = isOwner || isAdmin')
  })

  it('should compute canSetDefault for admin on shared/locked views', () => {
    expect(source).toContain('canSetDefault')
    expect(source).toMatch(/isAdmin && \(view\.visibility === 'shared' \|\| isLocked\)/)
  })

  it('should show success toast on duplicate', () => {
    expect(source).toContain('View duplicated to My Views')
  })

  it('should call orpcClient.dataforge.views.create for duplication', () => {
    expect(source).toContain('orpcClient.dataforge.views.create')
  })
})

// ====================================
// P2.5: PIN REORDER SUPPORT TESTS
// ====================================

describe('ViewPicker Pin Reorder Support (P2.5)', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should have handleReorderPins callback', () => {
    expect(source).toContain('handleReorderPins')
  })

  it('should call orpcClient.dataforge.views.reorderPins', () => {
    expect(source).toContain('orpcClient.dataforge.views.reorderPins')
  })

  it('should perform optimistic update on pins state', () => {
    // Should update pins state before API call
    expect(source).toContain('setPins((prev) =>')
    expect(source).toContain('pin_order: newOrder.indexOf(p.view_id)')
  })

  it('should rollback pins on API failure', () => {
    // Should restore previous pins if API call fails
    expect(source).toContain('setPins(prevPins)')
  })

  it('should show error toast on reorder failure', () => {
    expect(source).toContain('Failed to reorder')
  })

  it('should sort pins by pin_order before computing new order', () => {
    expect(source).toContain('sort((a, b) => a.pin_order - b.pin_order)')
  })

  it('should pass onReorder prop to pinned ViewItems', () => {
    expect(source).toContain('onReorder={(direction) => handleReorderPins(view.id, direction)')
  })

  it('should have onReorder as optional prop in ViewItemProps', () => {
    expect(source).toContain("onReorder?: (direction: 'up' | 'down') => void")
  })

  it('should handle Alt+ArrowUp keyboard shortcut for reorder', () => {
    expect(source).toContain("e.key === 'ArrowUp'")
    expect(source).toContain("onReorder('up')")
  })

  it('should handle Alt+ArrowDown keyboard shortcut for reorder', () => {
    expect(source).toContain("e.key === 'ArrowDown'")
    expect(source).toContain("onReorder('down')")
  })

  it('should check e.altKey before handling reorder keyboard shortcuts', () => {
    expect(source).toContain('e.altKey')
  })

  it('should preventDefault on reorder keyboard events', () => {
    expect(source).toContain('e.preventDefault()')
  })

  it('should have onKeyDown handler on the view name button', () => {
    expect(source).toContain('onKeyDown={(e) =>')
  })

  it('should only trigger keyboard reorder when onReorder is defined', () => {
    // Guard: if (onReorder && e.altKey)
    expect(source).toContain('if (onReorder && e.altKey)')
  })

  it('should swap items in the pin order array', () => {
    expect(source).toContain('[newOrder[currentIndex], newOrder[newIndex]]')
  })

  it('should send new order to reorderPins API as view_ids', () => {
    expect(source).toContain('view_ids: newOrder')
  })
})
