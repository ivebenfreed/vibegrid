import { format } from 'date-fns'
import { CalendarIcon, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import React, { useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Calendar } from '@/shared/components/ui/calendar'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Textarea } from '@/shared/components/ui/textarea'
import { toast } from 'sonner'
import { EntityNameUtils } from '@/shared/lib/entity-name-utils'
import { getLogger } from '@/shared/lib/logging'
import type { VibeGridStores } from '../stores/context'

const fileLog = getLogger(['vibegrid', 'components', 'VibeGridEntityAdd'])

interface VibeGridEntityAddProps {
  stores: VibeGridStores
  entityName: string
  entityDisplayName?: string // User-friendly display name (e.g., "Document" instead of "GCFile")
  orgId?: string
  createEntity: (data: Record<string, any>) => void
  className?: string
}

interface FieldValue {
  value: any
  isValid: boolean
  error?: string
}

/**
 * VibeGridEntityAdd - Dynamic entity form with enhanced schema integration
 *
 * This component leverages the enhanced schema API to provide:
 * - Rich validation metadata from backend field handlers
 * - Consistent error messages from field.validation.messages
 * - Display metadata for labels, placeholders, and formatting
 * - Proper field type handling aligned with the 47+ field type system
 */
export const VibeGridEntityAdd = observer(function VibeGridEntityAdd({
  stores,
  entityName,
  entityDisplayName,
  orgId,
  createEntity,
  className = '',
}: VibeGridEntityAddProps) {
  const { tableCoreStore } = stores

  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<Record<string, FieldValue>>({})
  const [_hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)

  // Get reactive data from MobX stores
  const columns = tableCoreStore.columns

  // Extract display name for UI - use provided entityDisplayName or fall back to transformed entityName
  const displayName =
    entityDisplayName || (entityName ? EntityNameUtils.toDisplayFormat(entityName) : 'Entity')

  // Get form fields from columns (excluding system columns, internal fields, and non-editable read-only columns)
  const formFields = useMemo(() => {
    if (!columns || !Array.isArray(columns)) return []

    // System fields that are auto-populated
    const systemFieldIds = new Set([
      'id',
      'created_at',
      'updated_at',
      'organization_id',
      'createdAt',
      'updatedAt',
      'created_by',
    ])

    // Internal/tracking fields that users should never fill in manually
    const internalFieldIds = new Set([
      'source_system',
      'external_id',
      'source_updated_at',
      'sync_status',
      'progress_percentage',
    ])

    const filtered = columns.filter((column) => {
      const isValidColumn = column && column.id
      if (!isValidColumn) return false
      if (systemFieldIds.has(column.id)) return false
      if (internalFieldIds.has(column.id)) return false
      // Include addFormOnly fields (like password) even if hidden/non-editable
      if ((column as any).addFormOnly) return true
      // Exclude hidden non-editable fields that aren't meant for the form
      if (column.hidden && !column.editable) return false
      return true
    })

    // Sort fields: name first, then required fields, then optional fields
    return filtered.sort((a, b) => {
      // 'name' always comes first
      if (a.id === 'name') return -1
      if (b.id === 'name') return 1
      // Required fields before optional
      const aReq = a.required || a.validation?.required || false
      const bReq = b.required || b.validation?.required || false
      if (aReq && !bReq) return -1
      if (!aReq && bReq) return 1
      return 0
    })
  }, [columns])

  // Initialize form data when dialog opens
  React.useEffect(() => {
    if (isOpen && formFields.length > 0) {
      const initialData: Record<string, FieldValue> = {}
      formFields.forEach((field) => {
        // Use enhanced validation metadata for required check
        const isRequired = field.required || field.validation?.required || field.id === 'name'

        // Use defaultValue from enhanced schema if available
        let defaultValue = field.defaultValue
        if (defaultValue === undefined || defaultValue === null) {
          if (field.type === 'boolean') {
            defaultValue = false
          } else {
            defaultValue = ''
          }
        }

        initialData[field.id] = {
          value: defaultValue,
          isValid: !isRequired, // Only mark as invalid if required and no default
          error: undefined,
        }
      })
      setFormData(initialData)
      setHasAttemptedSubmit(false) // Reset submission attempt state
    }
  }, [isOpen, formFields])

  const validateField = (
    fieldId: string,
    value: any,
    field: any,
  ): { isValid: boolean; error?: string } => {
    if (!field) return { isValid: true }

    // Use enhanced validation metadata from backend schema
    const validation = field.validation
    const isRequired = field.required || validation?.required || fieldId === 'name'

    // Required field validation
    if (isRequired && (value === '' || value === null || value === undefined)) {
      const errorMessage = validation?.messages?.required || `${field.label || fieldId} is required`
      return { isValid: false, error: errorMessage }
    }

    // Skip validation for empty optional fields
    if (!isRequired && (value === '' || value === null || value === undefined)) {
      return { isValid: true }
    }

    // Pattern validation (covers email, phone, url, etc.)
    if (validation?.pattern && value !== '' && value !== null) {
      const pattern = new RegExp(validation.pattern)
      if (!pattern.test(String(value))) {
        const errorMessage =
          validation.messages?.pattern ||
          validation.messages?.custom?.[`INVALID_${field.type.toUpperCase()}`] ||
          `Invalid ${field.type} format`
        return { isValid: false, error: errorMessage }
      }
    }

    // Length validation
    if (validation?.maxLength && String(value).length > validation.maxLength) {
      const errorMessage =
        validation.messages?.maxLength || `Too long (maximum ${validation.maxLength} characters)`
      return { isValid: false, error: errorMessage }
    }

    if (validation?.minLength && String(value).length < validation.minLength) {
      const errorMessage =
        validation.messages?.minLength || `Too short (minimum ${validation.minLength} characters)`
      return { isValid: false, error: errorMessage }
    }

    // Password-specific validation (matches server-side password-policy.ts)
    if (fieldId.toLowerCase().includes('password') && value !== '' && value !== null) {
      const pw = String(value)
      if (!/[A-Z]/.test(pw)) {
        return { isValid: false, error: 'Must contain at least one uppercase letter' }
      }
      if (!/[a-z]/.test(pw)) {
        return { isValid: false, error: 'Must contain at least one lowercase letter' }
      }
      if (!/\d/.test(pw)) {
        return { isValid: false, error: 'Must contain at least one number' }
      }
      if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(pw)) {
        return { isValid: false, error: 'Must contain at least one special character (!@#$%^&*)' }
      }
      if (/(.)\1{2,}/.test(pw)) {
        return {
          isValid: false,
          error: 'Must not contain more than 2 repeated characters in a row',
        }
      }
    }

    // Number range validation
    if (
      (field.type === 'number' || field.type === 'integer' || field.type === 'decimal') &&
      value !== '' &&
      value !== null
    ) {
      const numValue = typeof value === 'string' ? parseFloat(value) : value
      if (Number.isNaN(numValue)) {
        const errorMessage =
          validation?.messages?.custom?.INVALID_NUMBER || 'Please enter a valid number'
        return { isValid: false, error: errorMessage }
      }

      if (validation?.min !== undefined && numValue < validation.min) {
        const errorMessage = validation.messages?.min || `Must be at least ${validation.min}`
        return { isValid: false, error: errorMessage }
      }

      if (validation?.max !== undefined && numValue > validation.max) {
        const errorMessage = validation.messages?.max || `Must be no more than ${validation.max}`
        return { isValid: false, error: errorMessage }
      }
    }

    return { isValid: true }
  }

  const updateFieldValue = (fieldId: string, newValue: any) => {
    const field = formFields.find((f) => f.id === fieldId)
    if (!field) return

    const validation = validateField(fieldId, newValue, field)

    setFormData((prev) => ({
      ...prev,
      [fieldId]: {
        value: newValue,
        isValid: validation.isValid,
        error: validation.error,
      },
    }))
  }

  const isFormValid = useMemo(() => {
    fileLog.debug('Form validation check', {
      formData,
      allFields: Object.keys(formData),
      invalidFields: Object.entries(formData)
        .filter(([_key, field]) => !field.isValid)
        .map(([key]) => key),
      isValid: Object.values(formData).every((field) => field.isValid),
    })
    return Object.values(formData).every((field) => field.isValid)
  }, [formData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setHasAttemptedSubmit(true) // Mark that user has attempted to submit

    // Force validation on all fields before submit
    const validationErrors: string[] = []
    Object.entries(formData).forEach(([fieldId, fieldValue]) => {
      const field = formFields.find((f) => f.id === fieldId)
      if (field) {
        const validation = validateField(fieldId, fieldValue.value, field)
        if (!validation.isValid) {
          validationErrors.push(validation.error || `${fieldId} is invalid`)
        }
      }
    })

    if (validationErrors.length > 0) {
      fileLog.warn('Validation errors', { validationErrors })
      // Don't show alert - the status indicator will show the error message
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare entity data
      const now = new Date().toISOString()
      const entityData: Record<string, any> = {
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        organization_id: orgId,
      }

      // Add form field values
      Object.entries(formData).forEach(([key, field]) => {
        if (field.value !== '' && field.value !== null) {
          entityData[key] = field.value
        }
      })

      // Add default status and priority if not provided
      if (!entityData.status) {
        entityData.status = 'draft'
      }
      if (!entityData.priority) {
        entityData.priority = 'medium'
      }

      fileLog.debug('Creating entity', {
        entityName,
        data: entityData,
      })

      // Create the entity using TanStack DB mutation
      createEntity(entityData)

      fileLog.debug('Entity created successfully')

      // Reset form and close dialog
      setFormData({})
      setIsOpen(false)
    } catch (error) {
      fileLog.error('Error creating entity', { error })
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Error creating ${displayName}`, {
        description: errorMessage,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderField = (field: any) => {
    const fieldValue = formData[field.id]
    if (!fieldValue) return null

    // Enhanced visual feedback for field states
    const isRequired = field.required || field.validation?.required || field.id === 'name'
    const hasError = !fieldValue.isValid
    const isEmpty =
      fieldValue.value === '' || fieldValue.value === null || fieldValue.value === undefined
    const showRequiredState = isRequired && isEmpty && !fieldValue.error

    const containerClassName = `space-y-2 ${hasError ? 'border-l-4 border-l-red-500 pl-3' : showRequiredState ? 'border-l-4 border-l-orange-300 pl-3' : ''}`

    // Use enhanced display metadata for label and placeholder
    const fieldLabel =
      field.label ||
      field.display?.label ||
      field.id.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())

    const placeholder =
      field.display?.placeholder ||
      field.validation?.messages?.placeholder ||
      field.description ||
      `Enter ${fieldLabel.toLowerCase()}`

    // Enhanced input styling based on validation state
    const getInputClassName = (baseClasses = '') => {
      const classes = [baseClasses]

      if (hasError) {
        classes.push('border-red-500 focus:border-red-500 focus:ring-red-200')
      } else if (showRequiredState) {
        classes.push('border-orange-300 focus:border-orange-400 focus:ring-orange-100')
      } else if (isRequired && !isEmpty) {
        classes.push('border-green-400 focus:border-green-500 focus:ring-green-100')
      }

      return classes.filter(Boolean).join(' ')
    }

    return (
      <div key={field.id} className={containerClassName}>
        <Label
          htmlFor={field.id}
          className={`text-sm font-medium ${hasError ? 'text-red-700' : showRequiredState ? 'text-orange-700' : ''}`}
        >
          {fieldLabel}
          {isRequired && (
            <span
              className={`ml-1 ${hasError ? 'text-red-500' : showRequiredState ? 'text-orange-500' : 'text-red-400'}`}
            >
              *
            </span>
          )}
        </Label>

        {(() => {
          // Check if this is a select field based on actual field data
          const isSelectField =
            field.type === 'status' ||
            field.type === 'single-select' ||
            field.cellType === 'select' ||
            field.cellType === 'single-select' ||
            field.referenceType?.includes('_option') ||
            field.systemOptionType

          if (isSelectField) {
            // Normalize options: prefer column.options from schema, fall back to name patterns
            const normalizeOptions = (): Array<{
              value: string
              label: string
            }> => {
              // 1. Use schema-defined options (primary source)
              if (field.options && Array.isArray(field.options) && field.options.length > 0) {
                return field.options.map((opt: any) =>
                  typeof opt === 'string'
                    ? { value: opt, label: opt }
                    : { value: opt.value, label: opt.label || opt.value },
                )
              }
              // 2. Use editor-defined options
              if (
                field.editor?.options &&
                Array.isArray(field.editor.options) &&
                field.editor.options.length > 0
              ) {
                return field.editor.options.map((opt: any) => ({
                  value: opt.value,
                  label: opt.label || opt.value,
                }))
              }
              // 3. Fall back to field name patterns
              const lowerFieldId = field.id.toLowerCase()
              if (lowerFieldId.includes('status')) {
                return ['draft', 'active', 'inactive', 'pending', 'archived'].map((v) => ({
                  value: v,
                  label: v,
                }))
              } else if (lowerFieldId.includes('priority')) {
                return ['low', 'medium', 'high', 'urgent'].map((v) => ({
                  value: v,
                  label: v,
                }))
              }
              return []
            }

            const options = normalizeOptions()

            const selectedOption = options.find((opt) => opt.value === fieldValue.value)

            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={getInputClassName('w-full justify-between')}
                  >
                    {selectedOption
                      ? selectedOption.label
                      : `Select ${fieldLabel.toLowerCase()}...`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput placeholder={`Search ${fieldLabel.toLowerCase()}...`} />
                    <CommandList>
                      <CommandEmpty>No {fieldLabel.toLowerCase()} found.</CommandEmpty>
                      <CommandGroup>
                        {options.map((option) => (
                          <CommandItem
                            key={option.value}
                            value={option.value}
                            onSelect={() => updateFieldValue(field.id, option.value)}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                fieldValue.value === option.value ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            {option.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )
          }

          switch (field.type) {
            case 'number':
            case 'integer':
              return (
                <Input
                  id={field.id}
                  type="number"
                  value={fieldValue.value}
                  onChange={(e) =>
                    updateFieldValue(field.id, e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder={placeholder}
                  className={getInputClassName()}
                />
              )

            case 'currency':
              return (
                <Input
                  id={field.id}
                  type="number"
                  step="0.01"
                  value={fieldValue.value}
                  onChange={(e) =>
                    updateFieldValue(field.id, e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder={placeholder}
                  className={getInputClassName()}
                />
              )

            case 'boolean':
              return (
                <div className="flex items-center space-x-2">
                  <input
                    id={field.id}
                    type="checkbox"
                    checked={fieldValue.value || false}
                    onChange={(e) => updateFieldValue(field.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor={field.id} className="text-sm text-muted-foreground">
                    {field.description || `Enable ${fieldLabel.toLowerCase()}`}
                  </Label>
                </div>
              )

            case 'date':
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id={field.id}
                      variant="outline"
                      className={getInputClassName('w-full justify-start text-left font-normal')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fieldValue.value ? format(new Date(fieldValue.value), 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fieldValue.value ? new Date(fieldValue.value) : undefined}
                      onSelect={(date) =>
                        updateFieldValue(field.id, date?.toISOString().split('T')[0] || '')
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )

            case 'email':
              return (
                <Input
                  id={field.id}
                  type="email"
                  value={fieldValue.value}
                  onChange={(e) => updateFieldValue(field.id, e.target.value)}
                  placeholder={placeholder}
                  className={getInputClassName()}
                />
              )

            case 'url':
              return (
                <Input
                  id={field.id}
                  type="url"
                  value={fieldValue.value}
                  onChange={(e) => updateFieldValue(field.id, e.target.value)}
                  placeholder={placeholder}
                  className={getInputClassName()}
                />
              )

            case 'phone':
              return (
                <Input
                  id={field.id}
                  type="tel"
                  value={fieldValue.value}
                  onChange={(e) => updateFieldValue(field.id, e.target.value)}
                  placeholder={placeholder}
                  className={getInputClassName()}
                />
              )

            case 'rating':
              return (
                <Input
                  id={field.id}
                  type="number"
                  min="1"
                  max="5"
                  value={fieldValue.value}
                  onChange={(e) =>
                    updateFieldValue(field.id, e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder="1-5 rating"
                />
              )

            case 'address':
              return (
                <Textarea
                  id={field.id}
                  value={fieldValue.value}
                  onChange={(e) => updateFieldValue(field.id, e.target.value)}
                  placeholder={placeholder}
                  className={getInputClassName('min-h-[80px]')}
                />
              )

            default: {
              // Detect field types from field ID patterns
              const lowerFieldId = field.id.toLowerCase()

              if (lowerFieldId.includes('password')) {
                return (
                  <Input
                    id={field.id}
                    type="password"
                    value={fieldValue.value}
                    onChange={(e) => updateFieldValue(field.id, e.target.value)}
                    placeholder={placeholder}
                    className={getInputClassName()}
                    autoComplete="new-password"
                  />
                )
              }

              if (lowerFieldId.includes('email')) {
                return (
                  <Input
                    id={field.id}
                    type="email"
                    value={fieldValue.value}
                    onChange={(e) => updateFieldValue(field.id, e.target.value)}
                    placeholder={placeholder}
                  />
                )
              }

              if (lowerFieldId.includes('url') || lowerFieldId.includes('website')) {
                return (
                  <Input
                    id={field.id}
                    type="url"
                    value={fieldValue.value}
                    onChange={(e) => updateFieldValue(field.id, e.target.value)}
                    placeholder={placeholder}
                  />
                )
              }

              if (lowerFieldId.includes('phone')) {
                return (
                  <Input
                    id={field.id}
                    type="tel"
                    value={fieldValue.value}
                    onChange={(e) => updateFieldValue(field.id, e.target.value)}
                    placeholder={placeholder}
                  />
                )
              }

              // For text fields, use textarea for longer content
              const isLongText =
                lowerFieldId.includes('description') ||
                lowerFieldId.includes('notes') ||
                lowerFieldId.includes('content') ||
                lowerFieldId.includes('address')

              return isLongText ? (
                <Textarea
                  id={field.id}
                  value={fieldValue.value}
                  onChange={(e) => updateFieldValue(field.id, e.target.value)}
                  placeholder={placeholder}
                  className={getInputClassName('min-h-[80px]')}
                />
              ) : (
                <Input
                  id={field.id}
                  type="text"
                  value={fieldValue.value}
                  onChange={(e) => updateFieldValue(field.id, e.target.value)}
                  placeholder={placeholder}
                  className={getInputClassName()}
                />
              )
            }
          }
        })()}

        {fieldValue.error && <p className="text-xs text-red-500">{fieldValue.error}</p>}

        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className={`h-7 px-2 text-xs ${className}`}>
          <Plus className="h-3 w-3 mr-1" />
          Add {displayName}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New {displayName}</DialogTitle>
          <DialogDescription>
            Create a new {displayName.toLowerCase()} record using the same field editors as the
            table.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {formFields.length > 0 ? (
              formFields.map(renderField)
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Loading form fields...</p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !isFormValid}>
              {isSubmitting ? 'Creating...' : `Create ${displayName}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
})
