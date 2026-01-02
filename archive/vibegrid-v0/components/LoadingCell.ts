/**
 * Loading Cell Components
 *
 * Provides visual feedback when cells are waiting for dependencies
 * Different loading states for different cell types to maintain visual consistency
 */

import { log } from '@/logger'
import { Column } from '../types'
import { DependencyError } from '../types/cell-dependencies'

const fileLog = log('components/custom/vibegrid/components/LoadingCell.ts')

/**
 * Create a loading cell that matches the expected final cell appearance
 */
export function createLoadingCell(cellType: string, column: Column): HTMLElement {
  const loading = document.createElement('div')
  loading.className = `vibegrid-cell vibegrid-cell-loading vibegrid-cell-loading-${cellType}`
  loading.dataset.columnId = column.id
  loading.dataset.cellType = cellType
  loading.dataset.loadingState = 'true'

  // Set consistent cell styling
  loading.style.cssText = `
    flex: 0 0 ${column.width}px;
    height: 100%;
    padding: 0 12px;
    display: flex;
    align-items: center;
    font-size: 14px;
    border-right: 1px solid #f1f3f5;
    overflow: hidden;
    position: relative;
    cursor: default;
    background-color: #fafafa;
  `

  // Create loading content based on cell type
  const content = createLoadingContent(cellType, column)
  loading.appendChild(content)

  // Add tooltip
  loading.title = `Loading ${column.label || column.id}...`

  fileLog.debug('🔄 Created loading cell', {
    columnId: column.id,
    cellType,
    width: column.width,
  })

  return loading
}

/**
 * Create type-specific loading content
 */
function createLoadingContent(cellType: string, column: Column): HTMLElement {
  const container = document.createElement('div')
  container.className = 'loading-content'

  switch (cellType) {
    case 'relationship-single':
      container.innerHTML = createRelationshipSingleLoading()
      break

    case 'relationship-multi':
      container.innerHTML = createRelationshipMultiLoading()
      break

    case 'enum':
    case 'select':
      container.innerHTML = createEnumLoading()
      break

    case 'rollup_count':
    case 'rollup_sum':
    case 'rollup_average':
      container.innerHTML = createRollupNumberLoading()
      break

    case 'rollup_concat':
      container.innerHTML = createRollupTextLoading()
      break

    case 'computed_expression':
    case 'computed_formula':
      container.innerHTML = createComputedLoading()
      break

    case 'date':
      container.innerHTML = createDateLoading()
      break

    case 'number':
      container.innerHTML = createNumberLoading()
      break

    case 'boolean':
      container.innerHTML = createBooleanLoading()
      break

    default:
      container.innerHTML = createTextLoading()
      break
  }

  return container
}

/**
 * Loading states for different cell types
 */

function createRelationshipSingleLoading(): string {
  return `
    <div class="flex items-center gap-2" style="width: 100%;">
      <div class="loading-spinner-sm"></div>
      <div class="loading-badge-placeholder" style="
        background-color: #e5e7eb;
        border-radius: 6px;
        height: 20px;
        width: 80px;
        animation: pulse 2s infinite;
      "></div>
    </div>
  `
}

function createRelationshipMultiLoading(): string {
  return `
    <div class="flex items-center gap-2" style="width: 100%;">
      <div class="loading-spinner-sm"></div>
      <div class="flex gap-1">
        <div class="loading-badge-placeholder" style="
          background-color: #e5e7eb;
          border-radius: 4px;
          height: 18px;
          width: 60px;
          animation: pulse 2s infinite;
        "></div>
        <div class="loading-badge-placeholder" style="
          background-color: #e5e7eb;
          border-radius: 4px;
          height: 18px;
          width: 50px;
          animation: pulse 2s infinite;
          animation-delay: 0.2s;
        "></div>
      </div>
    </div>
  `
}

function createEnumLoading(): string {
  return `
    <div class="flex items-center gap-2">
      <div class="loading-spinner-sm"></div>
      <div class="loading-badge-placeholder" style="
        background-color: #e5e7eb;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        height: 24px;
        width: 70px;
        animation: pulse 2s infinite;
      "></div>
    </div>
  `
}

