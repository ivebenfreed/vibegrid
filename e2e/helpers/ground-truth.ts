import { readFileSync } from 'node:fs'

export interface FieldMatcher {
  /** Match strategy */
  type: 'exact' | 'numeric_tolerance' | 'date_tolerance' | 'string_similarity'
  /** Absolute tolerance for numeric_tolerance, days for date_tolerance */
  tolerance?: number
  /** Similarity threshold for string_similarity (0-1, default 0.8) */
  threshold?: number
}

export interface GroundTruth {
  source_pdf: string
  local_path: string
  expected_fields: Record<string, any>
  expected_vendor_match?: { entity_exists: boolean; company_name: string }
  field_matchers?: Record<string, FieldMatcher>
}

export interface FieldResult {
  field: string
  expected: any
  actual: any
  match: boolean
  matcher: string
}

export interface ComparisonResult {
  totalFields: number
  matchedFields: number
  accuracy: number
  fieldResults: FieldResult[]
}

/**
 * Load a ground truth fixture from a JSON file path.
 */
export function loadGroundTruth(fixturePath: string): GroundTruth {
  const raw = readFileSync(fixturePath, 'utf-8')
  return JSON.parse(raw) as GroundTruth
}

/**
 * Compare entity fields against ground truth expectations.
 *
 * Uses the field_matchers from the ground truth fixture to determine
 * comparison strategy per field. Falls back to 'exact' match if no
 * matcher is specified.
 */
export function compareFields(
  entity: Record<string, any>,
  groundTruth: GroundTruth,
): ComparisonResult {
  const matchers = groundTruth.field_matchers ?? {}
  const expected = groundTruth.expected_fields
  const fieldResults: FieldResult[] = []

  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = entity[field]
    const matcher = matchers[field] ?? { type: 'exact' as const }
    const match = applyMatcher(expectedValue, actualValue, matcher)

    fieldResults.push({
      field,
      expected: expectedValue,
      actual: actualValue,
      match,
      matcher: matcher.type,
    })
  }

  const matchedFields = fieldResults.filter((r) => r.match).length

  return {
    totalFields: fieldResults.length,
    matchedFields,
    accuracy: fieldResults.length > 0 ? matchedFields / fieldResults.length : 0,
    fieldResults,
  }
}

function applyMatcher(expected: any, actual: any, matcher: FieldMatcher): boolean {
  if (actual === undefined || actual === null) {
    return expected === null || expected === undefined
  }

  switch (matcher.type) {
    case 'exact':
      return matchExact(expected, actual)

    case 'numeric_tolerance':
      return matchNumericTolerance(expected, actual, matcher.tolerance ?? 0)

    case 'date_tolerance':
      return matchDateTolerance(expected, actual, matcher.tolerance ?? 0)

    case 'string_similarity':
      return matchStringSimilarity(expected, actual, matcher.threshold ?? 0.8)

    default:
      return matchExact(expected, actual)
  }
}

function matchExact(expected: any, actual: any): boolean {
  if (typeof expected === 'boolean') {
    // Coerce string 'true'/'false' to boolean
    if (typeof actual === 'string') {
      return expected === (actual.toLowerCase() === 'true')
    }
    return expected === actual
  }
  if (typeof expected === 'number' && typeof actual === 'string') {
    return expected === Number(actual)
  }
  if (typeof expected === 'string' && typeof actual === 'string') {
    return expected.toLowerCase() === actual.toLowerCase()
  }
  return expected === actual
}

function matchNumericTolerance(expected: any, actual: any, tolerance: number): boolean {
  const exp = typeof expected === 'number' ? expected : Number(expected)
  const act = typeof actual === 'number' ? actual : Number(actual)
  if (Number.isNaN(exp) || Number.isNaN(act)) return false
  return Math.abs(exp - act) <= tolerance
}

function matchDateTolerance(expected: any, actual: any, toleranceDays: number): boolean {
  const expDate = new Date(expected)
  const actDate = new Date(actual)
  if (Number.isNaN(expDate.getTime()) || Number.isNaN(actDate.getTime())) return false
  const diffMs = Math.abs(expDate.getTime() - actDate.getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= toleranceDays
}

function matchStringSimilarity(expected: any, actual: any, threshold: number): boolean {
  const expStr = String(expected).toLowerCase().trim()
  const actStr = String(actual).toLowerCase().trim()

  // Exact match shortcut
  if (expStr === actStr) return true

  // Containment check (if one contains the other)
  if (actStr.includes(expStr) || expStr.includes(actStr)) return true

  // Simple Dice coefficient on bigrams
  const similarity = diceCoefficient(expStr, actStr)
  return similarity >= threshold
}

/**
 * Dice coefficient (bigram overlap) for string similarity.
 * Returns a value between 0 and 1.
 */
function diceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) {
    return a === b ? 1 : 0
  }

  const bigramsA = new Set<string>()
  for (let i = 0; i < a.length - 1; i++) {
    bigramsA.add(a.slice(i, i + 2))
  }

  const bigramsB = new Set<string>()
  for (let i = 0; i < b.length - 1; i++) {
    bigramsB.add(b.slice(i, i + 2))
  }

  let intersection = 0
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size)
}
