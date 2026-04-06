---
initiative: vibegrid-granular-update-optimization
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-30
---

# vibegrid granular update optimization: DESIGN (Part 1/2)

**📚 Navigation:** [Part 1](#) [Part 2](./DESIGN-02.md) 

---

---
initiative: vibegrid-granular-update-optimization
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-29
---

# VibeGrid Granular Update Optimization: System Design

**Status**: Draft - Ready for Review
**Timeline**: 4 weeks
**Replaces**: Current full-rerender approach on cell edits

---

## System Architecture

### Granular Update Pipeline Design

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 4: Renderer Decision Layer (SimplePassiveRenderer)   │
│  • Version-based routing                                     │
│  • Capability checking                                       │
│  • Route: cell → row → full render                          │
└──────────────────────────────────────────────────────────────┘
                           ↓ uses
┌──────────────────────────────────────────────────────────────┐
│  Layer 3: Change Classification (NEW)                        │
│  • ChangeType: NONE | CELLS | ROWS | STRUCTURAL            │
│  • Threshold-based routing logic                            │
│  • Sorting-sensitivity detection                            │
└──────────────────────────────────────────────────────────────┘
                           ↓ uses
┌──────────────────────────────────────────────────────────────┐
│  Layer 2: Enhanced Guard 1 (NEW)                            │
│  • Per-column hashing with fast paths                       │
│  • Loop-back protection (metadata exclusion)                │
│  • Version tracking (data/config/structure)                 │
└──────────────────────────────────────────────────────────────┘
                           ↓ uses
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: Foundation (EXISTING ✅)                           │
│  • TableCoreStore (data state)                              │
│  • BodyRenderer (cell updates)                              │
│  • Field type system (update() methods)                     │
└──────────────────────────────────────────────────────────────┘
```

**Key Innovation**: Version-based change tracking + capability-driven routing prevents unnecessary recomputations while respecting field type constraints.

---

## Core Concepts

### 1. Row Snapshot (Hash-Based)

**Definition**: Lightweight representation of row state for change detection that avoids shared references and enables fast comparison.

**Structure**:
```typescript
interface RowSnapshot {
  id: string                              // Row identifier
  orderIndex: number                      // Position in dataset
  dataHash: string                        // Hash of ONLY data columns (excludes metadata)
  columnHashes: Map<string, string>       // Per-column hashes for granular comparison
  // NO values map - hash-only to prevent shared references
}
```

**Why this approach?**
- **Prevents shared reference bugs**: TanStack may reuse row objects between calls
- **Enables loop-back protection**: dataHash excludes metadata (updatedAt, createdAt)
- **Reduces memory**: No stored values, only hashes
- **Fast comparison**: Hash comparison before deep equality
- **Based on**: Google Incremental DOM pattern (in-place mutations)

### 2. Version Counters

**Definition**: Explicit counters to track different types of changes, enabling deterministic routing.

**Structure**:
```typescript
@observable dataVersion: number = 0        // Increments on cell value changes
@observable configVersion: number = 0      // Increments on sort/filter/group changes
@observable structureVersion: number = 0   // Increments on add/remove/reorder rows
```

**Why this approach?**
- **Avoids MobX timing issues**: Previous attempt used `@computed` with unpredictable evaluation
- **Deterministic**: Easy to reason about, debug, and test
- **Clear separation**: Data changes vs config changes vs structural changes
- **Enables smart routing**: Renderer knows exactly what changed
- **Based on**: Lessons learned from failed commits 36a3af25, 50c5d050

### 3. Change Classification

**Definition**: Algorithm to classify changes into tiers with different handling strategies.

**Structure**:
```typescript
enum ChangeType {
  NONE = 'none',           // No changes - early exit, no version bumps
  CELLS = 'cells',         // Cell values only - granular cell-level update
  ROWS = 'rows',           // Multiple cells per row - row-level update
  STRUCTURAL = 'structural' // Sort/filter/add/remove - full table render
}

interface ChangeMetadata {
  type: ChangeType
  affectedRows: Set<string>
  affectedCells: Map<string, Set<string>>
  sortingSensitive: boolean      // Do changes affect row order/visibility?
  structuralChange: boolean      // Row count or order changed?
  estimatedCellCount: number
}

const CHANGE_THRESHOLDS = {
  MAX_CELL_GRANULAR: 20,         // Max cells for cell-level updates
  MAX_CELLS_PER_ROW: 3           // Max cells per row for cell-level
}
```

**Why this approach?**
- **Tiered routing**: Not all changes benefit from granular updates
- **Threshold-based**: Large batches fall back to full render (more efficient)
- **Sorting awareness**: Changes to sort/filter fields trigger full recompute
- **Tunable**: Thresholds can be adjusted based on profiling
- **Based on**: Virtual scrolling best practices from TanStack, AG Grid patterns

### 4. Field Type Capabilities

**Definition**: Metadata describing whether a field type supports in-place cell updates.

**Structure**:
```typescript
interface FieldTypeMetadata {
  supportsUpdate: boolean     // Can handle updateCell() without losing state?
  updateTarget: 'content' | 'cell' | 'row'  // What element to update?
  requiresAsync: boolean      // Needs async data loading?
}
```

**Why this approach?**
- **Preserves EntityName listeners**: Respects JavaScript event listeners vs CSS :hover
- **Prevents regressions**: Non-supporting types fall back to row-level
- **Extensible**: New field types declare capabilities explicitly
- **Safe defaults**: Unknown types default to row-level (conservative)
- **Based on**: Lessons from EntityName hover effect preservation requirement

---

## Data Model

### Changes to TableCoreStore

**No database schema changes** - This is a frontend-only optimization.

**New Observable State**:
```typescript
class TableCoreStore {
  // Version tracking (NEW)
  @observable dataVersion: number = 0
  @observable configVersion: number = 0
  @observable structureVersion: number = 0

  // Change metadata (EXISTING, enhanced)
  @observable lastChangedCells: Map<string, Set<string>>  // Row ID → Column IDs
  @observable lastChangeMetadata: ChangeMetadata | null   // Classification result

  // Snapshot storage (EXISTING, enhanced)
  private previousRowsSnapshot: Map<string, RowSnapshot>  // Row ID → Snapshot
}
```

**New Utilities**:
```typescript
// Hash utilities
function cloneForHash(value: any): any
function hashValue(value: any): string
function createRowSnapshot(row: any, columns: Column[]): RowSnapshot

// Change analysis
function detectChangedCells(newRows: any[]): Map<string, Set<string>>
function classifyChanges(changedCells, sortingSensitive, structuralChange): ChangeMetadata
function checkSortingFields(changedCells): boolean
```

### Changes to Field Type Registry

**New Metadata Fields**:
```typescript
interface FieldTypeMetadata {
  // Existing fields...

  // NEW: Update capabilities
  supportsUpdate: boolean
  updateTarget: 'content' | 'cell' | 'row'
  requiresAsync: boolean
}
```

**Migration Required**: Add metadata to ALL existing field types (16+).

---

## Key Design Decisions

### Decision 1: Per-Column Hashing vs Row-Level Hashing

**Problem**: Need fast, deterministic change detection that handles TanStack object reuse and metadata changes.

**Considered**:
1. **Row-level hash (single hash per row)** - ❌ Rejected
   - Can't detect which columns changed
   - No support for loop-back protection
   - All-or-nothing: either no change or full row changed

2. **JSON.stringify comparison (current)** - ❌ Rejected
   - Expensive for large objects
   - Metadata changes (updatedAt) trigger spurious updates
   - Already tried, has performance issues

3. **Per-column hashing with metadata exclusion** - ✅ **CHOSEN**
   - Two-level hashing: dataHash (loop-back safe) + columnHashes (granular)
   - Fast path for primitives (inline hash, no ohash call)
   - Excludes metadata from change detection
   - Enables granular update routing

**Why Per-Column Hashing?**
- Granular detection: Know exactly which columns changed
- Loop-back protection: Metadata-only changes don't trigger updates
- Performance: Fast path for primitives (~0.1ms for 10k values)
- Memory efficient: Store hashes only, not cloned values
- Deterministic: Hash comparison not fooled by object reuse

**Trade-off**: Hashing overhead (target: <2ms for 1000 rows x 10 columns). Must benchmark and validate.

**Evidence**: Google Incremental DOM research shows in-place updates reduce GC thrashing by ~60%.

### Decision 2: Version Counters vs Computed Triggers

**Problem**: Need reliable way to track what changed without MobX timing issues.

**Considered**:
1. **Complex @computed with trigger counters (previous attempt)** - ❌ Rejected
   - Evaluated multiple times per change (timing issues)
   - Reactions didn't fire reliably
   - Hard to debug

2. **Event emitters** - ❌ Rejected
   - Outside MobX reactivity system
   - Manual subscription management
   - Doesn't integrate with existing observers

3. **Explicit version counters** - ✅ **CHOSEN**
   - Simple integers that increment on specific changes
   - dataVersion: cell values changed
   - configVersion: sort/filter/group changed
   - structureVersion: rows added/removed/reordered

**Why Version Counters?**
- Deterministic: Easy to reason about when versions change
- MobX-friendly: Standard observable pattern
- Debuggable: Can log version increments
- No timing issues: No complex computed evaluation
- Proven pattern: Used successfully in other reactive systems

**Trade-off**: Requires discipline to increment correctly. Mitigated by comprehensive tests.

**Evidence**: Analysis of failed attempt (commits 36a3af25, 50c5d050) showed computed timing issues.

### Decision 3: Hash-Only Snapshots vs Clone-and-Store

**Problem**: TanStack may reuse row objects between calls, hiding changes if we store references.

**Considered**:
1. **Store deep-cloned values (structuredClone)** - ❌ Rejected
   - Not universally available (SSR, older bundlers)
   - Expensive for large objects
   - Memory overhead

2. **Store shallow-cloned values** - ❌ Rejected
   - Still stores values (memory overhead)
   - Shallow clone may miss nested changes

3. **Store only hashes** - ✅ **CHOSEN**
   - No value storage = no shared references possible
   - Memory efficient (hash strings ~40 bytes each)
   - Hash comparison is deterministic
   - Use shallow clone ONLY during hashing, then discard

**Why Hash-Only?**
- Prevents shared reference bugs by design
- Reduces memory footprint
- Forces deterministic comparison
- Eliminates need for expensive deep cloning

**Trade-off**: Can't retrieve old values for debugging. Mitigated by logging changes when detected.

**Evidence**: No shared references requirement validated by TanStack Virtual best practices.

### Decision 4: Metadata Exclusion Strategy

**Problem**: Backend returns updated `updatedAt` timestamp after every edit, causing loop-back updates.

**Considered**:
1. **Ignore updatedAt column entirely** - ❌ Rejected
   - Loses data consistency tracking
   - Can't detect actual data races

2. **Hash all columns equally** - ❌ Rejected
   - Loop-back cycles: edit → backend updates updatedAt → triggers update → repeat
   - Current code removed hash check for this reason

3. **Two-level hashing: dataHash + columnHashes** - ✅ **CHOSEN**
   - dataHash: Only non-metadata columns (loop-back safe)
   - columnHashes: All columns (for debugging/granular detection)
   - Metadata columns excluded from change reporting

**Why Two-Level Hashing?**
- Loop-back protection: updatedAt-only changes detected as no-op
- Still track metadata: Available in columnHashes if needed
- Safe for optimistic updates: Local edit + backend timestamp = no spurious update

**Metadata Columns**:
```typescript
const METADATA_COLUMNS = new Set([
  'updatedAt',
  'createdAt',
  'version',
  'lastModifiedBy',
  'lastModifiedAt'
])
```

**Trade-off**: If metadata columns need to trigger updates, must configure differently per entity type.

**Evidence**: Comment in current code (line 369): "Skip the hash check as it's too sensitive to metadata changes"

### Decision 5: Capability-Driven Routing

**Problem**: Not all field types can handle cell-level updates (EntityName has listeners, Select has complex rendering).

**Considered**:
1. **Universal cell-level updates** - ❌ Rejected
   - Breaks EntityName hover effects (previous bug)
   - Select dropdown state gets lost
   - Reference fields need async data loading

2. **Universal row-level updates** - ❌ Rejected
   - Misses performance optimization for simple fields
   - Overkill for Text/Number fields

3. **Capability metadata + smart routing** - ✅ **CHOSEN**
   - Field types declare capabilities via metadata
   - Router checks all affected columns
   - Falls back to row-level if any column doesn't support update

**Why Capability-Driven?**
- Preserves EntityName listeners (critical requirement)
- Optimizes simple fields (Text, Number)
- Safe fallback for complex fields (Select, References)
- Extensible: New field types declare capabilities

**Capability Matrix**:
| Field Type | supportsUpdate | updateTarget | Reason |
|------------|----------------|--------------|--------|
| Text | true | content | Simple text node |
| Number | true | content | Simple text node |
| EntityName | true | content | Has update() method |
| Date | true | content | Format string update |
| Select | false | row | Complex dropdown rendering |
| UserReference | false | row | Async user data loading |
| EntityReference | false | row | Async entity data loading |
| Rollup | false | row | Complex recalculation |

**Trade-off**: Requires migration to add metadata to all field types. Mitigated by safe defaults (supportsUpdate: false).

**Evidence**: EntityName update() method exists and works (EntityNameFieldType.ts:110-123).

### Decision 6: Metadata Clearing Strategy

**Problem**: Stale lastChangedCells could linger and cause incorrect routing on subsequent updates.

**Considered**:
1. **Only clear in renderer** - ❌ Rejected
   - Metadata lives in store, should be cleared by store
   - Renderer might not always consume metadata

2. **Never clear (append-only)** - ❌ Rejected
   - Unbounded memory growth
   - Stale data causes wrong routing

3. **Clear on ALL non-granular paths** - ✅ **CHOSEN**
   - Clear on no-op detection
   - Clear on structural changes
   - Clear on config changes
   - Keep only for cell-only changes (granular path)
   - Renderer clears after consuming

**Why Clear on All Paths?**
- Prevents stale metadata
- Clear lifecycle: Store sets, renderer consumes, renderer clears
- No memory leaks
- Wrong routing impossible (metadata always fresh or empty)

**Clearing Points**:
```typescript
// Store clears:
setRows() → NONE → clear metadata
setRows() → STRUCTURAL → clear metadata
setRows() → SORTING_SENSITIVE → clear metadata
setRows() → CELL_ONLY → keep metadata
setSortBy() → clear metadata
setFilters() → clear metadata

// Renderer clears:
updateCells() → clear metadata after consuming
updateRowElement() → clear metadata after consuming
```

**Trade-off**: More clearing logic to maintain. Mitigated by clear documentation and tests.

---

## Performance Targets
