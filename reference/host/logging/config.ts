/**
 * LogTape configuration for Baseplane
 */
import { configure, getConsoleSink, type LogLevel } from '@logtape/logtape'

/**
 * Default logging configuration
 */
export function configureDefaultLogging() {
  const isDev = import.meta.env?.DEV ?? false
  // `isDev` is true only for `vite dev`. Built bundles (preview, staging,
  // production) all see `isDev=false`. We want info-level logs visible on
  // preview + staging — only production should default to `warning`.
  // `app.baseplane.ai` is the only host that should suppress info; everything
  // else (localhost, *.dev.baseplane.ai) shows info by default.
  const isProdHost =
    typeof window !== 'undefined' && window.location?.hostname === 'app.baseplane.ai'
  const defaultLevel: LogLevel =
    (import.meta.env?.VITE_LOG_LEVEL as LogLevel) || (isProdHost ? 'warning' : 'info')

  configure({
    sinks: {
      console: getConsoleSink({
        formatter: (record) => {
          // LogTape emits `record.level` as 'debug' | 'info' | 'warning' |
          // 'error' | 'fatal'. The previous map keyed on 'warn' (our
          // logger method name) which never matched the actual level
          // string — so warning logs rendered with an empty emoji prefix
          // and looked indistinguishable from level-less output.
          const emojiMap: Record<string, string> = {
            debug: '🔍',
            info: 'ℹ️',
            warning: '⚠️',
            error: '❌',
            fatal: '💀',
          }
          const emoji = emojiMap[record.level] || ''

          const time = new Date(record.timestamp).toISOString().substring(11, 23)
          // Show the full dotted category path so the root prefix is
          // visible. Previously rendered only the LAST segment, which
          // hid the root — e.g. ['substrate', 'worker-sync'] showed as
          // [worker-sync] with no indication the log belonged to the
          // substrate chain. Now:
          //   [substrate.worker-sync], [substrate.sqlite.schema], etc.
          const category = record.category.length > 0 ? record.category.join('.') : 'root'

          // LogTape's `record.properties` holds the structured payload passed
          // as the 2nd arg to `logger.warn('msg', { ... })` /
          // `logger.error('msg', err)`. Previously dropped — every structured
          // log call rendered as a bare string with no recoverable context.
          // Serialize to a compact JSON tail. Errors are unwrapped to
          // {name, message, stack} since Error doesn't JSON.stringify
          // usefully by default.
          const props = record.properties as Record<string, unknown> | undefined
          let payload = ''
          if (props && Object.keys(props).length > 0) {
            const replaced = Object.fromEntries(
              Object.entries(props).map(([k, v]) => {
                if (v instanceof Error) {
                  return [k, { name: v.name, message: v.message, stack: v.stack }]
                }
                return [k, v]
              }),
            )
            try {
              payload = ` ${JSON.stringify(replaced)}`
            } catch {
              payload = ' [unserializable properties]'
            }
          }

          return `${emoji} ${time} [${category}] ${record.message}${payload}`
        },
      }),
    },
    loggers: [
      // Suppress LogTape's own meta logger messages
      { category: ['logtape', 'meta'], lowestLevel: 'warning' as LogLevel },

      // Global default
      { category: [], lowestLevel: defaultLevel, sinks: ['console'] },

      // Non-production overrides — apply on dev, preview, AND staging hosts
      // so diagnostic info logs are visible in the console.
      // Categories can be promoted to debug on demand from the console:
      //   __BASEPLANE_LOGGER__.setLevel('debug', ['vibegrid'])
      //   __BASEPLANE_LOGGER__.setLevel('debug', ['substrate'])
      ...(isProdHost
        ? []
        : [
            { category: ['stores'], lowestLevel: 'info' as LogLevel },
            { category: ['vibegrid'], lowestLevel: 'info' as LogLevel },
            { category: ['substrate'], lowestLevel: 'info' as LogLevel },
            { category: ['data'], lowestLevel: 'info' as LogLevel },
          ]),
    ],
  })
}
