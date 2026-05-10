#!/usr/bin/env tsx
/**
 * Canonical WideCorp Seeder for VIbeGrid Smoke Testing — GH#2908
 *
 * Generates synthetic entity records into WideCorp at scales that exercise
 * every documented VIbeGrid behavior (virtualization, kanban, gantt,
 * grouping, saved-view live counts, dual-layer cell upgrade, sort/filter
 * on promoted vs unpromoted columns).
 *
 * Storage: shared `entity_records` table keyed by `entity_type_id`. Per-org
 * tables are deprecated. See docs/planning/research/2026-05-08-widecorp-
 * schema-audit.md for the audit that established this.
 *
 * Companion docs:
 *   - docs/planning/specs/2908-realistic-seed-data-for-vibegrid-smoke-t.md
 *   - docs/planning/research/2026-05-08-vibegrid-realistic-seed-data.md
 *   - docs/planning/research/2026-05-08-widecorp-schema-audit.md
 *   - docs/planning/research/2026-05-08-widecorp-renderer-coverage-audit.md
 *
 * Replaces (deprecated, will be removed in follow-up):
 *   - apps/web/scripts/sophisticated-widecorp-seeder.js
 *   - apps/web/scripts/seed-realistic-data.ts
 *
 * Usage:
 *   pnpm tsx apps/web/scripts/seed-vibegrid-scale.ts --target=staging --count=5000 --dry-run
 *   pnpm tsx apps/web/scripts/seed-vibegrid-scale.ts --target=staging --count=50000
 *   pnpm tsx apps/web/scripts/seed-vibegrid-scale.ts --target=staging --count=900000 --seed=42
 *   pnpm tsx apps/web/scripts/seed-vibegrid-scale.ts --target=staging --clean --confirm
 */

import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import {
  CANONICAL_SCHEMAS,
  RELATIONSHIP_TYPES,
  buildDistribution,
  generateClient,
  generateCompany,
  generateContact,
  generateVendor,
  generateWorkTask,
  generateWorkItem,
  generatePaymentCycle,
  generatePaymentLine,
  generateRelationship,
  buildSavedViews,
  WIDECORP_ORG_ID,
  SEED_NAMESPACE,
  type SeedDistribution,
  type UserPoolMember,
} from './seed-vibegrid-scale.lib.js'

// ============================================================================
// CLI
// ============================================================================

interface CLIArgs {
  target: 'staging' | 'preview' | 'local'
  count: number
  seed: number
  types: string[] | null
  clean: boolean
  confirm: boolean
  dryRun: boolean
  noRelationships: boolean
  skipEmbeddings: boolean
  batchSize: number
  installSchemaMods: boolean
  installSavedViews: boolean
}

function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {
    target: 'staging',
    count: 5000,
    seed: 42,
    types: null,
    clean: false,
    confirm: false,
    dryRun: false,
    noRelationships: false,
    skipEmbeddings: true,
    batchSize: 5000,
    installSchemaMods: true,
    installSavedViews: true,
  }
  for (const arg of argv) {
    if (arg.startsWith('--target=')) {
      const v = arg.slice('--target='.length)
      if (v !== 'staging' && v !== 'preview' && v !== 'local') {
        if (v === 'production') throw new Error('production target is hard-blocked')
        throw new Error(`unknown --target=${v}`)
      }
      args.target = v
    } else if (arg.startsWith('--count=')) args.count = Number.parseInt(arg.slice('--count='.length), 10)
    else if (arg.startsWith('--seed=')) args.seed = Number.parseInt(arg.slice('--seed='.length), 10)
    else if (arg.startsWith('--types=')) args.types = arg.slice('--types='.length).split(',').map((s) => s.trim())
    else if (arg.startsWith('--batch-size=')) args.batchSize = Number.parseInt(arg.slice('--batch-size='.length), 10)
    else if (arg === '--clean') args.clean = true
    else if (arg === '--confirm') args.confirm = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--no-relationships') args.noRelationships = true
    else if (arg === '--no-skip-embeddings') args.skipEmbeddings = false
    else if (arg === '--no-schema-mods') args.installSchemaMods = false
    else if (arg === '--no-saved-views') args.installSavedViews = false
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('--')) {
      console.error(`unknown flag: ${arg}`)
      printHelp()
      process.exit(1)
    }
  }
  if (args.clean && !args.confirm) {
    throw new Error('--clean requires --confirm (safety guard)')
  }
  return args
}

