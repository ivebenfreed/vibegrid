import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const MONOREPO_ROOT = resolve(import.meta.dirname ?? __dirname, '../../../..')

export interface EvalAuthConfig {
  /** Test user shorthand, e.g. 'deb.admin', 'ceo' */
  user: string
  /** Target environment */
  env: 'staging' | 'preview' | 'local'
}

/**
 * Run a bpd command with authentication context.
 * Returns stdout as a trimmed string.
 */
export function bpd(authConfig: EvalAuthConfig, command: string, timeoutMs = 30_000): string {
  const envFlag = authConfig.env === 'local' ? '' : `--${authConfig.env}`
  const fullCommand = `pnpm bpd ${envFlag} 'auth ${authConfig.user} | ${command}'`
  return execSync(fullCommand, {
    cwd: MONOREPO_ROOT,
    timeout: timeoutMs,
    encoding: 'utf-8',
  }).trim()
}

/**
 * Call an oRPC endpoint with authentication via bpd CLI.
 * Returns the parsed JSON response.
 */
export function orpc(
  authConfig: EvalAuthConfig,
  path: string,
  payload?: Record<string, unknown>,
  timeoutMs = 30_000,
): any {
  const payloadStr = payload ? ` ${JSON.stringify(payload)}` : ''
  const raw = bpd(authConfig, `orpc ${path}${payloadStr}`, timeoutMs)
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Run a raw shell command from the monorepo root.
 * Returns stdout as a trimmed string.
 */
export function shell(cmd: string, timeoutMs = 30_000): string {
  return execSync(cmd, {
    cwd: MONOREPO_ROOT,
    timeout: timeoutMs,
    encoding: 'utf-8',
  }).trim()
}
