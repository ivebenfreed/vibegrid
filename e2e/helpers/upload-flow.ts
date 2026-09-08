import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { type EvalAuthConfig, orpc, shell } from './eval-auth'

export interface UploadConfig {
  /** Absolute path to the PDF file to upload */
  pdfPath: string
  /** Entity schema ID, e.g. 'CertificateOfInsurance' */
  entitySchemaId: string
  /** Auth configuration */
  auth: EvalAuthConfig
  /** Timeout for polling the upload/extraction workflow (default 90000) */
  pollTimeout?: number
}

export interface UploadResult {
  entityId: string
  executionId?: string
  status: string
  durationMs: number
}

/**
 * Upload a file via the presigned URL flow and wait for processing to complete.
 *
 * Steps:
 * 1. Get presigned URL via /workflows/upload/getPresignedUrls
 * 2. PUT file to R2 via the presigned URL (curl)
 * 3. Complete upload via /workflows/upload/completeUpload
 * 4. Poll upload status until extraction finishes
 */
export async function uploadFile(config: UploadConfig): Promise<UploadResult> {
  const start = Date.now()
  const timeout = config.pollTimeout ?? 90_000
  const fileBuffer = readFileSync(config.pdfPath)
  const fileName = `eval-${Date.now()}-${basename(config.pdfPath)}`

  // Step 1: Get presigned URL
  const presignResult = orpc(config.auth, '/workflows/upload/getPresignedUrls', {
    entity_schema_id: config.entitySchemaId,
    files: [{ file_name: fileName, file_size: fileBuffer.length, mime_type: 'application/pdf' }],
  })

  const fileInfo = Array.isArray(presignResult) ? presignResult[0] : presignResult
  if (!fileInfo?.file_id || !fileInfo?.presigned_url) {
    throw new Error(`presignedUrls failed: ${JSON.stringify(presignResult).slice(0, 500)}`)
  }

  // Step 2: Upload to R2 via presigned URL using curl
  // Write file to a temp location and use curl (avoids shell escaping issues with binary data)
  const tmpPath = `/tmp/eval-upload-${Date.now()}.pdf`
  const { writeFileSync, unlinkSync } = await import('node:fs')
  writeFileSync(tmpPath, fileBuffer)

  try {
    shell(
      `curl -sf -X PUT "${fileInfo.presigned_url}" -H "Content-Type: application/pdf" --data-binary @${tmpPath}`,
      30_000,
    )
  } finally {
    try {
      unlinkSync(tmpPath)
    } catch {
      // Cleanup best-effort
    }
  }

  // Step 3: Complete upload
  const completeResult = orpc(config.auth, '/workflows/upload/completeUpload', {
    file_id: fileInfo.file_id,
  })

  if (!completeResult?.entity_id) {
    throw new Error(`completeUpload failed: ${JSON.stringify(completeResult).slice(0, 500)}`)
  }

  const entityId = completeResult.entity_id

  // Step 4: Poll upload status until extraction finishes
  const deadline = start + timeout
  let finalStatus = 'processing'

  while (Date.now() < deadline) {
    const result = orpc(config.auth, '/workflows/upload/uploadStatus', {
      entity_ids: [entityId],
    })

    const statuses: any[] = Array.isArray(result) ? result : result.statuses ?? result
    const entry = statuses.find((s: any) => s.entity_id === entityId)
    const status = entry?.status ?? 'unknown'

    if (status !== 'processing' && status !== 'unknown') {
      finalStatus = status
      break
    }

    await new Promise((r) => setTimeout(r, 5_000))
  }

  return {
    entityId,
    executionId: completeResult.execution_id,
    status: finalStatus,
    durationMs: Date.now() - start,
  }
}
