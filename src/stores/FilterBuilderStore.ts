/**
 * FilterBuilderStore - Filter Builder State Management (MobX)
 *
 * Extracted from InteractionStore (GH#2034 P1).
 * Owns all filter builder UI state: open/close, draft filter, presets, validation.
 */

import { action, computed, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import type { FilterBuilderState, FilterGroup, FilterPreset, ValidationError } from '../types/filter-types'
import { createPreset } from '../utils/filter-storage'
import { validateFilterGroup, countConditions, COMPLEXITY_WARNING_THRESHOLD } from '../utils/filter-utils'

const logger = getLogger(['vibegrid', 'stores', 'FilterBuilderStore'])

// ====================================
// STORE
// ====================================

/**
 * FilterBuilderStore - Manages filter builder UI state
 *
 * Handles:
 * - Filter builder open/close
 * - Draft filter group editing
 * - Filter presets (load, save, delete)
 * - Validation errors and complexity warnings
 */
export class FilterBuilderStore implements IStore {
  // ====================================
  // FILTER BUILDER STATE
  // ====================================

  @observable filterBuilderState: FilterBuilderState = {
    isOpen: false,
    searchValue: '',
    draftFilterGroup: null,
    presets: [],
    validationErrors: [],
    showComplexityWarning: false,
  }

  constructor() {
    makeObservable(this)
  }

  /**
   * Initialize store
   */
  init(): void {
    logger.info('Initializing FilterBuilderStore')
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    logger.info('FilterBuilderStore disposed')
  }

  /**
   * Reset to default state
   */
  @action
  reset(): void {
    this.filterBuilderState = {
      isOpen: false,
      searchValue: '',
      draftFilterGroup: null,
      presets: [],
      validationErrors: [],
      showComplexityWarning: false,
    }
    logger.info('FilterBuilderStore reset to defaults')
  }

  // ====================================
  // COMPUTED VALUES
  // ====================================

  /**
   * Validation errors for the draft filter group
   * Returns an array of errors for incomplete or invalid conditions
   */
  @computed get validationErrors(): ValidationError[] {
    if (!this.filterBuilderState.draftFilterGroup) return []
    return validateFilterGroup(this.filterBuilderState.draftFilterGroup)
  }

  /**
   * Whether there are any validation errors in the draft filter
   */
  @computed get hasValidationErrors(): boolean {
    return this.validationErrors.length > 0
  }

  /**
   * Whether to show the complexity warning (10+ conditions)
   */
  @computed get showComplexityWarning(): boolean {
    if (!this.filterBuilderState.draftFilterGroup) return false
    return countConditions(this.filterBuilderState.draftFilterGroup) >= COMPLEXITY_WARNING_THRESHOLD
  }

  // ====================================
  // FILTER BUILDER ACTIONS
  // ====================================

  @action
  openFilterBuilder(): void {
    this.filterBuilderState.isOpen = true
    // Load presets from localStorage if needed
    logger.info('Filter builder opened')
  }

  @action
  closeFilterBuilder(): void {
    this.filterBuilderState.isOpen = false
    this.filterBuilderState.draftFilterGroup = null
    this.filterBuilderState.searchValue = ''
    this.filterBuilderState.validationErrors = []
    logger.info('Filter builder closed')
  }

  @action
  setDraftFilter(group: FilterGroup | null): void {
    this.filterBuilderState.draftFilterGroup = group
    logger.info('Draft filter set', { hasGroup: !!group })
  }

  @action
  loadPresets(presets: FilterPreset[]): void {
    this.filterBuilderState.presets = presets
    logger.info('Presets loaded', { count: presets.length })
  }

  @action
  savePreset(name: string): void {
    if (!this.filterBuilderState.draftFilterGroup) {
      logger.warn('Cannot save preset - no draft filter group')
      return
    }
    const preset = createPreset(name, this.filterBuilderState.draftFilterGroup)
    this.filterBuilderState.presets.push(preset)
    logger.info('Preset saved', { name, id: preset.id })
  }

  @action
  loadPreset(preset: FilterPreset): void {
    this.filterBuilderState.draftFilterGroup = preset.filterGroup
    logger.info('Preset loaded into draft', { name: preset.name, id: preset.id })
  }

  @action
  deletePreset(presetId: string): void {
    this.filterBuilderState.presets = this.filterBuilderState.presets.filter((p) => p.id !== presetId)
    logger.info('Preset deleted', { id: presetId })
  }
}
