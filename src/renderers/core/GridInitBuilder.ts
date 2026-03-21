/**
 * GridInitBuilder — Type-enforced 10-step initialization sequence for SimplePassiveRenderer.
 *
 * Each step returns a new builder type that only exposes the next valid step,
 * making it impossible to call steps out of order at compile time.
 *
 * GH#2034 Phase 4
 */

/**
 * Access interface for SimplePassiveRenderer init methods.
 * The builder calls these private methods via this interface.
 */
export interface GridInitTarget {
  /** Step 1: Create DOM structure (viewport, header, body containers) */
  initDOM(): void
  /** Step 2: Create selection, keyboard nav, column width controllers */
  initControllers(): void
  /** Step 3: Create DOMElementFactory */
  initDOMFactory(): void
  /** Step 4: Create OverlayManager (must be before Phase2 managers) */
  initOverlayManager(): void
  /** Step 5: Create BodyRenderer, DragDropManager, EventManager, KeyboardController */
  initPhase2Managers(): void
  /** Step 6: Create canvas-based grid lines */
  initGridLineCanvas(): void
  /** Step 7: Create HeaderRenderer */
  initHeaderRenderer(): void
  /** Step 8: Deferred post-initialization (RAF chain) */
  postInitialization(): void
  /** Step 9+10: Enable observers and create all MobX reactions */
  initObservers(): void
}

// Step 1: Entry point - only initDOM is available
export class GridInitBuilder {
  constructor(private target: GridInitTarget) {}

  initDOM(): DOMReadyBuilder {
    this.target.initDOM()
    return new DOMReadyBuilder(this.target)
  }
}

// Step 2: After DOM
class DOMReadyBuilder {
  constructor(private target: GridInitTarget) {}

  initControllers(): ControllersReadyBuilder {
    this.target.initControllers()
    return new ControllersReadyBuilder(this.target)
  }
}

// Step 3: After controllers
class ControllersReadyBuilder {
  constructor(private target: GridInitTarget) {}

  initDOMFactory(): DOMFactoryReadyBuilder {
    this.target.initDOMFactory()
    return new DOMFactoryReadyBuilder(this.target)
  }
}

// Step 4: After DOM factory
class DOMFactoryReadyBuilder {
  constructor(private target: GridInitTarget) {}

  initOverlayManager(): OverlayReadyBuilder {
    this.target.initOverlayManager()
    return new OverlayReadyBuilder(this.target)
  }
}

// Step 5: After overlay manager
class OverlayReadyBuilder {
  constructor(private target: GridInitTarget) {}

  initPhase2Managers(): Phase2ReadyBuilder {
    this.target.initPhase2Managers()
    return new Phase2ReadyBuilder(this.target)
  }
}

// Step 6: After phase 2 managers
class Phase2ReadyBuilder {
  constructor(private target: GridInitTarget) {}

  initGridLineCanvas(): GridLinesReadyBuilder {
    this.target.initGridLineCanvas()
    return new GridLinesReadyBuilder(this.target)
  }
}

// Step 7: After grid line canvas
class GridLinesReadyBuilder {
  constructor(private target: GridInitTarget) {}

  initHeaderRenderer(): HeaderReadyBuilder {
    this.target.initHeaderRenderer()
    return new HeaderReadyBuilder(this.target)
  }
}

// Step 8: After header renderer
class HeaderReadyBuilder {
  constructor(private target: GridInitTarget) {}

  postInitialization(): PostInitReadyBuilder {
    this.target.postInitialization()
    return new PostInitReadyBuilder(this.target)
  }
}

// Step 9+10: After post-initialization
class PostInitReadyBuilder {
  constructor(private target: GridInitTarget) {}

  initObservers(): FinalBuilder {
    this.target.initObservers()
    return new FinalBuilder()
  }
}

// Final step: build() confirms all steps have been called
class FinalBuilder {
  build(): void {
    // All initialization steps have been called in order.
    // Nothing to do here - this method exists to close the builder chain.
  }
}
