/**
 * Pure data-generation library for seed-vibegrid-scale.ts (GH#2908).
 *
 * Everything in this file is pure (no DB, no IO) so it can be unit-tested
 * in isolation. The main script imports these and orchestrates the writes.
 */

import { v5 as uuidv5 } from 'uuid'

// ============================================================================
// Constants
// ============================================================================

export const WIDECORP_ORG_ID = '01920000-1000-7000-8000-000000000001'

/** UUIDv5 namespace for deterministic seed IDs. Stable across runs. */
export const SEED_NAMESPACE = '7c8a2b4e-1d3f-4a5b-9c0e-2d4f6a8c0e2f'

/** The 7 primary canonical entity schemas seeded into WideCorp. */
export const CANONICAL_SCHEMAS = [
  'Client',
  'Company',
  'Contact',
  'Vendor',
  'WorkTask',
  'WorkItem',
  'PaymentCycle',
  'PaymentLine',
] as const

export type CanonicalSchema = (typeof CANONICAL_SCHEMAS)[number]

/**
 * The 9 active relationship types we seed. Limited to relationships
 * among canonical entities (no soft-deleted-entity targets).
 */
export const RELATIONSHIP_TYPES = [
  // Contact → Company
  { name: 'Rel_Contact_Company_belongs_to', source: 'Contact', target: 'Company', semantic: 'belongs_to' },
  // Client/Company/Vendor → User (creator)
  { name: 'Rel_Client_User_created_by', source: 'Client', target: 'User', semantic: 'created_by' },
  { name: 'Rel_Company_User_created_by', source: 'Company', target: 'User', semantic: 'created_by' },
  // WorkTask → User (assignee, owner, reviewer, creator)
  { name: 'Rel_WorkTask_User_assigned_to', source: 'WorkTask', target: 'User', semantic: 'assigned_to' },
  { name: 'Rel_WorkTask_User_owned_by', source: 'WorkTask', target: 'User', semantic: 'owned_by' },
  { name: 'Rel_WorkTask_User_reviewed_by', source: 'WorkTask', target: 'User', semantic: 'reviewed_by' },
  { name: 'Rel_WorkTask_User_created_by', source: 'WorkTask', target: 'User', semantic: 'created_by' },
  // WorkTask → WorkTask (hierarchy)
  { name: 'Rel_WorkTask_WorkTask_child_of', source: 'WorkTask', target: 'WorkTask', semantic: 'child_of' },
  { name: 'Rel_WorkTask_WorkTask_depends_on', source: 'WorkTask', target: 'WorkTask', semantic: 'depends_on' },
] as const

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

// ============================================================================
// Types
// ============================================================================

export interface UserPoolMember {
  id: string
  email: string
  name: string
  role: string
}

export interface SeedDistribution {
  entityCounts: Partial<Record<CanonicalSchema, number>>
  relationshipCount: number
}

export interface GenContext {
  args: { seed: number; skipEmbeddings: boolean }
  users: UserPoolMember[]
  namespace: string
  orgId: string
  ceoId: string
  index: number
  ids: Record<string, string[]>
}

export interface EntityRecordRow {
  id: string
  organization_id: string
  entity_type_id: string
  name: string | null
  /** Object — postgres.js auto-serializes to JSONB on insert. NOT a string. */
  data: Record<string, unknown>
  is_deleted: boolean
  created_at: Date
  updated_at: Date
  created_by: string | null
}

// ============================================================================
// Distribution math
// ============================================================================

/**
 * Build entity-count distribution targeting `totalRows`. Allocates per the
 * canonical 5-year-consultancy ratios from the spec, scaled to fit.
 */
