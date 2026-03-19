---
initiative: GH#2008-vibegrid-affordance-separation
type: project
issue_type: improvement
status: approved
priority: high
roadmap: null
owner: platform-engineering
github_issue: 2008
github_milestone: null
created: 2026-03-19
updated: 2026-03-19
phases:
  - id: p1
    name: "renderEmpty + applyAffordanceAttrs core changes"
    tasks:
      - "Fix renderEmpty to produce data-action on inner span"
      - "Update applyAffordanceAttrs auto-wrap to use data-action"
      - "Add dev-mode DOM contract enforcement"
  - id: p2
    name: "CellActionRouter — remove spatial check, switch to data-action"
    tasks:
      - "Replace content-click branch with data-action lookup"
      - "Add backward compat data-action + data-affordance in non-editable return"
  - id: p3
    name: "Migrate renderer children from data-affordance to data-action"
    tasks:
      - "Migrate Date, Boolean, Select, URL, EntityName renderers"
      - "Add affordanceGroup to Email, Phone, Currency, Markdown"
      - "Fix Markdown empty to use renderEmpty"
      - "Migrate EntityRef, UserRef, BadgeList + domain renderers"
  - id: p4
    name: "CSS hover selector migration"
    tasks:
      - "Migrate affordances.css hover selectors to data-action"
      - "Update dark mode and high-contrast counterparts"
  - id: p5
    name: "Documentation + contract enforcement finalization"
    tasks:
      - "Document data-action contract in vibegrid-interactions.md"
      - "Add JSDoc to CellRenderer interface"
  - id: p6
    name: "Testing + verification evidence"
    tasks:
      - "CellActionRouter unit test matrix"
      - "applyAffordanceAttrs + renderEmpty unit tests"
      - "Browser smoke test all hover states"
---

# GH#2008: Redesign VIbeGrid Affordance System — Separate CSS from Routing

> **Improvement**: Architectural fix to eliminate a fundamental dual-use conflict in the affordance attribute system that has caused 6+ cascading regressions and continues to be a regression risk for all new cell renderer work.

---

## Problem

### Current Behavior

The VIbeGrid affordance system uses a single `data-affordance` attribute for two fundamentally different concerns:

1. **CSS visual feedback** — cursor style and hover effects (e.g., background-highlight on hover for editable content)
2. **Click routing** — `CellActionRouter.determineAction()` reads `data-affordance` to decide whether a click means "edit", "navigate", or "none"

For content-click renderers (Text, Number, Email, Phone, Currency, Markdown, Date, Select), this creates an irreconcilable conflict:

- The **CSS system** needs `data-affordance="edit"` on the container so that hovering anywhere over the cell shows the background-highlight affordance.
- The **router** needs to *not* find `data-affordance="edit"` on the container during a padding click (click in the blank cell margin, not on the text content itself), because a padding click on a content-click field should produce "selection only" (not "edit").

The current workaround is a **spatial check** in `CellActionRouter.determineAction()`: for `editTrigger === 'content-click'` fields, the router checks whether the click target is inside `cellContainer.firstElementChild`. This requires `applyAffordanceAttrs` to auto-wrap bare textContent in a `<span>` with `data-affordance="edit"`, which creates its own ordering and DOM-shape dependencies.

### Cascade of Failures

Because the same attribute serves two purposes, every fix creates a new regression:

| Commit | Fix | Regression |
|--------|-----|-----------|
| Auto-wrap text in content span | Enables spatial check for plain text | `renderEmpty` span has no `data-affordance` — empty cells feel dead |
| Add `data-affordance="edit"` to empty span | Empty cells now show hover feedback | Auto-wrap fires even when child already exists (double-wrapping) |
| Guard auto-wrap with `!element.firstElementChild` | No double-wrapping | Markdown renderer's empty state bypasses `renderEmpty` — no contract |
| ... | ... | ... |

Six commits later, the issues continue. Email, Phone, and Currency renderers still have no `affordanceGroup`, meaning their cells show no hover feedback at all — they feel dead and uneditable.

### Root Cause

A single attribute (`data-affordance`) is doing two distinct jobs:
- **Job 1 (CSS):** "What cursor/hover effect should this element show?" — needs to be on the *container* for padding-area hover coverage
- **Job 2 (Routing):** "When this element is clicked, what action should fire?" — needs to be on *child content elements* only, so padding clicks fall through to "none"

These two jobs have contradictory placement requirements for content-click fields.

### Current Bug Inventory

**Bug Category 1 — renderEmpty DOM contract violation (9 renderers):**

`renderEmpty()` at line 26–33 of `slot-initialization.ts` creates:
```html
<span style="opacity: 0.6;">Edit ✏️</span>
```
This inner span has no `data-affordance` attribute. After `applyAffordanceAttrs` runs, the auto-wrap guard (`!element.firstElementChild`) sees an existing child and skips wrapping. Result: the inner "Edit" span has no affordance — the CSS hover rule `[data-affordance-group="editable-content"] [data-affordance="edit"]:hover` never matches. Empty cells in Text, Number, Date, Select, Email, Phone, Currency, Markdown, and TextFallback renderers show no hover feedback.

**Bug Category 2 — Missing affordanceGroup (4 content-click renderers):**

