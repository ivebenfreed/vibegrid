/**
 * Filter Storage Utilities
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * Phase 5: localStorage utilities for persisting filter presets.
 * Presets are stored per-table (org + entityType + tableId).
 */

import { getLogger } from '@/shared/lib/logging'
import type { FilterGroup, FilterPreset } from '../types/filter-types'

const logger = getLogger(['vibegrid', 'filter-storage'])

const STORAGE_KEY_PREFIX = 'vibegrid-filters'
const STORAGE_VERSION = 1
const MAX_PRESETS = 20

interface StoredPresets {
  version: number
  presets: FilterPreset[]
  lastModified: string
}

/**
 * Generate a storage key for a specific table's filter presets
 */
export function getStorageKey(orgId: string, entityType: string, tableId: string): string {
  return `${STORAGE_KEY_PREFIX}-${orgId}-${entityType}-${tableId}`
}

/**
 * Load filter presets from localStorage
 */
export function loadPresets(storageKey: string): FilterPreset[] {
  try {
    const data = localStorage.getItem(storageKey)
    if (!data) return []

    const parsed: StoredPresets = JSON.parse(data)

    // Version check for future migrations
    if (parsed.version !== STORAGE_VERSION) {
      // For now, just return empty array if version mismatch
      // Future: implement migration logic
      return []
    }

    return parsed.presets ?? []
  } catch (error) {
    // Log error but don't throw - localStorage may not be available
    logger.warn('Failed to load filter presets from localStorage', { error })
    return []
  }
}

/**
 * Save filter presets to localStorage
 */
export function savePresets(storageKey: string, presets: FilterPreset[]): void {
  try {
    const data: StoredPresets = {
      version: STORAGE_VERSION,
      presets: presets.slice(0, MAX_PRESETS), // Enforce max limit
      lastModified: new Date().toISOString(),
    }
    localStorage.setItem(storageKey, JSON.stringify(data))
  } catch (error) {
    // Log error but don't throw - localStorage may not be available or quota exceeded
    logger.warn('Failed to save filter presets to localStorage', { error })
  }
}

/**
 * Create a new filter preset from a filter group
 */
export function createPreset(name: string, filterGroup: FilterGroup): FilterPreset {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    filterGroup,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Check if maximum preset limit has been reached
 */
export function hasReachedMaxPresets(presets: FilterPreset[]): boolean {
  return presets.length >= MAX_PRESETS
}

/**
 * Get the maximum number of presets allowed
 */
export function getMaxPresets(): number {
  return MAX_PRESETS
}
