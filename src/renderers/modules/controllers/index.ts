/**
 * Overlay Controllers - Specialized controllers for VibegGrid overlays
 *
 * Part of Phase 2: OverlayManager Split refactor
 * Extracts overlay logic from monolithic OverlayManager (1311 lines) into focused controllers
 *
 * @see planning/active/vibegrid-complexity-refactor/IMPLEMENTATION.md Phase 2
 */

export { OverlayController, type OverlayControllerOptions } from './OverlayController'
export {
  SelectionOverlayController,
  type SelectionOverlayControllerOptions,
} from './SelectionOverlayController'
export {
  EditingOverlayController,
  type EditingOverlayControllerOptions,
} from './EditingOverlayController'
export {
  ClipboardOverlayController,
  type ClipboardOverlayControllerOptions,
} from './ClipboardOverlayController'
export {
  ResizePreviewController,
  type ResizePreviewControllerOptions,
} from './ResizePreviewController'
