/**
 * Field Type Test Data Generator
 *
 * Generates mock data with all field types for comprehensive E2E testing.
 * Uses Faker for realistic random data with seeding for reproducibility.
 *
 * @feature GH#488
 */

import { faker } from '@faker-js/faker'
import { STATUS_OPTIONS } from './field-type-schema'

/**
 * Interface for field type test entity
 * Matches FIELD_TYPE_TEST_SCHEMA fields
 */
export interface FieldTypeTestEntity {
  id: string
  // Text fields
  name: string
  description: string | null
  email: string | null
  phone: string | null
  website: string | null
  // Numeric fields
  amount: number | null
  quantity: number | null
  rating: number | null
  progress: number
  // Date/time fields
  due_date: string | null
  created_at: string
  // Choice fields
  status: string
  is_active: boolean
  priority_color: string | null
  // File fields (paths for display)
  attachment: string | null
  avatar: string | null
  // Relationship fields
  assigned_to: string | null // User reference - displays as user badge
  assigned_to_resolved?: string // Pre-resolved display name (backend pattern)
  related_project: string | null // Entity reference - displays as entity badge
  __resolved_related_project?: { name: string } | null // Entity reference resolved data (backend pattern)
  // Internal
  parent_id: string | null
}

/**
 * Color palette for priority_color field
 */
