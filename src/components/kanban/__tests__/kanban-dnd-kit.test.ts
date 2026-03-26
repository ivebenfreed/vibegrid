/**
 * Tests for Kanban dnd-kit migration (GH#2200)
 *
 * Verifies that the Kanban components use @dnd-kit instead of HTML5 DnD,
 * and that the sensor configuration matches the spec.
 */

import { describe, expect, it } from 'vitest'

describe('Kanban dnd-kit migration (GH#2200)', () => {
  describe('KanbanBoard', () => {
    it('does not use HTML5 drag event types', async () => {
      const fs = await import('node:fs')
      const source = fs.readFileSync(new URL('../KanbanBoard.tsx', import.meta.url).pathname, 'utf-8')
      // Should NOT have HTML5 DnD handlers
      expect(source).not.toContain('handleCardDragStart')
      expect(source).not.toContain('handleCardDragEnd')
      expect(source).not.toContain('onCardDragStart')
      expect(source).not.toContain('onCardDragEnd')
      // Should have dnd-kit imports
      expect(source).toContain('@dnd-kit/core')
      expect(source).toContain('DndContext')
      expect(source).toContain('PointerSensor')
      expect(source).toContain('TouchSensor')
    })

    it('configures PointerSensor with distance 8 and TouchSensor with delay 250', async () => {
      const fs = await import('node:fs')
      const source = fs.readFileSync(new URL('../KanbanBoard.tsx', import.meta.url).pathname, 'utf-8')
      // Verify activation constraints match spec
      expect(source).toContain('distance: 8')
      expect(source).toContain('delay: 250')
      expect(source).toContain('tolerance: 5')
    })
  })

  describe('KanbanCard', () => {
    it('uses useDraggable instead of HTML5 draggable', async () => {
      const fs = await import('node:fs')
      const source = fs.readFileSync(new URL('../KanbanCard.tsx', import.meta.url).pathname, 'utf-8')
      // Should use dnd-kit
      expect(source).toContain('useDraggable')
      expect(source).toContain('@dnd-kit/core')
      // Should NOT have HTML5 DnD props
      expect(source).not.toContain('draggable={')
      expect(source).not.toContain('onDragStart={')
      expect(source).not.toContain('onDragEnd={')
      expect(source).not.toContain('e.dataTransfer')
    })

    it('does not accept isDragging or onDragStart/onDragEnd props', async () => {
      const fs = await import('node:fs')
      const source = fs.readFileSync(new URL('../KanbanCard.tsx', import.meta.url).pathname, 'utf-8')
      // Interface should be simplified — dnd-kit provides isDragging via hook
      expect(source).not.toMatch(/interface KanbanCardProps[\s\S]*?isDragging\?/)
      expect(source).not.toMatch(/interface KanbanCardProps[\s\S]*?onDragStart\?/)
      expect(source).not.toMatch(/interface KanbanCardProps[\s\S]*?onDragEnd\?/)
    })
  })

  describe('KanbanColumn', () => {
    it('uses useDroppable instead of HTML5 drop handlers', async () => {
      const fs = await import('node:fs')
      const source = fs.readFileSync(new URL('../KanbanColumn.tsx', import.meta.url).pathname, 'utf-8')
      // Should use dnd-kit
      expect(source).toContain('useDroppable')
      expect(source).toContain('@dnd-kit/core')
      // Should NOT have HTML5 DnD handlers
      expect(source).not.toContain('onDragOver={')
      expect(source).not.toContain('onDragLeave={')
      expect(source).not.toContain('onDrop={')
      expect(source).not.toContain('e.dataTransfer')
      expect(source).not.toContain('isLocalDragOver')
    })
  })
})

describe('MouseController pointer event migration (GH#2200)', () => {
  it('uses pointer events instead of mouse events', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(
      new URL('../../../renderers/modules/MouseController.ts', import.meta.url).pathname,
      'utf-8',
    )
    // Should have pointer event setup
    expect(source).toContain('setupGlobalPointerHandling')
    expect(source).toContain("'pointerdown'")
    expect(source).toContain("'pointermove'")
    expect(source).toContain("'pointerup'")
    // Should NOT have old mouse event listeners
    expect(source).not.toContain("'mousedown'")
    expect(source).not.toContain("'mousemove'")
    expect(source).not.toContain("'mouseup'")
    expect(source).not.toContain('setupGlobalMouseHandling')
  })

  it('has pointer capture for drag reliability', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(
      new URL('../../../renderers/modules/MouseController.ts', import.meta.url).pathname,
      'utf-8',
    )
    expect(source).toContain('setPointerCapture')
    expect(source).toContain('releasePointerCapture')
    expect(source).toContain('hasPointerCapture')
  })

  it('has pointermove deduplication', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(
      new URL('../../../renderers/modules/MouseController.ts', import.meta.url).pathname,
      'utf-8',
    )
    expect(source).toContain('lastPointerX')
    expect(source).toContain('lastPointerY')
  })

  it('guards hover tracking with pointerType check', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(
      new URL('../../../renderers/modules/MouseController.ts', import.meta.url).pathname,
      'utf-8',
    )
    expect(source).toContain("e.pointerType === 'mouse'")
  })
})

describe('CSS touch targets (GH#2200)', () => {
  it('has touch-action: pan-y on container', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('../../../vibegridx.css', import.meta.url).pathname, 'utf-8')
    expect(source).toContain('touch-action: pan-y')
  })

  it('has touch-action: none on resize handle', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('../../../vibegridx.css', import.meta.url).pathname, 'utf-8')
    // Resize handle should have touch-action: none
    const resizeHandleBlock = source.slice(
      source.indexOf('.vibegridx-resize-handle {'),
      source.indexOf('.vibegridx-resize-handle {') + 300,
    )
    expect(resizeHandleBlock).toContain('touch-action: none')
  })

  it('has touch-action: none on fill handle', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('../../../vibegridx-cells.css', import.meta.url).pathname, 'utf-8')
    expect(source).toContain('.vibegridx-fill-handle')
    expect(source).toContain('touch-action: none')
  })

  it('has @media (hover: none) affordances block', async () => {
    const fs = await import('node:fs')
    const source = fs.readFileSync(new URL('../../../affordances/affordances.css', import.meta.url).pathname, 'utf-8')
    expect(source).toContain('@media (hover: none)')
    expect(source).toContain('.vibegridx-fill-handle')
    expect(source).toContain('[data-affordance-role="icon"]')
  })
})
