/**
 * Centralized Icon Mapping
 *
 * Maps icon names to Unicode symbols for consistent display across
 * VibeGrid cell renderers and editing overlays.
 */

export const ICON_MAP: Record<string, string> = {
  // Directional arrows
  'arrow-down': '↓',
  'arrow-up': '↑',
  'arrow-left': '←',
  'arrow-right': '→',

  // Chevrons (UI navigation)
  'chevron': '⌄',
  'chevron-down': '⌄',
  'chevron-up': '⌃',
  'chevron-left': '‹',
  'chevron-right': '›',

  // Mathematical operators
  'minus': '−',
  'plus': '+',
  'equals': '=',

  // Status indicators
  'circle': '●',
  'check': '✓',
  'check-circle': '✓',
  'x': '✕',
  'x-circle': '✕',

  // Alert/warning
  'alert-triangle': '⚠',
  'warning': '⚠',
  'exclamation': '!',

  // Media controls
  'play': '▶',
  'pause': '⏸',
  'stop': '⏹',
  'record': '●',

  // Common UI elements
  'star': '★',
  'heart': '♥',
  'bookmark': '🔖',
  'flag': '🚩',

  // Priority indicators
  'low': '↓',
  'medium': '−',
  'high': '↑',
  'critical': '⚠',

  // Status workflows
  'todo': '○',
  'in-progress': '◐',
  'done': '●',
  'blocked': '⚠',
  'cancelled': '✕'
};

/**
 * Get Unicode symbol for an icon name
 * @param iconName - The icon name (e.g., 'arrow-down', 'chevron-up')
 * @returns Unicode symbol or empty string if not found
 */
export function getIconSymbol(iconName: string): string {
  return ICON_MAP[iconName] || '';
}

/**
 * Check if an icon name should be displayed (not just a UI element)
 * @param iconName - The icon name to check
 * @returns true if the icon should be shown as content
 */
export function shouldDisplayIcon(iconName: string): boolean {
  // Filter out pure UI elements that shouldn't be shown as content
  const uiOnlyIcons = ['chevron', 'chevron-down', 'chevron-up'];
  return !uiOnlyIcons.includes(iconName);
}

/**
 * Get icon display for an option, handling both mapping and filtering
 * @param iconName - The icon name from option data
 * @returns Unicode symbol or empty string
 */
export function getOptionIconDisplay(iconName: string | undefined): string {
  if (!iconName) return '';

  const symbol = getIconSymbol(iconName);
  return shouldDisplayIcon(iconName) ? symbol : '';
}