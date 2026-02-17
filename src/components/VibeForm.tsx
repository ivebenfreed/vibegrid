/**
 * VibeForm - Layout-agnostic form wrapper for entity editing
 *
 * Responsibilities:
 * - Manages form-level state (dirty, errors, create flow)
 * - Uses PropertySheet or other layout adapters based on config
 * - Integrates with EditingStore for edit lifecycle
 * - Handles auto-create flow (local → creating → persisted)
 *
 * Create Flow State Machine:
 * LOCAL (draft) → AUTO-CREATE (pending) → PERSISTED (edit mode)
 *
 * Usage:
 * <VibeForm
 *   entityId={entityId}  // null for create mode
 *   layoutConfig={{ type: 'property-sheet' }}
 *   columns={columns}
 *   onSave={(entity) => console.log('Saved:', entity)}
 * />
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useState, useMemo, useCallback } from 'react'
import type { Column } from '../types'
import type { LayoutConfig } from '../types/layout-types'
import type { FieldGroup } from '../adapters/GroupedFormLayoutAdapter'
import { PropertySheet } from './PropertySheet'
import { SingleColumnForm } from './SingleColumnForm'
import { TwoColumnForm } from './TwoColumnForm'
import { InlineRow } from './InlineRow'
import { GroupedForm } from './GroupedForm'
import { GridForm } from './GridForm'
import { InteractionStore } from '../stores/InteractionStore'
import { useVibeGridStoresOptional } from '../stores/context'
import { useCreateRecordMutation } from '@/shared/data/mutations/entity-data.mutations'
import { getLogger } from '@/shared/lib/logging'
import './VibeForm.css'

const logger = getLogger(['vibegrid', 'VibeForm'])

// ====================================
// TYPES
// ====================================

export interface VibeFormProps {
  /** Entity ID (null for create mode) */
  entityId?: string | null
  /** Entity name for DataForge API (e.g., 'Task', 'Project') */
  entityName?: string
  /** Layout configuration (determines PropertySheet vs Grid) */
  layoutConfig: LayoutConfig
  /** Field definitions */
  columns: Column[]
  /** Entity data (for editing existing entity) */
  data?: any
  /** Save callback */
  onSave?: (entity: any) => void
  /** Cancel callback */
  onCancel?: () => void
  /** Entity schema (for validation) */
  schema?: any
  /** Disable auto-create (manual save only) */
  disableAutoCreate?: boolean
  /** Field groups for grouped layout */
  groups?: FieldGroup[]
  /** Group toggle callback */
  onGroupToggle?: (groupId: string, collapsed: boolean) => void
  /** TanStack DB collection for auto-save (passed from dialog context) */
  collection?: any
}

/**
 * Create flow state machine
 */
type CreateFlowMode = 'local' | 'creating' | 'persisted'

interface CreateFlowState {
  mode: CreateFlowMode
  localValues: Record<string, any> // Pre-create field values
  entityId: string | null // Populated after auto-create
  createError: string | null // Error message if auto-create fails
}

// ====================================
// COMPONENT
// ====================================