function createRollupNumberLoading(): string {
  return `
    <div class="flex items-center justify-end gap-2" style="width: 100%;">
      <div class="loading-text-placeholder" style="
        background-color: #e5e7eb;
        border-radius: 4px;
        height: 16px;
        width: 40px;
        animation: pulse 2s infinite;
      "></div>
      <div class="text-xs text-muted-foreground">📊</div>
    </div>
  `
}

function createRollupTextLoading(): string {
  return `
    <div class="flex items-center gap-2" style="width: 100%;">
      <div class="loading-text-placeholder" style="
        background-color: #e5e7eb;
        border-radius: 4px;
        height: 16px;
        width: 120px;
        animation: pulse 2s infinite;
      "></div>
      <div class="text-xs text-muted-foreground">📊</div>
    </div>
  `
}

function createComputedLoading(): string {
  return `
    <div class="flex items-center gap-2" style="width: 100%;">
      <div class="loading-spinner-sm"></div>
      <div class="loading-text-placeholder" style="
        background-color: #e5e7eb;
        border-radius: 4px;
        height: 16px;
        width: 60px;
        animation: pulse 2s infinite;
      "></div>
      <div class="text-xs text-muted-foreground">🧮</div>
    </div>
  `
}

function createDateLoading(): string {
  return `
    <div class="flex items-center gap-2">
      <div class="loading-spinner-sm"></div>
      <div class="loading-text-placeholder" style="
        background-color: #e5e7eb;
        border-radius: 4px;
        height: 16px;
        width: 90px;
        animation: pulse 2s infinite;
      "></div>
    </div>
  `
}

function createNumberLoading(): string {
  return `
    <div class="flex items-center justify-end gap-2" style="width: 100%;">
      <div class="loading-text-placeholder" style="
        background-color: #e5e7eb;
        border-radius: 4px;
        height: 16px;
        width: 50px;
        animation: pulse 2s infinite;
      "></div>
    </div>
  `
}

function createBooleanLoading(): string {
  return `
    <div class="flex items-center gap-2">
      <div class="loading-checkbox-placeholder" style="
        background-color: #e5e7eb;
        border: 1px solid #d1d5db;
        border-radius: 3px;
        height: 16px;
        width: 16px;
        animation: pulse 2s infinite;
      "></div>
    </div>
  `
}

function createTextLoading(): string {
  return `
    <div class="flex items-center gap-2">
      <div class="loading-spinner-sm"></div>
      <div class="loading-text-placeholder" style="
        background-color: #e5e7eb;
        border-radius: 4px;
        height: 16px;
        width: 100px;
        animation: pulse 2s infinite;
      "></div>
    </div>
  `
}

/**
 * Create an error cell for when loading fails
 */
export function createErrorCell(error: Error | DependencyError, column: Column): HTMLElement {
  const errorCell = document.createElement('div')
  errorCell.className = `vibegrid-cell vibegrid-cell-error`
  errorCell.dataset.columnId = column.id
  errorCell.dataset.errorState = 'true'

  // Set consistent cell styling with error indication
  errorCell.style.cssText = `
    flex: 0 0 ${column.width}px;
    height: 100%;
    padding: 0 12px;
    display: flex;
    align-items: center;
    font-size: 14px;
    border-right: 1px solid #f1f3f5;
    overflow: hidden;
    position: relative;
    cursor: default;
    background-color: #fef2f2;
  `

  // Create error content
  const errorContent = document.createElement('div')
  errorContent.className = 'error-content'
  errorContent.innerHTML = `
    <div class="flex items-center gap-2 text-red-600">
      <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
      <span class="text-xs truncate">Error</span>
    </div>
  `

  errorCell.appendChild(errorContent)

  // Set detailed error tooltip
  const errorMessage = 'message' in error ? error.message : error.message
  errorCell.title = `Error in ${column.label || column.id}: ${errorMessage}`

  fileLog.error('❌ Created error cell', {
    columnId: column.id,
    error: errorMessage,
  })

  return errorCell
}