`EmailCellRenderer`, `PhoneCellRenderer`, `CurrencyCellRenderer`, and `MarkdownCellRenderer` declare `editTrigger: 'content-click'` but have no `affordanceGroup` property. Without a group, `applyAffordanceAttrs` never sets `data-affordance-group` on the container, so all CSS hover rules (which are scoped to `[data-affordance-group]`) never apply. These four cell types feel completely dead on hover — there is no visual cue that they are editable.

**Bug Category 3 — Markdown empty handling bypasses renderEmpty:**

`MarkdownCellRenderer.render()` checks `if (!value)` and sets `el.innerHTML = '<span ...>No content</span>'` directly, bypassing the shared `renderEmpty()` helper. This produces a different empty-state DOM than other renderers and has no affordance contract.

**Bug Category 4 — No enforced DOM contract:**

Any developer adding a new renderer has no guardrail preventing them from repeating these bugs. The `CellRenderer` interface JSDoc does not document what DOM structure is expected for content-click renderers.

### Why Now?

The current workaround (spatial check + auto-wrap) has proven fragile across 6+ commits. A new renderer is being planned (File/Gallery cell type, GH#2001) and the risk of introducing the same bug category is high. The fix requires touching the same 4–5 files regardless of whether it is done now or after more renderers are added. Doing it now prevents the debt from compounding.

---

## Solution

### Approach

Introduce a dedicated `data-action` attribute for click routing, keeping `data-affordance` for CSS-only purposes. This cleanly separates the two concerns:

| Attribute | Purpose | Placement | Read By |
|-----------|---------|-----------|---------|
| `data-affordance` | Cursor style (pointer/default) on container | Container element | `affordances.css` cursor rules; `applyAffordanceAttrs` sets this |
| `data-action` | Click routing (what action fires on click) + CSS hover effects | Interactive child elements | `CellActionRouter.determineAction()` + `affordances.css` hover selectors |

With `data-action` on children for routing, the `CellActionRouter` no longer needs the spatial check at all. A click on container padding finds no `[data-action]` ancestor within the cell, falls through to the field policy, and for content-click with no explicit trigger defaults to `'none'`. A click on the text content finds `[data-action="edit"]` on the auto-wrapped span and routes to `'edit'`.

The `data-affordance` attribute remains on the container for cursor CSS (pointer vs. default), and the CSS hover selectors are updated to target `[data-action="edit"]` on children instead of `[data-affordance="edit"]` on children. The same-element selector (`[data-affordance-group="editable-content"][data-affordance="edit"]:hover`) is removed since hover is now always on children.

This is a non-breaking refactor: no changes to the `CellRenderer` interface, no changes to how renderers call `applyAffordanceAttrs()`, and no changes to external consumers of VIbeGrid.

### Changes Required

| File | Change | Effort |
|------|--------|--------|
| `apps/web/src/systems/vibegrid/slots/applyAffordanceAttrs.ts` | Auto-wrap uses `data-action` on inner span; dev-mode DOM contract enforcement | Small |
| `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` | `renderEmpty` inner span gets `data-action="edit"`; add `affordanceGroup` to Email/Phone/Currency/Markdown; fix Markdown empty handling; change child `data-affordance` to `data-action` on Date, Select, EntityName, URL, Boolean renderers | Medium |
| `apps/web/src/systems/vibegrid/routing/CellActionRouter.ts` | Replace spatial check + `closest('[data-affordance]')` with `closest('[data-action]')` in content-click branch | Small |
| `apps/web/src/systems/vibegrid/affordances/affordances.css` | Hover selectors target `[data-action]` on children; remove same-element selector | Small |
| `.claude/rules/vibegrid-interactions.md` | Document `data-action` contract | Small |

### Before / After

**Before — `applyAffordanceAttrs` auto-wrap (line 54):**
```typescript
const content = document.createElement('span')
content.textContent = text
content.dataset.affordance = 'edit'           // used for both CSS AND routing
content.dataset.affordanceRole = 'content'
element.appendChild(content)
```

**After — `applyAffordanceAttrs` auto-wrap:**
```typescript
const content = document.createElement('span')
content.textContent = text
content.dataset.action = 'edit'              // routing only; container keeps data-affordance for CSS cursor
content.dataset.affordanceRole = 'content'
element.appendChild(content)
```

**Before — `renderEmpty` inner span (line 29 of `slot-initialization.ts`):**
```typescript
element.innerHTML = '<span style="opacity: 0.6;">Edit \u270F\uFE0F</span>'
// Inner span has NO data-affordance or data-action → CSS hover never fires on empty cells
```

**After — `renderEmpty` inner span:**
```typescript
element.innerHTML = '<span data-action="edit" data-affordance-role="content" style="opacity: 0.6;">Edit \u270F\uFE0F</span>'
// Inner span has data-action="edit" → CSS hover fires; router finds data-action for click routing
```

**Before — `CellActionRouter.determineAction()` content-click branch (lines 181–209):**
```typescript
if (fieldPolicy?.editTrigger === 'content-click') {
  const childAffordance = (target as HTMLElement).closest('[data-affordance]')
  const cellContainer = (target as HTMLElement).closest('[data-row-id][data-column-id]')
  if (childAffordance && childAffordance !== cellContainer) {
    const affordance = childAffordance.getAttribute('data-affordance')
    if (affordance === 'edit' || affordance === 'toggle') return 'edit'
    if (affordance === 'navigate') return 'navigate'
    if (affordance === 'none') return 'none'
  }
  // Spatial check: is click on firstElementChild?
  const contentElement = cellContainer?.firstElementChild
  if (contentElement && (target === contentElement || contentElement.contains(target as Node))) {
    return 'edit'
  }
  return 'none'
}
```

**After — `CellActionRouter.determineAction()` content-click branch:**
```typescript
if (fieldPolicy?.editTrigger === 'content-click') {
  const cellContainer = (target as HTMLElement).closest('[data-row-id][data-column-id]')
  const actionElement = (target as HTMLElement).closest('[data-action]')
  if (actionElement && cellContainer?.contains(actionElement)) {
    const action = actionElement.getAttribute('data-action')
    if (action === 'edit') return 'edit'
    if (action === 'navigate') return 'navigate'
    if (action === 'none') return 'none'
  }
  return 'none'  // Padding click — select only
}
```

**Before — `affordances.css` editable-content hover (lines 74–81):**
```css
/* Two selectors: child AND same-element */
[data-affordance-group="editable-content"] [data-affordance="edit"]:hover,
[data-affordance-group="editable-content"][data-affordance="edit"]:hover {
  background-color: oklch(0.5 0 0 / 0.15);
  ...
}
```

**After — `affordances.css` editable-content hover:**
```css
/* Single selector: child only, using data-action */
[data-affordance-group="editable-content"] [data-action="edit"]:hover {
  background-color: oklch(0.5 0 0 / 0.15);
  ...
}
```

---

## Feature Behaviors (TEVS Format)

### B1: Content-click routing — text click triggers edit

**Core:**
- **ID:** content-click-text-edit
- **Trigger:** User clicks on the text content span of an editable Text cell
- **Expected:** `EditingStore.startEdit()` is called for that cellId; inline editor opens
- **Verify:** Render a populated Text cell; simulate click on inner content span; assert action = `'edit'`
- **Source:** `apps/web/src/systems/vibegrid/routing/CellActionRouter.ts` + `slots/slot-initialization.ts` (`TextCellRenderer`)

**UI Layer:** Text span auto-wrapped by `applyAffordanceAttrs` has `data-action="edit"`. CSS `[data-affordance-group="editable-content"] [data-action="edit"]:hover` applies background-highlight on hover.

**API Layer:** N/A

**Data Layer:** N/A

---

### B2: Content-click routing — padding click produces selection only

**Core:**
- **ID:** content-click-padding-none
- **Trigger:** User clicks in the blank padding area of an editable Text cell (outside the text span)
- **Expected:** Cell becomes selected; no edit session starts
- **Verify:** Simulate click on cell container directly (no `[data-action]` descendant in click path); assert action = `'none'`; assert `EditingStore.isEditing` remains false
- **Source:** `apps/web/src/systems/vibegrid/routing/CellActionRouter.ts`

**UI Layer:** No `[data-action]` ancestor found within cell container boundary → router returns `'none'`.

**API Layer:** N/A

**Data Layer:** N/A

---

### B3: Empty cell hover shows edit affordance (all 9 content-click renderers)

**Core:**
- **ID:** empty-cell-hover-affordance
- **Trigger:** User hovers over an empty, editable cell (TextFallback, Text, Number, Date, Select, Email, Phone, Currency, Markdown)
- **Expected:** Background-highlight appears on the "Edit ✏️" placeholder span; cursor shows pointer
- **Verify:** Call `renderEmpty(el, true)`; assert inner span has `data-action="edit"` and `data-affordance-role="content"`; assert CSS rule `[data-affordance-group="editable-content"] [data-action="edit"]:hover` applies
- **Source:** `slots/slot-initialization.ts` `renderEmpty()` + `slots/applyAffordanceAttrs.ts` + `affordances/affordances.css`

**UI Layer:** `renderEmpty()` produces `<span data-action="edit" data-affordance-role="content" style="opacity: 0.6;">Edit ✏️</span>`. Container has `data-affordance-group` set by `applyAffordanceAttrs`.

**API Layer:** N/A

**Data Layer:** N/A

---

### B4: Email/Phone/Currency/Markdown hover shows affordance (missing group fix)

**Core:**
- **ID:** missing-affordance-group-fix
- **Trigger:** User hovers over an editable Email, Phone, Currency, or Markdown cell
- **Expected:** Background-highlight appears on the text content, indicating the field is editable
- **Verify:** Render each renderer; inspect DOM; assert container has `data-affordance-group="editable-content"`; assert CSS hover rule fires
- **Source:** `slots/slot-initialization.ts` — add `affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }` to these four renderers

**UI Layer:** Each of the four renderers gains `affordanceGroup`. Container receives `data-affordance-group="editable-content"` from `applyAffordanceAttrs`.

**API Layer:** N/A

**Data Layer:** N/A

---

### B5: Date/Select badge click triggers edit (data-action on badge)

**Core:**
- **ID:** badge-click-edit
- **Trigger:** User clicks the date badge or select option badge in an editable Date or Select cell
- **Expected:** Edit session starts; picker/dropdown opens
- **Verify:** Render populated Date cell; simulate click on badge div; assert `data-action="edit"` on badge; assert action = `'edit'`
- **Source:** `slots/slot-initialization.ts` (`DateCellRenderer`, `SelectCellRenderer`) — badge's `data-affordance` migrated to `data-action`

**UI Layer:** Date badge: `data-action="edit"` (was `data-affordance`). Select badges: `badge.dataset.action = 'edit'` (was `badge.dataset.affordance`).

**API Layer:** N/A

**Data Layer:** N/A

---

### B6: EntityName — text click navigates, pencil click edits

**Core:**
- **ID:** entity-name-dual-action
- **Trigger:** User clicks the text element of an EntityName cell → navigate; user clicks the pencil icon → edit
- **Expected:** Text click calls `onCellClick` callback for entity navigation. Pencil click calls `EditingStore.startEdit()`.
- **Verify:** Render EntityName cell; click text span; assert action = `'navigate'`. Click pencil span; assert action = `'edit'`.
- **Source:** `slots/slot-initialization.ts` (`EntityNameCellRenderer`) — `textEl.dataset.action = 'navigate'`; `pencilIcon.dataset.action = isEditable ? 'edit' : 'none'`

**UI Layer:** Text element: `data-action="navigate"`. Pencil icon: `data-action="edit"`. Container: `data-affordance-group="link-with-edit-icon"` (unchanged). CSS opacity reveal on pencil icon (unchanged — targets `data-affordance-role="icon"`).

**API Layer:** N/A

**Data Layer:** N/A

---

### B7: URL renderer — text click opens link, pencil click edits

**Core:**
- **ID:** url-renderer-dual-action
- **Trigger:** User clicks URL text span → external URL opens; user clicks pencil icon → edit session starts
- **Expected:** Text click triggers `window.open(href)`. Pencil click starts inline edit.
- **Verify:** Render UrlCellRenderer with a value; click text; assert action = `'navigate'` and `window.open` called. Click pencil; assert action = `'edit'`.
- **Source:** `slots/slot-initialization.ts` (`UrlCellRenderer`) — `textEl.dataset.action = 'navigate'`; `pencilIcon.dataset.action = 'edit'`

**UI Layer:** `textEl.dataset.action = 'navigate'` (was `affordance`). `pencilIcon.dataset.action = 'edit'` (was `affordance`).

**API Layer:** N/A

**Data Layer:** N/A

---

### B8: Non-editable column — navigate still works after migration

**Core:**
- **ID:** non-editable-navigate-compat
- **Trigger:** User clicks an EntityName cell in a non-editable column
- **Expected:** Router returns `'navigate'`; no edit session starts
- **Verify:** Set `column.editable = false`; click text span; assert action = `'navigate'`; assert `EditingStore.isEditing` is false
- **Source:** `CellActionRouter.determineAction()` — non-editable early return checks both `closest('[data-action="navigate"]')` and `closest('[data-affordance="navigate"]')` for backward compat during migration

**UI Layer:** Non-editable early return handles both old and new attribute patterns simultaneously.

**API Layer:** N/A

**Data Layer:** N/A

---

### B9: Markdown empty state uses shared renderEmpty

**Core:**
- **ID:** markdown-empty-render-empty
- **Trigger:** User views an empty editable Markdown cell
- **Expected:** Empty state shows "Edit ✏️" placeholder with hover affordance matching other content-click renderers; DOM matches `renderEmpty` contract
- **Verify:** Render `MarkdownCellRenderer` with null value; assert inner span has `data-action="edit"` and `data-affordance-role="content"`; assert no bespoke "No content" span
- **Source:** `slots/slot-initialization.ts` (`MarkdownCellRenderer`) — remove bespoke `if (!value)` empty handling; call `renderEmpty(el, isEditable)` instead

**UI Layer:** `MarkdownCellRenderer.render()` calls `renderEmpty(el, isEditable)` for falsy values, same as other renderers.

**API Layer:** N/A

**Data Layer:** N/A

---

### B10: Dev-mode DOM contract warning fires for violations

**Core:**
- **ID:** dev-mode-contract-enforcement
- **Trigger:** In development mode, `applyAffordanceAttrs()` is called for a content-click renderer with `isEditable=true` but no descendant element has `data-action`
- **Expected:** `console.warn()` is emitted identifying the renderer class name and the violation
- **Verify:** Register a minimal renderer with `editTrigger: 'content-click'`, render it with no `data-action` children, call `applyAffordanceAttrs`; assert `console.warn` called with message including renderer class name
- **Source:** `slots/applyAffordanceAttrs.ts`

**UI Layer:** Warning text: `"[VIbeGrid] DOM contract violation: renderer has editTrigger='content-click' and isEditable=true but no descendant has [data-action]. Hover and routing will not work correctly."`. Check gated by `process.env.NODE_ENV !== 'production'`.

**API Layer:** N/A

**Data Layer:** N/A

---

## Blast Radius Analysis

### Code Impact

| File | Impact | Breaking Change? |
|------|--------|-----------------|
| `systems/vibegrid/slots/applyAffordanceAttrs.ts` | Modified — auto-wrap uses `data-action`; contract enforcement added | No — `applyAffordanceAttrs()` signature unchanged |
| `systems/vibegrid/routing/CellActionRouter.ts` | Modified — spatial check removed; `data-action` lookup replaces `data-affordance` lookup in content-click branch | No — `route()` / `determineAction()` public API unchanged |
| `systems/vibegrid/slots/slot-initialization.ts` | Modified — 7 renderers update child attributes from `data-affordance` to `data-action`; 4 renderers gain `affordanceGroup`; Markdown empty handling fixed | No — all internal DOM changes, same CellRenderer interface |
| `systems/vibegrid/affordances/affordances.css` | Modified — hover selectors change from `[data-affordance="edit"]` to `[data-action="edit"]` on children; same-element selector removed | No — visual behavior preserved |
| `systems/vibegrid/affordances/types.ts` | No change | N/A |
| `systems/vibegrid/affordances/AffordanceGroups.ts` | No change | N/A |
| `.claude/rules/vibegrid-interactions.md` | Documentation only | N/A |

### Domain Renderer Audit (Required Before Phase 3)

Search for child-element `data-affordance` usage in domain features:
```bash
grep -rn "dataset\.affordance\|data-affordance" apps/web/src/features/ --include="*.ts" --include="*.tsx"
```

Any hit that sets `data-affordance` on a non-container element (e.g., a badge, icon, or link inside a renderer) should be migrated to `data-action`. Container-level `data-affordance` (set by `applyAffordanceAttrs`) does not need to change.

Known domain feature renderer files to audit:
- `apps/web/src/features/coi/` — COI-specific renderers
- `apps/web/src/features/projects/schemas/` — project field types
- Any file under `features/{domain}/schemas/*-field-types.ts`

### Database Impact

None. This is a pure frontend DOM/CSS/routing change.

### API Impact

None. No oRPC endpoints, no DataForge schemas, no shared-types changes.

### Test Impact

- `CellActionRouter` unit tests: the spatial check branch is removed; existing tests that relied on `firstElementChild` containment logic will need updating
- Cell renderer snapshot/DOM tests: child elements now have `data-action` instead of `data-affordance`
- New unit tests: `applyAffordanceAttrs` contract enforcement, `renderEmpty` DOM shape, `CellActionRouter.determineAction()` for every `editTrigger` variant

### Performance Considerations

No regression expected. `closest('[data-action]')` is a single DOM traversal — same cost as `closest('[data-affordance]')`. The spatial check (`firstElementChild.contains()`) is replaced with the simpler attribute lookup, which is marginally faster. No layout recalculation or paint cost.

### Security Considerations

None. DOM attribute names are not a security surface. No user-generated content is used as attribute values — only constant strings like `'edit'`, `'navigate'`, `'none'`.

### Accessibility Considerations

`aria-roledescription` is set by `applyAffordanceAttrs` based on the *container's* `data-affordance` value (lines 33–37 of `applyAffordanceAttrs.ts`). This is unchanged — the container still has `data-affordance="edit"` or `data-affordance="navigate"`. The `data-action` attribute is not read by screen readers. No accessibility regression.

The rule in `.claude/rules/vibegrid.md` requiring `opacity: 0` (not `display: none`) for hover-to-reveal elements is already satisfied by the pencil icons in EntityName and URL renderers. This constraint is unaffected.

---

## Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | No user-facing events; pure UI refactor |
| Real-time Sync | Not needed | No data mutations |
| Access Control | Not needed | No permission changes |
| Audit Logging | Not needed | No tracked actions |
| Workflows | Not needed | Not applicable |
| Settings | Not needed | No user-configurable behavior |
| Feature Flags | Not needed | Safe refactor with no behavioral change; no gradual rollout required |

---

## Implementation Phases

### Phase 1: renderEmpty + applyAffordanceAttrs core changes

**Goal:** Fix the two shared helper functions that all 27 renderers depend on. After this phase, `renderEmpty` produces correct `data-action` DOM and `applyAffordanceAttrs` auto-wrap uses `data-action`.

**TEST first (write before implementing):**
- `renderEmpty(el, true)` → inner span has `data-action="edit"` and `data-affordance-role="content"`
- `renderEmpty(el, false)` → element is empty, no inner span
- `applyAffordanceAttrs(el, contentClickRenderer, true)` with bare textContent → auto-wrap creates inner span with `data-action="edit"` and NO `data-affordance` on inner span
- `applyAffordanceAttrs(el, contentClickRenderer, true)` with existing firstElementChild → no double-wrap; existing child untouched (contract warning check, not an error)
- Dev-mode warning: content-click renderer, isEditable=true, no `[data-action]` descendant → `console.warn` called

**IMPL files:**
- `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` lines 26–33 — add `data-action="edit"` and `data-affordance-role="content"` to `renderEmpty` inner span
- `apps/web/src/systems/vibegrid/slots/applyAffordanceAttrs.ts` lines 54–55 — change `content.dataset.affordance = 'edit'` to `content.dataset.action = 'edit'`; add dev-mode contract check after the block

**VERIFY:** `pnpm typecheck`. `pnpm lint`. Browser: hover over empty Text cell → highlight appears.

**Dependencies:** None.

---

### Phase 2: CellActionRouter — remove spatial check, switch to data-action

**Goal:** The router's content-click branch uses `[data-action]` for action lookup. Spatial check removed. Non-editable early return supports both attributes during migration.

**TEST first:**
- `editTrigger='content-click'`, target has `[data-action="edit"]` ancestor within cell → returns `'edit'`
- `editTrigger='content-click'`, target has `[data-action="navigate"]` ancestor within cell → returns `'navigate'`
- `editTrigger='content-click'`, target has no `[data-action]` ancestor within cell (padding click) → returns `'none'`
- `editTrigger='click'`, any target → returns `'edit'`
- `column.editable=false`, target has `[data-action="navigate"]` → returns `'navigate'`
- `column.editable=false`, target has `[data-affordance="navigate"]` → returns `'navigate'` (backward compat)
- `column.editable=false`, target has neither navigate attribute → returns `'none'`

**IMPL files:**
- `apps/web/src/systems/vibegrid/routing/CellActionRouter.ts` lines 181–209
  - Replace entire `content-click` block with `[data-action]` lookup (see Before/After above)
  - Lines 160–173 (non-editable early return): add `closest('[data-action="navigate"]')` check

**VERIFY:** `pnpm typecheck`. `pnpm lint`. Browser: Text cell click routing (content vs. padding). Boolean toggle. EntityName navigate.

**Dependencies:** Phase 1 complete (auto-wrap now sets `data-action`).

---

### Phase 3: Migrate renderer children from data-affordance to data-action

**Goal:** All child elements in built-in renderers that were using `data-affordance` for routing now use `data-action`. Missing `affordanceGroup` properties added.

**Renderer changes in `apps/web/src/systems/vibegrid/slots/slot-initialization.ts`:**

| Renderer | Specific Change | Line Approx |
|----------|----------------|------------|
| `DateCellRenderer` | Badge div: `data-affordance="${affordance}"` → `data-action="${affordance}"` | ~333 |
| `BooleanCellRenderer` | Control div: `data-affordance="${affordance}"` → `data-action="${affordance}"` | ~484 |
| `SelectCellRenderer` (single) | `badge.dataset.affordance` → `badge.dataset.action` | ~637 |
| `SelectCellRenderer` (multi) | `badge.dataset.affordance` → `badge.dataset.action` | ~688 |
| `UrlCellRenderer` | `textEl.dataset.affordance = 'navigate'` → `textEl.dataset.action = 'navigate'`; `pencilIcon.dataset.affordance` → `pencilIcon.dataset.action` | ~869, ~887 |
| `EntityNameCellRenderer` | `textEl.dataset.affordance = 'navigate'` → `textEl.dataset.action = 'navigate'`; `pencilIcon.dataset.affordance` → `pencilIcon.dataset.action` | ~1583, ~1601 |
| `EmailCellRenderer` | Add `affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }` | after line ~836 |
| `PhoneCellRenderer` | Add `affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }` | after line ~1018 |
| `CurrencyCellRenderer` | Add `affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }` | after line ~1197 |
| `MarkdownCellRenderer` | Replace bespoke `if (!value)` block with `renderEmpty(el, isEditable)` call; add `affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }` | ~1513, ~1556 |
| `EntityReferenceCellRenderer` | Badge div: `data-affordance="navigate"` → keep `data-affordance="navigate"` AND add `data-action="navigate"` (dual-attribute, see Decision 5); pencil icon: `dataset.affordance` → `dataset.action`; empty-state override at ~2271 stays on container | ~2573, ~2407, ~2271 |
| `UserReferenceCellRenderer` | Same pattern as EntityRef: badge keeps `data-affordance="navigate"` + adds `data-action="navigate"`; pencil icon: `dataset.affordance` → `dataset.action`; empty-state override stays | ~2719, ~2615 |
| `BadgeListCellRenderer` | Badge children: `dataset.affordance` → `dataset.action` | ~2854 |

**Domain renderer audit (known hits):**

| File | Line | Change |
|------|------|--------|
| `features/admin/schemas/admin-field-types.ts` | ~73-74 | Badge-level `data-affordance` → `data-action` |
| `features/entities/components/EntityListView.tsx` | ~630 | **CONSUMER** — queries `[data-affordance="navigate"][data-entity-type][data-entity-id]`. Must update to query `[data-action="navigate"][data-entity-type][data-entity-id]` OR query both: `[data-action="navigate"][data-entity-type][data-entity-id], [data-affordance="navigate"][data-entity-type][data-entity-id]` |

Run `grep -rn "dataset\.affordance\|data-affordance" apps/web/src/features/ --include="*.ts" --include="*.tsx"` to verify no other consumers exist.

**TEST first:**
- Render each modified renderer; assert child elements have `data-action` not `data-affordance` (where applicable)
- Render Email/Phone/Currency/Markdown; assert container has `data-affordance-group="editable-content"`
- Render Markdown with null → same DOM as `renderEmpty`; no bespoke "No content" span

**VERIFY:** `pnpm typecheck`. `pnpm lint`. Browser: hover Email/Phone/Currency/Markdown → highlight appears. Date badge click → edit. Select badge click → edit. EntityName text click → navigate; pencil click → edit.

**Dependencies:** Phase 2 complete (router uses `data-action`).

---

### Phase 4: CSS hover selector migration

**Goal:** `affordances.css` hover selectors target `[data-action]` on children. Same-element editable-content selector removed.

**Changes in `apps/web/src/systems/vibegrid/affordances/affordances.css`:**

- Line 43–45: Change `[data-affordance-role="content"][data-affordance="edit"]` cursor rule → `[data-affordance-role="content"][data-action="edit"]`
- Lines 74–81: Change two-selector editable-content hover → single `[data-affordance-group="editable-content"] [data-action="edit"]:hover`
- Line 62–68: Change editable-badge hover → `[data-affordance-group="editable-badge"] [data-action="edit"]:hover`
- Lines 120–121: Change toggle hover → `[data-affordance-group="toggle-control"] [data-action="toggle"]:hover`
- Lines 151–154: Update dark mode counterparts of above
- Lines 181–186: Update high-contrast counterparts of above

**Keep unchanged:**
- Lines 17–39: `[data-affordance="X"]` cursor rules on containers — unchanged (these are container-level, stay on `data-affordance`)
- Lines 96–107: Edit icon opacity rules (target `data-affordance-role="icon"` — no change needed, role attribute is unchanged)

**Full list of selectors to migrate (affordances.css):**

| Current Selector | New Selector | Notes |
|-----------------|-------------|-------|
| `[data-affordance-group="link-with-edit-icon"] [data-affordance="navigate"]:hover` | `[data-action="navigate"]:hover` | Navigate link underline |
| `[data-affordance-group="link-only"] [data-affordance="navigate"]:hover` | `[data-action="navigate"]:hover` | Navigate link underline |
| `[data-affordance-group="editable-badge"] [data-affordance="edit"]:hover` | `[data-action="edit"]:hover` | Badge scale + darken |
| `[data-affordance-group="editable-content"] [data-affordance="edit"]:hover` | `[data-action="edit"]:hover` | Content background highlight |
| `[data-affordance-group="editable-content"][data-affordance="edit"]:hover` | **REMOVE** | Same-element selector, no longer needed |
| `[data-affordance-group="readonly-badge"] [data-affordance="none"]:hover` | **KEEP AS-IS** | Readonly badges don't have `data-action`; this selector targets `data-affordance` on the badge child which is preserved for readonly |
| `[data-affordance-group="toggle-control"] [data-affordance="toggle"]:hover` | `[data-action="toggle"]:hover` | Toggle brightness |
| `[data-affordance-role="content"][data-affordance="edit"]` cursor rule | `[data-affordance-role="content"][data-action="edit"]` | Content pointer cursor |
| Dark mode counterparts of above | Same pattern | Lines ~151-167 |
| High-contrast counterparts of above | Same pattern | Lines ~181-195 |

**Note on EntityRef/UserRef navigate badges:** These badges keep `data-affordance="navigate"` alongside `data-action="navigate"` (dual-attribute, Decision 5). The CSS selector migration to `[data-action="navigate"]:hover` will match. The retained `data-affordance="navigate"` ensures backward compat for consumers like `EntityListView.tsx` that query by `data-affordance`.

**TEST first:** Visual comparison screenshots of all hover states before vs. after.

**VERIFY:** Browser: all hover effects work. Dark mode hover works. `prefers-contrast: high` hover works.

**Dependencies:** Phase 3 complete (child elements now have `data-action`, making new CSS selectors functional).

---

### Phase 5: Documentation + contract enforcement finalization

**Goal:** Document the two-attribute system for future renderer authors; confirm dev-mode enforcement is functional.

**IMPL:**

1. `.claude/rules/vibegrid-interactions.md` — add "Cell Renderer DOM Contract" section:
   - Explain `data-affordance` (container, CSS only) vs. `data-action` (children, routing + hover)
   - List which renderer categories require what DOM shape
   - Show example DOM for content-click, click, icon, and none/custom renderers
   - Document dev-mode enforcement

2. `apps/web/src/systems/vibegrid/slots/SlotRegistry.ts` — add JSDoc to `CellRenderer` interface noting the `data-action` requirement for content-click renderers

3. `apps/web/src/systems/vibegrid/slots/applyAffordanceAttrs.ts` — confirm dev-mode check from Phase 1 fires correctly; refine warning message if needed

**VERIFY:** `pnpm lint`. Documentation review.

**Dependencies:** Phases 1–4 complete.

---

### Phase 6: Testing + verification evidence

**Goal:** Full unit test coverage, browser smoke tests, and verification evidence file.

**Unit tests to write/update:**
- `CellActionRouter.test.ts` — complete matrix: every `editTrigger` × populated/empty × content click/padding click × editable/non-editable
- `applyAffordanceAttrs.test.ts` (create if not exists) — contract enforcement, auto-wrap DOM shape, `renderEmpty` DOM shape
- `slot-initialization.test.ts` — spot-check each modified renderer for `data-action` on children and correct `affordanceGroup`

**Browser smoke test sequence:**
```bash
agent-browser eval "window.__auth.signIn('ceo').then(r => JSON.stringify(r))"
agent-browser open http://localhost:$DEV_PORT/projects
agent-browser snapshot -i -s "[role=grid]"
```

**Verification checklist:**
- [ ] Text cell populated: hover text → background-highlight; click text → edit session starts; click padding → selection only
- [ ] Text cell empty: hover "Edit ✏️" span → background-highlight; click → edit session starts
- [ ] Email cell populated: hover → background-highlight (was broken before this fix)
- [ ] Phone cell populated: hover → background-highlight (was broken before this fix)
- [ ] Currency cell populated: hover → background-highlight (was broken before this fix)
- [ ] Markdown cell populated: hover → background-highlight (was broken before this fix)
- [ ] Markdown cell empty: shows "Edit ✏️" (same as renderEmpty), not "No content"
- [ ] Date cell populated: hover badge → badge scale animation; click badge → edit session
- [ ] Select cell populated: hover badge → badge scale animation; click badge → edit session
- [ ] Boolean cell populated: hover toggle → brightness effect; click → toggle edit
- [ ] EntityName cell: hover text → underline; click text → navigate callback; hover pencil → pencil visible; click pencil → edit session
- [ ] URL cell: hover text → underline; click text → window.open; hover pencil → pencil visible; click pencil → edit session
- [ ] Non-editable Text cell: no hover highlight; no edit session on click
- [ ] Non-editable EntityName cell: navigate still works on text click
- [ ] Dev console: no warnings in production-like build; register violating renderer → warning in dev

---

## Decision Log

### Decision 1: Two-attribute system (data-affordance for CSS, data-action for routing)

**Date:** 2026-03-19

**Chose:** Keep `data-affordance` on containers for CSS cursor; introduce `data-action` on children for routing and hover effects

**Over:**
- A: Remove `data-affordance` from containers entirely, use `data-action` for everything — would break cursor CSS that targets `[data-affordance]` on containers
- B: Use only `data-affordance`, with stricter DOM conventions — continuation of the existing fragile approach
- C: Spatial check with richer DOM requirements — same fragility, harder to understand

**Reason:** Minimal blast radius. `data-affordance` on containers is established across dozens of CSS rules and is used for `aria-roledescription`. Changing containers requires touching all CSS. Introducing `data-action` on children only affects routing logic and child-specific hover selectors. The two attributes have a clear, documented semantic distinction.

---

### Decision 2: Remove spatial check (firstElementChild containment)

**Date:** 2026-03-19

**Chose:** Remove the `firstElementChild.contains(target)` spatial check entirely

**Over:** Keep spatial check as a fallback for renderers without `data-action`

**Reason:** The spatial check was only necessary because routing and CSS shared the same attribute. With `data-action` as the unambiguous routing signal, the spatial check is redundant and adds fragile DOM-shape coupling (all content must be in `firstElementChild`). Removing it simplifies the router and eliminates the ordering dependency. The dev-mode contract enforcement catches renderers that forget to add `data-action`.

---

### Decision 3: Dev-mode contract enforcement as console.warn, not throw

**Date:** 2026-03-19

**Chose:** `console.warn()` in `NODE_ENV !== 'production'` only

**Over:** TypeScript-level enforcement; throw error at runtime

**Reason:** TypeScript cannot enforce DOM structure. Throwing would break the grid for any renderer that temporarily violates the contract during development. A visible console warning names the offending renderer and is immediately actionable without disrupting the render cycle or user experience during development.

---

### Decision 4: Backward compat during migration — check both data-action and data-affordance in non-editable early return

**Date:** 2026-03-19

**Chose:** Check both `[data-action="navigate"]` and `[data-affordance="navigate"]` in the non-editable early return during and after migration

**Over:** Immediately remove `data-affordance` fallback

**Reason:** Domain renderers in `features/` may use `data-affordance="navigate"` on children. Phase 3 audits and migrates them, but the migration is not instantaneous. Keeping the fallback check ensures navigate still works for any domain renderer not yet migrated. Once all domain renderers are verified, the `data-affordance` fallback can be removed in a follow-up cleanup.

---

### Decision 5: EntityRef/UserRef badges keep data-affordance="navigate" alongside data-action="navigate" (dual-attribute)

**Date:** 2026-03-19

**Chose:** Entity reference badges emit BOTH `data-affordance="navigate"` and `data-action="navigate"` on the badge element

**Over:** Removing `data-affordance` from badges entirely

**Reason:** `EntityListView.tsx` line 630 queries `closest('[data-affordance="navigate"][data-entity-type][data-entity-id]')` to detect relationship badge clicks and open entity drawers. This is a consumer outside the VIbeGrid system boundary. Removing `data-affordance` from badges would silently break entity reference navigation across the entire platform. The dual-attribute approach lets the CSS migrate to `data-action` and the router use `data-action`, while preserving backward compat for external consumers. The `data-affordance` on badges can be removed in a follow-up once all consumers are migrated to `data-action`.

---

## Related Work

- **applyAffordanceAttrs:** `apps/web/src/systems/vibegrid/slots/applyAffordanceAttrs.ts`
- **CellActionRouter:** `apps/web/src/systems/vibegrid/routing/CellActionRouter.ts`
- **All 27 built-in renderers:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts`
- **Affordances CSS:** `apps/web/src/systems/vibegrid/affordances/affordances.css`
- **AffordanceGroups:** `apps/web/src/systems/vibegrid/affordances/AffordanceGroups.ts`
- **VIbeGrid interactions rule:** `.claude/rules/vibegrid-interactions.md`
- **VIbeGrid rule:** `.claude/rules/vibegrid.md`
- **EntityListView consumer:** `features/entities/components/EntityListView.tsx` line 630 — queries `[data-affordance="navigate"]` on badges; update to query `[data-action="navigate"]` in Phase 3
- **Admin field types:** `features/admin/schemas/admin-field-types.ts` — domain renderers with `data-affordance` on children
- **File/Gallery cell type (upcoming renderer):** GH#2001 — must follow the `data-action` contract documented here