export const VibeForm = observer(function VibeForm({
  entityId,
  entityName,
  layoutConfig,
  columns,
  data,
  onSave,
  onCancel: _onCancel,
  schema,
  disableAutoCreate = false,
  groups,
  onGroupToggle,
  collection,
}: VibeFormProps) {
  // ====================================
  // STORES
  // ====================================

  // Try to get stores from VibeGridStoreProvider context (e.g., when inside entity list grid)
  const contextStores = useVibeGridStoresOptional()

  // Create a local InteractionStore when not inside a VibeGridStoreProvider
  const localInteractionStore = useMemo(() => {
    if (contextStores) return null
    return new InteractionStore()
  }, [contextStores])

  const interactionStore = contextStores?.interactionStore ?? localInteractionStore!
  const editingStore = contextStores?.editingStore ?? null

  // Set layout mode for PropertySheet navigation
  useEffect(() => {
    interactionStore.setLayout('property-sheet')
    return () => {
      interactionStore.setLayout('grid')
    }
  }, [interactionStore])

  // Set collection on EditingStore for auto-save (when available)
  useEffect(() => {
    if (editingStore && collection) {
      editingStore.setCollection(collection)
    }
  }, [editingStore, collection])

  // ====================================
  // STATE
  // ====================================

  const [createFlow, setCreateFlow] = useState<CreateFlowState>({
    mode: entityId ? 'persisted' : 'local',
    localValues: data || {},
    entityId: entityId || null,
    createError: null,
  })

  const [isDirty, setIsDirty] = useState(false)

  // ====================================
  // DATAFORGE MUTATION
  // ====================================

  // Only initialize mutation if entityName is provided and we're in create mode
  // biome-ignore lint/correctness/useHookAtTopLevel: entityName is stable per mount
  const createMutation = entityName ? useCreateRecordMutation(entityName) : null

  // ====================================
  // CREATE FLOW LOGIC
  // ====================================

  /**
   * Check if minimum required fields are filled for auto-create
   */
  const shouldAutoCreate = useCallback(
    (values: Record<string, any>): boolean => {
      // Get required fields from schema, columns, or use default 'name' field
      let requiredFields: { id: string }[]

      if (schema?.fields) {
        requiredFields = schema.fields.filter((f: any) => f.required)
      } else {
        // Fall back to columns with required flag
        requiredFields = columns.filter((c) => c.required).map((c) => ({ id: c.id }))
      }

      // Default to 'name' if no required fields found
      if (requiredFields.length === 0) {
        requiredFields = [{ id: 'name' }]
      }

      const allFilled = requiredFields.every((f) => {
        const value = values[f.id]
        return value != null && value !== ''
      })

      logger.debug('Checking auto-create condition', {
        requiredFields: requiredFields.map((f) => f.id),
        values,
        allFilled,
      })

      return allFilled
    },
    [schema, columns],
  )

  /**
   * Auto-create entity when minimum fields are filled
   */
  const handleAutoCreate = useCallback(
    async (values: Record<string, any>) => {
      if (disableAutoCreate) {
        logger.debug('Skipping auto-create - disabled')
        return
      }

      if (createFlow.mode !== 'local') {
        logger.debug('Skipping auto-create - not in local mode', { mode: createFlow.mode })
        return
      }

      if (!shouldAutoCreate(values)) {
        logger.debug('Skipping auto-create - required fields not filled')
        return
      }

      logger.info('Triggering auto-create', { values, entityName })

      setCreateFlow((prev) => ({ ...prev, mode: 'creating' }))

      try {
        let createdEntity: any

        if (createMutation && entityName) {
          // Use DataForge API
          createdEntity = await createMutation.mutateAsync(values)
          logger.info('Auto-create successful via DataForge', { entityId: createdEntity.id })
        } else {
          // Fallback: Generate local ID (for testing/demo without API)
          createdEntity = {
            id: `local-${Date.now()}`,
            ...values,
            createdAt: new Date().toISOString(),
          }
          logger.info('Auto-create successful (local mode)', { entityId: createdEntity.id })
        }

        setCreateFlow({
          mode: 'persisted',
          localValues: values,
          entityId: createdEntity.id,
          createError: null,
        })

        // Notify parent
        if (onSave) {
          onSave(createdEntity)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Auto-create failed', { error: errorMessage })

        setCreateFlow((prev) => ({
          ...prev,
          mode: 'local',
          createError: errorMessage,
        }))
      }
    },
    [createFlow.mode, disableAutoCreate, shouldAutoCreate, createMutation, entityName, onSave],
  )

  /**
   * Handle field value change
   */
  const handleFieldChange = (fieldId: string, value: any) => {
    const newValues = { ...createFlow.localValues, [fieldId]: value }

    setCreateFlow((prev) => ({
      ...prev,
      localValues: newValues,
    }))

    setIsDirty(true)

    // Trigger auto-create if conditions met
    if (createFlow.mode === 'local') {
      handleAutoCreate(newValues)
    }

    logger.debug('Field changed', { fieldId, value, mode: createFlow.mode })
  }

  // ====================================
  // RESPONSIVE LAYOUT
  // ====================================

  /**
   * Determine effective layout type based on responsive config and screen size
   */
  const effectiveLayoutType = useMemo(() => {
    // Check for responsive override
    if (layoutConfig.responsive && typeof window !== 'undefined') {
      const isMobile = window.innerWidth < layoutConfig.responsive.threshold
      if (isMobile) {
        return layoutConfig.responsive.mobile
      }
    }
    return layoutConfig.type
  }, [layoutConfig])

  // ====================================
  // LAYOUT RENDERING
  // ====================================

  const renderLayout = () => {
    switch (effectiveLayoutType) {
      case 'property-sheet':
        return (
          <PropertySheet
            data={createFlow.localValues}
            columns={columns}
            interactionStore={interactionStore}
            onFieldChange={handleFieldChange}
          />
        )

      case 'single-column':
        return (
          <SingleColumnForm
            data={createFlow.localValues}
            columns={columns}
            interactionStore={interactionStore}
            onFieldChange={handleFieldChange}
          />
        )

      case 'two-column':
        return (
          <TwoColumnForm
            data={createFlow.localValues}
            columns={columns}
            interactionStore={interactionStore}
            onFieldChange={handleFieldChange}
          />
        )

      case 'inline-row':
        return (
          <InlineRow
            data={createFlow.localValues}
            columns={columns}
            interactionStore={interactionStore}
            showLabels={layoutConfig.showLabels}
            onFieldChange={handleFieldChange}
          />
        )

      case 'grouped':
        if (!groups || groups.length === 0) {
          logger.warn('Grouped layout requires groups prop')
          return (
            <PropertySheet
              data={createFlow.localValues}
              columns={columns}
              interactionStore={interactionStore}
              onFieldChange={handleFieldChange}
            />
          )
        }
        return (
          <GroupedForm
            data={createFlow.localValues}
            columns={columns}
            groups={groups}
            interactionStore={interactionStore}
            onFieldChange={handleFieldChange}
            onGroupToggle={onGroupToggle}
          />
        )

      case 'grid':
        return (
          <GridForm
            data={createFlow.localValues}
            columns={columns}
            interactionStore={interactionStore}
            fieldPlacements={layoutConfig.fields}
            gridColumns={2}
            onFieldChange={handleFieldChange}
          />
        )

      default:
        logger.error('Unknown layout type', { type: effectiveLayoutType })
        return <div className="vibe-form-error">Unknown layout type: {effectiveLayoutType}</div>
    }
  }

  // ====================================
  // RENDER
  // ====================================

  return (
    <div className="vibe-form" data-testid="vibe-form">
      {/* Save status indicator */}
      <div className="vibe-form-status" data-testid="vibe-form-save-status" role="status" aria-live="polite">
        {createFlow.mode === 'local' && (
          <span className="vibe-form-status-draft" aria-label="Form in draft mode">
            Draft
          </span>
        )}
        {createFlow.mode === 'creating' && (
          <span className="vibe-form-status-saving" aria-label="Auto-save in progress">
            Saving...
          </span>
        )}
        {createFlow.mode === 'persisted' && isDirty && (
          <span className="vibe-form-status-saved" aria-label="Changes saved">
            Saved
          </span>
        )}
        {!isDirty && createFlow.mode !== 'creating' && (
          <span className="vibe-form-status-idle">No pending changes</span>
        )}
      </div>

      {/* Error message */}
      {createFlow.createError && (
        <div className="vibe-form-error-banner" role="alert">
          <span>{createFlow.createError}</span>
          <button
            type="button"
            onClick={() => handleAutoCreate(createFlow.localValues)}
            className="vibe-form-retry-button"
            aria-label="Retry create flow"
          >
            Retry
          </button>
        </div>
      )}

      {/* Layout adapter */}
      {renderLayout()}
    </div>
  )
})
