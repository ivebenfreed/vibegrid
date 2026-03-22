import { describe, expect, it } from 'vitest'
import {
  FIELD_TYPE_CATEGORIES,
  isDateType,
  isDropdownPositioned,
  isModalTextType,
  isTextPositioned,
} from '../field-type-categories'

describe('FIELD_TYPE_CATEGORIES', () => {
  it('maps all text types correctly', () => {
    const textTypes = ['text', 'string', 'email', 'url', 'phone']
    for (const type of textTypes) {
      expect(FIELD_TYPE_CATEGORIES[type]).toBe('text')
    }
  })

  it('maps all number types correctly', () => {
    const numberTypes = ['number', 'integer', 'float', 'decimal']
    for (const type of numberTypes) {
      expect(FIELD_TYPE_CATEGORIES[type]).toBe('number')
    }
  })

  it('maps all modal-text types correctly', () => {
    const modalTextTypes = [
      'textarea',
      'longtext',
      'richtext',
      'rich-text',
      'rich_text',
      'html',
      'markdown',
    ]
    for (const type of modalTextTypes) {
      expect(FIELD_TYPE_CATEGORIES[type]).toBe('modal-text')
    }
  })

  it('maps all boolean types correctly', () => {
    const booleanTypes = ['boolean', 'checkbox', 'switch']
    for (const type of booleanTypes) {
      expect(FIELD_TYPE_CATEGORIES[type]).toBe('boolean')
    }
  })

  it('maps all dropdown types correctly', () => {
    const dropdownTypes = [
      'date',
      'datetime-local',
      'datetime',
      'timestamp',
      'time',
      'timestamptz',
      'select',
      'single-select',
      'enum',
      'select-multi',
      'multi-select',
      'multiselect',
      'tags',
      'entity_reference',
      'user_reference',
      'reference-select',
      'reference-multi',
      'priority_option',
      'status_option',
      'category_option',
      'task_type_option',
    ]
    for (const type of dropdownTypes) {
      expect(FIELD_TYPE_CATEGORIES[type]).toBe('dropdown')
    }
  })

  it('does not include json/jsonb (handled as special case)', () => {
    expect(FIELD_TYPE_CATEGORIES.json).toBeUndefined()
    expect(FIELD_TYPE_CATEGORIES.jsonb).toBeUndefined()
  })

  it('does not include display-only types', () => {
    // Note: currency and percentage ARE in FIELD_TYPE_CATEGORIES as 'number' — tested separately
    const displayOnly = [
      'file',
      'image',
      'color',
      'rating',
      'slider',
      'currency-abbreviated',
      'additional-insured',
      'expiration-date',
      'badge-list',
      'row-expand',
      'entity-name',
      'status',
      'discussion_type_option',
      'rollup_count',
      'rollup_sum',
      'rollup_average',
      'rollup_concat',
      'computed_expression',
      'computed_formula',
      'computed_decision_table',
    ]
    for (const type of displayOnly) {
      expect(FIELD_TYPE_CATEGORIES[type]).toBeUndefined()
    }
  })

  it('maps currency and percentage to number category', () => {
    // currency and percentage are editable number types, not display-only
    expect(FIELD_TYPE_CATEGORIES['currency']).toBe('number')
    expect(FIELD_TYPE_CATEGORIES['percentage']).toBe('number')
  })
})

describe('isTextPositioned', () => {
  it('returns true for text and number types', () => {
    expect(isTextPositioned('text')).toBe(true)
    expect(isTextPositioned('string')).toBe(true)
    expect(isTextPositioned('email')).toBe(true)
    expect(isTextPositioned('number')).toBe(true)
    expect(isTextPositioned('integer')).toBe(true)
  })

  it('returns false for dropdown types', () => {
    expect(isTextPositioned('select')).toBe(false)
    expect(isTextPositioned('date')).toBe(false)
    expect(isTextPositioned('boolean')).toBe(false)
  })

  it('returns false for modal-text types', () => {
    expect(isTextPositioned('textarea')).toBe(false)
    expect(isTextPositioned('rich-text')).toBe(false)
  })

  it('returns false for unmapped types', () => {
    expect(isTextPositioned('unknown-type')).toBe(false)
  })
})

describe('isDropdownPositioned', () => {
  it('returns true for dropdown types', () => {
    expect(isDropdownPositioned('select')).toBe(true)
    expect(isDropdownPositioned('date')).toBe(true)
    expect(isDropdownPositioned('entity_reference')).toBe(true)
  })

  it('returns true for boolean types (positioned as dropdown)', () => {
    expect(isDropdownPositioned('boolean')).toBe(true)
    expect(isDropdownPositioned('checkbox')).toBe(true)
    expect(isDropdownPositioned('switch')).toBe(true)
  })

  it('returns false for text types', () => {
    expect(isDropdownPositioned('text')).toBe(false)
    expect(isDropdownPositioned('number')).toBe(false)
  })

  it('returns false for unmapped types', () => {
    expect(isDropdownPositioned('unknown-type')).toBe(false)
  })
})

describe('isModalTextType', () => {
  it('returns true for modal text types', () => {
    expect(isModalTextType('textarea')).toBe(true)
    expect(isModalTextType('longtext')).toBe(true)
    expect(isModalTextType('richtext')).toBe(true)
    expect(isModalTextType('rich-text')).toBe(true)
    expect(isModalTextType('rich_text')).toBe(true)
    expect(isModalTextType('html')).toBe(true)
    expect(isModalTextType('markdown')).toBe(true)
  })

  it('returns false for non-modal types', () => {
    expect(isModalTextType('text')).toBe(false)
    expect(isModalTextType('select')).toBe(false)
    expect(isModalTextType('number')).toBe(false)
  })
})

describe('GH#1906: collapsed reference field types', () => {
  it('maps only canonical reference types to dropdown', () => {
    expect(FIELD_TYPE_CATEGORIES.entity_reference).toBe('dropdown')
    expect(FIELD_TYPE_CATEGORIES.user_reference).toBe('dropdown')
  })

  it('does not map removed reference type aliases', () => {
    // These were removed in GH#1906 — they should not exist in the category map
    const removedTypes = [
      'custom_entity_reference',
      'custom_user_reference',
      'relationship-single',
      'relationship-multi',
      'relationship-collection',
    ]
    for (const type of removedTypes) {
      expect(FIELD_TYPE_CATEGORIES[type]).toBeUndefined()
    }
  })
})

describe('isDateType', () => {
  it('returns true for date variants', () => {
    expect(isDateType('date')).toBe(true)
    expect(isDateType('datetime')).toBe(true)
    expect(isDateType('datetime-local')).toBe(true)
    expect(isDateType('timestamp')).toBe(true)
    expect(isDateType('timestamptz')).toBe(true)
  })

  it('returns false for time-only', () => {
    expect(isDateType('time')).toBe(false)
  })

  it('returns false for non-date types', () => {
    expect(isDateType('text')).toBe(false)
    expect(isDateType('select')).toBe(false)
  })
})
