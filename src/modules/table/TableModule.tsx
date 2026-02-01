/**
 * TableModule - Default VibeGrid view mode
 *
 * Renders the standard table view with virtual scrolling.
 * This is the simplest module as the table is the default renderer.
 *
 * @see GridModule for interface definition
 * @see Issue #1416 for architecture overview
 */

import React from 'react'
import type { GridModule, GridModuleRenderProps } from '../GridModule'
import type { VibeGridStores } from '../../stores/context'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'modules', 'TableModule'])

/**
 * TableModuleContent - The actual table view rendering
 *
 * This is a simple passthrough since the table view is rendered
 * by SimplePassiveRenderer which is already attached to the container.
 *
 * The table view doesn't need its own React component - the DOM rendering
 * is handled by SimplePassiveRenderer which is initialized by InitStore.
 */
function TableModuleContent({
  stores,
}: {
  props: GridModuleRenderProps
  stores: VibeGridStores
}) {
  // Table view content is rendered directly by SimplePassiveRenderer
  // This component just indicates that table mode is active
  // The actual rendering happens in the containerRef element

  logger.debug('TableModule render - content rendered by SimplePassiveRenderer')

  // Return empty fragment - the table is rendered by SimplePassiveRenderer
  // into the containerRef element, not as a React component
  return null
}

/**
 * TableModule: Default VibeGrid view mode.
 *
 * Renders traditional scrollable table with virtual scrolling.
 * This is the default view mode and simplest module.
 */
export const TableModule: GridModule = {
  id: 'table',
  displayName: 'Table View',
  icon: 'table',

  // No init needed - TableCoreStore and SimplePassiveRenderer are always initialized
  // init: undefined,

  render: (props: GridModuleRenderProps, stores: VibeGridStores) => {
    return <TableModuleContent props={props} stores={stores} />
  },

  // No custom slots for table view
  // registerSlots: undefined,
}

export default TableModule
