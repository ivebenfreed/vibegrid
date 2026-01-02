/**
 * CellFormatter - Centralized cell value formatting for VibeGrid
 * Handles formatting of different data types for display
 */

import { formatFieldForDisplay } from '@/server/dataforge/fields/display-formatters'

export class CellFormatter {
  /**
   * Format a cell value for display based on its type and column configuration
   */
  static formatCellValue(value: any, type?: string, column?: any): string {
    if (value === null || value === undefined) return ''

    // Use the DataForge formatter if type is provided
    if (type) {
      try {
        const formatted = formatFieldForDisplay(value, type, column)
        if (formatted !== null && formatted !== undefined) {
          return String(formatted)
        }
      } catch (error) {
        // Fall back to simple formatting if DataForge formatter fails
        console.warn('DataForge formatter failed, using fallback', error)
      }
    }

    // Fallback formatting based on type
    switch (type) {
      case 'boolean':
        return value ? 'True' : 'False'

      case 'date':
        if (value instanceof Date) {
          return value.toLocaleDateString()
        }
        return String(value)

      case 'datetime':
        if (value instanceof Date) {
          return value.toLocaleString()
        }
        return String(value)

      case 'number':
      case 'integer':
        return Number(value).toLocaleString()

      case 'float':
      case 'decimal':
        return Number(value).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })

      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: column?.currency || 'USD',
        }).format(Number(value))

      case 'percentage':
        return `${(Number(value) * 100).toFixed(2)}%`

      case 'email':
        return String(value).toLowerCase()

      case 'url':
        return String(value)

      case 'phone':
        return CellFormatter.formatPhoneNumber(String(value))

      case 'enum':
      case 'select':
        return String(value)

      case 'tags':
        if (Array.isArray(value)) {
          return value.join(', ')
        }
        return String(value)

      case 'json':
        if (typeof value === 'object') {
          return JSON.stringify(value, null, 2)
        }
        return String(value)

      default:
        return String(value)
    }
  }

  /**
   * Format phone number for display
   */
  private static formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '')

    // Format US phone numbers
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }

    // Return original if not a standard format
    return phone
  }

  /**
   * Get display text for empty values based on type
   */
  static getEmptyDisplayText(type?: string): string {
    switch (type) {
      case 'boolean':
        return 'Not set'
      case 'date':
      case 'datetime':
        return 'No date'
      case 'number':
      case 'integer':
      case 'float':
      case 'decimal':
      case 'currency':
        return '—'
      case 'tags':
        return 'No tags'
      case 'enum':
      case 'select':
        return 'Select...'
      default:
        return ''
    }
  }

  /**
   * Check if value should be displayed as empty
   */
  static isEmptyValue(value: any, type?: string): boolean {
    if (value === null || value === undefined) return true

    if (type === 'boolean') {
      return false // Booleans are never empty, they're either true or false
    }

    if (typeof value === 'string') {
      return value.trim() === ''
    }

    if (Array.isArray(value)) {
      return value.length === 0
    }

    if (type === 'number' || type === 'integer' || type === 'float' || type === 'decimal') {
      return isNaN(Number(value))
    }

    return false
  }

  /**
   * Format value for editing (raw format for input fields)
   */
  static formatForEdit(value: any, type?: string): string {
    if (value === null || value === undefined) return ''

    switch (type) {
      case 'boolean':
        return value ? 'true' : 'false'

      case 'date':
        if (value instanceof Date) {
          return value.toISOString().split('T')[0]
        }
        return String(value)

      case 'datetime':
        if (value instanceof Date) {
          return value.toISOString()
        }
        return String(value)

      case 'number':
      case 'integer':
      case 'float':
      case 'decimal':
      case 'currency':
      case 'percentage':
        return String(value)

      case 'tags':
        if (Array.isArray(value)) {
          return value.join(', ')
        }
        return String(value)

      case 'json':
        if (typeof value === 'object') {
          return JSON.stringify(value, null, 2)
        }
        return String(value)

      default:
        return String(value)
    }
  }

  /**
   * Parse edited value back to proper type
   */
  static parseEditedValue(value: string, type?: string): any {
    if (!value && value !== '0' && value !== 'false') return null

    switch (type) {
      case 'boolean':
        return value === 'true' || value === '1' || value === 'yes'

      case 'date':
      case 'datetime':
        return new Date(value)

      case 'number':
      case 'integer':
        return parseInt(value, 10)

      case 'float':
      case 'decimal':
      case 'currency':
      case 'percentage':
        return parseFloat(value)

      case 'tags':
        return value
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)

      case 'json':
        try {
          return JSON.parse(value)
        } catch {
          return value
        }

      default:
        return value
    }
  }
}