function printHelp(): void {
  console.log(`
seed-vibegrid-scale — canonical WideCorp seeder (GH#2908)

USAGE
  pnpm tsx apps/web/scripts/seed-vibegrid-scale.ts [flags]

FLAGS
  --target=staging|preview|local   Default: staging. (production hard-blocked.)
  --count=N                        Total target rows. Default: 5000.
                                   Wave guidance: 5k baseline, 50k kanban+gantt,
                                   350k virtualization stress, 900k full distribution.
  --seed=N                         Deterministic RNG seed. Default: 42.
  --types=A,B,C                    Limit to subset of canonical entity types.
                                   Available: ${CANONICAL_SCHEMAS.join(', ')}.
  --batch-size=N                   Rows per multi-row INSERT. Default: 5000.
  --clean                          TRUNCATE WideCorp entity_records before seed.
                                   Requires --confirm.
  --confirm                        Acknowledge destructive operations.
  --dry-run                        Compute and print plan without writing.
  --no-relationships               Skip relationship row inserts.
  --no-skip-embeddings             Insert with computed embeddings (default skips).
  --no-schema-mods                 Skip the file-field schema modification.
  --no-saved-views                 Skip the saved-view inserts.
  --help, -h                       Print this and exit.
`)
}

// ============================================================================
// Database
// ============================================================================

interface DbContext {
  sql: postgres.Sql
  args: CLIArgs
  users: UserPoolMember[]
}

async function connectDb(args: CLIArgs): Promise<postgres.Sql> {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  config({ path: resolve(__dirname, '../.env') })
  config({ path: resolve(__dirname, '../.env.local'), override: true })

  let connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL not set in apps/web/.env or .env.local')
  // Use direct connection (port 5432) instead of pooled (port 6432) for DDL/bulk.
  connectionString = connectionString.replace(':6432/', ':5432/')

  // Connection-level production safety guard. The CLI parser hard-blocks
  // --target=production, but DATABASE_URL could theoretically point at prod
  // by mistake. Production Neon endpoints contain "ep-prod" or specific
  // production project IDs; we hard-error if we detect any of those patterns.
  const url = new URL(connectionString)
  const host = url.hostname
  if (
    host.includes('-prod-') ||
    host.includes('production') ||
    host.includes('app.baseplane') ||
    host === 'app.baseplane.ai'
  ) {
    throw new Error(
      `connection-level production guard tripped: hostname '${host}' looks like production. ` +
        'Verify DATABASE_URL points at staging Neon. WideCorp does not exist in production.',
    )
  }
  // Log redacted host for operator verification.
  console.log(`  connecting to ${host}:${url.port || '5432'}/${url.pathname.slice(1).split('?')[0]}`)

  return postgres(connectionString, { max: 5, idle_timeout: 30, connect_timeout: 30 })
}

async function loadUserPool(sql: postgres.Sql): Promise<UserPoolMember[]> {
  const rows = await sql<UserPoolMember[]>`
    SELECT u.id, u.email, u.name, om.role
    FROM "user" u
    JOIN organization_members om ON u.id = om.user_id
    WHERE om.organization_id = ${WIDECORP_ORG_ID}
    ORDER BY u.email
  `
  if (rows.length < 4) {
    throw new Error(`User pool too small: found ${rows.length} users in WideCorp; need >= 4`)
  }
  return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role }))
}

async function validateCanonicalSchemas(sql: postgres.Sql): Promise<{ ok: boolean; missing: string[] }> {
  const rows = await sql<{ entity_name: string }[]>`
    SELECT entity_name FROM entity_schemas
    WHERE org_id = ${WIDECORP_ORG_ID}
      AND deleted = false
      AND entity_name = ANY(${CANONICAL_SCHEMAS as string[]})
  `
  const found = new Set(rows.map((r) => r.entity_name))
  const missing = CANONICAL_SCHEMAS.filter((n) => !found.has(n))
  return { ok: missing.length === 0, missing }
}

/**
 * Insert rows into entity_records using postgres.js multi-row INSERT.
 * Wraps each batch in a transaction and sets RLS context via SET LOCAL.
 */
async function batchInsertEntityRecords(
  sql: postgres.Sql,
  rows: EntityRecordRow[],
  batchSize: number,
  onBatch?: (count: number, ms: number) => void,
): Promise<{ inserted: number; throughputRowsPerSec: number; totalMs: number }> {
  if (rows.length === 0) return { inserted: 0, throughputRowsPerSec: 0, totalMs: 0 }

  const start = Date.now()
  let inserted = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const batchStart = Date.now()

    await sql.begin(async (tx) => {
      // RLS context for this transaction. set_config(..., is_local=true)
      // is the parameterized equivalent of SET LOCAL (which does NOT accept
      // bind params in standard Postgres).
      await tx`SELECT set_config('app.current_organization_id', ${WIDECORP_ORG_ID}, true)`

      // postgres.js multi-row insert with explicit column ordering.
      await tx`
        INSERT INTO entity_records ${tx(
          batch,
          'id',
          'organization_id',
          'entity_type_id',
          'name',
          'data',
          'is_deleted',
          'created_at',
          'updated_at',
          'created_by',
        )}
        ON CONFLICT (id) DO NOTHING
      `
    })

    inserted += batch.length
    if (onBatch) onBatch(batch.length, Date.now() - batchStart)
  }

  const totalMs = Date.now() - start
  return {
    inserted,
    totalMs,
    throughputRowsPerSec: totalMs > 0 ? Math.round((inserted / totalMs) * 1000) : 0,
  }
}

