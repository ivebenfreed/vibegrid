/**
 * User Reference Field Type Implementation
 *
 * Handles custom_user_reference and user_reference field types with async data loading,
 * user search, and proper relationship display. Integrates with RelationshipDataManager.
 */

import { getActiveOrganizationId } from '@/app/stores/global/OrganizationStore'
import { getLogger } from '@/shared/lib/logging'
import type { FieldTypeAffordance } from '../../../affordances/types'
import type { TableCoreStore } from '../../../stores/TableCoreStore'
import type {
  AsyncDataLoader,
  CellEditor,
  CellFormatter,
  CellRenderer,
  CellValidator,
  EnhancedColumn,
  RelationshipData,
  RelationshipOption,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

const logger = getLogger(
  'components/custom/vibegrid/field-types/implementations/relationship/UserReferenceFieldType.ts',
)

/**
 * User Data Loader for async relationship data
 */
export class UserDataLoader implements AsyncDataLoader {
  async loadRelationshipData(
    column: EnhancedColumn,
    rowIds: string[],
    _tableCore$: TableCoreStore,
  ): Promise<RelationshipData> {
    const orgId = this.getOrgId()

    try {
      const response = await fetch(
        `/api/dataforge/orgs/${orgId}/relationships/users?rowIds=${rowIds.join(',')}`,
      )

      if (!response.ok) {
        throw new Error(`Failed to load user data: ${response.status}`)
      }

      const result = (await response.json()) as { data?: RelationshipData }
      return result.data || {}
    } catch (error) {
      logger.error('Failed to load user relationship data', { error, column: column.id })
      throw error
    }
  }

  resolveDisplayValue(
    value: any,
    _column: EnhancedColumn,
    relationshipData: RelationshipData,
  ): string {
    if (value == null) return ''

    const userId = String(value)
    const userData = relationshipData.users?.[userId]

    if (userData) {
      // Priority: name > email > id
      return userData.name || userData.email || userData.id
    }

    return `User ${userId}`
  }

  async getSearchSuggestions(
    query: string,
    column: EnhancedColumn,
    limit: number = 10,
  ): Promise<RelationshipOption[]> {
    try {
      // Get members data from TableCoreStore (passed via tableCore$ parameter)
      const membersData =
        (column as any).tableCoreStore?.membersData || (column as any).tableCore$?.membersData

      if (!membersData || typeof membersData.get !== 'function') {
        logger.warn('No members data available in TableCoreStore')
        return []
      }

      // Convert Map to array and filter by query
      const allMembers = Array.from(membersData.entries() as Iterable<[any, any]>).map(
        ([userId, user]) => ({
          userId,
          user,
        }),
      )

      // Filter by query string
      const filtered = allMembers.filter(({ user }: { user: any }) => {
        const userName = user?.name || ''
        const userEmail = user?.email || ''
        const lowerQuery = query.toLowerCase()

        return (
          userName.toLowerCase().includes(lowerQuery) ||
          userEmail.toLowerCase().includes(lowerQuery)
        )
      })

      // Convert to RelationshipOption format
      const suggestions: RelationshipOption[] = filtered
        .slice(0, limit)
        .map(({ userId, user }: { userId: any; user: any }) => ({
          value: userId,
          label: user?.name || user?.email || userId,
          metadata: user,
        }))

      logger.debug('User search completed', {
        query,
        totalMembers: allMembers.length,
        filteredMembers: filtered.length,
        returnedUsers: suggestions.length,
      })

      return suggestions
    } catch (error) {
      logger.error('Failed to search users', { error, query })
      return []
    }
  }

  getCacheKey(column: EnhancedColumn, value: any): string {
    return `user_ref:${column.id}:${String(value)}`
  }

  invalidateCache(column: EnhancedColumn): void {
    // Implementation would clear relevant cache entries
    logger.debug('Invalidating user reference cache', { column: column.id })
  }

  private getOrgId(): string {
    return getActiveOrganizationId() || window.location.pathname.match(/\/org\/([^/]+)/)?.[1] || ''
  }
}

/**
 * User Reference Cell Renderer
 * 🚀 PERF: Removed MobX reactions - data should be pre-loaded in TableCoreStore
 */
export class UserReferenceRenderer implements CellRenderer {
  constructor(private dataLoader: UserDataLoader) {}

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    // Add affordance data attributes
    container.dataset.affordance = isEditable ? 'edit' : 'none'
    container.dataset.affordanceRole = 'badge'

    container.className = 'vibegridx-user-reference'
    container.style.cssText = 'max-width: 100%; min-width: 0; overflow: hidden;'

    if (!value) {
      if (!isEditable) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

    // Check for resolved display value from backend
    const resolvedFieldName = `${column.id}_resolved`
    const resolvedValue = rowData[resolvedFieldName]
    if (resolvedValue) {
      container.innerHTML = this.createUserBadgeFromName(resolvedValue)
      return container
    }

    // If value is already a display name (not a UUID), show it as a badge
    if (typeof value === 'string' && !value.match(/^[0-9a-f-]{36}$/i)) {
      container.innerHTML = this.createUserBadgeFromName(value)
      return container
    }

    const tableCoreStore = this.getTableCoreStore(column)
    if (!tableCoreStore) {
      logger.warn('UserReferenceRenderer: No tableCoreStore available on column', {
        columnId: column.id,
      })
      container.textContent = `User ${String(value).slice(-4)}`
      container.style.opacity = '0.6'
      container.style.fontStyle = 'italic'
      return container
    }

    // If it's a UUID, try to render immediately from membersData
    // 🚀 PERF: Removed debug logging and MobX reactions from hot path
    const tableCore$ = tableCoreStore
    const userId = value

    if (tableCore$?.membersData && typeof tableCore$.membersData.get === 'function') {
      const user = tableCore$.membersData.get(userId)
      if (user) {
        container.innerHTML = this.createUserBadge(user, userId)
        return container
      }
    }

    // Fallback: Show truncated ID if user not found (no reactions, no async)
    // User data should already be loaded by TableCoreStore
    container.textContent = `User ${userId.slice(-4)}`
    container.style.opacity = '0.6'
    container.style.fontStyle = 'italic'

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    element.className = 'vibegridx-user-reference'

    if (!value) {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      element.textContent = 'Loading...'
      element.style.opacity = '0.7'
      const tableCoreStore = this.getTableCoreStore(column)
      this.loadAndRenderUser(element, value, column, tableCoreStore)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return ['custom_user_reference', 'user_reference'].includes(type)
  }

  supportsAsyncData(): boolean {
    return true
  }

  async loadAsyncData(value: any, column: EnhancedColumn): Promise<any> {
    // This would integrate with the data loader
    return this.dataLoader.loadRelationshipData(column, [String(value)], {} as any)
  }

  private createUserBadge(userData: any, userId: string): string {
    const displayName = userData.name || userData.email || `User ${userId}`
    const initials = this.getInitials(userData.name || displayName)

    return this.createUserBadgeHTML(displayName, initials)
  }

  private createUserBadgeFromName(displayName: string): string {
    const initials = this.getInitials(displayName)
    return this.createUserBadgeHTML(displayName, initials)
  }

  private createUserBadgeHTML(displayName: string, initials: string): string {
    // Badge styling - cursor/hover controlled by affordance system
    return `
      <div class="vibegridx-user-badge" data-action="edit" title="${displayName}" style="
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
        background-color: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
        max-width: 100%;
        min-width: 0;
      ">
        <div class="vibegridx-user-avatar" style="
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background-color: #6366f1;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 600;
          flex-shrink: 0;
        ">${initials}</div>
        <span class="vibegridx-user-name" style="
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        ">${displayName}</span>
      </div>
    `
  }

  private getInitials(name: string): string {
    if (!name) return '?'

    const words = name.trim().split(/\s+/)
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase()
    }

    return words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
  }

  private async loadAndRenderUser(
    container: HTMLElement,
    userId: string,
    _column: EnhancedColumn,
    tableCoreStore?: TableCoreStore,
  ) {
    try {
      // ⚡ PERFORMANCE: Use setTimeout to defer lookup off the main thread
      await new Promise((resolve) => setTimeout(resolve, 0))

      const membersData = tableCoreStore?.membersData

      if (!membersData || typeof membersData.get !== 'function') {
        logger.warn('No members data available in TableCoreStore', { userId })
        container.textContent = `User ${userId.slice(-4)}`
        container.style.opacity = '0.6'
        container.style.fontStyle = 'italic'
        return
      }

      // Lookup user from members Map
      const user = membersData.get(userId)

      if (user) {
        container.innerHTML = this.createUserBadge(user, userId)
        container.style.opacity = '1'
      } else {
        // Fallback if user not found
        container.textContent = `User ${userId.slice(-4)}`
        container.style.opacity = '0.6'
        container.style.fontStyle = 'italic'
      }
    } catch (error) {
      logger.error('Failed to load user data', { error, userId })
      container.textContent = `User ${userId.slice(-4)}`
      container.className += ' vibegridx-user-reference-error'
      container.style.color = '#dc2626'
    }
  }

  private getTableCoreStore(column: EnhancedColumn): TableCoreStore | undefined {
    return (column as any).tableCoreStore || (column as any).tableCore$
  }
}

/**
 * User Reference Cell Editor - Uses ComboboxEditor with user data
 */
export class UserReferenceEditor implements CellEditor {
  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave
    // Create React ComboboxEditor with user options
    const container = document.createElement('div')
    container.className = 'vibegridx-user-editor-container'
    container.style.cssText = `
      width: 100%;
      height: 100%;
      position: relative;
    `

    // Load user options synchronously
    this.loadUserOptionsAndRender(container, value, column, onSave)

    this.currentElement = container
    return container
  }

  private async loadUserOptionsAndRender(
    container: HTMLElement,
    value: any,
    column: EnhancedColumn,
    onSave: (value: any) => void,
  ) {
    try {
      // Create simple input editor without React dependencies
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = 'Search users...'
      input.value = value || ''
      input.style.cssText = 'width:100%;height:100%;border:none;outline:none;padding:0 8px;'

      input.addEventListener('blur', () => onSave(input.value || null))
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSave(input.value || null)
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          input.blur()
        }
      })

      container.appendChild(input)
      setTimeout(() => input.focus(), 0)
    } catch (error) {
      logger.error('Failed to create user reference editor', { error, columnId: column.id })
      // Fallback to simple input
      const input = document.createElement('input')
      input.type = 'text'
      input.value = value || ''
      input.placeholder = 'Search users...'
      input.style.cssText = 'width:100%;height:100%;border:none;outline:none;padding:0 8px;'
      container.appendChild(input)
    }
  }

  getValue(element: HTMLElement): any {
    // For now, return the current value
    // In a full implementation, this would return the selected user ID
    const input = element.querySelector('input') as HTMLInputElement
    return input?.dataset.selectedUserId || null
  }

  setValue(element: HTMLElement, value: any): void {
    const input = element.querySelector('input') as HTMLInputElement
    if (input) {
      input.dataset.selectedUserId = value ? String(value) : ''
      input.value = value ? `User ${String(value).slice(-4)}` : ''
    }
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = []

    // Handle null/empty values
    if (value == null || value === '') {
      if (column.validation?.required) {
        errors.push(column.validation.messages?.required || `${column.name} is required`)
      }
      return { valid: errors.length === 0, errors, transformedValue: null }
    }

    // Basic user ID validation (should be a valid identifier)
    const userIdStr = String(value)
    if (userIdStr.trim() === '') {
      errors.push(`${column.name} must be a valid user ID`)
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: userIdStr,
    }
  }

  destroy(_element: HTMLElement): void {
    this.currentElement = null
    this.onSaveCallback = null
  }

  supportsInlineEditing(): boolean {
    return true
  }

  supportsModalEditing(): boolean {
    return true
  }

  requiresAsyncOptions(): boolean {
    return true
  }
}

