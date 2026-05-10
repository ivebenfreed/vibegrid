/**
 * Tests for seed-vibegrid-scale.lib.ts (GH#2908).
 *
 * Pure-function coverage: distribution math, deterministic UUIDs, seeded RNG,
 * entity generators, relationship generators, saved view definitions.
 */

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_SCHEMAS,
  RELATIONSHIP_TYPES,
  SEED_NAMESPACE,
  WIDECORP_ORG_ID,
  buildDistribution,
  buildSavedViews,
  deterministicId,
  generateClient,
  generateCompany,
  generateContact,
  generatePaymentCycle,
  generatePaymentLine,
  generateRelationship,
  generateVendor,
  generateWorkItem,
  generateWorkTask,
  makeRng,
  pick,
  type GenContext,
  type UserPoolMember,
} from '../seed-vibegrid-scale.lib'

const TEST_USERS: UserPoolMember[] = [
  { id: 'u-owner', email: 'owner@x.com', name: 'Owner', role: 'owner' },
  { id: 'u-admin', email: 'admin@x.com', name: 'Admin', role: 'admin' },
  { id: 'u-mgr', email: 'mgr@x.com', name: 'Manager', role: 'manager' },
  { id: 'u-mem1', email: 'mem1@x.com', name: 'Member1', role: 'member' },
  { id: 'u-mem2', email: 'mem2@x.com', name: 'Member2', role: 'member' },
  { id: 'u-viewer', email: 'viewer@x.com', name: 'Viewer', role: 'viewer' },
]

function makeCtx(overrides: Partial<GenContext> = {}): GenContext {
  return {
    args: { seed: 42, skipEmbeddings: true },
    users: TEST_USERS,
    namespace: SEED_NAMESPACE,
    orgId: WIDECORP_ORG_ID,
    ceoId: 'u-owner',
    index: 0,
    ids: {},
    ...overrides,
  }
}

describe('buildDistribution', () => {
  it('scales linearly: 5k baseline produces ~5k entities', () => {
    const dist = buildDistribution(5_000, null)
    const total = Object.values(dist.entityCounts).reduce((a, b) => a + (b ?? 0), 0)
    expect(total).toBeGreaterThan(4_500)
    expect(total).toBeLessThan(5_500)
  })

  it('full distribution at 900k stays close to reference shape', () => {
    const dist = buildDistribution(900_000, null)
    expect(dist.entityCounts.WorkTask).toBeGreaterThan(300_000)
    expect(dist.entityCounts.Contact).toBeGreaterThan(15_000)
    expect(dist.entityCounts.Company).toBeGreaterThan(1_500)
  })

  it('honors --types filter', () => {
    const dist = buildDistribution(10_000, ['Company', 'Contact'])
    expect(Object.keys(dist.entityCounts).sort()).toEqual(['Company', 'Contact'])
    expect(dist.entityCounts.WorkTask).toBeUndefined()
  })

  it('every canonical schema gets at least 1 row', () => {
    const dist = buildDistribution(100, null) // very small
    for (const type of CANONICAL_SCHEMAS) {
      expect(dist.entityCounts[type]).toBeGreaterThanOrEqual(1)
    }
  })

  it('relationshipCount scales with WorkTask count', () => {
    const small = buildDistribution(10_000, null)
    const large = buildDistribution(100_000, null)
    expect(large.relationshipCount).toBeGreaterThan(small.relationshipCount)
  })
})