export function buildDistribution(totalRows: number, typesFilter: string[] | null): SeedDistribution {
  // Reference distribution at 900k total. Scale linearly.
  // Note: relationships are computed separately and not counted in totalRows.
  const REFERENCE = {
    Company: 2_000,
    Contact: 20_000,
    Client: 2_000,
    Vendor: 800,
    WorkTask: 350_000,
    WorkItem: 40_000,
    PaymentCycle: 5_000,
    PaymentLine: 80_000,
  } as const

  const referenceTotal = Object.values(REFERENCE).reduce((a, b) => a + b, 0)
  const scale = totalRows / referenceTotal

  const entityCounts: Partial<Record<CanonicalSchema, number>> = {}
  for (const [type, refCount] of Object.entries(REFERENCE) as [CanonicalSchema, number][]) {
    if (typesFilter && !typesFilter.includes(type)) continue
    entityCounts[type] = Math.max(1, Math.round(refCount * scale))
  }

  // Relationship count estimate (rough — actual generators may produce
  // slightly different counts based on cardinality limits).
  const wt = entityCounts.WorkTask ?? 0
  const ct = entityCounts.Contact ?? 0
  const cl = entityCounts.Client ?? 0
  const co = entityCounts.Company ?? 0
  const relationshipCount =
    ct + // Contact↔Company
    cl + // Client↔User_created_by
    co + // Company↔User_created_by
    wt + // WorkTask↔User_assigned
    wt + // WorkTask↔User_owned
    Math.round(wt * 0.3) + // WorkTask↔User_reviewed (30%)
    wt + // WorkTask↔User_created
    Math.round(wt * 0.2) + // WorkTask↔WorkTask child_of (20% of tasks have a parent)
    Math.round(wt * 0.1) // WorkTask↔WorkTask depends_on (10% have a dependency)

  return { entityCounts, relationshipCount }
}

// ============================================================================
// Deterministic helpers
// ============================================================================

/** Deterministic UUID for a given (entity_type, index) within the seed namespace. */
export function deterministicId(namespace: string, entityType: string, index: number): string {
  return uuidv5(`${entityType}:${index}`, namespace)
}

/** Deterministic seedable RNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick element from an array using the rng. */
export function pick<T>(rng: () => number, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: empty array')
  return arr[Math.floor(rng() * arr.length)]!
}

/** Spread a date over a 5-year window with weekday weighting. */
export function seedDate(rng: () => number, index: number, span: number): Date {
  // Linear ramp from 5yr ago to now, with weekday bias.
  const now = Date.now()
  const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000
  const t = now - Math.floor(rng() * fiveYearsMs)
  const d = new Date(t)
  // Skew weekends: if weekend, randomly bump to a weekday 70% of the time.
  const dow = d.getDay()
  if ((dow === 0 || dow === 6) && rng() < 0.7) {
    d.setDate(d.getDate() + (dow === 0 ? 1 : 2))
  }
  // Bias to business hours (9am-6pm).
  d.setHours(9 + Math.floor(rng() * 9), Math.floor(rng() * 60), 0, 0)
  return d
}

// ============================================================================
// Curated business templates (ported from sophisticated-widecorp-seeder.js)
// ============================================================================

const INDUSTRIES = [
  'Technology',
  'Financial Services',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Education',
  'Energy',
  'Media',
  'Logistics',
  'Consulting',
  'Real Estate',
  'Food & Beverage',
  'Automotive',
  'Cloud Services',
] as const

const COMPANY_SUFFIXES = [
  'Inc',
  'Corp',
  'LLC',
  'Group',
  'Solutions',
  'Systems',
  'Industries',
  'Partners',
  'Holdings',
  'Ventures',
  'Networks',
  'Technologies',
  'Innovations',
  'Co',
] as const

const COMPANY_ROOTS = [
  'Acme',
  'Globex',
  'Initech',
  'Stark',
  'Wayne',
  'Umbrella',
  'Tyrell',
  'Wonka',
  'Hooli',
  'Pied Piper',
  'Vandelay',
  'Massive Dynamic',
  'Nakatomi',
  'Cyberdyne',
  'Soylent',
  'OCP',
  'InGen',
  'Yoyodyne',
  'BlueStar',
  'CrimsonForge',
  'Apex',
  'Helix',
  'Quantum',
  'Vertex',
  'Pinnacle',
  'Lumen',
  'Nexus',
  'Atlas',
  'Beacon',
  'Cipher',
  'Domain',
  'Emerald',
  'Falcon',
  'Granite',
  'Horizon',
] as const

const FIRST_NAMES = [
  'Alice',
  'Bob',
  'Carol',
  'David',
  'Eve',
  'Frank',
  'Grace',
  'Henry',
  'Iris',
  'Jack',
  'Kate',
  'Leo',
  'Maya',
  'Noah',
  'Olivia',
  'Peter',
  'Quinn',
  'Rachel',
  'Sam',
  'Tara',
  'Uma',
  'Victor',
  'Wendy',
  'Xavier',
  'Yara',
  'Zane',
] as const

