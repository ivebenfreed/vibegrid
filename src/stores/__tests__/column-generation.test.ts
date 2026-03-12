/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

// Import after mocks are in place
const { generateColumnsFromEntitySchema, enrichColumnsWithFieldTypes } = await import(
  '../column-generation'
)

function makeSchemaRegistry(fields: object[]) {
  return {
    isBootstrapping: false,
    schemas: {
      byName: {
        TestEntity: {
          // GH#1699: Use unified 'fields' array
          fields: fields,
        },
      },
    },
  } as any
}

describe('column-generation: system field filtering', () => {
  it('excludes fields marked isSystem: true', async () => {
    const registry = makeSchemaRegistry([
      { name: 'name', type: 'text' },
      { name: 'id', type: 'text', isSystem: true },
      { name: 'organization_id', type: 'text', isSystem: true },
      { name: 'is_deleted', type: 'boolean', isSystem: true },
      { name: 'created_at', type: 'datetime-local' },
      { name: 'updated_at', type: 'datetime-local' },
    ])

    const columns = await generateColumnsFromEntitySchema('TestEntity', registry)
    const ids = columns.map((c) => c.id)

    expect(ids).toContain('name')
    expect(ids).not.toContain('id')
    expect(ids).not.toContain('organization_id')
    expect(ids).not.toContain('is_deleted')
    // created_at and updated_at are not isSystem — they show as user-visible columns
    expect(ids).toContain('created_at')
    expect(ids).toContain('updated_at')
  })

  it('excludes fields marked system: true (manifest style)', async () => {
    const registry = makeSchemaRegistry([
      { name: 'name', type: 'text' },
      { name: 'source_system', type: 'text', system: true },
      { name: 'external_id', type: 'text', system: true },
      { name: 'sync_status', type: 'text', system: true },
      { name: 'description', type: 'text' },
    ])

    const columns = await generateColumnsFromEntitySchema('TestEntity', registry)
    const ids = columns.map((c) => c.id)

    expect(ids).toContain('name')
    expect(ids).toContain('description')
    expect(ids).not.toContain('source_system')
    expect(ids).not.toContain('external_id')
    expect(ids).not.toContain('sync_status')
  })

  it('excludes serverOnly fields', async () => {
    const registry = makeSchemaRegistry([
      { name: 'name', type: 'text' },
      { name: 'raw_payload', type: 'json', serverOnly: true },
      { name: 'internal_data', type: 'json', serverOnly: true },
    ])

    const columns = await generateColumnsFromEntitySchema('TestEntity', registry)
    const ids = columns.map((c) => c.id)

    expect(ids).toContain('name')
    expect(ids).not.toContain('raw_payload')
    expect(ids).not.toContain('internal_data')
  })

  it('includes regular business fields', async () => {
    const registry = makeSchemaRegistry([
      { name: 'name', type: 'text' },
      { name: 'description', type: 'text' },
      { name: 'budget', type: 'decimal' },
    ])

    const columns = await generateColumnsFromEntitySchema('TestEntity', registry)
    const ids = columns.map((c) => c.id)

    expect(ids).toContain('name')
    expect(ids).toContain('description')
    expect(ids).toContain('budget')
  })
})

describe('column-generation: D2 SlotRegistry migration', () => {
  it('enrichColumnsWithFieldTypes is a pass-through (no FieldTypeRegistry)', () => {
    const columns = [
      { id: 'name', field: 'name', cellType: 'text' },
      { id: 'budget', field: 'budget', cellType: 'decimal' },
    ] as any[]

    const result = enrichColumnsWithFieldTypes(columns)

    // Should return the exact same array reference (pass-through)
    expect(result).toBe(columns)
    expect(result).toHaveLength(2)
  })

  it('columns are generated without pre-computed formatter', async () => {
    const registry = makeSchemaRegistry([
      { name: 'name', type: 'text' },
      { name: 'status', type: 'select', editor: { options: [{ value: 'active' }] } },
    ])

    const columns = await generateColumnsFromEntitySchema('TestEntity', registry)

    // SlotRegistry handles rendering at render time — no formatter pre-computed
    for (const col of columns) {
      expect(col.formatter).toBeUndefined()
    }
  })
})