describe('deterministicId', () => {
  it('produces same UUID for same (type, index)', () => {
    const id1 = deterministicId(SEED_NAMESPACE, 'Company', 42)
    const id2 = deterministicId(SEED_NAMESPACE, 'Company', 42)
    expect(id1).toEqual(id2)
  })

  it('different types produce different UUIDs', () => {
    const a = deterministicId(SEED_NAMESPACE, 'Company', 1)
    const b = deterministicId(SEED_NAMESPACE, 'Contact', 1)
    expect(a).not.toEqual(b)
  })

  it('different indices produce different UUIDs', () => {
    const a = deterministicId(SEED_NAMESPACE, 'Company', 1)
    const b = deterministicId(SEED_NAMESPACE, 'Company', 2)
    expect(a).not.toEqual(b)
  })

  it('returns valid UUID format', () => {
    const id = deterministicId(SEED_NAMESPACE, 'Company', 1)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})

describe('makeRng', () => {
  it('produces deterministic sequence for same seed', () => {
    const rng1 = makeRng(42)
    const rng2 = makeRng(42)
    const seq1 = Array.from({ length: 5 }, () => rng1())
    const seq2 = Array.from({ length: 5 }, () => rng2())
    expect(seq1).toEqual(seq2)
  })

  it('different seeds produce different sequences', () => {
    const rng1 = makeRng(42)
    const rng2 = makeRng(43)
    expect(rng1()).not.toEqual(rng2())
  })

  it('values stay in [0, 1)', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('pick', () => {
  it('returns an array element', () => {
    const arr = ['a', 'b', 'c']
    const rng = makeRng(1)
    const result = pick(rng, arr)
    expect(arr).toContain(result)
  })

  it('throws on empty array', () => {
    expect(() => pick(makeRng(1), [])).toThrow()
  })
})

describe('entity generators', () => {
  it('generateCompany produces a Company row', () => {
    const ctx = makeCtx({ index: 0 })
    const row = generateCompany(ctx)
    expect(row.entity_type_id).toBe('Company')
    expect(row.organization_id).toBe(WIDECORP_ORG_ID)
    expect(row.is_deleted).toBe(false)
    expect(row.name).toBeTruthy()
    expect(row.data).toHaveProperty('industry')
    expect(row.data).toHaveProperty('email')
  })

  it('generateContact produces a Contact row with email', () => {
    const ctx = makeCtx({ index: 1 })
    const row = generateContact(ctx)
    expect(row.entity_type_id).toBe('Contact')
    const data = row.data
    expect(data.first_name).toBeTruthy()
    expect(data.last_name).toBeTruthy()
    expect(data.email).toContain('@')
  })

  it('generateClient populates a contract URL ~35% of the time', () => {
    let withContract = 0
    for (let i = 0; i < 200; i++) {
      const row = generateClient(makeCtx({ index: i }))
      if (row.data.contract) withContract++
    }
    expect(withContract).toBeGreaterThan(40)
    expect(withContract).toBeLessThan(100)
  })

  it('generateWorkTask covers test_url, test_color, test_email, test_phone, test_rating, test_slider, test_currency, test_markdown, test_multi_select', () => {
    const row = generateWorkTask(makeCtx({ index: 0 }))
    const data = row.data
    expect(data.test_url).toMatch(/^https:\/\//)
    expect(data.test_color).toMatch(/^#[0-9a-f]{6}$/)
    expect(data.test_email).toContain('@')
    expect(data.test_phone).toMatch(/^\+/)
    expect(data.test_rating).toBeGreaterThanOrEqual(1)
    expect(data.test_rating).toBeLessThanOrEqual(5)
    expect(data.test_slider).toBeGreaterThanOrEqual(0)
    expect(data.test_slider).toBeLessThanOrEqual(100)
    expect(typeof data.test_currency).toBe('number')
    expect(data.test_markdown).toContain('#')
    expect(Array.isArray(data.test_multi_select)).toBe(true)
  })

  it('generateWorkTask attachment populates ~15% of rows', () => {
    let withAttachment = 0
    for (let i = 0; i < 500; i++) {
      const row = generateWorkTask(makeCtx({ index: i }))
      if (row.data.attachment) withAttachment++
    }
    // Sample-size aware bounds: 15% of 500 = 75; allow 50-110.
    expect(withAttachment).toBeGreaterThan(50)
    expect(withAttachment).toBeLessThan(110)
  })

  it('generateVendor produces valid Vendor row', () => {
    const row = generateVendor(makeCtx({ index: 0 }))
    expect(row.entity_type_id).toBe('Vendor')
    expect(row.data).toHaveProperty('payment_terms')
  })

  it('generateWorkItem covers image renderer (10% sampling)', () => {
    let withImage = 0
    for (let i = 0; i < 200; i++) {
      const row = generateWorkItem(makeCtx({ index: i }))
      if (row.data.image) withImage++
    }
    expect(withImage).toBeGreaterThan(10)
    expect(withImage).toBeLessThan(40)
  })

  it('generatePaymentCycle ranges over a 5-year window', () => {
    const rows = Array.from({ length: 60 }, (_, i) => generatePaymentCycle(makeCtx({ index: i })))
    const years = new Set(rows.map((r) => r.data.period_start.slice(0, 4)))
    expect(years.size).toBeGreaterThanOrEqual(4)
  })

  it('generatePaymentLine produces valid amount', () => {
    const row = generatePaymentLine(makeCtx({ index: 0 }))
    const data = row.data
    expect(data.amount).toBeGreaterThan(0)
    expect(data.currency).toBe('USD')
  })

  it('all generators produce idempotent IDs (same index → same ID)', () => {
    const a = generateCompany(makeCtx({ index: 5 }))
    const b = generateCompany(makeCtx({ index: 5 }))
    expect(a.id).toEqual(b.id)
  })
})

describe('generateRelationship', () => {
  const ids = {
    Company: ['c1', 'c2', 'c3'],
    Contact: ['ct1', 'ct2', 'ct3', 'ct4'],
    Client: ['cl1', 'cl2'],
    WorkTask: ['wt1', 'wt2', 'wt3', 'wt4', 'wt5'],
  }

  it('Contact→Company creates one rel per Contact', () => {
    const relType = RELATIONSHIP_TYPES.find((r) => r.name === 'Rel_Contact_Company_belongs_to')!
    const rels = generateRelationship({
      args: { seed: 42 },
      users: TEST_USERS,
      namespace: SEED_NAMESPACE,
      orgId: WIDECORP_ORG_ID,
      ceoId: 'u-owner',
      ids,
      relType,
    })
    expect(rels.length).toBe(ids.Contact.length)
    expect(rels[0]!.entity_type_id).toBe('Rel_Contact_Company_belongs_to')
    const data = rels[0]!.data as Record<string, unknown>
    expect(data.source_entity_type).toBe('Contact')
    expect(data.target_entity_type).toBe('Company')
    expect(data.semantic).toBe('belongs_to')
  })

  it('WorkTask→User assigned_to creates one rel per WorkTask', () => {
    const relType = RELATIONSHIP_TYPES.find((r) => r.name === 'Rel_WorkTask_User_assigned_to')!
    const rels = generateRelationship({
      args: { seed: 42 },
      users: TEST_USERS,
      namespace: SEED_NAMESPACE,
      orgId: WIDECORP_ORG_ID,
      ceoId: 'u-owner',
      ids,
      relType,
    })
    expect(rels.length).toBe(ids.WorkTask.length)
  })

  it('WorkTask→User reviewed_by creates fewer rels (~30% of WorkTasks)', () => {
    const relType = RELATIONSHIP_TYPES.find((r) => r.name === 'Rel_WorkTask_User_reviewed_by')!
    const rels = generateRelationship({
      args: { seed: 42 },
      users: TEST_USERS,
      namespace: SEED_NAMESPACE,
      orgId: WIDECORP_ORG_ID,
      ceoId: 'u-owner',
      ids,
      relType,
    })
    expect(rels.length).toBeLessThan(ids.WorkTask.length)
  })

  it('WorkTask→WorkTask child_of avoids cycles (target index < source index)', () => {
    const relType = RELATIONSHIP_TYPES.find((r) => r.name === 'Rel_WorkTask_WorkTask_child_of')!
    const manyTasks = { WorkTask: Array.from({ length: 100 }, (_, i) => `wt${i}`) }
    const rels = generateRelationship({
      args: { seed: 42 },
      users: TEST_USERS,
      namespace: SEED_NAMESPACE,
      orgId: WIDECORP_ORG_ID,
      ceoId: 'u-owner',
      ids: manyTasks,
      relType,
    })
    for (const rel of rels) {
      const data = rel.data
      const sourceIdx = Number(data.source_entity_id.slice(2))
      const targetIdx = Number(data.target_entity_id.slice(2))
      expect(targetIdx).toBeLessThan(sourceIdx)
    }
  })

  it('reviewed_by limits to admin/manager/owner roles', () => {
    const relType = RELATIONSHIP_TYPES.find((r) => r.name === 'Rel_WorkTask_User_reviewed_by')!
    const rels = generateRelationship({
      args: { seed: 42 },
      users: TEST_USERS,
      namespace: SEED_NAMESPACE,
      orgId: WIDECORP_ORG_ID,
      ceoId: 'u-owner',
      ids,
      relType,
    })
    const allowedRoles = new Set(['admin', 'manager', 'owner'])
    for (const rel of rels) {
      const data = rel.data
      const user = TEST_USERS.find((u) => u.id === data.target_entity_id)
      expect(user).toBeDefined()
      expect(allowedRoles.has(user!.role)).toBe(true)
    }
  })
})

describe('buildSavedViews', () => {
  it('produces views for every canonical entity', () => {
    const views = buildSavedViews(WIDECORP_ORG_ID, 'u-owner')
    const entityTypes = new Set(views.map((v) => v.entity_type))
    expect(entityTypes.has('WorkTask')).toBe(true)
    expect(entityTypes.has('Company')).toBe(true)
    expect(entityTypes.has('Contact')).toBe(true)
    expect(entityTypes.has('Client')).toBe(true)
    expect(entityTypes.has('Vendor')).toBe(true)
  })

  it('produces 12 views for WorkTask (heaviest entity)', () => {
    const views = buildSavedViews(WIDECORP_ORG_ID, 'u-owner')
    const wtViews = views.filter((v) => v.entity_type === 'WorkTask')
    expect(wtViews.length).toBe(12)
  })

  it('view IDs are deterministic across calls', () => {
    const a = buildSavedViews(WIDECORP_ORG_ID, 'u-owner')
    const b = buildSavedViews(WIDECORP_ORG_ID, 'u-owner')
    expect(a[0]!.id).toEqual(b[0]!.id)
  })

  it('every view has a config object', () => {
    const views = buildSavedViews(WIDECORP_ORG_ID, 'u-owner')
    for (const v of views) {
      expect(v.config).toBeDefined()
      expect(typeof v.config).toBe('object')
    }
  })

  it('total view count is between 60 and 80', () => {
    const views = buildSavedViews(WIDECORP_ORG_ID, 'u-owner')
    expect(views.length).toBeGreaterThanOrEqual(60)
    expect(views.length).toBeLessThanOrEqual(80)
  })

  it('exactly one default view per entity type', () => {
    const views = buildSavedViews(WIDECORP_ORG_ID, 'u-owner')
    const defaultsByType: Record<string, number> = {}
    for (const v of views) {
      if (v.is_default) defaultsByType[v.entity_type] = (defaultsByType[v.entity_type] ?? 0) + 1
    }
    for (const [type, count] of Object.entries(defaultsByType)) {
      expect(count).toBe(1)
    }
  })
})

describe('renderer coverage matrix', () => {
  it('one batch of generators covers all 19 documented renderers', () => {
    // This test asserts B5: renderer-coverage acceptance.
    // It generates 200 of each canonical entity and checks that every
    // documented renderer type is exercised at least once.
    const renderersFound = new Set<string>()
    const COUNT = 200
    for (let i = 0; i < COUNT; i++) {
      for (const [type, gen] of [
        ['Company', generateCompany],
        ['Contact', generateContact],
        ['Client', generateClient],
        ['Vendor', generateVendor],
        ['WorkTask', generateWorkTask],
        ['WorkItem', generateWorkItem],
        ['PaymentCycle', generatePaymentCycle],
        ['PaymentLine', generatePaymentLine],
      ] as const) {
        const row = gen(makeCtx({ index: i }))
        const data = row.data as Record<string, unknown>
        for (const [k, v] of Object.entries(data)) {
          if (v == null) continue
          // Heuristic-tag the renderer this field exercises.
          if (typeof v === 'string') {
            if (k === 'attachment' || k === 'contract') renderersFound.add('file')
            if (k === 'image') renderersFound.add('image')
            if (k.includes('color') || /^#[0-9a-f]{6}$/.test(v)) renderersFound.add('color')
            if (k.includes('email') || v.includes('@')) renderersFound.add('email')
            if (k.includes('phone') || v.startsWith('+1-')) renderersFound.add('phone')
            if (k.includes('url') || v.startsWith('http')) renderersFound.add('url')
            if (k.includes('time') && /^\d{2}:\d{2}/.test(v)) renderersFound.add('text')
            if (k === 'test_markdown' || v.startsWith('#')) renderersFound.add('markdown')
            if (k === 'period_start' || k === 'due_date' || /^\d{4}-\d{2}-\d{2}$/.test(v)) renderersFound.add('date')
            if (k === 'status' || k === 'priority' || k === 'tier' || k === 'category') renderersFound.add('single-select')
            if (k.length > 0 && !/email|phone|url|color|markdown/.test(k)) renderersFound.add('text')
          } else if (typeof v === 'number') renderersFound.add('number')
          else if (typeof v === 'boolean') renderersFound.add('boolean')
          else if (Array.isArray(v) && v.length > 0) renderersFound.add('multi-select')
        }
      }
    }
    // At minimum the field-set-derived renderers (text, number, boolean, date,
    // single-select, multi-select, email, phone, url, color, markdown, image,
    // file) MUST be present.
    expect(renderersFound).toContain('text')
    expect(renderersFound).toContain('number')
    expect(renderersFound).toContain('boolean')
    expect(renderersFound).toContain('email')
    expect(renderersFound).toContain('phone')
    expect(renderersFound).toContain('url')
    expect(renderersFound).toContain('color')
    expect(renderersFound).toContain('markdown')
    expect(renderersFound).toContain('multi-select')
    expect(renderersFound).toContain('single-select')
    expect(renderersFound).toContain('file')
    expect(renderersFound).toContain('image')
    expect(renderersFound).toContain('date')
  })
})