const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Lee',
  'Walker',
  'Hall',
  'Allen',
  'Young',
  'King',
  'Wright',
  'Scott',
  'Torres',
  'Nguyen',
  'Patel',
  'Kim',
  'Chen',
  'Wang',
] as const

const TASK_TITLES = [
  'Implement user authentication',
  'Fix bug in payment module',
  'Update documentation',
  'Code review',
  'Database migration',
  'API endpoint creation',
  'UI/UX improvements',
  'Performance optimization',
  'Security patch',
  'Write unit tests',
  'Deploy to staging',
  'Customer feedback implementation',
  'Refactor legacy code',
  'Setup CI/CD pipeline',
  'Create dashboard',
  'Mobile responsiveness',
  'Integration testing',
  'Load testing',
  'Discovery workshop',
  'Architecture review',
  'Sprint retrospective',
  'Stakeholder sync',
  'User research',
  'Wireframe iteration',
  'Design QA',
] as const

const STATUSES = ['todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
const TIERS = ['enterprise', 'midmarket', 'small'] as const
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const
const TASK_TAGS = ['frontend', 'backend', 'urgent', 'tech-debt', 'security', 'infra', 'design', 'docs'] as const
const PAYMENT_STATUSES = ['draft', 'pending', 'sent', 'paid', 'overdue', 'void'] as const

// ============================================================================
// Generators
// ============================================================================

function generateCompanyName(rng: () => number, index: number): string {
  const root = COMPANY_ROOTS[index % COMPANY_ROOTS.length]!
  const suffix = pick(rng, COMPANY_SUFFIXES)
  const variant = Math.floor(index / COMPANY_ROOTS.length)
  return variant === 0 ? `${root} ${suffix}` : `${root} ${suffix} ${variant}`
}

function generatePersonName(rng: () => number, index: number): { first: string; last: string; full: string } {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!
  const last = LAST_NAMES[(index * 7919) % LAST_NAMES.length]!
  return { first, last, full: `${first} ${last}` }
}

function rowSkeleton(
  ctx: GenContext,
  type: string,
  data: Record<string, unknown>,
  name: string,
): EntityRecordRow {
  const id = deterministicId(ctx.namespace, type, ctx.index)
  const rng = makeRng(ctx.args.seed + ctx.index)
  const created = seedDate(rng, ctx.index, 5)
  return {
    id,
    organization_id: ctx.orgId,
    entity_type_id: type,
    name,
    data,
    is_deleted: false,
    created_at: created,
    updated_at: created,
    created_by: ctx.ceoId,
  }
}

export function generateCompany(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 1000 + ctx.index)
  const name = generateCompanyName(rng, ctx.index)
  const slug = name.toLowerCase().replace(/\s+/g, '')
  const data = {
    industry: pick(rng, INDUSTRIES),
    company_size: pick(rng, COMPANY_SIZES),
    annual_revenue: Math.round(rng() * 50_000_000 + 100_000),
    email: `info@${slug}.com`,
    phone: `+1-555-${String(Math.floor(rng() * 9000) + 1000)}`,
    website: `https://${slug}.com`,
    status: rng() < 0.7 ? 'active' : 'inactive',
    description: `${name} is a ${pick(rng, INDUSTRIES).toLowerCase()} company.`,
  }
  return rowSkeleton(ctx, 'Company', data, name)
}

export function generateContact(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 2000 + ctx.index)
  const person = generatePersonName(rng, ctx.index)
  const titles = ['CEO', 'CTO', 'VP Engineering', 'Director', 'Manager', 'Senior Engineer', 'Engineer', 'Analyst']
  const title = pick(rng, titles)
  const data = {
    first_name: person.first,
    last_name: person.last,
    title,
    email: `${person.first.toLowerCase()}.${person.last.toLowerCase()}.${ctx.index}@example.com`,
    phone: `+1-555-${String(Math.floor(rng() * 9000) + 1000)}`,
    linkedin_url: `https://linkedin.com/in/${person.first.toLowerCase()}${person.last.toLowerCase()}${ctx.index}`,
    status: rng() < 0.85 ? 'active' : 'inactive',
    notes: `Met at ${pick(rng, ['conference', 'webinar', 'referral', 'cold outreach', 'LinkedIn'])} in ${2020 + Math.floor(rng() * 6)}`,
  }
  return rowSkeleton(ctx, 'Contact', data, person.full)
}

