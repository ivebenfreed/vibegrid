/**
 * GroupByDropdown - Kanban column grouping field picker (GH#2139)
 *
 * Allows users to select which field defines Kanban board columns.
 * Hidden when only one groupable field exists.
 */

import { ChevronDown } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { useVibeGridStores } from '../../stores/context'

export const GroupByDropdown = observer(function GroupByDropdown() {
  const { kanbanViewStore } = useVibeGridStores()
  if (!kanbanViewStore) return null

  const options = kanbanViewStore.availableGroupFields
  // Hide when 0 or 1 option — picker not useful
  if (options.length <= 1) return null

  const currentField = kanbanViewStore.groupByField
  const currentLabel = options.find((o) => o.id === currentField)?.name ?? currentField

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="gap-1 text-xs" data-testid="kanban-groupby" />}
      >
        <span className="text-muted-foreground">Group by:</span>
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={currentField} onValueChange={(value) => kanbanViewStore.setGroupByField(value)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
