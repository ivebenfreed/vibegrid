/**
 * GroupConfigDropdownPure — disabled post-GH#2806 P8.
 *
 * Group-by UI is disabled for every VibeGrid-rendered entity (substrate is
 * the unconditional data path; the substrate's SQL emitter doesn't support
 * group-by). This dropdown now always renders nothing.
 *
 * Kept as an exported component (prop-shape stable) so the rest of the grid
 * chrome (header buttons, toolbar wiring) doesn't have to learn that
 * group-by is gone. To restore group-by, see git log for GH#2806 P8 and
 * reinstate the prior implementation behind a feature flag tied to
 * substrate group-by SQL support.
 */

import { observer } from 'mobx-react-lite'
import type { VibeGridStores } from '../stores/context'

interface GroupConfigDropdownPureProps {
  stores: VibeGridStores
  className?: string
}

export const GroupConfigDropdownPure = observer(function GroupConfigDropdownPure(
  _props: GroupConfigDropdownPureProps,
) {
  return null
})
