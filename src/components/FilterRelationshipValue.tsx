/**
 * FilterRelationshipValue Component
 *
 * Value control for relationship conditions in the VibeGrid filter builder.
 *
 * Relationship columns previously fell through to the plain text input in
 * `FilterValueInput`, which required the user to know (and hand-type) a
 * target entity UUID. This renders a searchable listbox instead, with the
 * options split into two groups:
 *
 *   1. **In this view** — the distinct related records actually referenced by
 *      the rows currently loaded in the grid. These are the values that can
 *      produce a non-empty result, so they lead.
 *   2. **All {Entity}** — the full target-entity option set from
 *      `useEntityOptions` (a 200-row alphabetical window whose typeahead is
 *      pushed down to the substrate/server, so it is not capped at what the
 *      grid happens to have loaded).
 *
 * The header for a group only renders when both groups have entries; a grid
 * with no loaded relationship values degrades to a plain "all records" list.
 *
 * **Why not `EntityPicker`?** `EntityPicker`'s dropdown renders through
 * `createPortal(..., document.body)`. The filter builder itself lives inside a
 * Base UI `Popover`, which closes on any pointer-down outside its DOM subtree
 * — so a portaled dropdown would dismiss the whole filter dialog on the first
 * click. This control keeps its panel inside the popover's subtree. It reuses
 * `useEntityOptions` (same query, same label resolution) and mirrors
 * `PickerOption`'s markup so the two read identically.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, SearchIcon } from 'lucide-react'
import { useSchemaRegistry } from '@/app/stores'
import { Button } from '@/shared/components/ui/button'
import { useEntityOptions, useUserOptions } from '@/shared/components/ui/picker'
import type { PickerOption } from '@/shared/components/ui/picker'
import { getEntityTypeColor } from '@/shared/lib/entity-type-color'
import { cn } from '@/shared/lib/utils'
import type { InViewRelationshipOption } from '../utils/relationship-column'

export type { InViewRelationshipOption }

export interface FilterRelationshipValueProps {
  /** Target entity type of the relationship column (e.g. `Project`). */
  targetEntityType: string
  /** Field on the target used as the option label. Defaults to `name`. */
  displayField?: string
  /** Current condition value — an id, or an array of ids for `in`/`not_in`. */
  value: unknown
  /** Emits `string | null` for single select, `string[]` for multi. */
  onChange: (value: string | string[] | null) => void
  /** `in` / `not_in` operators select a set. */
  multiSelect?: boolean
  /** Distinct targets referenced by the grid's loaded rows, in row order. */
  inViewOptions?: readonly InViewRelationshipOption[]
  /** Index of the owning condition row — used for the scoped testid. */
  index: number
  className?: string
}

const IN_VIEW_GROUP = 'In this view'

/** Case-insensitive label/value match, mirroring `picker-utils.filterOptions`. */
function matchesSearch(option: PickerOption, search: string): boolean {
  if (!search) return true
  const lower = search.toLowerCase()
  return option.label.toLowerCase().includes(lower) || option.value.toLowerCase().includes(lower)
}

/** Normalize the stored condition value into the selected-id array. */
function toSelectedIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (typeof value === 'string' && value.length > 0) return [value]
  return []
}

