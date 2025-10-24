/**
 * Vibegrid Logging Presets
 *
 * Quick enable/disable presets for common Vibegrid debugging scenarios.
 * Use these in browser console to control log verbosity.
 */

import { setLogLevel, getLogConfig } from '@/lib/logging';

/**
 * Vibegrid logging presets for quick debugging
 */
export const VIBEGRID_LOG_PRESETS = {
  /**
   * Warn level - Only warnings and errors
   * Quietest mode for production-like experience
   */
  warn: () => {
    setLogLevel('warn', 'components/vibegrid/*');
    console.log('📵 Vibegrid logs: WARN level (warnings and errors only)');
  },

  /**
   * Info level - Balanced logging (DEFAULT)
   * Shows lifecycle events but hides diagnostic spam
   */
  info: () => {
    setLogLevel('info', 'components/vibegrid/*');
    // Hide noisy subsystems
    setLogLevel('warn', 'components/vibegrid/renderers/modules/OverlayManager');
    setLogLevel('warn', 'components/vibegrid/coordinates/*');
    setLogLevel('warn', 'components/vibegrid/performance/*');
    console.log('ℹ️ Vibegrid logs: INFO level (lifecycle + warnings + errors)');
  },

  /**
   * Debug level - All logs visible
   * Use when you need to see everything happening in Vibegrid
   */
  debug: () => {
    setLogLevel('debug', 'components/vibegrid/*');
    console.log('🔍 Vibegrid logs: DEBUG level (all logs visible)');
  },

  // Aliases for clarity
  quiet: function() { return this.warn(); },
  normal: function() { return this.info(); },

  /**
   * Debug overlays - Focus on overlay system
   * Shows detailed overlay positioning and state management
   */
  debugOverlays: () => {
    setLogLevel('warn', 'components/vibegrid/*');
    setLogLevel('debug', 'components/vibegrid/renderers/modules/OverlayManager');
    setLogLevel('debug', 'components/vibegrid/overlays/*');
    console.log('🎯 Vibegrid logs: OVERLAY DEBUG mode');
  },

  /**
   * Debug coordinates - Focus on coordinate system
   * Shows cell position calculations and coordinate mapping
   */
  debugCoordinates: () => {
    setLogLevel('warn', 'components/vibegrid/*');
    setLogLevel('debug', 'components/vibegrid/coordinates/*');
    setLogLevel('debug', 'components/vibegrid/renderers/core/SimplePassiveRenderer');
    console.log('📐 Vibegrid logs: COORDINATE DEBUG mode');
  },

  /**
   * Debug performance - Focus on performance metrics
   * Shows performance profiling and bottlenecks
   */
  debugPerformance: () => {
    setLogLevel('warn', 'components/vibegrid/*');
    setLogLevel('info', 'components/vibegrid/performance/*');
    console.log('⚡ Vibegrid logs: PERFORMANCE DEBUG mode');
  },

  /**
   * Debug mouse - Focus on mouse interactions
   * Shows mouse events, drag/drop, and selection changes
   */
  debugMouse: () => {
    setLogLevel('warn', 'components/vibegrid/*');
    setLogLevel('debug', 'components/vibegrid/renderers/modules/MouseController');
    setLogLevel('debug', 'components/vibegrid/renderers/utils/interaction-handlers');
    console.log('🖱️  Vibegrid logs: MOUSE DEBUG mode');
  },

  /**
   * Debug editors - Focus on cell editors
   * Shows editor creation, value changes, and commits
   */
  debugEditors: () => {
    setLogLevel('warn', 'components/vibegrid/*');
    setLogLevel('debug', 'components/vibegrid/overlays/editors/*');
    setLogLevel('debug', 'components/vibegrid/overlays/EditingOverlay');
    console.log('✏️  Vibegrid logs: EDITOR DEBUG mode');
  },

  /**
   * Debug fields - Focus on field types
   * Shows field rendering, value formatting, and cell creation
   */
  debugFields: () => {
    setLogLevel('warn', 'components/vibegrid/*');
    setLogLevel('debug', 'components/vibegrid/field-types/*');
    console.log('🔤 Vibegrid logs: FIELD DEBUG mode');
  },

  /**
   * Get current log configuration
   */
  status: () => {
    const config = getLogConfig();
    console.log('📋 Current Vibegrid log configuration:', config);
    return config;
  },
};

/**
 * Set default Vibegrid log levels for optimal development experience
 * Reduces spam while keeping important logs visible
 */
function initializeDefaultLevels() {
  // Use the info preset as default
  VIBEGRID_LOG_PRESETS.info();
}

/**
 * Expose presets on window for easy console access
 */
if (typeof window !== 'undefined') {
  (window as any).__VIBEGRID_LOGS__ = VIBEGRID_LOG_PRESETS;

  // Initialize default log levels
  initializeDefaultLevels();

  // Log availability on module load
  console.log('✅ Vibegrid logging presets available: __VIBEGRID_LOGS__');
  console.log('   Log Levels:');
  console.log('   - __VIBEGRID_LOGS__.warn()        // Warn+ only');
  console.log('   - __VIBEGRID_LOGS__.info()        // Info+ (default)');
  console.log('   - __VIBEGRID_LOGS__.debug()       // All logs');
  console.log('   Focus Modes:');
  console.log('   - __VIBEGRID_LOGS__.debugOverlays() // Overlay debugging');
  console.log('   - __VIBEGRID_LOGS__.debugMouse()  // Mouse events');
  console.log('   - __VIBEGRID_LOGS__.debugEditors() // Cell editors');
  console.log('   Other:');
  console.log('   - __VIBEGRID_LOGS__.status()      // Show config');
}