export function generateClient(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 3000 + ctx.index)
  const name = generateCompanyName(rng, ctx.index + 5000)
  const slug = name.toLowerCase().replace(/\s+/g, '')
  const tier = pick(rng, TIERS)
  const contractValue = tier === 'enterprise' ? 200_000 + Math.round(rng() * 300_000) : tier === 'midmarket' ? 50_000 + Math.round(rng() * 150_000) : 10_000 + Math.round(rng() * 40_000)
  const data = {
    industry: pick(rng, INDUSTRIES),
    tier,
    contract_value: contractValue,
    contact_email: `contact@${slug}.com`,
    contact_phone: `+1-555-${String(Math.floor(rng() * 9000) + 1000)}`,
    website: `https://${slug}.com`,
    address: `${Math.floor(rng() * 9000) + 100} ${pick(rng, ['Main', 'Oak', 'Maple', 'Park', 'Cedar'])} St`,
    city: pick(rng, ['San Francisco', 'New York', 'Austin', 'Seattle', 'Chicago', 'Boston', 'Denver']),
    satisfaction_score: Math.floor(rng() * 5) + 1, // 1-5 rating
    status: rng() < 0.65 ? 'active' : 'churned',
    contract: rng() < 0.35 ? `r2://wide-corp/seed/contracts/${ctx.index}.pdf` : null,
  }
  return rowSkeleton(ctx, 'Client', data, name)
}

export function generateVendor(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 4000 + ctx.index)
  const name = generateCompanyName(rng, ctx.index + 10000)
  const slug = name.toLowerCase().replace(/\s+/g, '')
  const data = {
    category: pick(rng, ['software', 'hardware', 'services', 'consulting', 'cloud', 'security']),
    contact_email: `sales@${slug}.com`,
    phone: `+1-555-${String(Math.floor(rng() * 9000) + 1000)}`,
    website: `https://${slug}.com`,
    status: pick(rng, ['active', 'pending_review', 'preferred', 'on_hold']),
    payment_terms: pick(rng, ['Net 15', 'Net 30', 'Net 60', 'Due on receipt']),
  }
  return rowSkeleton(ctx, 'Vendor', data, name)
}

export function generateWorkTask(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 5000 + ctx.index)
  const titleBase = pick(rng, TASK_TITLES)
  const title = `${titleBase} #${ctx.index + 1}`
  const status = pick(rng, STATUSES)
  const priority = pick(rng, PRIORITIES)
  const dueOffset = Math.floor((rng() - 0.3) * 90) * 24 * 60 * 60 * 1000 // -27 to +63 days from now
  const due = new Date(Date.now() + dueOffset)

  // Tag selection — multi-select rendering exercise
  const tagCount = Math.floor(rng() * 3)
  const tags = Array.from({ length: tagCount }, () => pick(rng, TASK_TAGS))
  const uniqueTags = [...new Set(tags)]

  const data = {
    title,
    status,
    priority,
    due_date: due.toISOString().slice(0, 10),
    description: `Detailed work for ${titleBase.toLowerCase()}. Includes scope, acceptance criteria, and stakeholders.`,
    test_markdown: `# Acceptance\n\n- Goal: ${titleBase}\n- Owner: TBD\n\n## Notes\n\nCreated for smoke testing.`,
    test_textarea: `Multi-line free-form notes for task ${ctx.index}. Lorem ipsum varies as needed.`,
    estimated_hours: Math.floor(rng() * 16) + 1,
    actual_hours: Math.floor(rng() * 20),
    hourly_rate: Math.floor(rng() * 200) + 50,
    test_currency: Math.floor(rng() * 5000) + 100,
    test_decimal: Math.round(rng() * 10000) / 100,
    test_integer: Math.floor(rng() * 1000),
    billable: rng() < 0.7,
    test_color: `#${Math.floor(rng() * 0xffffff).toString(16).padStart(6, '0')}`,
    test_email: `task${ctx.index}@example.com`,
    test_phone: `+1-555-${String(Math.floor(rng() * 9000) + 1000)}`,
    test_url: `https://example.com/tasks/${ctx.index}`,
    test_rating: Math.floor(rng() * 5) + 1,
    test_slider: Math.floor(rng() * 100),
    test_time: `${String(Math.floor(rng() * 24)).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`,
    test_multi_select: uniqueTags,
    task_type: pick(rng, ['feature', 'bug', 'improvement', 'task', 'spike']),
    complexity: pick(rng, ['simple', 'moderate', 'complex']),
    blocking_issues: status === 'blocked' ? 'Waiting for upstream API change' : null,
    attachment: rng() < 0.15 ? `r2://wide-corp/seed/attachments/${ctx.index}.pdf` : null,
  }
  return rowSkeleton(ctx, 'WorkTask', data, title)
}

