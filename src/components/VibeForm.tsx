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
import { useEffect, useState } from 'react'
import type { Column } from '../types'
import type { LayoutConfig } from '../types/layout-types'
import { PropertySheet } from './PropertySheet'
import { getLogger } from '@/shared/lib/logging'
import './VibeForm.css'

const logger = getLogger(['vibegrid', 'VibeForm'])

// ====================================
// TYPES
// ====================================

export interface VibeFormProps {
	/** Entity ID (null for create mode) */
	entityId?: string | null
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
	layoutConfig,
	columns,
	data,
	onSave,
	onCancel,
	schema,
}: VibeFormProps) {
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
	// CREATE FLOW LOGIC
	// ====================================

	/**
	 * Check if minimum required fields are filled for auto-create
	 */
	const shouldAutoCreate = (values: Record<string, any>): boolean => {
		// Get required fields from schema or use default 'name' field
		const requiredFields = schema?.fields?.filter((f: any) => f.required) || [{ id: 'name' }]

		const allFilled = requiredFields.every((f: any) => {
			const value = values[f.id]
			return value != null && value !== ''
		})

		logger.debug('Checking auto-create condition', {
			requiredFields: requiredFields.map((f: any) => f.id),
			values,
			allFilled,
		})

		return allFilled
	}

	/**
	 * Auto-create entity when minimum fields are filled
	 */
	const handleAutoCreate = async (values: Record<string, any>) => {
		if (createFlow.mode !== 'local') {
			logger.debug('Skipping auto-create - not in local mode', { mode: createFlow.mode })
			return
		}

		if (!shouldAutoCreate(values)) {
			logger.debug('Skipping auto-create - required fields not filled')
			return
		}

		logger.info('Triggering auto-create', { values })

		setCreateFlow((prev) => ({ ...prev, mode: 'creating' }))

		try {
			// TODO: Replace with actual DataForge create API call
			// For now, simulate entity creation
			const mockEntityId = `entity-${Date.now()}`

			logger.info('Auto-create successful', { entityId: mockEntityId })

			setCreateFlow({
				mode: 'persisted',
				localValues: values,
				entityId: mockEntityId,
				createError: null,
			})

			// Notify parent
			if (onSave) {
				onSave({ id: mockEntityId, ...values })
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
	}

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
	// LAYOUT RENDERING
	// ====================================

	const renderLayout = () => {
		switch (layoutConfig.type) {
			case 'property-sheet':
				return (
					<PropertySheet
						data={createFlow.localValues}
						columns={columns}
						interactionStore={null as any} // TODO: Pass actual InteractionStore
						onFieldChange={handleFieldChange}
					/>
				)

			case 'grid':
			case 'single-column':
			case 'two-column':
			case 'inline-row':
				// TODO: Implement other layout adapters
				return (
					<div className="vibe-form-placeholder">
						<p>Layout type '{layoutConfig.type}' not yet implemented</p>
						<p>Using PropertySheet as fallback</p>
						<PropertySheet
							data={createFlow.localValues}
							columns={columns}
							interactionStore={null as any}
							onFieldChange={handleFieldChange}
						/>
					</div>
				)

			default:
				logger.error('Unknown layout type', { type: layoutConfig.type })
				return <div className="vibe-form-error">Unknown layout type: {layoutConfig.type}</div>
		}
	}

	// ====================================
	// RENDER
	// ====================================

	return (
		<div className="vibe-form" data-testid="vibe-form">
			{/* Save status indicator */}
			<div className="vibe-form-status" data-testid="vibe-form-save-status">
				{createFlow.mode === 'local' && (
					<span className="vibe-form-status-draft">Draft</span>
				)}
				{createFlow.mode === 'creating' && (
					<span className="vibe-form-status-saving">Saving...</span>
				)}
				{createFlow.mode === 'persisted' && isDirty && (
					<span className="vibe-form-status-saved">Saved</span>
				)}
			</div>

			{/* Error message */}
			{createFlow.createError && (
				<div className="vibe-form-error-banner">
					<span>{createFlow.createError}</span>
					<button
						type="button"
						onClick={() => handleAutoCreate(createFlow.localValues)}
						className="vibe-form-retry-button"
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
