/**
 * SaveViewDialog Component Tests
 *
 * GH#1570 P2.3: Entity View Customization - Save View Dialog
 *
 * Tests cover:
 * 1. Component existence and exports
 * 2. Props interface
 * 3. Form structure (name input, visibility radio)
 * 4. Validation requirements
 * 5. Accessibility
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
// COMPONENT EXISTENCE
// ====================================

describe('SaveViewDialog Component Existence', () => {
  it('should have SaveViewDialog.tsx component file', () => {
    expect(componentExists()).toBe(true)
  })
})

// ====================================
// STRUCTURE TESTS
// ====================================

describe('SaveViewDialog Component Structure', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should export SaveViewDialog as named export', () => {
    expect(source).toContain('export function SaveViewDialog')
  })

  it('should export SaveViewDialogProps interface', () => {
    expect(source).toContain('export interface SaveViewDialogProps')
  })

  it('should export ViewVisibility type', () => {
    expect(source).toContain('export type ViewVisibility')
  })
})

// ====================================
// IMPORTS TESTS
// ====================================

describe('SaveViewDialog Imports', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should import Dialog components', () => {
    expect(source).toContain("from '@/shared/components/ui/dialog'")
    expect(source).toContain('Dialog')
    expect(source).toContain('DialogContent')
    expect(source).toContain('DialogHeader')
    expect(source).toContain('DialogTitle')
    expect(source).toContain('DialogFooter')
  })

  it('should import Input for name field', () => {
    expect(source).toContain("from '@/shared/components/ui/input'")
  })

  it('should import Label for form labels', () => {
    expect(source).toContain("from '@/shared/components/ui/label'")
  })

  it('should import RadioGroup for visibility selection', () => {
    expect(source).toContain("from '@/shared/components/ui/radio-group'")
    expect(source).toContain('RadioGroup')
    expect(source).toContain('RadioGroupItem')
  })

  it('should import Button for actions', () => {
    expect(source).toContain("from '@/shared/components/ui/button'")
  })
})

// ====================================
// PROPS INTERFACE TESTS
// ====================================

describe('SaveViewDialog Props Interface', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should include open and onOpenChange props', () => {
    expect(source).toContain('open: boolean')
    expect(source).toContain('onOpenChange:')
  })

  it('should include entityType prop', () => {
    expect(source).toContain('entityType: string')
  })

  it('should include onSave callback', () => {
    expect(source).toContain('onSave:')
  })

  it('should include initialName for edit mode', () => {
    expect(source).toContain('initialName?:')
  })

  it('should include initialVisibility for edit mode', () => {
    expect(source).toContain('initialVisibility?:')
  })

  it('should include isAdmin flag', () => {
    expect(source).toContain('isAdmin: boolean')
  })
})

// ====================================
// FORM STRUCTURE TESTS
// ====================================

describe('SaveViewDialog Form Structure', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should have name input field', () => {
    expect(source).toContain('id="view-name"')
    expect(source).toContain('maxLength={100}')
  })

  it('should have visibility radio options', () => {
    expect(source).toContain('value="personal"')
    expect(source).toContain('value="shared"')
    expect(source).toContain('value="locked"')
  })

  it('should only show locked option for admins', () => {
    expect(source).toContain('isAdmin')
    expect(source).toContain('value="locked"')
  })

  it('should have Cancel and Save buttons', () => {
    expect(source).toContain('Cancel')
    expect(source).toContain('data-testid="save-view-cancel"')
    expect(source).toContain('data-testid="save-view-submit"')
  })

  it('should show loading state during save', () => {
    expect(source).toContain('isSaving')
    expect(source).toContain('Loader2')
  })

  it('should display error messages inline', () => {
    expect(source).toContain('data-testid="save-view-error"')
  })

  it('should support Enter key submission', () => {
    expect(source).toContain("e.key === 'Enter'")
  })
})

// ====================================
// VALIDATION TESTS
// ====================================

describe('SaveViewDialog Validation', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should validate name is required', () => {
    expect(source).toContain('Name is required')
  })

  it('should validate name max length', () => {
    expect(source).toContain('100 characters')
  })

  it('should disable Save button when name is empty', () => {
    expect(source).toContain('!name.trim()')
  })
})

// ====================================
// DATA-TESTID TESTS
// ====================================

describe('SaveViewDialog Test IDs', () => {
  let source: string

  beforeEach(() => {
    if (!componentExists()) return
    source = getSourceCode()
  })

  it('should have dialog test id', () => {
    expect(source).toContain('data-testid="save-view-dialog"')
  })

  it('should have name input test id', () => {
    expect(source).toContain('data-testid="save-view-name-input"')
  })

  it('should have visibility test id', () => {
    expect(source).toContain('data-testid="save-view-visibility"')
  })

  it('should have cancel button test id', () => {
    expect(source).toContain('data-testid="save-view-cancel"')
  })

  it('should have submit button test id', () => {
    expect(source).toContain('data-testid="save-view-submit"')
  })
})
