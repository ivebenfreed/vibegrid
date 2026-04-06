---
initiative: vibegrid-row-actions
type: improvement
status: draft
owner: platform-engineering
updated: 2025-12-05
---

# Vibegrid Row Actions: System Design

**Status**: Draft
**Timeline**: [X weeks/months | Ongoing]
**Replaces**: [What this deprecates, if applicable | N/A]

---

## Design Principles

**Use docs for durable contracts, not quasi-code**

This DESIGN.md should focus on:
- **What** the system guarantees (contracts, interfaces, invariants)
- **How** it flows (sequence diagrams with failure branches)
- **Why** decisions were made (trade-offs, non-goals)
- **References** to actual code (not duplicated implementations)

**What belongs here**:
- ✅ State interfaces and validation rules
- ✅ Flow diagrams showing happy path + failures + retries
- ✅ Sample payloads (requests, responses, queue messages)
- ✅ Acceptance criteria (testable outcomes)
- ✅ Checklists (deployment, testing, operations)
- ✅ Decision records (trade-offs, why)
- ✅ Risk and rollback procedures
- ✅ Code references (src/path/to/file.ts:45-78)

**What doesn't belong here**:
- ❌ Full implementations (those live in src/)
- ❌ Quasi-code that duplicates actual code
- ❌ Step-by-step how-to guides (those go in IMPLEMENTATION.md)

---

## System Architecture

### High-Level Design

```
┌─────────────────────────────────────────┐
│  Layer 3: [High-level abstraction]     │
│  • Feature 1                            │
│  • Feature 2                            │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│  Layer 2: [Mid-level services]         │
│  • Service A                            │
│  • Service B                            │
└─────────────────────────────────────────┘
              ↓ uses
┌─────────────────────────────────────────┐
│  Layer 1: [Foundation] (EXISTING ✅)    │
│  • Infrastructure component             │
└─────────────────────────────────────────┘
```

**Key Innovation**: [What makes this approach novel/better than alternatives]

**Non-Goals**: [What this explicitly does NOT do]

---

## State Interfaces & Invariants

### [Primary Entity Name]

**Interface**:
```typescript
interface PrimaryEntity {
  id: string              // Stable ULID, never changes
  version: number         // Increments on update, required for optimistic locking
  status: 'pending' | 'processing' | 'complete' | 'failed'
  error?: string          // Present only if status === 'failed'
  createdAt: Date         // ISO 8601 timestamp
  updatedAt: Date         // ISO 8601 timestamp
}
```

**Validation Rules**:
- `id`: Must be valid ULID format (26 characters, alphanumeric)
- `version`: Non-negative integer, starts at 0
- `status`: Must be one of enum values
- `error`: Required if status === 'failed', null otherwise
- Timestamps: ISO 8601 format, immutable after creation

**Invariants** (always true):
- ID stability: Once created, ID never changes
- Version monotonicity: version only increases, never decreases
- Error presence: error field present ↔ status === 'failed'
- Timestamp ordering: updatedAt >= createdAt

**Idempotency Guarantee**:
- Duplicate request with same ID → returns existing entity (no-op)
- Retry after failure → safe to retry any operation

**Reference Implementation**:
- Interface: `src/server/types/[entity].ts:12-25`
- Validation: `src/server/validation/[entity].ts:30-65`
- Service: `src/server/services/[entity]-service.ts:45-120`

---

## Flows & Sequence Diagrams

### [Primary Flow Name]

**Happy Path**:
```
client → POST /endpoint → validate → enqueue → return 202
                              ↓
                          [success]

worker: queue → fetch → process → validate → store → complete
```

**With Failure Branches**:
```
client → POST /endpoint → validate → enqueue → return 202
              ↓              ↓          ↓
          [400]        [422]     [500: retry]

worker: queue → fetch → process → validate → store → complete
          ↓       ↓        ↓         ↓        ↓         ↓
      [requeue] [retry] [requeue] [discard] [retry] [done]
```

**Retry Policy**:
- Strategy: Exponential backoff (1s, 2s, 4s, 8s, 16s)
- Max attempts: 5
- Timeout per attempt: 30s
- After max retries: Move to DLQ + alert

