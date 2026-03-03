/**
 * SaveViewDialog Multi-Tab Tests (GH#1677 P2.3)
 *
 * Source-code analysis tests verifying:
 * 1. Multi-tab child entity support (array-based)
 * 2. Add/remove tab entries
 * 3. Max limit enforcement
 * 4. Backward compatibility (single initialChildEntityConfig)
 * 5. onSave callback signature change
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'

const COMPONENT_PATH = join(__dirname, '../SaveViewDialog.tsx')

function getSourceCode(): string {
  if (!existsSync(COMPONENT_PATH)) {
    throw new Error('SaveViewDialog.tsx does not exist yet')
  }
  return readFileSync(COMPONENT_PATH, 'utf-8')
}

function componentExists(): boolean {
  return existsSync(COMPONENT_PATH)
}

// ====================================
// MULTI-TAB SUPPORT
// ====================================

describe('SaveViewDialog Multi-Tab Child Entity Support', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should have onSave callback accepting childEntityTabs array', () => {
    expect(source).toContain('childEntityTabs: ChildEntityConfigInput[]')
  })

  it('should have initialChildEntityTabs prop', () => {
    expect(source).toContain('initialChildEntityTabs?: ChildEntityConfigInput[]')
  })

  it('should keep initialChildEntityConfig for backward compat', () => {
    expect(source).toContain('initialChildEntityConfig?: ChildEntityConfigInput')
  })

  it('should use childTabs state array', () => {
    expect(source).toContain('childTabs')
    expect(source).toContain('setChildTabs')
  })

  it('should have resolveInitialTabs helper for backward compat', () => {
    expect(source).toContain('resolveInitialTabs')
  })
})

// ====================================
// ADD/REMOVE TAB ENTRIES
// ====================================

describe('SaveViewDialog Tab Entry Management', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should have handleAddTab callback', () => {
    expect(source).toContain('handleAddTab')
  })

  it('should have handleRemoveTab callback', () => {
    expect(source).toContain('handleRemoveTab')
  })

  it('should have handleUpdateTab callback', () => {
    expect(source).toContain('handleUpdateTab')
  })

  it('should have Add child tab button', () => {
    expect(source).toContain('Add child tab')
    expect(source).toContain('data-testid="child-tab-add"')
  })

  it('should have remove button per entry', () => {
    expect(source).toContain('child-tab-remove-')
  })
})

// ====================================
// MAX LIMIT
// ====================================

describe('SaveViewDialog Max Tab Limit', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should define MAX_CHILD_TABS constant', () => {
    expect(source).toContain('MAX_CHILD_TABS')
  })

  it('should enforce max limit of 5', () => {
    expect(source).toContain('MAX_CHILD_TABS = 5')
  })

  it('should disable add button when at max', () => {
    expect(source).toContain('childTabs.length >= MAX_CHILD_TABS')
  })
})

// ====================================
// CHILD TAB ENTRY SUB-COMPONENT
// ====================================

describe('SaveViewDialog ChildTabEntry', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should define ChildTabEntry sub-component', () => {
    expect(source).toContain('function ChildTabEntry')
  })

  it('should accept index prop for unique IDs', () => {
    expect(source).toContain('index: number')
  })

  it('should have per-entry entity type selector', () => {
    expect(source).toContain('child-entity-type-')
  })

  it('should have per-entry relationship type selector', () => {
    expect(source).toContain('child-rel-type-')
  })

  it('should have per-entry direction selector', () => {
    expect(source).toContain('child-direction-')
  })

  it('should show tab number label', () => {
    expect(source).toContain('Tab {index + 1}')
  })
})

// ====================================
// SAVE BEHAVIOR
// ====================================

describe('SaveViewDialog Save Behavior', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should filter out entries with empty entity type before saving', () => {
    expect(source).toContain('childEntityType.trim()')
    expect(source).toContain('validTabs')
  })

  it('should pass validTabs array to onSave', () => {
    expect(source).toContain('await onSave(trimmedName, visibility, validTabs)')
  })
})

// ====================================
// COLLAPSIBLE SECTION
// ====================================

describe('SaveViewDialog Child Tabs Collapsible', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should use Collapsible for child tabs section', () => {
    expect(source).toContain('Collapsible')
    expect(source).toContain('CollapsibleTrigger')
    expect(source).toContain('CollapsibleContent')
  })

  it('should show tab count in header', () => {
    expect(source).toContain('childTabs.length')
  })

  it('should label section as "Child Entity Tabs (optional)"', () => {
    expect(source).toContain('Child Entity Tabs (optional)')
  })
})
