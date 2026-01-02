/**
 * VibeGrid Loading Overlay
 *
 * Shows loading state with skeleton UI while VibeGrid initializes.
 * Displays progress, errors, and provides retry functionality.
 */

import { useSelector } from '@legendapp/state/react'
import { AlertTriangle, CheckCircle, Loader2, RefreshCw } from 'lucide-react'
import React from 'react'
import type { VibeGridHydrationManager } from '../stores/init-state'
import { TableSkeleton } from './TableSkeleton'

// ====================================
// COMPONENT PROPS
// ====================================

interface VibeGridLoadingOverlayProps {
  initManager: VibeGridHydrationManager
  height?: number | string
  width?: number | string
  showDetailedProgress?: boolean
}

// ====================================
// LOADING OVERLAY COMPONENT
// ====================================

export function VibeGridLoadingOverlay({
  initManager,
  height = 600,
  width = '100%',
  showDetailedProgress = false,
}: VibeGridLoadingOverlayProps) {
  // Subscribe to init state
  const isFullyInitialized = useSelector(initManager.isFullyHydrated$)
  const errors = useSelector(initManager.errors$)
  const hasErrors = useSelector(initManager.hasErrors$)
  const criticalErrors = useSelector(initManager.criticalErrors$)

  // Always render - let parent control visibility to prevent flash
  // if (isFullyInitialized) {
  //   return null;
  // }

  const hasCriticalErrors = criticalErrors.length > 0

  return (
    <div className="relative bg-white" style={{ height, width }}>
      {/* Clean Table Skeleton */}
      <TableSkeleton columns={6} rows={8} />

      {/* Only show error indicator if there are critical errors */}
      {hasCriticalErrors && (
        <div className="absolute top-4 right-4 flex items-center space-x-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg border shadow-sm">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-600">Loading failed</span>
          <button
            onClick={() => initManager.reset()}
            className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Development Debug Panel (only if explicitly enabled) */}
      {showDetailedProgress && process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg max-w-sm">
          <div className="text-xs font-medium text-gray-700 mb-2">Debug Info:</div>
          <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
            {Object.entries(initManager.hydrationState$.get()).map(([dependency, ready]) => (
              <div key={dependency} className="flex items-center justify-between">
                <span className="text-gray-600">{dependency}</span>
                {ready ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <div className="w-3 h-3 bg-gray-300 rounded-full animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ====================================
// LOADING STATE HOOK
// ====================================

/**
 * Hook for using VibeGrid loading state in components
 */
export function useVibeGridLoadingState(initManager: VibeGridHydrationManager) {
  const isFullyInitialized = useSelector(initManager.isFullyHydrated$)
  const progress = useSelector(initManager.hydrationProgress$)
  const hasErrors = useSelector(initManager.hasErrors$)
  const criticalErrors = useSelector(initManager.criticalErrors$)

  return {
    isLoading: !isFullyInitialized,
    isReady: isFullyInitialized,
    progress,
    hasErrors,
    hasCriticalErrors: criticalErrors.length > 0,
    canRetry: criticalErrors.some((error) => error.canRetry),
    retry: () => initManager.reset(),
    getStatus: () => initManager.getStatus(),
  }
}
