/**
 * SmartSearchInput Component Tests
 *
 * GH#1391: Smart Text Search Filter for VibeGrid
 *
 * Tests cover:
 * 1. Component structure and exports
 * 2. MobX observer wrapping
 * 3. Props interface
 * 4. Debounce functionality
 * 5. Clear button behavior
 * 6. Accessibility attributes
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const COMPONENT_PATH = join(__dirname, '../SmartSearchInput.tsx')

/**
 * Read the SmartSearchInput source code to verify implementation
 */
function getSmartSearchInputSource(): string {
  if (!existsSync(COMPONENT_PATH)) {
    throw new Error('SmartSearchInput.tsx does not exist yet - implement component to pass tests')
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

describe('SmartSearchInput Component Existence', () => {
  it('should have SmartSearchInput.tsx component file', () => {
    expect(componentExists()).toBe(true)
  })
})

// ====================================
// COMPONENT STRUCTURE TESTS
// ====================================

describe('SmartSearchInput Component Structure', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) {
      return
    }
    sourceCode = getSmartSearchInputSource()
  })

  it('should export SmartSearchInput component', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('export const SmartSearchInput')
  })

  it('should be wrapped with observer for MobX reactivity', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/observer\(function SmartSearchInput/)
  })

  it('should accept stores prop of type VibeGridStores', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('stores: VibeGridStores')
  })

  it('should import VibeGridStores type', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toMatch(/import.*VibeGridStores.*from/)
  })

  it('should accept optional placeholder prop', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('placeholder?:')
  })

  it('should accept optional className prop', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('className?:')
  })
})

// ====================================
// DEBOUNCE TESTS
// ====================================

describe('SmartSearchInput Debounce Functionality', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) {
      return
    }
    sourceCode = getSmartSearchInputSource()
  })

  it('should use useDebouncedCallback from use-debounce', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain("from 'use-debounce'")
    expect(sourceCode).toContain('useDebouncedCallback')
  })

  it('should use 300ms debounce delay', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('300')
  })

  it('should call setGlobalSearchText on visualStateStore', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('visualStateStore.setGlobalSearchText')
  })

  it('should cancel debounce on unmount', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('.cancel()')
  })
})

// ====================================
// STORE SYNC TESTS
// ====================================

describe('SmartSearchInput Store Synchronization', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) {
      return
    }
    sourceCode = getSmartSearchInputSource()
  })

  it('should sync local state from globalSearchText', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('visualStateStore.globalSearchText')
  })

  it('should use useEffect to sync when store changes', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('useEffect')
    expect(sourceCode).toContain('setLocalValue(visualStateStore.globalSearchText)')
  })
})

// ====================================
// ACCESSIBILITY TESTS
// ====================================

describe('SmartSearchInput Accessibility', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) {
      return
    }
    sourceCode = getSmartSearchInputSource()
  })

  it('should have aria-label on input', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('aria-label="Search grid"')
  })

  it('should have aria-label on clear button', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('aria-label="Clear search"')
  })

  it('should use semantic search element', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('<search')
  })
})

// ====================================
// TEST ID TESTS
// ====================================

describe('SmartSearchInput Test IDs', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) {
      return
    }
    sourceCode = getSmartSearchInputSource()
  })

  it('should have data-testid on search input', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('data-testid="vibegrid-smart-search"')
  })

  it('should have data-testid on clear button', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('data-testid="vibegrid-smart-search-clear"')
  })
})

// ====================================
// CLEAR FUNCTIONALITY TESTS
// ====================================

describe('SmartSearchInput Clear Functionality', () => {
  let sourceCode: string

  beforeEach(() => {
    if (!componentExists()) {
      return
    }
    sourceCode = getSmartSearchInputSource()
  })

  it('should have a clear button', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('handleClear')
  })

  it('should cancel pending debounce when clearing', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    // Clear should cancel pending debounce and immediately set store to empty
    expect(sourceCode).toContain('debouncedUpdate.cancel()')
  })

  it('should only show clear button when there is text', () => {
    if (!componentExists()) {
      throw new Error('SmartSearchInput.tsx does not exist yet')
    }
    expect(sourceCode).toContain('{localValue && (')
  })
})
