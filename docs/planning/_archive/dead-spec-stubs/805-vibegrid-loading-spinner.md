# GH#805: Add Loading Spinner to VibeGrid Empty State

**Status:** Draft
**Type:** Enhancement (Trivial)
**Issue:** https://github.com/baseplane-ai/baseplane/issues/805

## Summary

Add a centered loading spinner to the VibeGrid loading overlay to indicate active loading.

## Problem

When VibeGrid is loading and has no data yet, users see only a static table skeleton with no indication that loading is actively happening.

## Solution

Add a centered `Loader2` spinner (with animation) over the existing `TableSkeleton` in `VibeGridLoadingOverlay.tsx`.

## Implementation

**File:** `apps/web/src/systems/vibegrid/components/VibeGridLoadingOverlay.tsx`

**Change:** Add centered spinner overlay after `TableSkeleton` (around line 51):

```tsx
{/* Clean Table Skeleton */}
<TableSkeleton columns={6} rows={8} />

{/* Loading spinner - centered over skeleton */}
<div className="absolute inset-0 flex items-center justify-center">
  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
</div>
```

**Notes:**
- `Loader2` is already imported from lucide-react (line 8)
- Uses Tailwind `animate-spin` for rotation
- `text-muted-foreground` for subtle appearance over skeleton

## Acceptance Criteria

- [ ] Spinner appears centered when VibeGrid is loading
- [ ] Spinner animates (spins)
- [ ] Spinner disappears when data arrives or empty state confirmed
- [ ] No visual regression to existing skeleton or error states

## Scope

- **IN:** Add spinner to loading overlay (~10 lines)
- **OUT:** No changes to skeleton, error states, or loading logic
