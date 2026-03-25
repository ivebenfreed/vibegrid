/**
 * SaveViewDialog - Save/Rename Entity View Dialog (GH#1570, GH#1677 P2.3)
 *
 * Modal dialog for creating or editing a saved view.
 * Collects view name, visibility level, and child entity tab configurations.
 * Supports multiple child entity tabs (max 5).
 */

import { ChevronDown, Loader2, PlusIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'components', 'SaveViewDialog'])

const MAX_CHILD_TABS = 5

// ====================================
// TYPES
// ====================================

export type ViewVisibility = 'personal' | 'shared' | 'locked'

export interface ChildEntityConfigInput {
  childEntityType: string
  relationshipType: string
  direction: 'incoming' | 'outgoing'
}

export interface SaveViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: string
  onSave: (
    name: string,
    visibility: ViewVisibility,
    childEntityTabs: ChildEntityConfigInput[],
  ) => Promise<void>
  /** Pre-filled name for "Save As" or edit mode */
  initialName?: string
  /** Pre-filled visibility for edit mode */
  initialVisibility?: ViewVisibility
  /** Pre-filled child entity tabs for edit mode (array) */
  initialChildEntityTabs?: ChildEntityConfigInput[]
  /** @deprecated Use initialChildEntityTabs instead. Single config for backward compat. */
  initialChildEntityConfig?: ChildEntityConfigInput
  /** Available entity schemas for the child entity picker */
  entitySchemas?: Array<{ entityName: string; label?: string }>
  /** Controls whether "locked" option is available */
  isAdmin: boolean
}

// ====================================
// HELPERS
// ====================================

function createEmptyTabEntry(): ChildEntityConfigInput {
  return { childEntityType: '', relationshipType: 'belongs_to', direction: 'incoming' }
}

/**
 * Resolve initial tabs from props, supporting both array and single (legacy) shape.
 */
function resolveInitialTabs(
  tabs?: ChildEntityConfigInput[],
  single?: ChildEntityConfigInput,
): ChildEntityConfigInput[] {
  if (tabs && tabs.length > 0) return tabs
  if (single) return [single]
  return []
}

// ====================================
// CHILD TAB ENTRY SUB-COMPONENT
// ====================================

interface ChildTabEntryProps {
  index: number
  entry: ChildEntityConfigInput
  entitySchemas?: Array<{ entityName: string; label?: string }>
  onUpdate: (index: number, entry: ChildEntityConfigInput) => void
  onRemove: (index: number) => void
}

