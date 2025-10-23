/**
 * VibeGrid Loading Overlay
 *
 * Shows loading state with skeleton UI while VibeGrid initializes.
 * Displays progress, errors, and provides retry functionality.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import type { InitStore } from '../stores/InitStore';
import { TableSkeleton } from './TableSkeleton';

// ====================================
// COMPONENT PROPS
// ====================================

interface VibeGridLoadingOverlayProps {
  initStore: InitStore;
  height?: number | string;
  width?: number | string;
  showDetailedProgress?: boolean;
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

  // Access MobX store properties directly
  const isFullyInitialized = initStore.isFullyHydrated;
  const errors = initStore.errors;
  const hasErrors = initStore.hasErrors;
  const criticalErrors = initStore.criticalErrors;

  // Always render - let parent control visibility to prevent flash
  // if (isFullyInitialized) {
  //   return null;
  // }

  const hasCriticalErrors = criticalErrors.length > 0;

  return (
    <div
      className="relative bg-white"
      style={{ height, width }}
    >
      {/* Clean Table Skeleton */}
      <TableSkeleton columns={6} rows={8} />

      {/* Only show error indicator if there are critical errors */}
      {hasCriticalErrors && (
        <div className="absolute top-4 right-4 flex items-center space-x-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg border shadow-sm">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-600">Loading failed</span>
          <button
            onClick={() => initStore.reset()}
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
            {Object.entries(initStore.hydrationState).map(([dependency, ready]) => (
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
  );
})


// ====================================
// LOADING STATE HOOK
// ====================================

/**
 * Hook for using VibeGrid loading state in components
 */
export function useVibeGridLoadingState(initStore: InitStore) {
  // MobX observables are accessed directly, observer() handles reactivity
  return {
    isLoading: !initStore.isFullyHydrated,
    isReady: initStore.isFullyHydrated,
    progress: initStore.hydrationProgress,
    hasErrors: initStore.hasErrors,
    hasCriticalErrors: initStore.criticalErrors.length > 0,
    canRetry: initStore.criticalErrors.some(error => error.canRetry),
    retry: () => initStore.reset(),
    getStatus: () => initStore.getStatus(),
  };
}