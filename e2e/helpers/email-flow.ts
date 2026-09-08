import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { resolve } from 'node:path'
import { type EvalAuthConfig, orpc, shell } from './eval-auth'

const GWS_BIN = resolve(process.env.HOME || '/home/ubuntu', '.npm-global/bin/gws')

export interface EmailConfig {
  /** One or more PDF file paths to attach */
  pdfPaths: string[]
  /** Email subject (default: auto-generated with timestamp) */
  subject?: string
  /** Recipient email address (default: 'ben@baseplane.ai' for DEB) */
  toAddress?: string
  /** Template slug to match triggered workflow (default: 'coi-incoming-processing') */
  templateSlug?: string
  /** Auth configuration for polling executions */
  auth: EvalAuthConfig
  /** Total timeout in ms including email delivery + workflow execution (default 120000) */
  timeout?: number
}

export interface EmailResult {
  entityIds: string[]
  executionIds: string[]
  status: string
  durationMs: number
}

/**
 * Build an RFC 2822 MIME multipart message with PDF attachments,
 * base64url-encode it, and send via Gmail API (gws CLI).
 *
 * Returns the Gmail message ID.
 */
function sendMimeEmail(to: string, subject: string, body: string, attachmentPaths: string[]): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  const parts: string[] = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    body,
  ]

  for (const attachmentPath of attachmentPaths) {
    const pdfData = readFileSync(attachmentPath)
    const pdfBase64 = pdfData.toString('base64')
    const pdfName = basename(attachmentPath)

    parts.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${pdfName}"`,
      `Content-Disposition: attachment; filename="${pdfName}"`,
      `Content-Transfer-Encoding: base64`,
      '',
      pdfBase64,
    )
  }

  parts.push(`--${boundary}--`)

  const mime = parts.join('\r\n')
  const encoded = Buffer.from(mime).toString('base64url')
  const payload = JSON.stringify({ raw: encoded })

  // Shell-escape single quotes in the JSON payload
  const escaped = payload.replace(/'/g, "'\\''")
  const cmd = `${GWS_BIN} gmail users messages send --params '{"userId":"me"}' --json '${escaped}'`

  const result = shell(cmd, 30_000)
  const parsed = JSON.parse(result)
  return parsed.id
}

/**
 * Send email(s) with PDF attachment(s) and poll for triggered workflow executions.
 *
 * Steps:
 * 1. Build RFC 2822 MIME multipart with base64url-encoded PDF attachments
 * 2. Send via gws CLI (Gmail API)
 * 3. Poll for triggered workflow executions matching the template slug
 * 4. Wait for all triggered executions to reach terminal state
 */
export async function sendEmailWithPdfs(config: EmailConfig): Promise<EmailResult> {
  const start = Date.now()
  const timeout = config.timeout ?? 120_000
  const toAddress = config.toAddress ?? 'ben@baseplane.ai'
  const timestamp = Date.now()
  const subject = config.subject ?? `Eval email ${timestamp}`

  if (!existsSync(GWS_BIN)) {
    throw new Error(`gws CLI not found at ${GWS_BIN}`)
  }

  for (const pdfPath of config.pdfPaths) {
    if (!existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`)
    }
  }

  // Snapshot execution count before sending
  const beforeResult = orpc(config.auth, '/workflows/executions/list', { limit: 1 })
  const beforeTotal = beforeResult.total ?? 0

  // Send the email
  sendMimeEmail(
    toAddress,
    subject,
    `Automated eval email -- timestamp ${timestamp}`,
    config.pdfPaths,
  )

  // Poll for new executions triggered by the email
  const deadline = start + timeout
  const pollInterval = 10_000
  const foundExecutionIds: string[] = []
  const foundEntityIds: string[] = []
  let lastStatus = 'waiting'

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval))

    const afterResult = orpc(config.auth, '/workflows/executions/list', { limit: 20 })
    const afterTotal = afterResult.total ?? 0

    if (afterTotal > beforeTotal) {
      const executions: any[] = afterResult.executions ?? []

      // Find email-triggered executions created after we sent
      const newExecs = executions.filter(
        (e: any) =>
          e.trigger_type === 'email' && new Date(e.created_at).getTime() > start,
      )

      for (const exec of newExecs) {
        if (!foundExecutionIds.includes(exec.id)) {
          foundExecutionIds.push(exec.id)
          const entityId =
            exec.output?.entity_id ??
            exec.trigger_data?.entity_id ??
            exec.output?.coi_id
          if (entityId && !foundEntityIds.includes(entityId)) {
            foundEntityIds.push(entityId)
          }
        }
      }

      if (foundExecutionIds.length > 0) {
        // Check if all found executions are terminal
        const allTerminal = newExecs.every((e: any) =>
          ['completed', 'failed', 'cancelled'].includes(e.status),
        )

        if (allTerminal) {
          lastStatus = newExecs.every((e: any) => e.status === 'completed')
            ? 'completed'
            : 'partial'
          break
        }

        lastStatus = 'running'
      }
    }
  }

  // If we found executions but they haven't all completed, poll each individually
  if (lastStatus === 'running') {
    for (const execId of foundExecutionIds) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) break

      const pollDeadline = Date.now() + remaining
      while (Date.now() < pollDeadline) {
        const exec = orpc(config.auth, '/workflows/executions/get', { execution_id: execId })
        if (['completed', 'failed', 'cancelled'].includes(exec.status)) {
          // Extract entity ID from output if available
          const entityId = exec.output?.entity_id ?? exec.output?.coi_id
          if (entityId && !foundEntityIds.includes(entityId)) {
            foundEntityIds.push(entityId)
          }
          break
        }
        await new Promise((r) => setTimeout(r, 5_000))
      }
    }
    lastStatus = 'completed'
  }

  return {
    entityIds: foundEntityIds,
    executionIds: foundExecutionIds,
    status: foundExecutionIds.length > 0 ? lastStatus : 'no_execution_found',
    durationMs: Date.now() - start,
  }
}