/**
 * User Reference Cell Formatter
 */
export class UserReferenceFormatter implements CellFormatter {
  private dataLoader = new UserDataLoader()

  format(value: any, column: EnhancedColumn): string {
    return this.formatForDisplay(value, column)
  }

  parse(text: string, _column: EnhancedColumn): any {
    if (text.trim() === '') return null

    // For user references, we typically need the user ID
    // This would need integration with user search to resolve names to IDs
    return text.trim()
  }

  formatForDisplay(
    value: any,
    column: EnhancedColumn,
    relationshipData?: RelationshipData,
  ): string {
    if (relationshipData) {
      return this.dataLoader.resolveDisplayValue(value, column, relationshipData)
    }

    return value ? `User ${String(value).slice(-4)}` : ''
  }

  formatForExport(value: any, _column: EnhancedColumn): string {
    return value == null ? '' : String(value)
  }
}

/**
 * User Reference Cell Validator
 */
export class UserReferenceValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new UserReferenceEditor()
    return editor.validate(value, column)
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {}

    if (column.validation?.required) {
      constraints.required = true
    }

    constraints.relationshipType = 'user_reference'
    constraints.targetEntityType = 'User'

    return constraints
  }
}

/**
 * User Reference Field Type Definition
 */
export const UserReferenceFieldType: VibeGridFieldType = {
  type: 'custom_user_reference',
  category: 'relationship',
  renderer: new UserReferenceRenderer(new UserDataLoader()),
  editor: new UserReferenceEditor(),
  formatter: new UserReferenceFormatter(),
  validator: new UserReferenceValidator(),
  asyncDataLoader: new UserDataLoader(),

  relationshipConfig: {
    targetEntityType: 'User',
    cardinality: 'many-to-one',
    displayField: 'name',
    searchFields: ['name', 'email'],
    relationshipType: 'assigned_to',
  },

  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
    supportsValidation: true,
    supportsFormatting: true,
    requiresAsyncData: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, _rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🚀 Interaction policy
  interactionPolicy: {
    defaultAction: 'edit', // User reference fields open picker on click
    editTrigger: 'content-click', // Click badge to open picker (padding = selection only)
    blurPolicy: 'commit', // Save on blur
  },

  // 🎯 Affordance Group System
  affordance: {
    group: 'editable-badge',
    whenNotEditable: 'readonly-badge',
  } as FieldTypeAffordance,
}

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('custom_user_reference', UserReferenceFieldType)
fieldTypeRegistry.register('user_reference', UserReferenceFieldType)
