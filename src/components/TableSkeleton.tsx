import React from 'react'
import { createLogger } from '@/shared/lib/logging'

const fileLog = createLogger('components/vibegrid/components/TableSkeleton')

// ====================================
// TABLE SKELETON COMPONENT
// ====================================

interface TableSkeletonProps {
  columns?: number
  rows?: number
}

/**
 * Loading skeleton that matches VibeGrid table structure
 * Shows animated placeholders while data is loading
 */
export function TableSkeleton({ columns = 5, rows = 10 }: TableSkeletonProps) {
  return (
    <div className="w-full h-full bg-background rounded-lg overflow-hidden">
      <div className="relative w-full h-full border border-border">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-background border-b border-border">
          <div className="flex h-10">
            {/* Selection column */}
            <div className="w-12 px-3 py-2 border-r border-border">
              <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>
            </div>

            {/* Column headers */}
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="flex-1 px-3 py-2 border-r border-border min-w-[120px]">
                <div className="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="relative">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex h-10 border-b border-border">
              {/* Selection column */}
              <div className="w-12 px-3 py-2 border-r border-border">
                <div className="h-4 w-4 bg-muted/50 rounded animate-pulse"></div>
              </div>

              {/* Data cells */}
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div
                  key={colIndex}
                  className="flex-1 px-3 py-2 border-r border-border min-w-[120px]"
                >
                  <div
                    className="h-4 bg-muted/50 rounded animate-pulse"
                    style={{ width: `${Math.floor(Math.random() * 30 + 50)}%` }}
                  ></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Minimal skeleton for inline loading states
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="vibegrid-row flex h-10 border-b border-gray-100 dark:border-gray-800">
      {/* Selection column */}
      <div className="vibegrid-cell w-12 px-3 py-2">
        <div className="animate-pulse h-4 w-4 bg-gray-100 dark:bg-gray-800 rounded"></div>
      </div>

      {/* Data columns */}
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="vibegrid-cell flex-1 px-3 py-2">
          <div className="animate-pulse h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  )
}
