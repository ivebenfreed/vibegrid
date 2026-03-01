/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

// Mock heavy dependencies before importing the module under test
vi.mock('../../../field-types/FieldTypeRegistry', () => ({
  fieldTypeRegistry: {
    getFieldType: vi.fn().mockReturnValue({
      category: 'text',
      formatter: { format: vi.fn() },
      editor: {},
    }),
  },
}))

vi.mock('../../../field-types', () => ({}))

vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Import after mocks are in place
const { generateColumnsFromEntitySchema } = await import('../column-generation')

function makeSchemaRegistry(fields: object[]) {
  return {
    isBootstrapping: false,
    schemas: {
      byName: {
        TestEntity: {
          allFields: Object.fromEntries((fields as any[]).map((f) => [f.name, f])),
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
