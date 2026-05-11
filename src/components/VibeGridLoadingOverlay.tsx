/**
 * VibeGrid Loading Overlay
 *
 * Shows loading state with skeleton UI while VibeGrid initializes.
 * Visibility is controlled by the parent — see `showLoadingOverlay` in
 * VibeGrid.tsx (predicate: `phase !== 'painted' || (!entityDataKnownComplete
 * && processedRows.length === 0)`).
 */

import { AlertTriangle } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import type { InitStore } from '../stores/InitStore'
import { TableSkeleton } from './TableSkeleton'

// ====================================
// COMPONENT PROPS
// ====================================

interface VibeGridLoadingOverlayProps {
  initStore: InitStore
  height?: number | string
  width?: number | string
  showDetailedProgress?: boolean
}

// ====================================
// LOADING OVERLAY COMPONENT
// ====================================

export const VibeGridLoadingOverlay = observer(function VibeGridLoadingOverlay({
  initStore,
  height = 600,
  width = '100%',
  showDetailedProgress = false,
}: VibeGridLoadingOverlayProps) {
  const criticalErrors = initStore.criticalErrors
  const hasCriticalErrors = criticalErrors.length > 0

  return (
    <div className="relative bg-background" style={{ height, width }}>
      {/* Clean Table Skeleton */}
      <TableSkeleton columns={6} rows={8} />

      {/* Only show error indicator if there are critical errors */}
      {hasCriticalErrors && (
        <div className="absolute top-4 right-4 flex items-center space-x-2 bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg border shadow-sm">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-600">Loading failed</span>
          <button
            type="button"
            onClick={() => initStore.reset()}
            className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Development Debug Panel (only if explicitly enabled) — GH#2925 p4:
          collapsed from per-flag map to the 2 phase-machine signals. */}
      {showDetailedProgress && process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg max-w-sm">
          <div className="text-xs font-medium text-muted-foreground mb-2">Debug Info:</div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">phase</span>
              <span>{initStore.phase}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">entityDataKnownComplete</span>
              <span>{String(initStore.entityDataKnownComplete)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
