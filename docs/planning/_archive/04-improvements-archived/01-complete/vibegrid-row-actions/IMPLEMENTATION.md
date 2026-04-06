---
initiative: vibegrid-row-actions
type: improvement
status: draft
owner: platform-engineering
updated: 2025-12-05
---

# Vibegrid Row Actions: Implementation Guide

**Timeline**: [X weeks/months | Ongoing]
**Approach**: Incremental, testable phases
**Risk**: [Low/Medium/High] - [justification]

---

## Implementation Philosophy

**Incremental delivery with testable milestones**

Each phase should:
- ✅ Be independently testable
- ✅ Have clear acceptance criteria (measurable)
- ✅ Deliver value or reduce risk
- ✅ Be reversible if needed

**Reference actual code**, don't duplicate it:
- Point to src/ files with line numbers
- Show interfaces/signatures, not full implementations
- Use code references: `src/path/to/file.ts:45-78`

---

## Phase 1: [Phase Name] ([Timeframe])

### Goal
[What this phase achieves and why it comes first]

### Tasks

#### Task 1.1: [Task Name]

**Create/Update**: `src/path/to/file.ts`

**What it does**: [Brief description]

**Key interfaces**:
```typescript
// Show types/signatures, not full implementations
export interface ConfigOptions {
  option1: string
  option2: number
}

export function initialize(options: ConfigOptions): Promise<Result>
```

**Reference implementation**:
- See: `src/path/to/file.ts` (will be created)
- Based on pattern from: `src/existing/pattern.ts:120-145`

**Tests**: `src/path/to/file.test.ts`
```typescript
import { describe, it, expect } from 'vitest'

describe('ComponentName', () => {
  it('should handle valid input', async () => {
    const result = await initialize({ option1: 'value', option2: 42 })
    expect(result.status).toBe('success')
  })

  it('should reject invalid input', async () => {
    await expect(initialize({ option1: '', option2: -1 }))
      .rejects.toThrow('Invalid configuration')
  })
})
```

**Acceptance Criteria**:
- ✅ [Specific, testable criterion 1]
- ✅ [Specific, testable criterion 2]
- ✅ All tests pass
- ✅ Type checking passes

**Estimated Effort**: [X hours/days]

---

#### Task 1.2: [Next Task]

[Follow same structure]

---

### Phase 1 Acceptance Criteria

- ✅ [Phase-level outcome 1]
- ✅ [Phase-level outcome 2]
- ✅ All unit tests pass
- ✅ No new type errors
- ✅ Documentation updated

**Completion**: [How to verify phase is done]

---

## Phase 2: [Phase Name] ([Timeframe])

### Goal
[What this phase achieves and why it comes after Phase 1]

### Dependencies
- Requires: Phase 1 complete
- Blocks: Phase 3

### Tasks

[Follow same structure as Phase 1]

---

## Database Migrations

### Migration 1: [Name]

**Purpose**: [What this migration does]

**File**: `src/server/migrations/fixed/[YYYYMMDD]_[name].ts`

**Schema changes**:
```sql
-- Add new table
CREATE TABLE new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- key fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index
CREATE INDEX idx_new_table_field ON new_table(field);
```

**Migration code**:
```typescript
export async function up(db: Kysely<Database>): Promise<void> {
  // Reference: See migration file for full implementation
  await db.schema
    .createTable('new_table')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    // ... etc
    .execute()
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('new_table').execute()
}
```

**Verification**:
```bash
# Apply migration
pnpm db:migrate

# Verify schema
psql $DATABASE_URL -c "\d new_table"

# Rollback test (in dev)
pnpm db:migrate:down
pnpm db:migrate
```

**Safety**:
- Backwards compatible: [Yes/No - explain]
- Zero downtime: [Yes/No - explain]
- Rollback safe: [Yes/No - explain]

---

## Testing Strategy

### Unit Tests

**Coverage Target**: 80%+ for core business logic

**Key Test Scenarios**:
1. **Happy path**: [Normal operation with valid inputs]
2. **Edge cases**: [Boundary conditions, empty inputs, large inputs]
3. **Error cases**: [Invalid inputs, system errors, timeouts]
4. **Concurrency**: [Race conditions, locks, retries]