export function FilterRelationshipValue({
  targetEntityType,
  displayField,
  value,
  onChange,
  multiSelect = false,
  inViewOptions,
  index,
  className,
}: FilterRelationshipValueProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // `User` is a Better Auth account, not a DataForge entity — the org-scoped
  // member list is the only resolvable source (same split EntityPicker makes
  // via UserPicker, GH#3179). Both hooks are called unconditionally; exactly
  // one result is used.
  const isUserTarget = targetEntityType === 'User'
  const entityOptions = useEntityOptions(isUserTarget ? '' : targetEntityType, displayField, search)
  const userOptions = useUserOptions()
  const { options: allOptions, isLoading } = isUserTarget ? userOptions : entityOptions

  const schemaRegistry = useSchemaRegistry()
  const dotColor = useMemo(() => {
    if (isUserTarget) return undefined
    return getEntityTypeColor(targetEntityType, schemaRegistry.schemas?.byName[targetEntityType])
  }, [isUserTarget, targetEntityType, schemaRegistry.schemas])

  const selectedIds = useMemo(() => toSelectedIds(value), [value])

  // Labels for the trigger have to survive the panel being closed, and a
  // value restored from a saved view may reference a record outside the
  // current option window. Accumulate every label we ever see.
  const [labelCache, setLabelCache] = useState<Record<string, string>>({})
  useEffect(() => {
    setLabelCache((prev) => {
      let next: Record<string, string> | null = null
      // `authoritative` marks the option-query label, which honors the
      // schema's displayFormat / primaryField (e.g. "260143 - BMO Brentwood
      // Renovation"). The join projection only carries the raw `name`
      // ("BMO Brentwood Renovation"), so it may never overwrite a label
      // already resolved — otherwise the same record renders under two
      // different names depending on which group surfaced it.
      const put = (id: string, label: string, authoritative: boolean) => {
        if (!id || !label || prev[id] === label) return
        if (!authoritative && prev[id]) return
        next ??= { ...prev }
        next[id] = label
      }
      for (const opt of inViewOptions ?? []) put(opt.id, opt.name, false)
      for (const opt of allOptions) put(opt.value, opt.label, true)
      return next ?? prev
    })
  }, [inViewOptions, allOptions])

  // Two groups, deduped: an id present in the view is not repeated below.
  const { inViewMatches, allMatches } = useMemo(() => {
    // Canonical labels for this render, so an in-view row and its twin in the
    // full list never disagree. Falls back to the accumulated cache (which
    // survives the option window narrowing as the user types) and finally to
    // the join projection's raw name.
    const canonicalLabel = new Map(allOptions.map((o) => [o.value, o.label]))
    const inViewIds = new Set<string>()
    const inView: PickerOption[] = []
    for (const opt of inViewOptions ?? []) {
      if (!opt.id || inViewIds.has(opt.id)) continue
      inViewIds.add(opt.id)
      const candidate: PickerOption = {
        value: opt.id,
        label:
          canonicalLabel.get(opt.id) || labelCache[opt.id] || opt.name || `Entity ${opt.id.slice(-6)}`,
        color: dotColor,
        group: IN_VIEW_GROUP,
      }
      if (matchesSearch(candidate, search)) inView.push(candidate)
    }
    const rest = allOptions.filter((o) => !inViewIds.has(o.value) && matchesSearch(o, search))
    return { inViewMatches: inView, allMatches: rest }
  }, [inViewOptions, allOptions, search, dotColor, labelCache])

  // Flat order drives keyboard navigation and index-based highlighting.
  const flatOptions = useMemo(() => [...inViewMatches, ...allMatches], [inViewMatches, allMatches])

  // Reset the highlight whenever the candidate set changes under it.
  const flatCount = flatOptions.length
  // biome-ignore lint/correctness/useExhaustiveDependencies: flatCount is the reset trigger, mirroring PickerOptions
  useEffect(() => {
    setHighlighted(0)
  }, [flatCount])

  const commit = useCallback(
    (optionValue: string) => {
      if (multiSelect) {
        const next = selectedIds.includes(optionValue)
          ? selectedIds.filter((v) => v !== optionValue)
          : [...selectedIds, optionValue]
        onChange(next)
        return
      }
      onChange(optionValue)
      setOpen(false)
      setSearch('')
    },
    [multiSelect, onChange, selectedIds],
  )

  // Focus the search box when the panel opens — same convention as
  // `PickerSearch`, minus the `autoFocus` attribute biome forbids.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Close on a pointer-down outside this control. Scoped to the control (not
  // the document body) so the click never escapes to the filter popover's own
  // outside-press handling.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const node = rootRef.current
      if (node && !node.contains(event.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        setSearch('')
        return
      }
      if (flatOptions.length === 0) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlighted((i) => (i + 1) % flatOptions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted((i) => (i - 1 + flatOptions.length) % flatOptions.length)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const option = flatOptions[highlighted]
        if (option) commit(option.value)
      }
    },
    [flatOptions, highlighted, commit],
  )

  const triggerLabel = useMemo(() => {
    if (selectedIds.length === 0) return null
    const labels = selectedIds.map((id) => labelCache[id] || `Entity ${id.slice(-6)}`)
    if (labels.length <= 2) return labels.join(', ')
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
  }, [selectedIds, labelCache])

  const showGroupHeaders = inViewMatches.length > 0 && allMatches.length > 0

  const renderOption = (option: PickerOption, flatIndex: number) => {
    const isSelected = selectedIds.includes(option.value)
    return (
      <div
        key={option.value}
        role="option"
        aria-selected={isSelected}
        tabIndex={-1}
        data-testid={`picker-option-${option.value}`}
        className={cn(
          'flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none',
          highlighted === flatIndex && 'bg-accent',
        )}
        onPointerDown={(e) => {
          e.preventDefault()
          commit(option.value)
        }}
        onPointerMove={() => {
          if (highlighted !== flatIndex) setHighlighted(flatIndex)
        }}
      >
        {multiSelect && (
          <span className="flex h-4 w-4 items-center justify-center">
            {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
          </span>
        )}
        {option.color && (
          <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, backgroundColor: option.color }} />
        )}
        <span className="truncate">{option.label}</span>
        {!multiSelect && isSelected && <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0" />}
      </div>
    )
  }

  return (
    <div ref={rootRef} className={cn('relative min-w-0 flex-1', className)}>
      <Button
        type="button"
        variant="outline"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={`vibegrid-filter-value-${index}`}
        data-filter-value="relationship"
        className={cn('h-9 w-full justify-between font-normal', !triggerLabel && 'text-muted-foreground')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{triggerLabel ?? `Select ${targetEntityType}...`}</span>
        <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div
          role="listbox"
          data-testid={`vibegrid-filter-value-options-${index}`}
          className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 w-[280px] rounded-md border shadow-md"
        >
          <div className="flex h-9 items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 opacity-50" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Search ${targetEntityType}...`}
              data-testid={`vibegrid-filter-value-search-${index}`}
              className="placeholder:text-muted-foreground flex h-9 w-full bg-transparent text-sm outline-hidden"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {isLoading && flatOptions.length === 0 ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Loading options...
              </div>
            ) : flatOptions.length === 0 ? (
              <div className="text-muted-foreground py-6 text-center text-sm">No results found.</div>
            ) : (
              <>
                {inViewMatches.length > 0 && (
                  <>
                    {showGroupHeaders && (
                      <div className="text-muted-foreground flex h-7 items-center px-2 text-xs font-semibold">
                        {IN_VIEW_GROUP}
                      </div>
                    )}
                    {inViewMatches.map((option, i) => renderOption(option, i))}
                  </>
                )}
                {allMatches.length > 0 && (
                  <>
                    {showGroupHeaders && (
                      <div className="text-muted-foreground flex h-7 items-center px-2 text-xs font-semibold">
                        {`All ${targetEntityType}`}
                      </div>
                    )}
                    {allMatches.map((option, i) => renderOption(option, inViewMatches.length + i))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
