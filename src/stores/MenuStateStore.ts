/**
 * MenuStateStore - Menu State Management (MobX)
 *
 * Extracted from InteractionStore (GH#2034 P1).
 * Owns all menu open/close state: header menu, context menu,
 * column visibility menu, group config menu, row action menu.
 */

import { action, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'stores', 'MenuStateStore'])

// ====================================
// TYPES
// ====================================

export interface HeaderMenuState {
  openMenu: string | null // columnId of open menu
  position: { x: number; y: number }
  menuType: 'filter' | 'sort' | 'settings' | null
}

export interface ContextMenuState {
  isOpen: boolean
  position: { x: number; y: number }
  context: 'cell' | 'row' | 'column' | 'header' | null
  targetId: string | null // cellId, rowId, or columnId
}

export interface ColumnVisibilityMenuState {
  isOpen: boolean
  searchValue: string
}

export interface GroupConfigMenuState {
  isOpen: boolean
}

export interface RowActionMenuState {
  isOpen: boolean
  position: { x: number; y: number }
  rowId: string | null
}

// ====================================
// STORE
// ====================================

/**
 * MenuStateStore - Manages all menu open/close state
 *
 * Handles:
 * - Header menu (filter, sort, settings per column)
 * - Context menu (cell, row, column, header)
 * - Column visibility menu
 * - Group config menu
 * - Row action menu
 */
export class MenuStateStore implements IStore {
  // ====================================
  // MENU STATES
  // ====================================

  @observable headerMenuState: HeaderMenuState = {
    openMenu: null,
    position: { x: 0, y: 0 },
    menuType: null,
  }

  @observable contextMenuState: ContextMenuState = {
    isOpen: false,
    position: { x: 0, y: 0 },
    context: null,
    targetId: null,
  }

  @observable columnVisibilityMenuState: ColumnVisibilityMenuState = {
    isOpen: false,
    searchValue: '',
  }

  @observable groupConfigMenuState: GroupConfigMenuState = {
    isOpen: false,
  }

  @observable rowActionMenuState: RowActionMenuState = {
    isOpen: false,
    position: { x: 0, y: 0 },
    rowId: null,
  }

  constructor() {
    makeObservable(this)
  }

  /**
   * Initialize store
   */
  init(): void {
    logger.info('Initializing MenuStateStore')
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    logger.info('MenuStateStore disposed')
  }

  /**
   * Reset to default state
   */
  @action
  reset(): void {
    this.headerMenuState = { openMenu: null, position: { x: 0, y: 0 }, menuType: null }
    this.contextMenuState = {
      isOpen: false,
      position: { x: 0, y: 0 },
      context: null,
      targetId: null,
    }
    this.columnVisibilityMenuState = { isOpen: false, searchValue: '' }
    this.groupConfigMenuState = { isOpen: false }
    this.rowActionMenuState = { isOpen: false, position: { x: 0, y: 0 }, rowId: null }
    logger.info('MenuStateStore reset to defaults')
  }

  // ====================================
  // MENU ACTIONS
  // ====================================

  @action
  openHeaderMenu(
    columnId: string,
    position: { x: number; y: number },
    menuType: 'filter' | 'sort' | 'settings',
  ): void {
    // Close other menus first
    this.contextMenuState.isOpen = false
    this.columnVisibilityMenuState.isOpen = false
    this.groupConfigMenuState.isOpen = false

    // Open header menu
    this.headerMenuState = {
      openMenu: columnId,
      position,
      menuType,
    }

    logger.info('Header menu opened', { columnId, position, menuType })
  }

  @action
  closeHeaderMenu(): void {
    this.headerMenuState = {
      openMenu: null,
      position: { x: 0, y: 0 },
      menuType: null,
    }

    logger.info('Header menu closed')
  }

  @action
  openContextMenu(
    position: { x: number; y: number },
    context: 'cell' | 'row' | 'column' | 'header',
    targetId: string,
  ): void {
    // Close other menus first
    this.headerMenuState.openMenu = null
    this.columnVisibilityMenuState.isOpen = false
    this.groupConfigMenuState.isOpen = false

    // Open context menu
    this.contextMenuState = {
      isOpen: true,
      position,
      context,
      targetId,
    }

    logger.info('Context menu opened', { position, context, targetId })
  }

  @action
  closeContextMenu(): void {
    this.contextMenuState = {
      isOpen: false,
      position: { x: 0, y: 0 },
      context: null,
      targetId: null,
    }

    logger.info('Context menu closed')
  }

  @action
  openColumnVisibilityMenu(): void {
    // Close other menus first
    this.headerMenuState.openMenu = null
    this.contextMenuState.isOpen = false
    this.groupConfigMenuState.isOpen = false

    // Open column visibility menu
    this.columnVisibilityMenuState = {
      isOpen: true,
      searchValue: '',
    }

    logger.info('Column visibility menu opened')
  }

  @action
  closeColumnVisibilityMenu(): void {
    this.columnVisibilityMenuState = {
      isOpen: false,
      searchValue: '',
    }

    logger.info('Column visibility menu closed')
  }

  @action
  setColumnVisibilitySearch(searchValue: string): void {
    this.columnVisibilityMenuState = {
      ...this.columnVisibilityMenuState,
      searchValue,
    }
  }

  @action
  openGroupConfigMenu(): void {
    // Close other menus first
    this.headerMenuState.openMenu = null
    this.contextMenuState.isOpen = false
    this.columnVisibilityMenuState.isOpen = false

    // Open group config menu
    this.groupConfigMenuState = {
      isOpen: true,
    }

    logger.info('Group config menu opened')
  }

  @action
  closeGroupConfigMenu(): void {
    this.groupConfigMenuState = {
      isOpen: false,
    }

    logger.info('Group config menu closed')
  }

  @action
  openRowActionMenu(rowId: string, position: { x: number; y: number }): void {
    // Close other menus first
    this.headerMenuState.openMenu = null
    this.contextMenuState.isOpen = false
    this.columnVisibilityMenuState.isOpen = false
    this.groupConfigMenuState.isOpen = false

    // Open row action menu
    this.rowActionMenuState = {
      isOpen: true,
      position,
      rowId,
    }

    logger.info('Row action menu opened', { rowId, position })
  }

  @action
  closeRowActionMenu(): void {
    this.rowActionMenuState = {
      isOpen: false,
      position: { x: 0, y: 0 },
      rowId: null,
    }

    logger.info('Row action menu closed')
  }
}