**Example**:
```typescript
import { describe, it, expect, vi } from 'vitest'

describe('ServiceName', () => {
  describe('methodName', () => {
    it('handles valid input', async () => {
      // Arrange
      const input = { /* ... */ }

      // Act
      const result = await service.methodName(input)

      // Assert
      expect(result.status).toBe('success')
    })

    it('rejects invalid input', async () => {
      const input = { /* invalid */ }
      await expect(service.methodName(input))
        .rejects.toThrow('ValidationError')
    })

    it('handles system errors gracefully', async () => {
      // Mock external service failure
      vi.spyOn(externalService, 'call').mockRejectedValue(new Error('Service unavailable'))

      const result = await service.methodName(input)
      expect(result.status).toBe('failed')
      expect(result.retryable).toBe(true)
    })
  })
})
```

### Integration Tests

**What to test**:
- API endpoints end-to-end
- Database operations with real schema
- Queue processing workflows
- Service-to-service integration

**Setup requirements**:
```typescript
// Test database with migrations applied
// Queue with test configuration
// Mock external services
```

**Example**:
```typescript
describe('Integration: Feature Flow', () => {
  beforeAll(async () => {
    // Apply migrations, seed data
  })

  afterAll(async () => {
    // Cleanup
  })

  it('completes end-to-end flow', async () => {
    // Create resource via API
    const createResponse = await api.post('/resource', data)
    expect(createResponse.status).toBe(202)

    // Wait for async processing
    await waitFor(() =>
      db.selectFrom('resources')
        .where('id', '=', createResponse.body.id)
        .where('status', '=', 'complete')
        .executeTakeFirst()
    )

    // Verify final state
    const resource = await db.selectFrom('resources')
      .where('id', '=', createResponse.body.id)
      .executeTakeFirstOrThrow()

    expect(resource.status).toBe('complete')
    expect(resource.error).toBeNull()
  })
})
```

### E2E Tests (if applicable)

**Scenarios**:
- User workflow from start to finish
- Cross-feature interactions
- UI + API + background jobs

**Tools**: Playwright, Cypress, etc.

### Performance Tests

**Targets**:
- [Operation 1]: <Xms p95
- [Operation 2]: <Xms p95
- Throughput: X req/s sustained

**Benchmark**:
```typescript
// Load test with k6, Artillery, or similar
// Measure: latency, throughput, error rate
```

**Acceptance**:
- ✅ Meets latency targets under load
- ✅ No memory leaks over 10-minute test
- ✅ Error rate <0.1%

---

## Deployment

### Pre-Deployment Checklist

**Code Quality**:
- [ ] All tests pass (unit + integration + E2E)
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Code review approved

**Infrastructure**:
- [ ] Database migrations tested in staging
- [ ] Environment variables configured
- [ ] Secrets added to secrets manager
- [ ] Feature flags created (default=disabled)

**Observability**:
- [ ] Monitoring dashboards configured
- [ ] Alerts configured (critical + warning)
- [ ] Logging includes trace IDs
- [ ] Error tracking (Sentry/similar) configured

**Documentation**:
- [ ] API docs updated
- [ ] CLAUDE.md updated (if user-facing)
- [ ] Runbooks created
- [ ] On-call trained

### Deployment Steps

**Staging**:
1. Deploy to staging: `git push origin staging`
2. Monitor CI/CD: https://github.com/baseplane-ai/baseplane/actions
3. Run migrations: `pnpm db:migrate` (uses HYPERDRIVE_DB in staging)
4. Verify deploy: `curl https://staging.baseplane.app/api/health`
5. Smoke tests: [Specify key scenarios to verify]

**Production** (automated via CI/CD):
1. Push to main: `git push origin main`
2. Monitor CI/CD: https://github.com/baseplane-ai/baseplane/actions
3. Migrations run automatically (via CI/CD)
4. Verify deploy: `curl https://api.baseplane.app/api/health`
5. Enable feature flag: Gradual rollout via LaunchDarkly (if applicable)
6. Monitor metrics: [Specify Grafana/DataDog dashboard URL]

**Note**: Never deploy manually - use CI/CD pipeline (see CLAUDE.md)

### Post-Deployment Checklist

**Immediate (0-15 minutes)**:
- [ ] Smoke tests pass
- [ ] Error rate <0.1%
- [ ] Latency within targets
- [ ] No unusual log patterns

**Short-term (15-60 minutes)**:
- [ ] Feature flag rollout to 10%
- [ ] Metrics look healthy
- [ ] No customer complaints
- [ ] Database performance stable

**Long-term (1-24 hours)**:
- [ ] Feature flag rollout to 100%
- [ ] Full traffic on new code
- [ ] Metrics stable over time
- [ ] Cost within budget

---

## Rollback Procedures

### Scenario 1: Bug Discovered Post-Deploy