**Failure Handling**:
- Transient errors (network, timeout): Retry with backoff
- Validation errors: Discard + log
- System errors: Retry → DLQ → alert

**Rollback Procedure**:
1. Stop worker: `worker.stop()`
2. Drain queue: Wait for in-flight to complete
3. Fix issue: Deploy patch or config change
4. Resume: `worker.start()`
5. Reprocess DLQ if needed

---

## Sample Payloads

### API Request
```typescript
// POST /api/endpoint
{
  "json": {
    "organizationId": "01920000-1000-7000-8000-000000000001",
    "name": "Example Resource",
    "config": {
      "option1": true,
      "option2": "value"
    }
  }
}
```

### API Response (Success)
```typescript
// 202 Accepted
{
  "json": {
    "id": "01JDPEXAMPLE123456789",
    "status": "pending",
    "estimatedCompletionMs": 30000
  }
}
```

### API Response (Error)
```typescript
// 422 Unprocessable Entity
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid configuration",
    "details": {
      "field": "config.option2",
      "reason": "Must be one of: ['value1', 'value2']"
    }
  }
}
```

### Queue Message Format
```typescript
{
  "entityId": "01JDPEXAMPLE123456789",
  "organizationId": "01920000-1000-7000-8000-000000000001",
  "attempt": 1,
  "enqueuedAt": "2025-12-01T10:30:00Z",
  "metadata": {
    "source": "api",
    "userId": "01JDP9876543210"
  }
}
```

### Storage Key Pattern
```
orgs/{organizationId}/resources/{entityId}/{version}.json
```

Example: `orgs/01920000-1000-7000-8000-000000000001/resources/01JDPEXAMPLE123456789/0.json`

---

## Acceptance Criteria (Per Phase)

### Phase 1: Core Implementation
- ✅ CRUD operations work for primary entity
- ✅ Validation catches 100% of invalid inputs
- ✅ Idempotency: Duplicate requests return same result
- ✅ Error states: All failures return appropriate error codes

### Phase 2: Async Processing
- ✅ Queue processing: 95th percentile <500ms per item
- ✅ Retry logic: Transient failures retry with exponential backoff
- ✅ DLQ: Permanent failures move to DLQ after 5 attempts
- ✅ Monitoring: All queue metrics exported to Prometheus

### Phase 3: Production Readiness
- ✅ Load test: Handles 1000 req/s sustained for 10 minutes
- ✅ Rollback: Can safely stop/start worker without data loss
- ✅ Observability: All operations logged with trace IDs
- ✅ Documentation: API docs published and up-to-date

---

## Data Model (if applicable)

### Tables

#### `table_name`
**Purpose**: [What this table stores and why]

**Schema**:
```sql
CREATE TABLE table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_table_name_org_status ON table_name(organization_id, status);
CREATE INDEX idx_table_name_created ON table_name(created_at DESC);

-- Constraints
ALTER TABLE table_name
  ADD CONSTRAINT check_error_message
  CHECK ((status = 'failed' AND error_message IS NOT NULL) OR
         (status != 'failed' AND error_message IS NULL));
```

**Kysely Type**:
```typescript
export interface TableName {
  id: string
  organizationId: string
  version: number
  status: 'pending' | 'processing' | 'complete' | 'failed'
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
```

**Reference**:
- Migration: `src/server/migrations/fixed/[YYYYMMDD]_create_table_name.ts`
- Types: `src/server/types/database.ts:123-145`
- Queries: `src/server/services/[service].ts:67-89`

---

## Checklists

### Deployment Checklist
- [ ] Environment variables configured
  - [ ] `ENV_VAR_1`: [Description]
  - [ ] `ENV_VAR_2`: [Description]
