import { useMemo } from 'react'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'

const _fileLog = getLogger(['vibegrid', 'components', 'TableSkeleton'])

// ====================================
// TABLE SKELETON COMPONENT
// ====================================

interface TableSkeletonProps {
  columns?: number
  rows?: number
}

/**
 * Loading skeleton that matches VibeGrid table structure exactly
 * Uses same dimensions as actual grid: drag column (30px) + row header (40px) + data columns.
 *
 * GH#2934 (p5): shimmer bars use the unified `.vibegrid-skeleton-bar` class so
 * the cold-load overlay and the fast-scroll sparse-row cells share one keyframe
 * (`vibegrid-skeleton-pulse`, 1.5s ease-in-out, opacity 0.6 → 1.0 → 0.6).
 */
export function TableSkeleton({ columns = 6, rows = 12 }: TableSkeletonProps) {
  // Generate stable random widths once per render (not on every cell)
  const cellWidths = useMemo(
    () => Array.from({ length: rows * columns }, () => `${Math.floor(Math.random() * 30 + 50)}%`),
    [rows, columns],
  )

  return (
    <div className="w-full h-full bg-background overflow-hidden">
      <div className="relative w-full h-full">
        {/* Header - matches HEADER_HEIGHT (48px) */}
        <div
          className="sticky top-0 z-20 bg-muted border-b border-border flex"
          style={{ height: GRID_DIMENSIONS.HEADER_HEIGHT }}
        >
          {/* Drag column placeholder - 30px */}
          <div className="flex-shrink-0 border-r border-border" style={{ width: GRID_DIMENSIONS.DRAG_COLUMN_WIDTH }} />

          {/* Row header with select-all checkbox - 40px */}
          <div
            className="flex-shrink-0 flex items-center justify-center border-r border-border"
            style={{ width: GRID_DIMENSIONS.ROW_HEADER_WIDTH }}
          >
            <div className="h-4 w-4 vibegrid-skeleton-bar" />
          </div>

          {/* Column headers */}
          {Array.from({ length: columns }).map((_, i) => (
            <div
              key={i}
              className="flex items-center px-3 border-r border-border"
              style={{ width: GRID_DIMENSIONS.DEFAULT_COLUMN_WIDTH }}
            >
              <div className="h-4 w-3/4 vibegrid-skeleton-bar" />
            </div>
          ))}
        </div>

        {/* Body - rows with ROW_HEIGHT (40px) */}
        <div className="relative">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex border-b border-border" style={{ height: GRID_DIMENSIONS.ROW_HEIGHT }}>
              {/* Drag handle column - 30px */}
              <div
                className="flex-shrink-0 flex items-center justify-center border-r border-border"
                style={{ width: GRID_DIMENSIONS.DRAG_COLUMN_WIDTH }}
              >
                {/* Drag handle dots */}
                <div className="flex flex-col gap-0.5 opacity-30">
                  <div className="flex gap-0.5">
                    <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                    <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                  </div>
                  <div className="flex gap-0.5">
                    <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                    <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                  </div>
                  <div className="flex gap-0.5">
                    <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                    <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                  </div>
                </div>
              </div>

              {/* Row header with checkbox - 40px */}
              <div
                className="flex-shrink-0 flex items-center justify-center border-r border-border"
                style={{ width: GRID_DIMENSIONS.ROW_HEADER_WIDTH }}
              >
                <div className="h-4 w-4 vibegrid-skeleton-bar" />
              </div>

              {/* Data cells */}
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div
                  key={colIndex}
                  className="flex items-center px-3 border-r border-border"
                  style={{ width: GRID_DIMENSIONS.DEFAULT_COLUMN_WIDTH }}
                >
                  <div
                    className="h-4 vibegrid-skeleton-bar"
                    style={{ width: cellWidths[rowIndex * columns + colIndex] }}
                  />
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
export function TableRowSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <div className="vibegrid-row flex border-b border-border" style={{ height: GRID_DIMENSIONS.ROW_HEIGHT }}>
      {/* Drag column */}
      <div className="flex-shrink-0 border-r border-border" style={{ width: GRID_DIMENSIONS.DRAG_COLUMN_WIDTH }} />

      {/* Row header with checkbox */}
      <div
        className="flex-shrink-0 flex items-center justify-center border-r border-border"
        style={{ width: GRID_DIMENSIONS.ROW_HEADER_WIDTH }}
      >
        <div className="h-4 w-4 vibegrid-skeleton-bar" />
      </div>

      {/* Data columns */}
      {Array.from({ length: columns }).map((_, i) => (
        <div
          key={i}
          className="flex items-center px-3 border-r border-border"
          style={{ width: GRID_DIMENSIONS.DEFAULT_COLUMN_WIDTH }}
        >
          <div className="h-4 w-3/4 vibegrid-skeleton-bar" />
        </div>
      ))}
    </div>
  )
}
