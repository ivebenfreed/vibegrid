/**
 * SaveViewDialog - Save/Rename Entity View Dialog (GH#1570)
 *
 * Modal dialog for creating or editing a saved view.
 * Collects view name and visibility level.
 */

import { ChevronDown, Loader2, XIcon } from 'lucide-react'
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
    childEntityConfig?: ChildEntityConfigInput,
  ) => Promise<void>
  /** Pre-filled name for "Save As" or edit mode */
  initialName?: string
  /** Pre-filled visibility for edit mode */
  initialVisibility?: ViewVisibility
  /** Pre-filled child entity config for edit mode */
  initialChildEntityConfig?: ChildEntityConfigInput
  /** Available entity schemas for the child entity picker */
  entitySchemas?: Array<{ entityName: string; label?: string }>
  /** Controls whether "locked" option is available */
  isAdmin: boolean
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
  initialChildEntityConfig,
  entitySchemas,
  isAdmin,
}: SaveViewDialogProps): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [visibility, setVisibility] = useState<ViewVisibility>(initialVisibility)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Child entity config state (GH#1621)
  const [childEntityType, setChildEntityType] = useState(
    initialChildEntityConfig?.childEntityType ?? '',
  )
  const [childRelType, setChildRelType] = useState(
    initialChildEntityConfig?.relationshipType ?? 'belongs_to',
  )
  const [childDirection, setChildDirection] = useState<'incoming' | 'outgoing'>(
    initialChildEntityConfig?.direction ?? 'incoming',
  )
  const [childSectionOpen, setChildSectionOpen] = useState(!!initialChildEntityConfig)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(initialName)
      setVisibility(initialVisibility)
      setError(null)
      setIsSaving(false)
      setChildEntityType(initialChildEntityConfig?.childEntityType ?? '')
      setChildRelType(initialChildEntityConfig?.relationshipType ?? 'belongs_to')
      setChildDirection(initialChildEntityConfig?.direction ?? 'incoming')
      setChildSectionOpen(!!initialChildEntityConfig)
    }
  }, [open, initialName, initialVisibility, initialChildEntityConfig])

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

    // Build child entity config if specified
    const childConfig = childEntityType.trim()
      ? {
          childEntityType: childEntityType.trim(),
          relationshipType: childRelType,
          direction: childDirection,
        }
      : undefined

    try {
      await onSave(trimmedName, visibility, childConfig)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save view'
      setError(msg)
      logger.error('Failed to save view', { error: msg })
    } finally {
      setIsSaving(false)
    }
  }, [name, visibility, childEntityType, childRelType, childDirection, onSave, onOpenChange])

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

          {/* Child Entity Section (GH#1621) - optional */}
          <Collapsible open={childSectionOpen} onOpenChange={setChildSectionOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
              <span className="font-medium">Child Entity Section (optional)</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${childSectionOpen ? 'rotate-180' : ''}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              {/* Entity Type */}
              <div className="space-y-1.5">
                <Label htmlFor="child-entity-type" className="text-xs">
                  Entity Type
                </Label>
                {entitySchemas && entitySchemas.length > 0 ? (
                  <Select value={childEntityType} onValueChange={setChildEntityType}>
                    <SelectTrigger id="child-entity-type" data-testid="child-entity-type-select">
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
                    id="child-entity-type"
                    value={childEntityType}
                    onChange={(e) => setChildEntityType(e.target.value)}
                    placeholder="e.g., GCCOICoverage"
                    data-testid="child-entity-type-input"
                  />
                )}
              </div>

              {/* Relationship Type */}
              <div className="space-y-1.5">
                <Label htmlFor="child-rel-type" className="text-xs">
                  Relationship Type
                </Label>
                <Select value={childRelType} onValueChange={setChildRelType}>
                  <SelectTrigger id="child-rel-type" data-testid="child-rel-type-select">
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
                <Label htmlFor="child-direction" className="text-xs">
                  Direction
                </Label>
                <Select
                  value={childDirection}
                  onValueChange={(val) => setChildDirection(val as 'incoming' | 'outgoing')}
                >
                  <SelectTrigger id="child-direction" data-testid="child-direction-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incoming">Incoming (child is source)</SelectItem>
                    <SelectItem value="outgoing">Outgoing (child is target)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear button */}
              {childEntityType && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    setChildEntityType('')
                    setChildRelType('belongs_to')
                    setChildDirection('incoming')
                  }}
                >
                  <XIcon className="h-3 w-3 mr-1" />
                  Remove child section
                </Button>
              )}
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