- [ ] Secrets added to secrets manager
  - [ ] `SECRET_1`: [What it's for]
- [ ] Database migrations run (up to [YYYYMMDD])
- [ ] Feature flags created
  - [ ] `feature.enabled`: Default=false, rollout plan
- [ ] Monitoring dashboards configured
- [ ] Alerts configured (critical + warning)

### Testing Checklist
- [ ] Unit tests: 80%+ coverage for core logic
- [ ] Integration tests: All API endpoints covered
- [ ] E2E tests: Happy path + key failure scenarios
- [ ] Load tests: Meets performance targets
- [ ] Chaos tests: Handles transient failures gracefully

### Operations Checklist
- [ ] Kill switch implemented: Can disable feature without deploy
- [ ] Rollback procedure documented and tested
- [ ] Runbooks created for common incidents
- [ ] On-call rotation trained on new system
- [ ] Backfill script created (if migrating data)

---

## Key Design Decisions

### Decision 1: [Title]
**Problem**: [What problem this solves]

**Considered**:
1. **Option A**: [Description] - ❌ Rejected because [reason]
2. **Option B**: [Description] - ❌ Rejected because [reason]
3. **Option C**: [Description] - ✅ **CHOSEN**

**Why Option C?**
- Benefit 1: [Specific advantage]
- Benefit 2: [Specific advantage]
- Trade-off: [Accepted limitation and why it's acceptable]

**Evidence**: [Benchmark results, prior art, research]

### Decision 2: [Title]
[Follow same structure]

---

## Performance & Scale

### Performance Targets

| Operation | Target | Measurement | Strategy |
|-----------|--------|-------------|----------|
| API request | <100ms p95 | Response time | In-memory cache |
| Queue processing | <500ms p95 | Item latency | Parallel workers |
| Database query | <50ms p95 | Query time | Indexed fields |
| Throughput | 1000 req/s | Sustained load | Horizontal scaling |

### Scalability

**Horizontal scaling**: [How this scales out]
**Vertical scaling**: [How this scales up]
**Bottlenecks**: [Known limits and mitigation]

---

## Security

### Authentication
[How requests are authenticated]

### Authorization
[How permissions are enforced - who can do what]

### Data Protection
[How sensitive data is handled - encryption, access control]

### Attack Vectors
[Known security concerns and mitigations]

---

## Risk & Rollback

### Risks

**Risk 1: [High/Medium/Low] - [Title]**
- **Scenario**: [What could go wrong]
- **Impact**: [Consequences if it happens]
- **Probability**: [High/Medium/Low]
- **Mitigation**: [How we reduce likelihood or impact]

**Risk 2: [Title]**
[Follow same structure]

### Rollback Procedures

**If processing fails systematically**:
1. Stop workers: `./scripts/stop-workers.sh`
2. Check DLQ: `./scripts/inspect-dlq.sh`
3. Identify root cause: [Where to look]
4. Deploy fix or config change
5. Resume workers: `./scripts/start-workers.sh`
6. Reprocess DLQ if safe: `./scripts/reprocess-dlq.sh --limit 100`

**If bad data gets through**:
1. Identify affected entities: [Query to run]
2. Stop new processing: [Kill switch]
3. Backfill with corrected data: [Script to run]
4. Verify corrections: [Validation query]
5. Re-enable processing

**If performance degrades**:
1. Check metrics: [Dashboard URL]
2. Identify slow operations: [Query or tool]
3. Temporary relief: [Scaling or caching]
4. Permanent fix: [Code optimization]

---

## Open Questions

1. **[Question 1]?**
   - Options: [A, B, C]
   - Recommendation: [X] because [reason]
   - Needs input from: [Team/person]
   - Decision by: [Date]

2. **[Question 2]?**
   [Follow same structure]

---

## Length Guidelines

**Target**: <800 lines

**⚠️ IMPORTANT**: If you're approaching 700 lines, START SPLITTING NOW into numbered files:
- DESIGN-01.md: Architecture, interfaces, flows
- DESIGN-02.md: Data model, migrations
- DESIGN-03.md: Security, deployment, risks

**Don't wait until you hit 800 lines** - validation will fail and you'll need to reorganize.

**Each split file should**:
- Have same front matter
- Be self-contained with its own sections
- Link to other parts in a ToC at the top of DESIGN-01.md

**Key Principle**: Focus on contracts (what/why), not implementations (how)
- If you're writing implementations → Move to src/ and reference with line numbers
- If you're duplicating code → Reference it instead

---

**Template Version**: 2.0