export function generateWorkItem(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 6000 + ctx.index)
  const titles = ['Subtask', 'Line item', 'Sub-deliverable', 'Bullet']
  const title = `${pick(rng, titles)} ${ctx.index + 1}`
  const data = {
    title,
    status: pick(rng, STATUSES),
    estimated_hours: Math.round(rng() * 800) / 100, // decimal
    description: `${title} — generated for smoke testing.`,
    notes: `Multi-line notes\nLine 2\nLine 3 for item ${ctx.index}`,
    image: rng() < 0.1 ? `r2://wide-corp/seed/images/${ctx.index}.jpg` : null,
  }
  return rowSkeleton(ctx, 'WorkItem', data, title)
}

export function generatePaymentCycle(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 7000 + ctx.index)
  const month = (ctx.index % 60) + 1 // 60 months = 5 years
  const year = 2021 + Math.floor((ctx.index % 60) / 12)
  const startDate = new Date(year, (month - 1) % 12, 1)
  const endDate = new Date(year, month % 12, 0)
  const data = {
    period_start: startDate.toISOString().slice(0, 10),
    period_end: endDate.toISOString().slice(0, 10),
    total_amount: Math.round(rng() * 500_000),
    currency: 'USD',
    status: pick(rng, PAYMENT_STATUSES),
    notes: `Cycle for ${year}-${String(month).padStart(2, '0')}`,
  }
  return rowSkeleton(ctx, 'PaymentCycle', data, `Cycle ${year}-${String(month).padStart(2, '0')}`)
}

export function generatePaymentLine(ctx: GenContext): EntityRecordRow {
  const rng = makeRng(ctx.args.seed + 8000 + ctx.index)
  const amount = Math.round(rng() * 50_000) + 100
  const description = `Line item ${ctx.index + 1}`
  const data = {
    description,
    amount,
    currency: 'USD',
    quantity: Math.floor(rng() * 20) + 1,
    rate: Math.round(rng() * 500) + 50,
    line_type: pick(rng, ['service', 'expense', 'product', 'time', 'fee']),
    status: pick(rng, PAYMENT_STATUSES),
    tax_rate: pick(rng, [0, 0.05, 0.0825, 0.1]),
    notes: `Notes for line ${ctx.index}`,
    test_multi_select: rng() < 0.4 ? [pick(rng, TASK_TAGS), pick(rng, TASK_TAGS)] : [],
  }
  return rowSkeleton(ctx, 'PaymentLine', data, description)
}

// ============================================================================
// Relationship generation
// ============================================================================

interface RelGenInput {
  args: { seed: number }
  users: UserPoolMember[]
  namespace: string
  orgId: string
  ceoId: string
  ids: Record<string, string[]>
  relType: RelationshipType
}

export function generateRelationship(input: RelGenInput): EntityRecordRow[] {
  const { relType, ids, users, args, namespace, orgId, ceoId } = input
  const rng = makeRng(args.seed + 9000 + relType.name.length)
  const out: EntityRecordRow[] = []

  if (relType.target === 'User') {
    // Source entity → User. Round-robin user selection with role weighting where relevant.
    const sources = ids[relType.source] ?? []
    const userPool = filterUsersForRel(relType.semantic, users)
    if (userPool.length === 0) return out

    // Some relationship types apply to ALL source rows (assigned_to, owned_by, created_by).
    // Others apply to a fraction (reviewed_by ≈ 30%, requires_approval_from ≈ 10%).
    const fraction = relSemanticToFraction(relType.semantic)
    for (let i = 0; i < sources.length; i++) {
      if (rng() > fraction) continue
      const sourceId = sources[i]!
      const targetUser = userPool[i % userPool.length]!
      out.push(buildRelRow({
        relType,
        sourceType: relType.source,
        sourceId,
        targetType: 'User',
        targetId: targetUser.id,
        index: out.length,
        namespace,
        orgId,
        ceoId,
      }))
    }
  } else if (relType.source === 'Contact' && relType.target === 'Company') {
    // Each Contact → one Company (round-robin)
    const contacts = ids.Contact ?? []
    const companies = ids.Company ?? []
    if (companies.length === 0) return out
    for (let i = 0; i < contacts.length; i++) {
      out.push(buildRelRow({
        relType,
        sourceType: 'Contact',
        sourceId: contacts[i]!,
        targetType: 'Company',
        targetId: companies[i % companies.length]!,
        index: out.length,
        namespace,
        orgId,
        ceoId,
      }))
    }
  } else if (relType.source === 'WorkTask' && relType.target === 'WorkTask') {
    // child_of: 20% of tasks have a parent. depends_on: 10% have a dep.
    const tasks = ids.WorkTask ?? []
    const fraction = relType.semantic === 'child_of' ? 0.2 : 0.1
    for (let i = 1; i < tasks.length; i++) {
      if (rng() > fraction) continue
      // Pick a parent/dep that's earlier in the list (avoid cycles).
      const parentIdx = Math.floor(rng() * i)
      out.push(buildRelRow({
        relType,
        sourceType: 'WorkTask',
        sourceId: tasks[i]!,
        targetType: 'WorkTask',
        targetId: tasks[parentIdx]!,
        index: out.length,
        namespace,
        orgId,
        ceoId,
      }))
    }
  }

  return out
}

