---
initiative: vibegrid-granular-update-optimization
type: improvement
status: complete
owner: platform-engineering
updated: 2025-11-29
---

# VibeGrid Granular Update Optimization

**Status**: Draft - Ready for Review
**Timeline**: 4 weeks
**Effort**: 1 engineer, full-time
**Risk**: Medium-High - Previous attempt failed, requires careful MobX reactivity management

---

## Executive Summary (1 minute read)

### The Problem

- **Full table rerenders on single cell edits**: Editing one cell triggers `processedRows` recomputation (filters, sorting, grouping) across entire dataset
- **Poor performance at scale**: ~50ms for single cell edit, ~200ms for 10-cell fill handle operation
- **Previous optimization failed**: Commits 36a3af25, 50c5d050 caused MobX timing issues and EntityName regression
- **Current workaround is incomplete**: Forces DOM updates but doesn't prevent expensive recomputation
- **Collaborative editing latency**: Remote user edits cause full rerenders, poor UX for multi-user scenarios

### The Solution

- **Enhanced guard system** with per-column hashing and loop-back protection to prevent no-op recomputations
- **Version-based change tracking** (dataVersion, configVersion, structureVersion) to distinguish change types
- **Capability-driven routing** that respects field type update constraints (EntityName hover listeners, async reference fields)
- **Tiered update strategies**: Route to cell-level → row-level → full render based on change classification
- **MobX-friendly approach**: Works with reactivity model, avoids timing issues from previous attempt

### ROI & Benefits

| Metric | Current | After Implementation |
|--------|---------|---------------------|
| Single cell edit | ~50ms | <5ms (10x faster) |
| Fill handle (10 cells) | ~200ms | <50ms (4x faster) |
| Collaborative edit latency | ~150ms | <10ms (15x faster) |
| processedRows churn | 100% calls | <10% calls (no-op guard) |
| User-perceived responsiveness | Noticeable lag | Instant |

### Investment

- **Timeline**: 4 weeks (1 week per phase)
- **Effort**: 1 engineer full-time
- **Risk**: Medium-High
  - Previous attempt failed (MobX timing issues)
  - EntityName hover effects are fragile
  - Hashing overhead must be validated
  - Requires comprehensive testing
- **Costs**: None (internal optimization, no external dependencies beyond ohash library)

### Success Criteria

- ✅ Single cell edit: <5ms (90th percentile) - 10x improvement
- ✅ Fill handle (10 cells): <50ms (90th percentile) - 4x improvement
- ✅ Zero EntityName hover effect regressions
- ✅ Zero MobX timing errors in production logs (7 days)
- ✅ Hash overhead: <2ms for 1000 rows x 10 columns
- ✅ Test coverage: 90%+ for new code
- ✅ Feature flag rollout: 100% users with <1% fallback rate

---

## Documentation

### Active Documents (READ THESE)

**1. [DESIGN.md](./DESIGN.md)** ⭐ (~30 pages)
- System architecture with ASCII diagrams
- Enhanced Guard 1 with loop-back protection
- Version-based change tracking system
- Change classification algorithm
- Capability-driven routing design
- Performance targets and benchmarking plan
- Key design decisions with rationale

**2. [IMPLEMENTATION.md](./IMPLEMENTATION.md)** ⭐ (~40 pages)
- Week-by-week phased implementation plan
- Complete code examples for all components
- Testing strategy (50+ test cases)
- Database schema changes (none for this work)
- Performance benchmarking scripts
- Feature flag rollout strategy
- Deployment and monitoring checklist

### Reference

**3. [archive/](./archive/)** (6 background docs)
- `feasibility-analysis.md` - Original risk assessment
- `technical-approach-v1.md` - First draft (pre-feedback)
- `references.md` - Research sources and academic papers
- `SUMMARY.md` - Planning process summary
- `implementation-plan-v1.md` - Original task breakdown
- `testing-strategy.md` - Detailed test specifications

---

## Decision Log

### Why Version Counters Over Complex Computed?

**Chose**: Explicit version counters (dataVersion, configVersion, structureVersion)
**Over**: Complex `@computed` values with trigger mechanisms
**Reason**: Previous attempt using computed values had unpredictable evaluation timing. Version counters are simple, deterministic, and easy to debug.

### Why Hash-Only Snapshots Over Clone-and-Store?

**Chose**: Store only hashes, not cloned values
**Over**: Store deep-cloned values in snapshot
**Reason**: Prevents shared reference bugs from TanStack object reuse, reduces memory overhead, and eliminates need for expensive structuredClone.

### Why Per-Column Hashing Over Row-Level?

**Chose**: Hash each column individually + combined dataHash
**Over**: Single hash per row
**Reason**: Enables granular change detection (which columns changed), supports loop-back protection (metadata-only changes), and allows fast path for primitives.

### Why Remove cachedSortedRows Custom Equals?

**Chose**: Let MobX track sortBy dependency naturally
**Over**: Custom ID-based equality check with sort-key fingerprint
**Reason**: ID-only check misses sort key changes (e.g., name "Alice" → "Zara"). MobX tracks sortBy as dependency correctly without custom logic.

### Why Remove computeShallowRowHash?

**Chose**: Remove unused method
**Over**: Integrate into new hashing system
**Reason**: Dead code cleanup. New per-column hashing system is more sophisticated and replaces any potential use case.

### Why Metadata Exclusion in Hashing?

**Chose**: Exclude updatedAt, createdAt, version from dataHash
**Over**: Hash all columns equally
**Reason**: Prevents loop-back cycles where backend timestamp updates trigger spurious updates after optimistic updates.

---

## Related Work

- **Previous Investigation**: `planning/active/vibegrid-qol/granular-update-investigation.md` - Analysis of failed attempt
- **Session History**: `sessions/2025-11-24/session-2/` - Debugging session
- **Backup Branch**: `backup-attempted-fixes` - Code from previous attempt
- **Field Type System**: `src/systems/vibegrid/field-types/` - Renderer update() methods
- **Virtual Scrolling**: `src/systems/vibegrid/virtualization/` - Variable-height implementation

---

## Quick Start (For Implementers)

1. **Read DESIGN.md** - Understand architecture and decisions
2. **Read IMPLEMENTATION.md Phase 1** - Start with Enhanced Snapshot System
3. **Run baseline benchmarks** - Measure current performance before changes
4. **Implement TODOs in order** - Each phase builds on previous
5. **Benchmark continuously** - Validate performance targets at each step

## Current Status

**Phase**: Planning Complete
**Next Steps**: Team review → Approval → Begin Phase 1 implementation
**Blockers**: None
**Open Questions**: None (all decisions documented)

---

**Last Updated**: 2025-11-24
**Owner**: VibeGrid Team
**Reviewers**: Architecture Team
