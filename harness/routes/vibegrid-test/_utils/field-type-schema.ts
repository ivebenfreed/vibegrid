/**
 * Comprehensive Field Type Schema for E2E Testing
 *
 * Schema with all 16 basic field types to test field type-specific
 * rendering, editing, and interaction behaviors.
 *
 * @feature GH#488
 */

import type { EntitySchema, FieldDefinition } from '@/shared/types/dataforge'

/**
 * Status options for select field
 */
export const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: '#22c55e' },
  { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { value: 'done', label: 'Done', color: '#6b7280' },
  { value: 'blocked', label: 'Blocked', color: '#ef4444' },
] as const

/**
 * Priority options for multi-select field
 */
export const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical', color: '#ef4444', icon: 'alert-circle' },
  { value: 'high', label: 'High', color: '#f59e0b', icon: 'arrow-up' },
  { value: 'medium', label: 'Medium', color: '#3b82f6', icon: 'minus' },
  { value: 'low', label: 'Low', color: '#22c55e', icon: 'arrow-down' },
] as const

/**
 * Comprehensive schema with all field types for E2E testing
 */
export const FIELD_TYPE_TEST_SCHEMA: EntitySchema = {
  entityName: 'FieldTypeTest',
  archetype: 'task',
  tableName: 'field_type_tests',
  displayName: 'Field Type Test',
  description: 'Test entity with all field types for E2E testing',
  fields: [
    // ============================================
    // TEXT FIELDS
    // ============================================
    {
      name: 'name',
      type: 'text',
      label: 'Name',
      required: true,
      description: 'Basic text field (entity name)',
    },
    {
      name: 'description',
      type: 'markdown',
      label: 'Description',
      required: false,
      description: 'Markdown text with preview',
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      required: false,
      description: 'Email with mailto link',
    },
    {
      name: 'phone',
      type: 'phone',
      label: 'Phone',
      required: false,
      description: 'Phone with tel link',
    },
    {
      name: 'website',
      type: 'url',
      label: 'Website',
      required: false,
      description: 'URL with external link',
    },

    // ============================================
    // NUMERIC FIELDS
    // ============================================
    {
      name: 'amount',
      type: 'currency',
      label: 'Amount',
      required: false,
      description: 'Currency with symbol and formatting',
    },
    {
      name: 'quantity',
      type: 'number',
      label: 'Quantity',
      required: false,
      description: 'Plain number',
    },
    {
      name: 'rating',
      type: 'rating',
      label: 'Rating',
      required: false,
      description: 'Star rating (0-5)',
      validation: {
        min: 0,
        max: 5,
      },
    },
    {
      name: 'progress',
      type: 'slider',
      label: 'Progress',
      required: false,
      description: 'Slider 0-100%',
      validation: {
        min: 0,
        max: 100,
      },
    },

    // ============================================
    // DATE/TIME FIELDS
    // ============================================
    {
      name: 'due_date',
      type: 'date',
      label: 'Due Date',
      required: false,
      description: 'Date picker',
    },
    {
      name: 'created_at',
      type: 'datetime',
      label: 'Created At',
      required: false,
      description: 'Date and time picker',
    },

    // ============================================
    // CHOICE FIELDS
    // ============================================
    {
      name: 'status',
      type: 'select',
      label: 'Status',
      required: false,
      description: 'Single-select dropdown',
      options: STATUS_OPTIONS as unknown as Array<{ value: string; label: string }>,
    },
    {
      name: 'is_active',
      type: 'boolean',
      label: 'Active',
      required: false,
      description: 'Boolean toggle',
      display: {
        trueLabel: 'Active',
        falseLabel: 'Inactive',
      },
    },
    {
      name: 'priority_color',
      type: 'color',
      label: 'Color',
      required: false,
      description: 'Color picker with swatch',
    },

    // ============================================
    // FILE FIELDS (display only for E2E)
    // ============================================
    {
      name: 'attachment',
      type: 'file',
      label: 'Attachment',
      required: false,
      description: 'File attachment',
    },
    {
      name: 'avatar',
      type: 'image',
      label: 'Avatar',
      required: false,
      description: 'Image thumbnail',
    },

    // ============================================
    // INTERNAL FIELDS
    // ============================================
    {
      name: 'parent_id',
      type: 'text',
      label: 'Parent ID',
      required: false,
      description: 'For hierarchy testing',
    },
  ] as FieldDefinition[],
  createdAt: new Date().toISOString(),
  dependencies: {
    supportsDependencies: false,
    validDependencyTypes: [],
    currentDependencies: [],
    dependencyCount: 0,
    lastUpdated: new Date().toISOString(),
  },
}

/**
 * Field categories for UI organization
 */
export const FIELD_CATEGORIES = {
  text: ['name', 'description', 'email', 'phone', 'website'],
  numeric: ['amount', 'quantity', 'rating', 'progress'],
  datetime: ['due_date', 'created_at'],
  choice: ['status', 'is_active', 'priority_color'],
  file: ['attachment', 'avatar'],
} as const

/**
 * High-priority fields for focused E2E testing
 */
export const HIGH_PRIORITY_FIELDS = [
  'is_active',    // boolean - toggle affordance
  'status',       // select - dropdown
  'due_date',     // date - date picker
  'rating',       // rating - star clicks
  'progress',     // slider - drag
  'priority_color', // color - color picker
] as const
