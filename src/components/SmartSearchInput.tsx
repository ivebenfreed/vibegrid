/**
 * SmartSearchInput Component
 *
 * GH#1391: Smart Text Search Filter for VibeGrid
 *
 * A debounced search input that integrates with VibeGrid's VisualStateStore
 * to provide global text search across searchable columns.
 *
 * Features:
 * - 300ms debounce for optimal UX
 * - Clear button when text is present
 * - Syncs with store for external updates (reset, persistence load)
 * - Accessible with proper ARIA attributes
 */

import { Search, X } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import type { VibeGridStores } from '../stores/context'

interface SmartSearchInputProps {
  stores: VibeGridStores
  placeholder?: string
  className?: string
}

export const SmartSearchInput = observer(function SmartSearchInput({
  stores,
  placeholder = 'Search...',
  className,
}: SmartSearchInputProps) {
  const { visualStateStore } = stores
  const [localValue, setLocalValue] = useState(visualStateStore.globalSearchText)
  const debouncedUpdateRef = useRef<ReturnType<typeof useDebouncedCallback> | null>(null)

  // Create debounced update (300ms per spec)
  const debouncedUpdate = useDebouncedCallback(
    (value: string) => visualStateStore.setGlobalSearchText(value),
    300
  )
  debouncedUpdateRef.current = debouncedUpdate

  // CRITICAL: Sync local state when store changes externally
  // (e.g., reset filters, persistence load, programmatic clear)
  useEffect(() => {
    setLocalValue(visualStateStore.globalSearchText)
  }, [visualStateStore.globalSearchText])

  // Cancel pending debounce on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateRef.current?.cancel()
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalValue(value)
    debouncedUpdate(value)
  }

  const handleClear = () => {
    setLocalValue('')
    debouncedUpdate.cancel() // Cancel any pending debounce
    visualStateStore.setGlobalSearchText('')
  }

  return (
    <search className={cn('relative', className)}>
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="h-8 w-[200px] pl-8 pr-8"
        data-testid="vibegrid-smart-search"
        aria-label="Search grid"
      />
      {localValue && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 p-0"
          onClick={handleClear}
          data-testid="vibegrid-smart-search-clear"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </search>
  )
})
