---
initiative: keyboard-editing-vibegrid-refactor
type: improvement
status: complete
owner: platform-engineering
updated: 2025-11-29
---

# Vibegrid Keyboard & Editing State Refactor

**Status:** Ready to Implement
**Created:** 2025-11-26
**Target:** Fix remaining editing state and keyboard handling issues after Phase 2-6 refactor

## Quick Links

- **[Implementation Plan](./IMPLEMENTATION-PLAN.md)** - Complete 5-phase implementation guide with tasks and timeline
- **[Detailed Issues](./DETAILED-ISSUES.md)** - In-depth analysis of all 6 critical issues with code examples
- **[Summary](./SUMMARY.md)** - Executive summary with benefits and quick overview
- **[Architecture Comparison](./ARCHITECTURE-COMPARISON.md)** - Visual diagrams comparing current vs proposed architecture

## Overview

This refactor addresses the last remaining complexity issues in Vibegrid's editing and keyboard handling systems.

### Problems

1. **Dual Editing Sources** - EditSessionManager and InteractionStore both manage editing state → desync and "commit() called but no active session" warnings
2. **Container-Focused Keyboard** - Binds only to grid container → breaks when editor has focus, steals shortcuts
3. **Inconsistent Value Lookup** - Keyboard uses `row[columnId]`, click uses `row.data[field]` → wrong initial values
4. **No Outside-Click Handling** - Blur policies defined but never invoked → dropdowns stay open
5. **Async Race Conditions** - State cleared before async save → double-commit warnings
6. **Focus Loss After Commit** - Cancel restores focus but commit doesn't → keyboard navigation breaks after Enter/Tab/blur
7. **Focus Assumptions** - No recovery when focused cell hidden/filtered → keyboard navigation breaks

### Solution

**6-Phase Refactor:**

1. **Extract EditingStore** (4-6 hours) - Single source of truth for editing state
2. **Merge EditSessionManager** (3-4 hours) - Consolidate into EditingStore, delete duplicate code
3. **Document-Level Keyboard** (3-4 hours) - Centralized routing, survives focus changes
4. **Focus Restoration After Commit** (1-2 hours) - Restore container focus after edit commits
5. **Focus Recovery** (2-3 hours) - Handle invalid focus after config changes
6. **Testing** (3-4 hours) - 8 regression tests to prevent regressions

**Total: 16-23 hours (2-3 days)**

### Expected Outcomes

- ✅ **-638 lines** of code removed (2088 → 1450)
- ✅ **All critical issues fixed** (dropdown stays open, Enter key warning, focus loss after commit)
- ✅ **Single source of truth** (EditingStore owns all editing state)
- ✅ **Keyboard centralized** (1 file instead of 5+)
- ✅ **No circular dependencies**
- ✅ **Better testability**

## Current State

After Phase 2-6 refactor completion, these issues remain:

- **InteractionStore:** 1490 lines (still has editing state mixed with selection)
- **EditSessionManager:** 292 lines (duplicate editing state)
- **Keyboard handling:** Fragmented across 5+ files
- **Active bugs:** Issues #6 (dropdown) and #7 (Enter warning)

## Files to Create

- `src/systems/vibegrid/stores/EditingStore.ts` (~400 lines)
- `src/systems/vibegrid/controllers/KeyboardController.ts` (~150 lines)
- Tests for EditingStore and KeyboardController

## Files to Delete

- `src/systems/vibegrid/services/EditSessionManager.ts` (292 lines)

## Files to Modify

- `src/systems/vibegrid/stores/InteractionStore.ts` (remove editing, ~590 lines removed)
- `src/systems/vibegrid/stores/context.ts` (add EditingStore)
- `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts` (use EditingStore, add focus recovery)
- `src/systems/vibegrid/renderers/modules/controllers/EditingOverlayController.ts` (use EditingStore)
- `src/systems/vibegrid/VibeGrid.tsx` (use KeyboardController)

## Next Steps

1. Read [Implementation Plan](./IMPLEMENTATION-PLAN.md) for detailed tasks
2. Review [Detailed Issues](./DETAILED-ISSUES.md) to understand root causes
3. Start with Phase 1: Extract EditingStore
4. Follow phases sequentially (each builds on previous)
5. Run tests after each phase

## Success Criteria

- [ ] All 8 regression tests pass
- [ ] Type checking passes: `pnpm typecheck`
- [ ] Linting passes: `pnpm check`
- [ ] No console warnings during manual testing
- [ ] All 7 critical issues verified fixed
- [ ] Keyboard navigation works with editor focus
- [ ] Focus restored after edit commit (Enter, Tab, blur)
- [ ] Focus recovers after column hide/filter

## Related

- **Original Complexity Refactor:** `planning/active/vibegrid-complexity-refactor/`
- **Known Issues:** `planning/active/vibegrid-complexity-refactor/ISSUES.md`
- **Vibegrid README:** `src/systems/vibegrid/README.md`