function filterUsersForRel(semantic: string, users: UserPoolMember[]): UserPoolMember[] {
  if (semantic === 'reviewed_by' || semantic === 'requires_approval_from') {
    return users.filter((u) => u.role === 'admin' || u.role === 'manager' || u.role === 'owner')
  }
  if (semantic === 'created_by' || semantic === 'owned_by') {
    return users.filter((u) => u.role !== 'viewer')
  }
  // assigned_to and others: any user
  return users
}

function relSemanticToFraction(semantic: string): number {
  switch (semantic) {
    case 'reviewed_by':
      return 0.3
    case 'requires_approval_from':
      return 0.1
    case 'relates_to':
      return 0.05
    default:
      return 1.0 // assigned_to, owned_by, created_by — every source row gets one
  }
}

function buildRelRow(input: {
  relType: RelationshipType
  sourceType: string
  sourceId: string
  targetType: string
  targetId: string
  index: number
  namespace: string
  orgId: string
  ceoId: string
}): EntityRecordRow {
  // UUID derives from (relType.name, sourceId) only — NOT targetId. This
  // guarantees idempotency under user-pool drift: if WideCorp gains/loses a
  // user between runs, the same source row maps to a different round-robin
  // target, but the relationship row's UUID stays the same → ON CONFLICT DO
  // NOTHING preserves the row. To refresh stale targets, use --clean
  // --confirm. (Documented behavior; not a bug.)
  const id = uuidv5(`${input.relType.name}:${input.sourceId}`, input.namespace)
  const data = {
    source_entity_type: input.sourceType,
    source_entity_id: input.sourceId,
    target_entity_type: input.targetType,
    target_entity_id: input.targetId,
    semantic: input.relType.semantic,
  }
  return {
    id,
    organization_id: input.orgId,
    entity_type_id: input.relType.name,
    name: null,
    data,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: input.ceoId,
  }
}

// ============================================================================
// Saved view definitions
// ============================================================================

export interface SavedView {
  id: string
  entity_type: string
  name: string
  icon: string
  visibility: string
  is_default: boolean
  config: Record<string, unknown>
}

