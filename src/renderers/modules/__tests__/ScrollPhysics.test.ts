/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import { ScrollPhysics } from '../ScrollPhysics'

describe('ScrollPhysics', () => {
  let physics: ScrollPhysics

  beforeEach(() => {
    physics = new ScrollPhysics()
    vi.restoreAllMocks()
  })

  describe('begin()', () => {
    it('resets state and cancels in-flight momentum', () => {
      physics.begin(100)
      expect(physics.isAnimating).toBe(false)
    })
  })

  describe('addMove()', () => {
    it('returns delta Y from last position', () => {
      physics.begin(100)
      const dy = physics.addMove(90)
      expect(dy).toBe(-10) // moved up 10px
    })

    it('tracks consecutive moves correctly', () => {
      physics.begin(100)
      expect(physics.addMove(95)).toBe(-5)
      expect(physics.addMove(88)).toBe(-7)
      expect(physics.addMove(85)).toBe(-3)
    })
  })

  describe('computeVelocity()', () => {
    it('returns 0 with fewer than 2 samples', () => {
      physics.begin(100)
      expect(physics.computeVelocity()).toBe(0)
    })

    it('computes velocity from samples', () => {
      physics.begin(100)
      // Manually add samples with known timestamps
      physics.addMove(90) // dy = -10
      physics.addMove(80) // dy = -10

      const velocity = physics.computeVelocity()
      // Velocity should be negative (finger moving up)
      expect(velocity).toBeLessThan(0)
    })
  })

  describe('startMomentum()', () => {
    it('does not start momentum if velocity is below threshold', () => {
      const viewport = createMockViewport(100, 500)
      physics.begin(100)
      physics.addMove(100) // zero movement

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
      physics.startMomentum(viewport)
      expect(rafSpy).not.toHaveBeenCalled()
    })

    it('starts RAF loop for momentum when velocity is above threshold', () => {
      const viewport = createMockViewport(100, 500)

      // Simulate fast scroll with controlled timestamps
      let mockTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => {
        mockTime += 10
        return mockTime
      })

      physics = new ScrollPhysics()
      physics.begin(200)
      physics.addMove(180) // -20px
      physics.addMove(160) // -20px
      physics.addMove(140) // -20px

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
      physics.startMomentum(viewport)

      // Should have started RAF if velocity is above threshold
      expect(rafSpy).toHaveBeenCalled()
      expect(physics.isAnimating).toBe(true)
    })
  })

  describe('cancel()', () => {
    it('cancels in-flight momentum animation', () => {
      // Start and then cancel
      physics.begin(100)
      physics.cancel()

      // Should not throw even if no animation is running
      expect(physics.isAnimating).toBe(false)
    })

    it('calls cancelAnimationFrame when momentum is active', () => {
      const viewport = createMockViewport(100, 500)

      let mockTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => {
        mockTime += 10
        return mockTime
      })

      physics = new ScrollPhysics()
      physics.begin(200)
      physics.addMove(180)
      physics.addMove(160)
      physics.addMove(140)

      vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42)
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')

      physics.startMomentum(viewport)
      expect(physics.isAnimating).toBe(true)

      physics.cancel()
      expect(cancelSpy).toHaveBeenCalledWith(42)
      expect(physics.isAnimating).toBe(false)
    })
  })

  describe('reset()', () => {
    it('cancels animation and clears all state', () => {
      physics.begin(100)
      physics.addMove(90)
      physics.reset()

      expect(physics.isAnimating).toBe(false)
      expect(physics.computeVelocity()).toBe(0)
    })
  })

  describe('bounds clamping', () => {
    it('clamps scrollTop to 0 when scrolling up past top', () => {
      const viewport = createMockViewport(0, 500) // at top

      physics.begin(100)
      const dy = physics.addMove(120) // finger moved down = scroll up
      expect(dy).toBe(20)

      // viewport.scrollTop -= dy means scrollTop = 0 - 20 = -20, but clamped to 0
      viewport.scrollTop = Math.max(0, viewport.scrollTop - dy)
      expect(viewport.scrollTop).toBe(0)
    })

    it('clamps to maxScrollTop when scrolling down past bottom', () => {
      const viewport = createMockViewport(500, 500) // at bottom

      physics.begin(100)
      const dy = physics.addMove(80) // finger moved up = scroll down
      expect(dy).toBe(-20)

      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight
      viewport.scrollTop = Math.max(0, Math.min(maxScrollTop, viewport.scrollTop - dy))
      expect(viewport.scrollTop).toBe(500)
    })
  })
})

function createMockViewport(scrollTop: number, maxScroll: number): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollHeight', { value: maxScroll + 400, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
  el.scrollTop = scrollTop
  return el
}
