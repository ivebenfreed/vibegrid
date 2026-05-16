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
const { generateColumnsFromEntitySchema } = await import('../column-generation')

const STATUS_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'processing', label: 'Processing' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'confirmed', label: 'Confirmed' },
]

function makeSchemaRegistry(
  entityType: string,
  fields: object[],
): any {
  return {
    isBootstrapping: false,
    schemas: {
      byName: {
        [entityType]: {
          fields,
        },
      },
    },
  }
}

function statusField(type: 'status' | 'status_set' | 'text' = 'status_set') {
  return {
    name: 'status',
    type,
    editor: {
      options: STATUS_OPTIONS.map((o) => ({ ...o })),
    },
  }
}

function findColumn(columns: any[], id: string) {
  return columns.find((c) => c.id === id)
}

describe('column-generation: GH#3044 status label override', () => {
  describe('CertificateOfInsurance', () => {
    it('remaps column.options labels per the COI override map', async () => {
      const registry = makeSchemaRegistry('CertificateOfInsurance', [statusField('status_set')])
      const columns = await generateColumnsFromEntitySchema('CertificateOfInsurance', registry)
      const status = findColumn(columns, 'status')

      expect(status).toBeDefined()
      const optionsByValue: Record<string, string> = {}
      for (const opt of status.options) {
        optionsByValue[opt.value] = opt.label
      }

      expect(optionsByValue.approved).toBe('Compliant')
      expect(optionsByValue.confirmed).toBe('Compliant')
      expect(optionsByValue.rejected).toBe('Failed')
      expect(optionsByValue.needs_review).toBe('Needs review')
      expect(optionsByValue.processing).toBe('Processing')
    })

    it('mirrors the remapped labels onto column.editor.options', async () => {
      const registry = makeSchemaRegistry('CertificateOfInsurance', [statusField('status_set')])
      const columns = await generateColumnsFromEntitySchema('CertificateOfInsurance', registry)
      const status = findColumn(columns, 'status')

      expect(status.editor).toBeDefined()
      expect(status.editor.options).toBeDefined()
      // Structural equality: editor.options carries the same remapped labels.
      expect(status.editor.options).toEqual(status.options)

      const editorByValue: Record<string, string> = {}
      for (const opt of status.editor.options) {
        editorByValue[opt.value] = opt.label
      }

      expect(editorByValue.approved).toBe('Compliant')
      expect(editorByValue.confirmed).toBe('Compliant')
      expect(editorByValue.rejected).toBe('Failed')
      expect(editorByValue.needs_review).toBe('Needs review')
      expect(editorByValue.processing).toBe('Processing')
    })

    it('also applies when the field type is "status" (not just "status_set")', async () => {
      const registry = makeSchemaRegistry('CertificateOfInsurance', [statusField('status')])
      const columns = await generateColumnsFromEntitySchema('CertificateOfInsurance', registry)
      const status = findColumn(columns, 'status')

      const optionsByValue: Record<string, string> = {}
      for (const opt of status.options) {
        optionsByValue[opt.value] = opt.label
      }

      expect(optionsByValue.approved).toBe('Compliant')
      expect(optionsByValue.rejected).toBe('Failed')

      const editorByValue: Record<string, string> = {}
      for (const opt of status.editor.options) {
        editorByValue[opt.value] = opt.label
      }
      expect(editorByValue.approved).toBe('Compliant')
      expect(editorByValue.rejected).toBe('Failed')
    })

    it('does NOT mutate text-typed option fields, even on CertificateOfInsurance', async () => {
      // A non-status field that happens to have option values like "approved".
      // The override must NOT fire — gate is on fieldType === 'status' || 'status_set'.
      // Use a unique field name so it doesn't collide with the status renderer mapping.
      const textField = {
        name: 'category',
        type: 'text',
        editor: {
          options: STATUS_OPTIONS.map((o) => ({ ...o })),
        },
      }
      const registry = makeSchemaRegistry('CertificateOfInsurance', [textField])
      const columns = await generateColumnsFromEntitySchema('CertificateOfInsurance', registry)
      const col = findColumn(columns, 'category')

      const optionsByValue: Record<string, string> = {}
      for (const opt of col.options) {
        optionsByValue[opt.value] = opt.label
      }

      // Original backend labels — NOT remapped.
      expect(optionsByValue.approved).toBe('Approved')
      expect(optionsByValue.rejected).toBe('Rejected')
      expect(optionsByValue.needs_review).toBe('Needs Review')
      expect(optionsByValue.confirmed).toBe('Confirmed')
      expect(optionsByValue.processing).toBe('Processing')

      const editorByValue: Record<string, string> = {}
      for (const opt of col.editor.options) {
        editorByValue[opt.value] = opt.label
      }
      expect(editorByValue.approved).toBe('Approved')
      expect(editorByValue.rejected).toBe('Rejected')
    })
  })

  describe('non-overridden entity types', () => {
    it('does NOT remap status options for RFI', async () => {
      const registry = makeSchemaRegistry('RFI', [statusField('status_set')])
      const columns = await generateColumnsFromEntitySchema('RFI', registry)
      const status = findColumn(columns, 'status')

      const optionsByValue: Record<string, string> = {}
      for (const opt of status.options) {
        optionsByValue[opt.value] = opt.label
      }

      // Original backend labels — untouched.
      expect(optionsByValue.approved).toBe('Approved')
      expect(optionsByValue.rejected).toBe('Rejected')
      expect(optionsByValue.needs_review).toBe('Needs Review')
      expect(optionsByValue.confirmed).toBe('Confirmed')
      expect(optionsByValue.processing).toBe('Processing')
    })

    it('does NOT remap editor.options for RFI', async () => {
      const registry = makeSchemaRegistry('RFI', [statusField('status_set')])
      const columns = await generateColumnsFromEntitySchema('RFI', registry)
      const status = findColumn(columns, 'status')

      const editorByValue: Record<string, string> = {}
      for (const opt of status.editor.options) {
        editorByValue[opt.value] = opt.label
      }

      expect(editorByValue.approved).toBe('Approved')
      expect(editorByValue.rejected).toBe('Rejected')
      expect(editorByValue.needs_review).toBe('Needs Review')
      expect(editorByValue.confirmed).toBe('Confirmed')
      expect(editorByValue.processing).toBe('Processing')
    })
  })
})
