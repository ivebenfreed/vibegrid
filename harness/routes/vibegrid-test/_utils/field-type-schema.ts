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
    // HIGH-PRIORITY E2E TEST FIELDS (FIRST for visibility)
    // These are the fields with E2E test files - show them first!
    // Narrow widths (80-100px) so all 16 columns fit on screen
    // ============================================
    {
      name: 'name',
      type: 'text',
      label: 'Name',
      required: true,
      description: 'Basic text field (entity name)',
      display: { width: 120 },
    },
    {
      name: 'is_active',
      type: 'boolean',
      label: 'Active',
      required: false,
      description: 'Boolean toggle - E2E: boolean.spec.ts',
      display: {
        width: 70,
        trueLabel: 'Active',
        falseLabel: 'Inactive',
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Status',
      required: false,
      description: 'Single-select dropdown - E2E: select.spec.ts',
      options: STATUS_OPTIONS as unknown as Array<{ value: string; label: string }>,
      display: { width: 100 },
    },
    {
      name: 'due_date',
      type: 'date',
      label: 'Due',
      required: false,
      description: 'Date picker - E2E: date.spec.ts',
      display: { width: 100 },
    },
    {
      name: 'rating',
      type: 'rating',
      label: 'Rating',
      required: false,
      description: 'Star rating (0-5) - E2E: rating.spec.ts',
      validation: {
        min: 0,
        max: 5,
      },
      display: { width: 100 },
    },
    {
      name: 'progress',
      type: 'slider',
      label: 'Progress',
      required: false,
      description: 'Slider 0-100% - E2E: slider.spec.ts',
      validation: {
        min: 0,
        max: 100,
      },
      display: { width: 100 },
    },
    {
      name: 'priority_color',
      type: 'color',
      label: 'Color',
      required: false,
      description: 'Color picker with swatch - E2E: color.spec.ts',
      display: { width: 70 },
    },

    // ============================================
    // REMAINING TEXT FIELDS (narrower for test fixture)
    // ============================================
    {
      name: 'description',
      type: 'markdown',
      label: 'Desc',
      required: false,
      description: 'Markdown text with preview',
      display: { width: 100 },
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      required: false,
      description: 'Email with mailto link',
      display: { width: 120 },
    },
    {
      name: 'phone',
      type: 'phone',
      label: 'Phone',
      required: false,
      description: 'Phone with tel link',
      display: { width: 100 },
    },
    {
      name: 'website',
      type: 'url',
      label: 'URL',
      required: false,
      description: 'URL with external link',
      display: { width: 100 },
    },

    // ============================================
    // REMAINING NUMERIC FIELDS
    // ============================================
    {
      name: 'amount',
      type: 'currency',
      label: 'Amount',
      required: false,
      description: 'Currency with symbol and formatting',
      display: { width: 90 },
    },
    {
      name: 'quantity',
      type: 'number',
      label: 'Qty',
      required: false,
      description: 'Plain number',
      display: { width: 60 },
    },

    // ============================================
    // REMAINING DATE/TIME FIELDS
    // ============================================
    {
      name: 'created_at',
      type: 'datetime',
      label: 'Created',
      required: false,
      description: 'Date and time picker',
      display: { width: 120 },
    },

    // ============================================
    // FILE FIELDS
    // ============================================
    {
      name: 'attachment',
      type: 'file',
      label: 'File',
      required: false,
      description: 'File attachment',
      display: { width: 80 },
    },
    {
      name: 'avatar',
      type: 'image',
      label: 'Img',
      required: false,
      description: 'Image thumbnail',
      display: { width: 60 },
    },

    // ============================================
    // RELATIONSHIP FIELDS - E2E: relationship-types.spec.ts
    // ============================================
    {
      name: 'assigned_to',
      type: 'user_reference',
      label: 'Assignee',
      required: false,
      description: 'User reference with badge display',
      display: { width: 140 },
    },
    {
      name: 'related_project',
      type: 'entity_reference',
      label: 'Project',
      required: false,
      description: 'Entity reference with badge display',
      display: { width: 140 },
      relationshipConfig: {
        targetEntityType: 'Project',
        displayField: 'name',
      },
    },

    // ============================================
    // INTERNAL FIELDS
    // ============================================
    {
      name: 'parent_id',
      type: 'text',
      label: 'Parent',
      required: false,
      description: 'For hierarchy testing',
      display: { width: 80 },
    },
  ] as unknown as FieldDefinition[], // Cast via unknown to allow display.width overrides
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
  relationship: ['assigned_to', 'related_project'],
} as const

/**
 * High-priority fields for focused E2E testing
 */
export const HIGH_PRIORITY_FIELDS = [
  'is_active', // boolean - toggle affordance
  'status', // select - dropdown
  'due_date', // date - date picker
  'rating', // rating - star clicks
  'progress', // slider - drag
  'priority_color', // color - color picker
] as const
