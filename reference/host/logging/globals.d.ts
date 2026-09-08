/**
 * TypeScript ambient globals for logger console APIs
 */

export interface ConsoleAPI {
  setLevel(level: 'debug' | 'info' | 'warning' | 'error' | 'fatal', category?: string[]): void
  getConfig(): any
  clearOverrides(): void
  removeOverride(category?: string[]): void
}

export interface VibegridLogPresets {
  warn(): void
  info(): void
  debug(): void
  quiet(): void
  normal(): void
  debugOverlays(): void
  debugCoordinates(): void
  debugMouse(): void
  debugEditors(): void
  status(): any
}

declare global {
  interface Window {
    __BASEPLANE_LOGGER__: ConsoleAPI
    __VIBEGRID_LOGS__: VibegridLogPresets
  }

  // Ambient globals (accessible from browser console)
  const __BASEPLANE_LOGGER__: ConsoleAPI
  const __VIBEGRID_LOGS__: VibegridLogPresets
}

export {}
