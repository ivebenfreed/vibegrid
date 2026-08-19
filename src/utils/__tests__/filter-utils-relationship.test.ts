/**
 * JS filter evaluation over list-valued (relationship) cells.
 *
 * The dense/client-side path mirrors the SQL translation: a relationship cell
 * holds an ARRAY of target ids, so a match is set membership.
 */

import { describe, expect, it } from 'vitest'
import { evaluateCondition } from '../filter-utils'

const P1 = 'p-1'
const P2 = 'p-2'

function condition(operator: string, value: unknown) {
  return { id: 'c1', field: 'project', operator, value } as never
}

describe('evaluateCondition — list-valued cells', () => {
  it('matches equals when the id is a member of the array', () => {
    expect(evaluateCondition({ data: { project: [P1, P2] } }, condition('equals', P1))).toBe(true)
    expect(evaluateCondition({ data: { project: [P2] } }, condition('equals', P1))).toBe(false)
  })

  it('inverts membership for not_equals', () => {
    expect(evaluateCondition({ data: { project: [P2] } }, condition('not_equals', P1))).toBe(true)
    expect(evaluateCondition({ data: { project: [P1] } }, condition('not_equals', P1))).toBe(false)
  })

  it('treats `in` as an intersection with the selected set', () => {
    expect(evaluateCondition({ data: { project: [P2] } }, condition('in', [P1, P2]))).toBe(true)
    expect(evaluateCondition({ data: { project: ['p-9'] } }, condition('in', [P1, P2]))).toBe(false)
  })

  it('treats `not_in` as an empty intersection', () => {
    expect(evaluateCondition({ data: { project: ['p-9'] } }, condition('not_in', [P1, P2]))).toBe(true)
    expect(evaluateCondition({ data: { project: [P1] } }, condition('not_in', [P1, P2]))).toBe(false)
  })

  it('counts an empty array as empty', () => {
    expect(evaluateCondition({ data: { project: [] } }, condition('is_empty', null))).toBe(true)
    expect(evaluateCondition({ data: { project: [] } }, condition('is_not_empty', null))).toBe(false)
    expect(evaluateCondition({ data: { project: [P1] } }, condition('is_not_empty', null))).toBe(true)
  })

  it('still treats a missing value as empty', () => {
    expect(evaluateCondition({ data: {} }, condition('is_empty', null))).toBe(true)
  })

  it('leaves scalar cells on the original semantics', () => {
    expect(evaluateCondition({ data: { project: P1 } }, condition('equals', P1))).toBe(true)
    expect(evaluateCondition({ data: { project: P1 } }, condition('equals', P2))).toBe(false)
    expect(evaluateCondition({ data: { project: P1 } }, condition('in', [P1]))).toBe(true)
    expect(evaluateCondition({ data: { project: '' } }, condition('is_empty', null))).toBe(true)
  })
})
