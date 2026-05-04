/**
 * GroupConfigPanel — disabled post-GH#2806 P8.
 *
 * Group-by UI is disabled for every VibeGrid-rendered entity (substrate is
 * the unconditional data path; the substrate's SQL emitter doesn't support
 * group-by). This component now always renders nothing.
 *
 * Kept as an exported component (prop-shape stable) so the rest of the grid
 * chrome doesn't have to learn that group-by is gone. To restore group-by,
 * see git log for GH#2806 P8 and reinstate the prior implementation behind
 * a feature flag tied to substrate group-by SQL support.
 */

import type { Column, GroupConfig } from '../types'

interface GroupConfigPanelProps {
  columns: Column[]
  groupConfig: GroupConfig | null
  onGroupConfigChange: (config: GroupConfig | null) => void
  className?: string
  /** Unused post-cutover. Kept for prop-shape compatibility. */
  entityName?: string
}

export function GroupConfigPanel(_props: GroupConfigPanelProps) {
  return null
}
