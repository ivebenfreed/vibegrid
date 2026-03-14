/**
 * Tests verifying legacy dead code has been removed from the VibeGrid public API.
 *
 * Phase P1 of GH#1413 (vibegrid-architecture-consolidation) removed:
 * - 8 .backup files
 * - pure-observables.ts legacy stub
 * - 6 stale analysis markdown files
 * - createVibeGrid unused factory
 * - LEGEND_STATE feature flag
 *
 * These tests ensure the removed symbols do not re-appear and that
 * the remaining public surface is intact.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const VIBEGRID_ROOT = resolve(__dirname, '..')

/** Read index.ts content for export surface assertions. */
function readIndex(): string {
  return readFileSync(resolve(VIBEGRID_ROOT, 'index.ts'), 'utf-8')
}

describe('VibeGrid dead code removal (P1)', () => {
  // --------------------------------------------------------
  // Deleted files must not exist on disk
  // --------------------------------------------------------
  describe('backup files are deleted', () => {
    const backupFiles = [
      'renderers/components/HeaderRenderer.ts.backup',
      'renderers/core/SimplePassiveRenderer.ts.backup',
      'renderers/factories/DOMElementFactory.ts.backup',
      'renderers/modules/KeyboardNavigationController.ts.backup',
      'renderers/modules/MouseController.ts.backup',
      'renderers/modules/SelectionController.ts.backup',
      'renderers/modules/OverlayManager.ts.backup',
      'renderers/modules/ScrollController.ts.backup',
    ]

    for (const file of backupFiles) {
      it(`${file} does not exist`, () => {
        expect(existsSync(resolve(VIBEGRID_ROOT, file))).toBe(false)
      })
    }
  })

  describe('legacy stub is deleted', () => {
    it('stores/pure-observables.ts does not exist', () => {
      expect(existsSync(resolve(VIBEGRID_ROOT, 'stores/pure-observables.ts'))).toBe(false)
    })
  })

  describe('stale analysis docs are deleted', () => {
    const staleDocs = [
      'VIBEGRID_OVERHAUL_ANALYSIS.md',
      'VIBEGRID_STATE_ANALYSIS.md',
      'MANAGER_CONSOLIDATION.md',
      'RENDERER_CONSOLIDATION_PLAN.md',
      'PURE_OBSERVABLES_SPLIT_PLAN.md',
      'VIBEGRID_SYNC_FIX_SUMMARY.md',
      'FIELD_TYPE_MODULAR_ARCHITECTURE_PLAN.md',
    ]

    for (const doc of staleDocs) {
      it(`${doc} does not exist`, () => {
        expect(existsSync(resolve(VIBEGRID_ROOT, doc))).toBe(false)
      })
    }
  })

  describe('active docs are preserved', () => {
    const activeDocs = ['UX_SPEC.md', 'stores/PERSISTENCE-README.md', 'stores/reactive-patterns.md']

    for (const doc of activeDocs) {
      it(`${doc} still exists`, () => {
        expect(existsSync(resolve(VIBEGRID_ROOT, doc))).toBe(true)
      })
    }
  })

  // --------------------------------------------------------
  // index.ts export surface assertions (text-based to avoid
  // triggering transitive side-effects from barrel import)
  // --------------------------------------------------------
  describe('index.ts removed exports', () => {
    it('does not export createPureObservables', () => {
      const content = readIndex()
      expect(content).not.toContain('createPureObservables')
    })

    it('does not import from pure-observables', () => {
      const content = readIndex()
      expect(content).not.toContain('pure-observables')
    })

    it('does not export createVibeGrid factory', () => {
      const content = readIndex()
      expect(content).not.toMatch(/export\s+(const|function)\s+createVibeGrid\b/)
    })

    it('does not contain LEGEND_STATE feature flag', () => {
      const content = readIndex()
      expect(content).not.toContain('LEGEND_STATE')
    })
  })

  describe('index.ts retained exports', () => {
    it('exports VibeGrid component', () => {
      const content = readIndex()
      expect(content).toMatch(/export\s*\{.*VibeGrid.*\}/)
    })

    it('exports SimplePassiveRenderer', () => {
      const content = readIndex()
      expect(content).toMatch(/export\s*\{.*SimplePassiveRenderer.*\}/)
    })

    it('exports VIBEGRIDX_PERFORMANCE_TARGETS', () => {
      const content = readIndex()
      expect(content).toContain('VIBEGRIDX_PERFORMANCE_TARGETS')
    })

    it('exports VIBEGRID_FEATURES with expected flags', () => {
      const content = readIndex()
      expect(content).toContain('VIBEGRID_FEATURES')
      expect(content).toContain('PURE_OBSERVABLES')
      expect(content).toContain('VIRTUAL_SCROLLING')
      expect(content).toContain('CANVAS_OVERLAYS')
      expect(content).toContain('OPTIMISTIC_UPDATES')
      expect(content).toContain('DIRECT_DOM_UPDATES')
      expect(content).toContain('DOMAIN_INTEGRATION')
    })

    it('exports row expansion processor functions', () => {
      const content = readIndex()
      const expectedFunctions = [
        'processExpandedRows',
        'createExpandedContentRow',
        'calculateExpandedHeight',
        'recalculateRowOffsets',
        'getParentRowId',
        'isExpandedContentRowId',
        'getTotalExpandedHeight',
        'filterExpandedRows',
        'getNavigableRowIndices',
      ]
      for (const fn of expectedFunctions) {
        expect(content).toContain(fn)
      }
    })
  })

  // --------------------------------------------------------
  // Architecture comment reflects MobX, not Legend State
  // --------------------------------------------------------
  describe('architecture comment updated', () => {
    it('references MobX instead of Legend State', () => {
      const content = readIndex()
      expect(content).toContain('MobX')
      expect(content).not.toMatch(/Legend.State/)
    })
  })
})
