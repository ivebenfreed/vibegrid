/**
 * SaveViewDialog - Save/Rename Entity View Dialog (GH#1570)
 *
 * Modal dialog for creating or editing a saved view.
 * Collects view name and visibility level.
 */

import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
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
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'components', 'SaveViewDialog'])

// ====================================
// TYPES
// ====================================

export type ViewVisibility = 'personal' | 'shared' | 'locked'

export interface SaveViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: string
  onSave: (name: string, visibility: ViewVisibility) => Promise<void>
  /** Pre-filled name for "Save As" or edit mode */
  initialName?: string
  /** Pre-filled visibility for edit mode */
  initialVisibility?: ViewVisibility
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
  isAdmin,
}: SaveViewDialogProps): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [visibility, setVisibility] = useState<ViewVisibility>(initialVisibility)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(initialName)
      setVisibility(initialVisibility)
      setError(null)
      setIsSaving(false)
    }
  }, [open, initialName, initialVisibility])

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

    try {
      await onSave(trimmedName, visibility)
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save view'
      setError(msg)
      logger.error('Failed to save view', { error: msg })
    } finally {
      setIsSaving(false)
    }
  }, [name, visibility, onSave, onOpenChange])

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
