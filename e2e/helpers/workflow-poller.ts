import { type EvalAuthConfig, orpc } from './eval-auth'

export interface PollConfig {
  /** Match by template slug */
  templateSlug?: string
  /** Match by trigger entity ID */
  triggerEntityId?: string
  /** Match by known execution ID (skip search, poll directly) */
  executionId?: string
  /** Only consider executions created after this ISO timestamp */
  createdAfter?: string
  /** Maximum time to wait in ms (default 90000) */
  timeout?: number
  /** Interval between polls in ms (default 5000) */
  pollInterval?: number
}

export interface PollResult {
  executionId: string
  status: string
  durationMs: number
  output: Record<string, any> | null
}

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled']

/**
 * Poll a workflow execution until it reaches a terminal state.
 *
 * If `executionId` is provided, polls that execution directly.
 * Otherwise, searches recent executions matching the provided filters
 * (templateSlug, triggerEntityId, createdAfter) and polls the first match.
 */
export async function pollExecution(
  auth: EvalAuthConfig,
  config: PollConfig,
): Promise<PollResult> {
  const timeout = config.timeout ?? 90_000
  const interval = config.pollInterval ?? 5_000
  const start = Date.now()
  const deadline = start + timeout

  let executionId = config.executionId

  // Phase 1: Find the execution if no ID was provided
  while (!executionId && Date.now() < deadline) {
    const result = orpc(auth, '/workflows/executions/list', { limit: 20 })
    const executions: any[] = result.executions ?? result ?? []

    const match = executions.find((e: any) => {
      if (config.templateSlug && e.workflow_name !== config.templateSlug && e.template_slug !== config.templateSlug) {
        return false
      }
      if (config.triggerEntityId && e.trigger_data?.entity_id !== config.triggerEntityId) {
        return false
      }
      if (config.createdAfter && new Date(e.created_at).getTime() < new Date(config.createdAfter).getTime()) {
        return false
      }
      return true
    })

    if (match) {
      executionId = match.id
      break
    }

    await sleep(interval)
  }

  if (!executionId) {
    throw new Error(
      `No matching execution found within ${timeout}ms (filters: ${JSON.stringify(config)})`,
    )
  }

  // Phase 2: Poll until terminal status
  while (Date.now() < deadline) {
    const exec = orpc(auth, '/workflows/executions/get', { execution_id: executionId })

    if (TERMINAL_STATUSES.includes(exec.status)) {
      return {
        executionId,
        status: exec.status,
        durationMs: Date.now() - start,
        output: exec.output ?? null,
      }
    }

    await sleep(interval)
  }

  throw new Error(`Execution ${executionId} did not reach terminal state within ${timeout}ms`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
