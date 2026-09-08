/**
 * Shared types for MobX stores
 */

export interface IStore {
  /**
   * Initialize the store (async operations, hydration, etc.)
   */
  init(): Promise<void> | void

  /**
   * Cleanup resources, dispose reactions
   */
  dispose(): void
}

/**
 * Theme configuration
 */
export type ThemeMode = 'light' | 'dark' | 'system'

/**
 * Layout configuration
 */
export interface LayoutConfig {
  sidebarCollapsed: boolean
  sidebarWidth: number
  showBreadcrumbs: boolean
}

/**
 * Font configuration
 */
export type FontFamily = 'default' | 'mono' | 'sans' | 'serif'

/**
 * Direction configuration
 */
export type Direction = 'ltr' | 'rtl'