function ChildTabEntry({
  index,
  entry,
  entitySchemas,
  onUpdate,
  onRemove,
}: ChildTabEntryProps): React.ReactElement {
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`child-tab-entry-${index}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Tab {index + 1}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
          data-testid={`child-tab-remove-${index}`}
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Entity Type */}
      <div className="space-y-1.5">
        <Label htmlFor={`child-entity-type-${index}`} className="text-xs">
          Entity Type
        </Label>
        {entitySchemas && entitySchemas.length > 0 ? (
          <Select
            value={entry.childEntityType}
            onValueChange={(val) => {
              if (val !== null) onUpdate(index, { ...entry, childEntityType: val })
            }}
          >
            <SelectTrigger
              id={`child-entity-type-${index}`}
              data-testid={`child-entity-type-select-${index}`}
            >
              <SelectValue placeholder="Select entity type" />
            </SelectTrigger>
            <SelectContent>
              {entitySchemas.map((s) => (
                <SelectItem key={s.entityName} value={s.entityName}>
                  {s.label || s.entityName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={`child-entity-type-${index}`}
            value={entry.childEntityType}
            onChange={(e) => onUpdate(index, { ...entry, childEntityType: e.target.value })}
            placeholder="e.g., GCCOICoverage"
            data-testid={`child-entity-type-input-${index}`}
          />
        )}
      </div>

      {/* Relationship Type */}
      <div className="space-y-1.5">
        <Label htmlFor={`child-rel-type-${index}`} className="text-xs">
          Relationship Type
        </Label>
        <Select
          value={entry.relationshipType}
          onValueChange={(val) => {
            if (val !== null) onUpdate(index, { ...entry, relationshipType: val })
          }}
        >
          <SelectTrigger
            id={`child-rel-type-${index}`}
            data-testid={`child-rel-type-select-${index}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="belongs_to">belongs_to</SelectItem>
            <SelectItem value="parent_child">parent_child</SelectItem>
            <SelectItem value="related_to">related_to</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Direction */}
      <div className="space-y-1.5">
        <Label htmlFor={`child-direction-${index}`} className="text-xs">
          Direction
        </Label>
        <Select
          value={entry.direction}
          onValueChange={(val) =>
            onUpdate(index, { ...entry, direction: val as 'incoming' | 'outgoing' })
          }
        >
          <SelectTrigger
            id={`child-direction-${index}`}
            data-testid={`child-direction-select-${index}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="incoming">Incoming (child is source)</SelectItem>
            <SelectItem value="outgoing">Outgoing (child is target)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ====================================
// COMPONENT
// ====================================

export function SaveViewDialog({
  open,
  onOpenChange,
  entityType: _entityType,
  onSave,
  initialName = '',
  initialVisibility = 'personal',
  initialChildEntityTabs,
  initialChildEntityConfig,
  entitySchemas,
  isAdmin,
}: SaveViewDialogProps): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [visibility, setVisibility] = useState<ViewVisibility>(initialVisibility)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Child entity tabs state (GH#1677 P2.3)
  const [childTabs, setChildTabs] = useState<ChildEntityConfigInput[]>(() =>
    resolveInitialTabs(initialChildEntityTabs, initialChildEntityConfig),
  )
  const [childSectionOpen, setChildSectionOpen] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(initialName)
      setVisibility(initialVisibility)
      setError(null)
      setIsSaving(false)
      const resolved = resolveInitialTabs(initialChildEntityTabs, initialChildEntityConfig)
      setChildTabs(resolved)
      setChildSectionOpen(resolved.length > 0)
    }
  }, [open, initialName, initialVisibility, initialChildEntityTabs, initialChildEntityConfig])

  const handleUpdateTab = useCallback((index: number, entry: ChildEntityConfigInput) => {
    setChildTabs((prev) => {
      const next = [...prev]
      next[index] = entry
      return next
    })
  }, [])

  const handleRemoveTab = useCallback((index: number) => {
    setChildTabs((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleAddTab = useCallback(() => {
    setChildTabs((prev) => {
      if (prev.length >= MAX_CHILD_TABS) return prev
      return [...prev, createEmptyTabEntry()]
    })
  }, [])

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }
    if (trimmedName.length > 100) {
      setError('Name must be 100 characters or less')
      return
    }

    setError(null)
    setIsSaving(true)

    // Filter out entries with empty entity type
    const validTabs = childTabs.filter((tab) => tab.childEntityType.trim())

    try {
      await onSave(trimmedName, visibility, validTabs)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save view'
      setError(msg)
      logger.error('Failed to save view', { error: msg })
    } finally {
      setIsSaving(false)
    }
  }, [name, visibility, childTabs, onSave, onOpenChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isSaving) {
        e.preventDefault()
        handleSave()
      }
    },
    [handleSave, isSaving],
  )

  const isEditMode = !!initialName

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="save-view-dialog">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Rename View' : 'Save View'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="view-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter view name"
              maxLength={100}
              autoFocus
              data-testid="save-view-name-input"
            />
            {error && (
              <p className="text-sm text-destructive" data-testid="save-view-error">
                {error}
              </p>
            )}
          </div>

          {/* Visibility radio group */}
          <div className="space-y-2">
            <Label>Visibility</Label>
            <RadioGroup
              value={visibility}
              onValueChange={(val) => setVisibility(val as ViewVisibility)}
              className="grid gap-2"
              data-testid="save-view-visibility"
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value="personal" id="visibility-personal" />
                <Label htmlFor="visibility-personal" className="cursor-pointer font-normal">
                  <div className="text-sm font-medium">Personal</div>
                  <div className="text-xs text-muted-foreground">Only you can see this view</div>
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <RadioGroupItem value="shared" id="visibility-shared" />
                <Label htmlFor="visibility-shared" className="cursor-pointer font-normal">
                  <div className="text-sm font-medium">Shared</div>
                  <div className="text-xs text-muted-foreground">Everyone in the organization</div>
                </Label>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="locked" id="visibility-locked" />
                  <Label htmlFor="visibility-locked" className="cursor-pointer font-normal">
                    <div className="text-sm font-medium">Locked</div>
                    <div className="text-xs text-muted-foreground">
                      Only admins can modify this view
                    </div>
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>

          {/* Child Entity Tabs (GH#1677 P2.3) - optional */}
          <Collapsible open={childSectionOpen} onOpenChange={setChildSectionOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
              <span className="font-medium">
                Child Entity Tabs (optional)
                {childTabs.length > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">({childTabs.length})</span>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${childSectionOpen ? 'rotate-180' : ''}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              {/* List of tab entries */}
              {childTabs.map((entry, index) => (
                <ChildTabEntry
                  key={`child-tab-${
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable list with add/remove only
                    index
                  }`}
                  index={index}
                  entry={entry}
                  entitySchemas={entitySchemas}
                  onUpdate={handleUpdateTab}
                  onRemove={handleRemoveTab}
                />
              ))}

              {/* Add button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={handleAddTab}
                disabled={childTabs.length >= MAX_CHILD_TABS}
                data-testid="child-tab-add"
              >
                <PlusIcon className="h-3.5 w-3.5 mr-1" />
                Add child tab
                {childTabs.length >= MAX_CHILD_TABS && (
                  <span className="ml-1 text-muted-foreground">(max {MAX_CHILD_TABS})</span>
                )}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            data-testid="save-view-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            data-testid="save-view-submit"
          >
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            {isEditMode ? 'Rename' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