const COLOR_PALETTE = [
  '#ef4444', // red
  '#f59e0b', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

/**
 * Mock users for person/reference field testing
 * These simulate resolved user data for E2E tests
 */
export const MOCK_USERS = [
  { id: 'user-001', name: 'Alice Johnson', email: 'alice@example.com' },
  { id: 'user-002', name: 'Bob Smith', email: 'bob@example.com' },
  { id: 'user-003', name: 'Carol Williams', email: 'carol@example.com' },
  { id: 'user-004', name: 'David Brown', email: 'david@example.com' },
  { id: 'user-005', name: 'Eva Martinez', email: 'eva@example.com' },
] as const

/**
 * Mock projects for reference-select field testing
 */
export const MOCK_PROJECTS = [
  { id: 'proj-001', name: 'Alpha Project' },
  { id: 'proj-002', name: 'Beta Initiative' },
  { id: 'proj-003', name: 'Gamma Sprint' },
  { id: 'proj-004', name: 'Delta Migration' },
  { id: 'proj-005', name: 'Epsilon Launch' },
] as const

/**
 * Generate a single field type test entity
 */
export function generateFieldTypeTestEntity(
  index: number,
  options?: {
    includeNulls?: boolean // Include null values for optional fields
    parentId?: string | null // For hierarchy testing
  },
): FieldTypeTestEntity {
  const includeNulls = options?.includeNulls ?? true
  const shouldBeNull = () => includeNulls && faker.datatype.boolean({ probability: 0.2 })

  const statusValues = STATUS_OPTIONS.map((s) => s.value)
  const now = new Date()
  const dueDate = faker.date.soon({ days: 30, refDate: now })

  return {
    id: `field-test-${Date.now()}-${index}`,

    // Text fields
    name: `${faker.commerce.productAdjective()} ${faker.commerce.product()} ${index}`,
    description: shouldBeNull() ? null : faker.lorem.paragraph(),
    email: shouldBeNull() ? null : faker.internet.email(),
    phone: shouldBeNull() ? null : faker.phone.number(),
    website: shouldBeNull() ? null : faker.internet.url(),

    // Numeric fields
    amount: shouldBeNull() ? null : faker.number.float({ min: 10, max: 10000, fractionDigits: 2 }),
    quantity: shouldBeNull() ? null : faker.number.int({ min: 1, max: 1000 }),
    rating: faker.number.int({ min: 0, max: 5 }),
    progress: faker.number.int({ min: 0, max: 100 }),

    // Date/time fields
    due_date: shouldBeNull() ? null : dueDate.toISOString().split('T')[0],
    created_at: faker.date.recent({ days: 30 }).toISOString(),

    // Choice fields
    status: faker.helpers.arrayElement(statusValues),
    is_active: faker.datatype.boolean(),
    priority_color: shouldBeNull() ? null : faker.helpers.arrayElement(COLOR_PALETTE),

    // File fields (mock paths)
    attachment: shouldBeNull() ? null : faker.system.fileName(),
    avatar: shouldBeNull() ? null : faker.image.avatar(),

    // Relationship fields - store display name directly (not UUID)
    // The field type renderer checks for non-UUID strings and renders them as badges
    assigned_to: shouldBeNull() ? null : faker.helpers.arrayElement(MOCK_USERS).name,
    // For entity reference, use __resolved_ prefix pattern expected by renderer
    ...(() => {
      if (shouldBeNull()) return { related_project: null, __resolved_related_project: null }
      const project = faker.helpers.arrayElement(MOCK_PROJECTS)
      return {
        related_project: project.id, // Store ID (or any value)
        __resolved_related_project: { name: project.name }, // Resolved display data
      }
    })(),

    // Internal
    parent_id: options?.parentId ?? null,
  }
}

/**
 * Generate multiple field type test entities
 */
export function generateFieldTypeTestEntities(
  count: number,
  options?: {
    includeNulls?: boolean
    withHierarchy?: boolean
    seed?: number
  },
): FieldTypeTestEntity[] {
  // Seed faker for reproducibility
  if (options?.seed !== undefined) {
    faker.seed(options.seed)
  }

  const entities: FieldTypeTestEntity[] = []

  if (options?.withHierarchy) {
    // Generate parent/child structure
    const parentCount = Math.ceil(count / 4)
    const childrenPerParent = Math.floor((count - parentCount) / parentCount)

    for (let i = 0; i < parentCount; i++) {
      // Parent
      const parent = generateFieldTypeTestEntity(i + 1, {
        includeNulls: options?.includeNulls,
        parentId: null,
      })
      parent.name = `Project ${i + 1}: ${faker.commerce.department()}`
      entities.push(parent)

      // Children
      for (let j = 0; j < childrenPerParent && entities.length < count; j++) {
        const child = generateFieldTypeTestEntity(entities.length + 1, {
          includeNulls: options?.includeNulls,
          parentId: parent.id,
        })
        child.name = `Task ${i + 1}.${j + 1}: ${faker.commerce.productName()}`
        entities.push(child)
      }
    }

    // Fill remaining slots if any
    while (entities.length < count) {
      entities.push(
        generateFieldTypeTestEntity(entities.length + 1, {
          includeNulls: options?.includeNulls,
        }),
      )
    }
  } else {
    // Flat list
    for (let i = 0; i < count; i++) {
      entities.push(
        generateFieldTypeTestEntity(i + 1, {
          includeNulls: options?.includeNulls,
        }),
      )
    }
  }

  return entities.slice(0, count)
}

/**
 * Generate entities with specific field values for targeted testing
 */
export function generateFieldTypeTestFixtures(): FieldTypeTestEntity[] {
  faker.seed(54321) // Fixed seed for reproducible fixtures

  return [
    // Boolean variations
    {
      ...generateFieldTypeTestEntity(1, { includeNulls: false }),
      name: 'Boolean True Test',
      is_active: true,
    },
    {
      ...generateFieldTypeTestEntity(2, { includeNulls: false }),
      name: 'Boolean False Test',
      is_active: false,
    },

    // Rating variations
    {
      ...generateFieldTypeTestEntity(3, { includeNulls: false }),
      name: 'Rating 0 Stars',
      rating: 0,
    },
    {
      ...generateFieldTypeTestEntity(4, { includeNulls: false }),
      name: 'Rating 3 Stars',
      rating: 3,
    },
    {
      ...generateFieldTypeTestEntity(5, { includeNulls: false }),
      name: 'Rating 5 Stars',
      rating: 5,
    },

    // Progress variations
    {
      ...generateFieldTypeTestEntity(6, { includeNulls: false }),
      name: 'Progress 0%',
      progress: 0,
    },
    {
      ...generateFieldTypeTestEntity(7, { includeNulls: false }),
      name: 'Progress 50%',
      progress: 50,
    },
    {
      ...generateFieldTypeTestEntity(8, { includeNulls: false }),
      name: 'Progress 100%',
      progress: 100,
    },

    // Status variations (all statuses)
    ...STATUS_OPTIONS.map((status, i) => ({
      ...generateFieldTypeTestEntity(9 + i, { includeNulls: false }),
      name: `Status: ${status.label}`,
      status: status.value,
    })),

    // Color variations
    ...COLOR_PALETTE.slice(0, 4).map((color, i) => ({
      ...generateFieldTypeTestEntity(13 + i, { includeNulls: false }),
      name: `Color: ${color}`,
      priority_color: color,
    })),

    // Null/empty variations
    {
      ...generateFieldTypeTestEntity(17, { includeNulls: false }),
      name: 'All Nulls Test',
      description: null,
      email: null,
      phone: null,
      website: null,
      amount: null,
      quantity: null,
      rating: null,
      due_date: null,
      priority_color: null,
      attachment: null,
      avatar: null,
      assigned_to: null,
      related_project: null,
    },

    // User reference variations
    ...MOCK_USERS.slice(0, 3).map((user, i) => ({
      ...generateFieldTypeTestEntity(18 + i, { includeNulls: false }),
      name: `User Ref: ${user.name}`,
      assigned_to: user.name,
    })),

    // Entity reference variations
    ...MOCK_PROJECTS.slice(0, 3).map((project, i) => ({
      ...generateFieldTypeTestEntity(21 + i, { includeNulls: false }),
      name: `Project Ref: ${project.name}`,
      related_project: project.id,
      __resolved_related_project: { name: project.name },
    })),
  ]
}

/**
 * Seed faker for reproducible data
 */
export function seedFaker(seed: number): void {
  faker.seed(seed)
}

/**
 * Reset faker seed to random
 */
export function resetFakerSeed(): void {
  faker.seed()
}
