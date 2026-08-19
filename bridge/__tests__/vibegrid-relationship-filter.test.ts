/**
 * Relationship-field filter translation (bridge leg).
 *
 * Relationship cells hold an ARRAY of target ids, so `data->>'<field>'` is the
 * JSON text `["<uuid>"]` and scalar `eq '<uuid>'` never matches. Verified
 * against staging DEB RFI: `eq` → 0 rows, `contains` → 9 rows for the same id.
 * These tests pin the substring translation that closes that gap.
 */

import { describe, expect, it } from 'vitest'
import {
  collectRelationshipFields,
  convertVibeGridFilterToFilterExpression,
} from '../vibegrid-sort-filter-bridge'

const REL_FIELD = 'rel__r_f_i__project_belongs_tos'
const PROJECT_A = '5ba79477-8263-45af-afac-2903735be35f'
const PROJECT_B = '11111111-2222-3333-4444-555555555555'

const relationshipFields = new Set([REL_FIELD])

describe('collectRelationshipFields', () => {
  it('collects columns with a resolvable target entity', () => {
    const fields = collectRelationshipFields([
      { id: 'a', field: REL_FIELD, relationshipTargetEntity: 'Project' },
      { id: 'b', field: 'company', relationshipConfig: { targetEntityType: 'Company' } },
      { id: 'c', field: 'subject' },
    ])
    expect([...fields].sort()).toEqual(['company', REL_FIELD].sort())
  })

  it('falls back to the column id when no field name is set', () => {
    expect([...collectRelationshipFields([{ id: 'project', relationshipTargetEntity: 'Project' }])]).toEqual([
      'project',
    ])
  })

  it('excludes relationship-ish columns whose target could not be derived', () => {
    expect(collectRelationshipFields([{ id: 'x', field: 'x', relationshipTargetEntity: null }]).size).toBe(0)
  })

  it('tolerates null/empty column lists', () => {
    expect(collectRelationshipFields(null).size).toBe(0)
    expect(collectRelationshipFields([]).size).toBe(0)
  })
})

describe('relationship condition translation', () => {
  it('translates equals into a substring match over the id array', () => {
    const expr = convertVibeGridFilterToFilterExpression(
      [{ field: REL_FIELD, operator: 'equals', value: PROJECT_A }],
      { relationshipFields },
    )
    expect(expr).toEqual({ op: 'contains', field: REL_FIELD, value: PROJECT_A })
  })

  it('translates a multi-value `in` into an OR of substring matches', () => {
    const expr = convertVibeGridFilterToFilterExpression(
      [{ field: REL_FIELD, operator: 'in', value: [PROJECT_A, PROJECT_B] }],
      { relationshipFields },
    )
    expect(expr).toEqual({
      op: 'or',
      filters: [
        { op: 'contains', field: REL_FIELD, value: PROJECT_A },
        { op: 'contains', field: REL_FIELD, value: PROJECT_B },
      ],
    })
  })

  it('collapses a single-value `in` to a bare substring match', () => {
    const expr = convertVibeGridFilterToFilterExpression(
      [{ field: REL_FIELD, operator: 'in', value: [PROJECT_A] }],
      { relationshipFields },
    )
    expect(expr).toEqual({ op: 'contains', field: REL_FIELD, value: PROJECT_A })
  })

  it('keeps emptiness checks as null checks', () => {
    expect(
      convertVibeGridFilterToFilterExpression([{ field: REL_FIELD, operator: 'is_empty', value: null }], {
        relationshipFields,
      }),
    ).toEqual({ op: 'is_null', field: REL_FIELD })
    expect(
      convertVibeGridFilterToFilterExpression([{ field: REL_FIELD, operator: 'is_not_empty', value: null }], {
        relationshipFields,
      }),
    ).toEqual({ op: 'is_not_null', field: REL_FIELD })
  })

  it('drops operators with no correct translation rather than emitting a wrong one', () => {
    // `not_equals` / `not_in` would need a negated substring op the v1 server
    // AST does not have; a plain `notIn` over the JSON text matches every row.
    for (const operator of ['not_equals', 'not_in']) {
      expect(
        convertVibeGridFilterToFilterExpression([{ field: REL_FIELD, operator, value: PROJECT_A }], {
          relationshipFields,
        }),
      ).toBeUndefined()
    }
  })

  it('drops a relationship condition with an empty value', () => {
    expect(
      convertVibeGridFilterToFilterExpression([{ field: REL_FIELD, operator: 'equals', value: '' }], {
        relationshipFields,
      }),
    ).toBeUndefined()
    expect(
      convertVibeGridFilterToFilterExpression([{ field: REL_FIELD, operator: 'in', value: [] }], {
        relationshipFields,
      }),
    ).toBeUndefined()
  })

  it('leaves non-relationship fields on the scalar path', () => {
    const expr = convertVibeGridFilterToFilterExpression(
      [{ field: 'status', operator: 'equals', value: 'open' }],
      { relationshipFields },
    )
    expect(expr).toEqual({ op: 'eq', field: 'status', value: 'open' })
  })

  it('applies the same translation inside nested groups', () => {
    const expr = convertVibeGridFilterToFilterExpression(
      {
        logic: 'AND',
        conditions: [
          { field: 'status', operator: 'equals', value: 'open' },
          {
            logic: 'OR',
            conditions: [{ field: REL_FIELD, operator: 'equals', value: PROJECT_A }],
          },
        ],
      },
      { relationshipFields },
    )
    expect(expr).toEqual({
      op: 'and',
      filters: [
        { op: 'eq', field: 'status', value: 'open' },
        { op: 'contains', field: REL_FIELD, value: PROJECT_A },
      ],
    })
  })

  it('without the option set, falls back to the (non-matching) scalar equality', () => {
    // Documents the pre-fix behavior the option exists to correct.
    expect(
      convertVibeGridFilterToFilterExpression([{ field: REL_FIELD, operator: 'equals', value: PROJECT_A }]),
    ).toEqual({ op: 'eq', field: REL_FIELD, value: PROJECT_A })
  })
})
