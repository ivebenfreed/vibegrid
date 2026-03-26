/**
 * VibGrid Debug Overlay
 *
 * Shows real-time performance metrics and virtual scroll diagnostics.
 * Enable via console: __VIBEGRID_DEBUG__.enable()
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import type { DebugStore } from '../stores/DebugStore'

interface DebugOverlayProps {
  debugStore: DebugStore
}

export const DebugOverlay: React.FC<DebugOverlayProps> = observer(function DebugOverlay({ debugStore }) {
  if (!debugStore.isEnabled) {
    return null
  }

  const { virtualScrollMetrics, renderMetrics, activePhases } = debugStore

  return (
    <div className="absolute top-2 right-2 z-50 bg-black/80 text-white text-xs font-mono p-3 rounded-lg shadow-lg max-w-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-green-400">VibGrid Debug</span>
        <button type="button" onClick={() => debugStore.setEnabled(false)} className="text-gray-400 hover:text-white">
          ✕
        </button>
      </div>

      {/* Virtual Scroll Section */}
      <div className="border-t border-gray-600 pt-2 mt-2">
        <div className="text-yellow-400 font-semibold mb-1">Virtual Scroll</div>
        <div className="space-y-0.5">
          <Row label="Visible" value={debugStore.virtualRowRangeDisplay} />
          <Row label="Rendered" value={debugStore.renderedRowRangeDisplay} />
          <Row label="DOM Rows" value={debugStore.domEfficiency} />
          <Row label="Scroll Top" value={`${virtualScrollMetrics.scrollTop.toFixed(0)}px`} />
          <Row label="Viewport" value={`${virtualScrollMetrics.viewportHeight.toFixed(0)}px`} />
        </div>
      </div>

      {/* Render Performance Section */}
      <div className="border-t border-gray-600 pt-2 mt-2">
        <div className="text-cyan-400 font-semibold mb-1">Render Performance</div>
        <div className="space-y-0.5">
          <Row
            label="Last Render"
            value={`${renderMetrics.lastRenderDurationMs.toFixed(2)}ms`}
            warn={renderMetrics.lastRenderDurationMs > 16}
          />
          <Row label="Avg Render" value={`${renderMetrics.avgRenderDurationMs.toFixed(2)}ms`} />
          <Row label="Total Renders" value={renderMetrics.totalRenderCount.toString()} />
          <Row
            label="Hiccups"
            value={`${debugStore.hiccupCount}/${debugStore.renderHistory.length}`}
            warn={debugStore.hiccupCount > 0}
          />
        </div>
      </div>

      {/* Render History Timeline */}
      {debugStore.renderHistory.length > 0 && (
        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-orange-400 font-semibold mb-1">Render Timeline</div>
          <div className="flex items-end gap-px h-8 bg-gray-800 rounded p-1">
            {debugStore.renderHistory.map((entry, i) => {
              // Scale: 0-32ms maps to 0-100% height
              const heightPct = Math.min(100, (entry.durationMs / 32) * 100)
              const bgColor = entry.isHiccup ? 'bg-red-500' : 'bg-green-500'
              return (
                <div
                  key={i}
                  className={`flex-1 ${bgColor} rounded-sm min-w-[2px]`}
                  style={{ height: `${heightPct}%` }}
                  title={`${entry.durationMs.toFixed(1)}ms`}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
            <span>0ms</span>
            <span className="text-yellow-500">16ms</span>
            <span>32ms</span>
          </div>
        </div>
      )}

      {/* Active Phases Section */}
      {activePhases.length > 0 && (
        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-purple-400 font-semibold mb-1">Phases</div>
          <div className="space-y-0.5">
            {activePhases.map((phase) => (
              <Row
                key={phase.name}
                label={phase.name}
                value={`${phase.durationMs.toFixed(0)}ms`}
                status={phase.status}
              />
            ))}
          </div>
        </div>
      )}

      {/* Help */}
      <div className="border-t border-gray-600 pt-2 mt-2 text-gray-400 text-[10px]">
        Console: __VIBEGRID_DEBUG__.disable()
      </div>
    </div>
  )
})

interface RowProps {
  label: string
  value: string
  warn?: boolean
  status?: string
}

function Row({ label, value, warn, status }: RowProps) {
  const valueColor = warn
    ? 'text-red-400'
    : status === 'active'
      ? 'text-yellow-300'
      : status === 'complete'
        ? 'text-green-400'
        : 'text-white'

  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}:</span>
      <span className={valueColor}>{value}</span>
    </div>
  )
}