export function buildSavedViews(orgId: string, ownerId: string): SavedView[] {
  const ns = SEED_NAMESPACE
  const views: SavedView[] = []
  const namespacedId = (key: string) => uuidv5(`saved-view:${orgId}:${key}`, ns)

  const addView = (
    entity: string,
    key: string,
    name: string,
    icon: string,
    config: Record<string, unknown>,
    is_default = false,
  ) => {
    views.push({
      id: namespacedId(`${entity}:${key}`),
      entity_type: entity,
      name,
      icon,
      visibility: 'shared',
      is_default,
      config,
    })
  }

  // WorkTask — 12 views
  addView('WorkTask', 'all', 'All Tasks', 'list', { filters: [], sort: [] }, true)
  addView('WorkTask', 'my-open', 'My Open Tasks', 'check-circle', {
    filters: [{ field: 'status', op: 'not_in', value: ['done', 'cancelled'] }],
  })
  addView('WorkTask', 'high-priority', 'High Priority', 'alert-triangle', {
    filters: [{ field: 'priority', op: 'in', value: ['high', 'critical'] }],
    sort: [{ field: 'due_date', direction: 'asc' }],
  })
  addView('WorkTask', 'by-status', 'By Status', 'columns', { groupBy: ['status'] })
  addView('WorkTask', 'by-priority', 'By Priority', 'flag', { groupBy: ['priority'] })
  addView('WorkTask', 'blocked', 'Blocked', 'pause-circle', {
    filters: [{ field: 'status', op: 'eq', value: 'blocked' }],
  })
  addView('WorkTask', 'overdue', 'Overdue', 'clock', {
    filters: [
      { field: 'due_date', op: 'lt', value: 'today' },
      { field: 'status', op: 'not_in', value: ['done', 'cancelled'] },
    ],
  })
  addView('WorkTask', 'completed', 'Completed', 'check', {
    filters: [{ field: 'status', op: 'eq', value: 'done' }],
    sort: [{ field: 'updated_at', direction: 'desc' }],
  })
  addView('WorkTask', 'this-week', 'Due This Week', 'calendar', {
    filters: [{ field: 'due_date', op: 'between', value: ['today', 'today+7d'] }],
  })
  addView('WorkTask', 'billable', 'Billable Work', 'dollar-sign', {
    filters: [{ field: 'billable', op: 'eq', value: true }],
  })
  addView('WorkTask', 'kanban', 'Kanban', 'kanban', { viewMode: 'kanban', groupBy: ['status'] })
  addView('WorkTask', 'gantt', 'Timeline', 'timeline', { viewMode: 'gantt' })

  // Company — 8 views
  addView('Company', 'all', 'All Companies', 'building', { filters: [] }, true)
  addView('Company', 'active', 'Active', 'check', { filters: [{ field: 'status', op: 'eq', value: 'active' }] })
  addView('Company', 'by-industry', 'By Industry', 'briefcase', { groupBy: ['industry'] })
  addView('Company', 'by-size', 'By Size', 'users', { groupBy: ['company_size'] })
  addView('Company', 'high-revenue', 'High Revenue', 'trending-up', {
    filters: [{ field: 'annual_revenue', op: 'gt', value: 10_000_000 }],
  })
  addView('Company', 'enterprise', 'Enterprise (500+)', 'building', {
    filters: [{ field: 'company_size', op: 'eq', value: '500+' }],
  })
  addView('Company', 'small-biz', 'Small Business', 'home', {
    filters: [{ field: 'company_size', op: 'in', value: ['1-10', '11-50'] }],
  })
  addView('Company', 'recent', 'Recently Added', 'clock', { sort: [{ field: 'created_at', direction: 'desc' }] })

  // Contact — 8 views
  addView('Contact', 'all', 'All Contacts', 'users', {}, true)
  addView('Contact', 'leadership', 'Leadership', 'star', {
    filters: [{ field: 'title', op: 'contains_any', value: ['CEO', 'CTO', 'VP', 'Director'] }],
  })
  addView('Contact', 'active', 'Active', 'check', { filters: [{ field: 'status', op: 'eq', value: 'active' }] })
  addView('Contact', 'by-title', 'By Title', 'briefcase', { groupBy: ['title'] })
  addView('Contact', 'recent', 'Recently Added', 'clock', { sort: [{ field: 'created_at', direction: 'desc' }] })
  addView('Contact', 'no-company', 'Unaffiliated', 'help-circle', {
    filters: [{ field: 'rel:Rel_Contact_Company_belongs_to', op: 'is_null' }],
  })
  addView('Contact', 'engineers', 'Engineers', 'code', {
    filters: [{ field: 'title', op: 'contains_any', value: ['Engineer', 'Developer'] }],
  })
  addView('Contact', 'archived', 'Inactive', 'archive', {
    filters: [{ field: 'status', op: 'eq', value: 'inactive' }],
  })

  // Client — 8 views
  addView('Client', 'all', 'All Clients', 'briefcase', {}, true)
  addView('Client', 'active', 'Active', 'check', { filters: [{ field: 'status', op: 'eq', value: 'active' }] })
  addView('Client', 'enterprise', 'Enterprise Tier', 'star', {
    filters: [{ field: 'tier', op: 'eq', value: 'enterprise' }],
  })
  addView('Client', 'midmarket', 'Midmarket', 'circle', {
    filters: [{ field: 'tier', op: 'eq', value: 'midmarket' }],
  })
  addView('Client', 'high-value', 'High-Value Contracts', 'dollar-sign', {
    filters: [{ field: 'contract_value', op: 'gt', value: 100_000 }],
    sort: [{ field: 'contract_value', direction: 'desc' }],
  })
  addView('Client', 'churned', 'Churned', 'x-circle', { filters: [{ field: 'status', op: 'eq', value: 'churned' }] })
  addView('Client', 'high-satisfaction', 'Top NPS', 'smile', {
    filters: [{ field: 'satisfaction_score', op: 'gte', value: 4 }],
  })
  addView('Client', 'by-industry', 'By Industry', 'briefcase', { groupBy: ['industry'] })

  // Vendor — 8 views
  addView('Vendor', 'all', 'All Vendors', 'truck', {}, true)
  addView('Vendor', 'preferred', 'Preferred', 'star', {
    filters: [{ field: 'status', op: 'eq', value: 'preferred' }],
  })
  addView('Vendor', 'by-category', 'By Category', 'tag', { groupBy: ['category'] })
  addView('Vendor', 'pending-review', 'Pending Review', 'clock', {
    filters: [{ field: 'status', op: 'eq', value: 'pending_review' }],
  })
  addView('Vendor', 'on-hold', 'On Hold', 'pause-circle', {
    filters: [{ field: 'status', op: 'eq', value: 'on_hold' }],
  })
  addView('Vendor', 'net-30', 'Net 30 Terms', 'credit-card', {
    filters: [{ field: 'payment_terms', op: 'eq', value: 'Net 30' }],
  })
  addView('Vendor', 'recent', 'Recently Added', 'clock', { sort: [{ field: 'created_at', direction: 'desc' }] })
  addView('Vendor', 'software', 'Software Vendors', 'cpu', {
    filters: [{ field: 'category', op: 'eq', value: 'software' }],
  })

  // WorkItem — 6 views
  addView('WorkItem', 'all', 'All Items', 'list', {}, true)
  addView('WorkItem', 'open', 'Open', 'circle', {
    filters: [{ field: 'status', op: 'not_in', value: ['done', 'cancelled'] }],
  })
  addView('WorkItem', 'by-status', 'By Status', 'columns', { groupBy: ['status'] })
  addView('WorkItem', 'with-image', 'With Image', 'image', { filters: [{ field: 'image', op: 'is_not_null' }] })
  addView('WorkItem', 'completed', 'Completed', 'check', { filters: [{ field: 'status', op: 'eq', value: 'done' }] })
  addView('WorkItem', 'recent', 'Recently Added', 'clock', { sort: [{ field: 'created_at', direction: 'desc' }] })

  // PaymentCycle — 6 views
  addView('PaymentCycle', 'all', 'All Cycles', 'calendar', {}, true)
  addView('PaymentCycle', 'paid', 'Paid', 'check', { filters: [{ field: 'status', op: 'eq', value: 'paid' }] })
  addView('PaymentCycle', 'pending', 'Pending', 'clock', { filters: [{ field: 'status', op: 'eq', value: 'pending' }] })
  addView('PaymentCycle', 'overdue', 'Overdue', 'alert-circle', {
    filters: [{ field: 'status', op: 'eq', value: 'overdue' }],
  })
  addView('PaymentCycle', 'by-status', 'By Status', 'columns', { groupBy: ['status'] })
  addView('PaymentCycle', 'high-value', 'High Value', 'dollar-sign', {
    filters: [{ field: 'total_amount', op: 'gt', value: 100_000 }],
  })

  // PaymentLine — 6 views
  addView('PaymentLine', 'all', 'All Lines', 'list', {}, true)
  addView('PaymentLine', 'services', 'Services', 'wrench', {
    filters: [{ field: 'line_type', op: 'eq', value: 'service' }],
  })
  addView('PaymentLine', 'expenses', 'Expenses', 'credit-card', {
    filters: [{ field: 'line_type', op: 'eq', value: 'expense' }],
  })
  addView('PaymentLine', 'by-type', 'By Type', 'columns', { groupBy: ['line_type'] })
  addView('PaymentLine', 'high-amount', 'High Amount', 'dollar-sign', {
    filters: [{ field: 'amount', op: 'gt', value: 5_000 }],
  })
  addView('PaymentLine', 'recent', 'Recently Added', 'clock', { sort: [{ field: 'created_at', direction: 'desc' }] })

  return views
}