// EntityRecordRow type is defined in seed-vibegrid-scale.lib.ts as the
// source of truth for both generators and the insert path. The `data` field
// is Record<string, unknown> (an object) — postgres.js auto-serializes to
// JSONB when the column is jsonb. Re-export here for callers if needed.
import type { EntityRecordRow } from './seed-vibegrid-scale.lib.js'

// ============================================================================
// Schema modifications (P1.2 finding: add `file` field to Client + WorkTask)
// ============================================================================

async function installSchemaMods(sql: postgres.Sql): Promise<void> {
  console.log('\n=== Installing schema modifications ===')
  const mods = [
    {
      entity_name: 'Client',
      field: { name: 'contract', type: 'file', required: false, displayOrder: 99 },
    },
    {
      entity_name: 'WorkTask',
      field: { name: 'attachment', type: 'file', required: false, displayOrder: 99 },
    },
  ]

  for (const mod of mods) {
    // Idempotent: only add field if name doesn't already exist.
    const existing = await sql<{ has_field: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM entity_schemas, jsonb_array_elements(business_metadata->'fields') as f
        WHERE org_id = ${WIDECORP_ORG_ID}
          AND entity_name = ${mod.entity_name}
          AND deleted = false
          AND f->>'name' = ${mod.field.name}
      ) as has_field
    `
    if (existing[0]?.has_field) {
      console.log(`  ${mod.entity_name}.${mod.field.name} already present — skip`)
      continue
    }

    await sql`
      UPDATE entity_schemas
      SET business_metadata = jsonb_set(
        business_metadata,
        '{fields}',
        (business_metadata->'fields') || ${JSON.stringify(mod.field)}::jsonb
      )
      WHERE org_id = ${WIDECORP_ORG_ID}
        AND entity_name = ${mod.entity_name}
        AND deleted = false
    `
    console.log(`  added ${mod.entity_name}.${mod.field.name} (${mod.field.type})`)
  }
}

// ============================================================================
// Saved views
// ============================================================================

async function installSavedViews(sql: postgres.Sql, users: UserPoolMember[]): Promise<void> {
  console.log('\n=== Installing saved views ===')
  const ceo = users.find((u) => u.role === 'owner') ?? users[0]
  if (!ceo) throw new Error('no user available for view ownership')

  const views = buildSavedViews(WIDECORP_ORG_ID, ceo.id)
  let created = 0
  let skipped = 0

  for (const v of views) {
    const result = await sql`
      INSERT INTO entity_views (
        id, organization_id, entity_type, name, icon,
        created_by, visibility, is_default, config, config_version,
        created_at, updated_at
      ) VALUES (
        ${v.id}, ${WIDECORP_ORG_ID}, ${v.entity_type}, ${v.name}, ${v.icon},
        ${ceo.id}, ${v.visibility}, ${v.is_default}, ${JSON.stringify(v.config)}::jsonb, 1,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) created++
    else skipped++
  }

  console.log(`  created ${created}, skipped ${skipped} (idempotent)`)
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log(`\nseed-vibegrid-scale — GH#2908`)
  console.log(`  target=${args.target} count=${args.count} seed=${args.seed} batch=${args.batchSize}`)
  console.log(`  dryRun=${args.dryRun} clean=${args.clean} skipEmbeddings=${args.skipEmbeddings}`)

  const distribution = buildDistribution(args.count, args.types)
  console.log('\n=== Distribution plan ===')
  let total = 0
  for (const [type, count] of Object.entries(distribution.entityCounts)) {
    console.log(`  ${type.padEnd(20)} ${count.toString().padStart(8)}`)
    total += count
  }
  console.log(`  ${'(relationships)'.padEnd(20)} ${distribution.relationshipCount.toString().padStart(8)}`)
  console.log(`  ${'TOTAL'.padEnd(20)} ${(total + distribution.relationshipCount).toString().padStart(8)}`)

  const sql = await connectDb(args)
  try {
    console.log('\n=== Validating canonical schemas ===')
    const validation = await validateCanonicalSchemas(sql)
    if (!validation.ok) {
      throw new Error(
        `canonical schemas missing in entity_schemas: ${validation.missing.join(', ')}. ` +
          'P0 audit recorded these as canonical; if they have been deleted, re-run the audit.',
      )
    }
    console.log(`  all ${CANONICAL_SCHEMAS.length} canonical schemas present`)

    console.log('\n=== Loading user pool ===')
    const users = await loadUserPool(sql)
    console.log(`  found ${users.length} users in WideCorp`)
    for (const u of users) console.log(`    ${u.email.padEnd(30)} ${u.role}`)

    if (args.dryRun) {
      console.log('\n=== Dry-run complete — no writes performed ===')
      return
    }

    if (args.clean) {
      console.log('\n=== CLEAN: truncating WideCorp entity_records ===')
      const deleteResult = await sql`
        DELETE FROM entity_records
        WHERE organization_id = ${WIDECORP_ORG_ID}
      `
      console.log(`  deleted ${deleteResult.count} rows`)
    }

    if (args.installSchemaMods) {
      await installSchemaMods(sql)
    }
    if (args.installSavedViews) {
      await installSavedViews(sql, users)
    }

    // Generate entities in dependency order. We collect IDs as we go to seed
    // relationship targets. All inserts go to entity_records.
    console.log('\n=== Generating entities ===')
    const ids: Record<string, string[]> = {}
    const allRows: EntityRecordRow[] = []

    // ceoId attributes seeded rows in created_by. Prefer the actual owner
    // (consistent with installSavedViews); fall back to first user if no
    // owner exists in the pool.
    const owner = users.find((u) => u.role === 'owner') ?? users[0]
    if (!owner) throw new Error('user pool empty after validation')
    const ctx = { args, users, namespace: SEED_NAMESPACE, orgId: WIDECORP_ORG_ID, ceoId: owner.id }

    const entityOrder = [
      ['Company', distribution.entityCounts.Company ?? 0, generateCompany],
      ['Contact', distribution.entityCounts.Contact ?? 0, generateContact],
      ['Client', distribution.entityCounts.Client ?? 0, generateClient],
      ['Vendor', distribution.entityCounts.Vendor ?? 0, generateVendor],
      ['WorkTask', distribution.entityCounts.WorkTask ?? 0, generateWorkTask],
      ['WorkItem', distribution.entityCounts.WorkItem ?? 0, generateWorkItem],
      ['PaymentCycle', distribution.entityCounts.PaymentCycle ?? 0, generatePaymentCycle],
      ['PaymentLine', distribution.entityCounts.PaymentLine ?? 0, generatePaymentLine],
    ] as const

    for (const [type, count, gen] of entityOrder) {
      if (count === 0) continue
      console.log(`  generating ${count} × ${type}...`)
      const typeIds: string[] = []
      for (let i = 0; i < count; i++) {
        const row = gen({ ...ctx, index: i, ids })
        typeIds.push(row.id)
        allRows.push(row)
      }
      ids[type] = typeIds
    }

    console.log(`\n=== Inserting ${allRows.length} entity rows ===`)
    const entityResult = await batchInsertEntityRecords(sql, allRows, args.batchSize, (n, ms) => {
      const rps = Math.round((n / ms) * 1000)
      process.stdout.write(`    batch +${n} in ${ms}ms (${rps} rows/sec)\n`)
    })
    console.log(
      `  inserted ${entityResult.inserted} rows in ${entityResult.totalMs}ms ` +
        `(${entityResult.throughputRowsPerSec} rows/sec aggregate)`,
    )

    if (!args.noRelationships && distribution.relationshipCount > 0) {
      console.log('\n=== Generating relationships ===')
      const relRows: EntityRecordRow[] = []
      for (const relType of RELATIONSHIP_TYPES) {
        const rels = generateRelationship({ ...ctx, ids, relType })
        for (const r of rels) relRows.push(r)
      }
      console.log(`  generated ${relRows.length} relationship rows`)

      console.log(`\n=== Inserting ${relRows.length} relationship rows ===`)
      const relResult = await batchInsertEntityRecords(sql, relRows, args.batchSize, (n, ms) => {
        const rps = Math.round((n / ms) * 1000)
        process.stdout.write(`    batch +${n} in ${ms}ms (${rps} rows/sec)\n`)
      })
      console.log(
        `  inserted ${relResult.inserted} rows in ${relResult.totalMs}ms ` +
          `(${relResult.throughputRowsPerSec} rows/sec aggregate)`,
      )
    }

    console.log('\n=== Seed complete ===')
  } catch (error) {
    console.error('seeder failed:', error instanceof Error ? error.message : error)
    if (error instanceof Error && error.stack) console.error(error.stack)
    process.exitCode = 1
  } finally {
    await sql.end()
  }
}

main()