/**
 * Create a timeout cell for when dependencies take too long
 */
export function createTimeoutCell(column: Column, timeoutMs: number): HTMLElement {
  const timeoutCell = document.createElement('div')
  timeoutCell.className = `vibegrid-cell vibegrid-cell-timeout`
  timeoutCell.dataset.columnId = column.id
  timeoutCell.dataset.timeoutState = 'true'

  // Set consistent cell styling with timeout indication
  timeoutCell.style.cssText = `
    flex: 0 0 ${column.width}px;
    height: 100%;
    padding: 0 12px;
    display: flex;
    align-items: center;
    font-size: 14px;
    border-right: 1px solid #f1f3f5;
    overflow: hidden;
    position: relative;
    cursor: default;
    background-color: #fffbeb;
  `

  // Create timeout content
  const timeoutContent = document.createElement('div')
  timeoutContent.className = 'timeout-content'
  timeoutContent.innerHTML = `
    <div class="flex items-center gap-2 text-amber-600">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span class="text-xs truncate">Timeout</span>
    </div>
  `

  timeoutCell.appendChild(timeoutContent)

  // Set timeout tooltip
  timeoutCell.title = `Loading timeout for ${column.label || column.id} (${timeoutMs}ms)`

  fileLog.warn('⏰ Created timeout cell', {
    columnId: column.id,
    timeoutMs,
  })

  return timeoutCell
}

/**
 * Check if an element is a loading cell
 */
export function isLoadingCell(element: Element): boolean {
  return (
    element.hasAttribute('data-loading-state') &&
    element.getAttribute('data-loading-state') === 'true'
  )
}

/**
 * Check if an element is an error cell
 */
export function isErrorCell(element: Element): boolean {
  return (
    element.hasAttribute('data-error-state') && element.getAttribute('data-error-state') === 'true'
  )
}

/**
 * Update loading cell progress (for long-running operations)
 */
export function updateLoadingProgress(
  loadingCell: HTMLElement,
  progress: { message?: string; percentage?: number },
): void {
  const spinner = loadingCell.querySelector('.loading-spinner-sm')

  if (progress.message) {
    const messageEl = loadingCell.querySelector('.loading-message')
    if (messageEl) {
      messageEl.textContent = progress.message
    }
  }

  if (progress.percentage !== undefined && spinner) {
    // Add progress ring around spinner
    spinner.style.background = `conic-gradient(#3b82f6 ${progress.percentage * 3.6}deg, #e5e7eb 0deg)`
  }
}

/**
 * Add CSS animations for loading states
 * Should be called once during app initialization
 */
export function injectLoadingCSS(): void {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .loading-spinner-sm {
      width: 14px;
      height: 14px;
      border: 2px solid #e5e7eb;
      border-top: 2px solid #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      flex-shrink: 0;
    }
    
    .loading-badge-placeholder,
    .loading-text-placeholder,
    .loading-checkbox-placeholder {
      animation: pulse 2s infinite;
    }
    
    .vibegrid-cell-loading {
      user-select: none;
      pointer-events: none;
    }
    
    .vibegrid-cell-error {
      cursor: help;
    }
    
    .vibegrid-cell-timeout {
      cursor: help;
    }
  `

  document.head.appendChild(style)

  fileLog.info('💄 Loading cell CSS injected')
}

// Auto-inject CSS when module loads
if (typeof document !== 'undefined') {
  // Only inject if not already present
  if (!document.querySelector('style[data-loading-cells]')) {
    const style = document.createElement('style')
    style.dataset.loadingCells = 'true'
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      .loading-spinner-sm {
        width: 14px;
        height: 14px;
        border: 2px solid #e5e7eb;
        border-top: 2px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        flex-shrink: 0;
      }
      
      .vibegrid-cell-loading {
        user-select: none;
        pointer-events: none;
      }
      
      .vibegrid-cell-error {
        cursor: help;
      }
      
      .vibegrid-cell-timeout {
        cursor: help;
      }
    `

    document.head.appendChild(style)
  }
}
