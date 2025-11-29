/**
 * Vibegrid Logging Presets (LogTape-powered)
 *
 * Quick enable/disable presets for common Vibegrid debugging scenarios.
 * Use these in browser console to control log verbosity.
 */

/**
 * Vibegrid logging presets for quick debugging
 */
export const VIBEGRID_LOG_PRESETS = {
	/**
	 * Warn level - Only warnings and errors
	 */
	warn() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			;(window as any).__BASEPLANE_LOGGER__.setLevel('warning', ['vibegrid'])
			console.log('📵 Vibegrid logs: WARN level (warnings and errors only)')
		}
	},

	/**
	 * Info level - Balanced logging (DEFAULT)
	 */
	info() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			;(window as any).__BASEPLANE_LOGGER__.setLevel('info', ['vibegrid'])
			console.log('ℹ️ Vibegrid logs: INFO level (lifecycle + warnings + errors)')
		}
	},

	/**
	 * Debug level - All logs visible
	 */
	debug() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			;(window as any).__BASEPLANE_LOGGER__.setLevel('debug', ['vibegrid'])
			console.log('🔍 Vibegrid logs: DEBUG level (all logs visible)')
		}
	},

	// Aliases
	quiet() {
		return this.warn()
	},
	normal() {
		return this.info()
	},

	/**
	 * Debug overlays - Focus on overlay system
	 */
	debugOverlays() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			;(window as any).__BASEPLANE_LOGGER__.setLevel('warning', ['vibegrid'])
			;(window as any).__BASEPLANE_LOGGER__.setLevel('debug', [
				'vibegrid',
				'overlays',
			])
			console.log('🎯 Vibegrid logs: OVERLAY DEBUG mode')
		}
	},

	/**
	 * Debug coordinates - Focus on coordinate system
	 */
	debugCoordinates() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			;(window as any).__BASEPLANE_LOGGER__.setLevel('warning', ['vibegrid'])
			;(window as any).__BASEPLANE_LOGGER__.setLevel('debug', [
				'vibegrid',
				'coordinates',
			])
			console.log('📐 Vibegrid logs: COORDINATE DEBUG mode')
		}
	},

	/**
	 * Debug mouse - Focus on mouse interactions
	 */
	debugMouse() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			;(window as any).__BASEPLANE_LOGGER__.setLevel('warning', ['vibegrid'])
			;(window as any).__BASEPLANE_LOGGER__.setLevel('debug', [
				'vibegrid',
				'mouse',
			])
			console.log('🖱️  Vibegrid logs: MOUSE DEBUG mode')
		}
	},

	/**
	 * Debug editors - Focus on cell editors
	 */
	debugEditors() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			;(window as any).__BASEPLANE_LOGGER__.setLevel('warning', ['vibegrid'])
			;(window as any).__BASEPLANE_LOGGER__.setLevel('debug', [
				'vibegrid',
				'editors',
			])
			console.log('✏️  Vibegrid logs: EDITOR DEBUG mode')
		}
	},

	/**
	 * Get current log configuration
	 */
	status() {
		if (typeof window !== 'undefined' && (window as any).__BASEPLANE_LOGGER__) {
			const config = (window as any).__BASEPLANE_LOGGER__.getConfig()
			console.log('📋 Current Vibegrid log configuration:', config)
			return config
		}
		return null
	},
}

/**
 * Expose presets on window for easy console access
 */
if (typeof window !== 'undefined') {
	;(window as any).__VIBEGRID_LOGS__ = VIBEGRID_LOG_PRESETS
	console.log('✅ Vibegrid logging presets available: __VIBEGRID_LOGS__')
}