**If feature flag not yet rolled out**:
1. Keep feature flag disabled
2. Fix bug in code
3. Deploy fix
4. Resume rollout

**If feature flag at partial rollout (1-50%)**:
1. Disable feature flag immediately
2. Monitor that error rate drops
3. Fix bug in code
4. Deploy fix
5. Resume rollout from lower percentage

**If feature flag at 100%**:
1. Revert to previous code: `git revert [commit]`
2. Deploy revert immediately
3. Verify error rate drops
4. Fix bug properly
5. Re-deploy with fix

### Scenario 2: Performance Degradation

**Immediate relief**:
1. Reduce feature flag percentage to 10%
2. Scale up resources (if appropriate)
3. Identify bottleneck: [Where to look]

**Permanent fix**:
1. Optimize slow operation
2. Add caching if appropriate
3. Deploy optimization
4. Resume rollout

### Scenario 3: Database Migration Issues

**If migration fails**:
1. Do NOT run `down` migration in production without consulting team
2. Investigate cause: Check migration logs
3. Fix migration script
4. Test in staging thoroughly
5. Re-run in production

**If need to rollback application**:
1. Ensure application code is backwards-compatible with previous schema
2. Deploy previous application code
3. Leave migration in place (don't run `down`)
4. Plan forward-only fix

---

## Monitoring & Observability

### Key Metrics

```typescript
// Metrics to track
const metrics = {
  'api.request.duration': {
    type: 'histogram',
    target: '<100ms p95',
    alert: '>200ms p95'
  },
  'queue.processing.duration': {
    type: 'histogram',
    target: '<500ms p95',
    alert: '>1000ms p95'
  },
  'api.error.rate': {
    type: 'counter',
    target: '<0.1%',
    alert: '>1%'
  },
  'queue.dlq.size': {
    type: 'gauge',
    target: '0',
    alert: '>10'
  }
}
```

### Dashboards

**Dashboard 1: [Name]**
- URL: [Grafana/DataDog/etc link]
- Shows: [Request rate, latency, error rate]
- Check: [When and why]

**Dashboard 2: [Name]**
- URL: [Link]
- Shows: [Queue metrics, processing rate, DLQ size]
- Check: [When and why]

### Alerts

**Critical (page on-call)**:
- Error rate >5% for 5 minutes → Page
- API latency >1s p95 for 5 minutes → Page
- DLQ size >100 → Page

**Warning (Slack notification)**:
- Error rate >1% for 15 minutes → Slack
- API latency >200ms p95 for 15 minutes → Slack
- Queue processing lag >5 minutes → Slack

### Logging

**What to log**:
- All API requests (method, path, status, duration, trace ID)
- All errors (with stack traces and context)
- State transitions (pending → processing → complete)
- External service calls (duration, status, retries)

**Log levels**:
- `debug`: Detailed execution flow
- `info`: State changes, successful operations
- `warn`: Recoverable errors, retries
- `error`: Unrecoverable errors, failures

**Trace IDs**:
- Generate at API entry: `x-trace-id` header
- Propagate through all logs and services
- Include in error responses

---

## Known Issues / Technical Debt

### Issue 1: [Title]
**Impact**: [Low/Medium/High]
**Description**: [What's suboptimal and why]
**Workaround**: [How we're handling it now]
**Mitigation**: [How we minimize impact]
**Future Work**: [How to properly fix]
**Tracking**: [GitHub issue #123]

### Issue 2: [Title]
[Follow same structure]

---

## Future Enhancements

### Phase N+1 (Future)

**Goal**: [What this would add/improve]

**Effort**: [Estimated time]

**Prerequisites**: [What needs to exist first]

**High-level approach**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Why not now**: [Why we're deferring this]

---

## Length Guidelines

**Target**: <800 lines

**⚠️ IMPORTANT**: If you're approaching 700 lines, START SPLITTING NOW into numbered files:
- IMPLEMENTATION-01.md: Phases 1-3, core implementation
- IMPLEMENTATION-02.md: Phases 4-6, advanced features
- IMPLEMENTATION-03.md: Testing, deployment, monitoring

**Don't wait until you hit 800 lines** - validation will fail and you'll need to reorganize.

**Each split file should**:
- Have same front matter
- Be self-contained with its own phases
- Link to other parts in a ToC at the top of IMPLEMENTATION-01.md

**Key Principle**: Focus on execution (how), with references to actual code
- Reference actual files with line numbers (src/path/to/file.ts:45-78)
- Don't duplicate code - point to it instead

---

**Template Version**: 2.0
