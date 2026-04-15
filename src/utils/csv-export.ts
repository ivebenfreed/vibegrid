/**
 * CSV Export Utility for VibeGrid
 *
 * Pure utility functions for exporting grid data to CSV format.
 * No side effects at import time.
 *
 * @see planning/specs/1551-csv-export-for-data-grid.md
 */

/** System columns excluded from all exports */
const SYSTEM_COLUMNS = ['selection', 'row-expand', 'row-number', 'row-actions', 'drag-handle']

/** UTF-8 BOM for Excel compatibility */
const UTF8_BOM = '\uFEFF'

/**
 * Derive the list of exportable columns from full column definitions and visibility state.
 * - Excludes system columns (SYSTEM_COLUMNS)
 * - Excludes hidden columns (columnVisibility[col.id] === false)
 */
export function getExportableColumns(
  allColumns: Array<{ id: string; name: string; cellType?: string; editor?: any }>,
  columnVisibility: Record<string, boolean>,
): Array<{ id: string; name: string; cellType?: string; editor?: any }> {
  return allColumns.filter((col) => {
    if (SYSTEM_COLUMNS.includes(col.id)) return false
    if (columnVisibility[col.id] === false) return false
    return true
  })
}

/**
 * Generate a sanitized export filename.
 * Pattern: {name}-export-{YYYY-MM-DD}.csv
 */
export function getExportFilename(entityType?: string): string {
  const name = entityType
    ? entityType
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : 'data'
  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${name || 'data'}-export-${yyyy}-${mm}-${dd}.csv`
}

/**
 * Format a raw cell value to a plain string for CSV export.
 * Handles all VibeGrid column types per the spec's type table.
 * Unknown/unrecognized types fall back to String(value).
 */
export function formatCellValue(
  value: unknown,
  column: { cellType?: string; editor?: { options?: Array<{ value: string; label: string }> } },
): string {
  if (value == null) return ''

  const cellType = column.cellType || ''

  switch (cellType) {
    // Text passthrough
    case 'text':
    case 'longtext':
    case 'textarea':
    case 'entity-name':
      return String(value)

    // Rich text — strip markdown/HTML
    case 'rich-text':
    case 'rich_text':
    case 'markdown':
      return stripMarkdown(String(value))

    // Numeric — raw string
    case 'number':
    case 'integer':
    case 'decimal':
    case 'percentage':
    case 'rating':
    case 'slider':
    case 'currency':
    case 'currency-abbreviated':
      return String(value)

    // Boolean
    case 'boolean':
      return String(Boolean(value)).toLowerCase()

    // Date — ISO 8601 date only
    case 'date':
    case 'expiration-date': {
      const s = String(value)
      // If already looks like a date string, extract the date portion
      if (s.length >= 10) return s.slice(0, 10)
      try {
        return new Date(value as any).toISOString().slice(0, 10)
      } catch {
        return s
      }
    }

    // Time — passthrough
    case 'time':
      return String(value)

    // Datetime/Timestamp — full ISO
    case 'datetime':
    case 'datetime-local':
    case 'timestamp':
    case 'timestamptz':
      try {
        return new Date(value as any).toISOString()
      } catch {
        return String(value)
      }

    // Single select — resolve label
    case 'select':
    case 'single-select':
    case 'status':
    case 'status_option':
    case 'priority_option':
    case 'category_option':
    case 'task_type_option':
    case 'discussion_type_option': {
      const options = column.editor?.options
      if (options) {
        const match = options.find((opt) => opt.value === value)
        if (match) return match.label
      }
      return String(value)
    }

    // Multi-select — comma-separated labels
    case 'multi-select':
    case 'select-multi':
    case 'badge-list': {
      const arr = Array.isArray(value) ? value : [value]
      const options = column.editor?.options
      return arr
        .map((v) => {
          if (options) {
            const match = options.find((opt) => opt.value === v)
            if (match) return match.label
          }
          return String(v)
        })
        .join(', ')
    }

    // Reference — use display value as-is
    case 'reference-select':
      return String(value)

    // Computed — raw string
    case 'rollup_count':
    case 'rollup_sum':
    case 'rollup_average':
    case 'rollup_concat':
    case 'computed_expression':
    case 'computed_formula':
      return String(value)

    // Color — hex passthrough
    case 'color':
      return String(value)

    // Misc — passthrough
    case 'email':
    case 'url':
    case 'phone':
      return String(value)

    // File/Image — filename or URL
    case 'file':
    case 'image':
      return String(value)

    // JSON — stringify
    case 'json':
      try {
        return typeof value === 'string' ? value : JSON.stringify(value)
      } catch {
        return String(value)
      }

    // Domain-specific — passthrough
    case 'additional-insured':
      return String(value)

    // Unknown/unrecognized — String(value) fallback
    default:
      return String(value)
  }
}

/**
 * Convert an array of grid rows and column definitions to a CSV string.
 * - Filters to type === 'data' rows only
 * - Prepends UTF-8 BOM for Excel compatibility
 * - Applies RFC 4180 escaping
 */
export function rowsToCSV(
  rows: Array<{ id: string; data: Record<string, unknown> | null; type: string }>,
  columns: Array<{
    id: string
    name: string
    cellType?: string
    editor?: { options?: Array<{ value: string; label: string }> }
  }>,
): string {
  const dataRows = rows.filter((row) => row.type === 'data')

  // Header row
  const header = columns.map((col) => escapeCSV(col.name)).join(',')

  // Data rows
  const body = dataRows.map((row) => {
    return columns
      .map((col) => {
        const value = row.data?.[col.id]
        const formatted = formatCellValue(value, col)
        return escapeCSV(formatted)
      })
      .join(',')
  })

  return UTF8_BOM + [header, ...body].join('\n')
}

/**
 * Trigger a browser file download for a CSV string.
 * Creates a Blob URL, clicks a hidden anchor, then revokes the URL.
 */
export function downloadCSV(csvString: string, filename: string): void {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}

/**
 * RFC 4180 CSV field escaping.
 * Wraps in double-quotes if value contains comma, newline, or double-quote.
 * Escapes embedded double-quotes as double-double-quote.
 */
function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Strip markdown syntax to plain text.
 * Handles: headings, bold, italic, code, links, HTML tags.
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Links [text](url) → text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // HTML tags
      .replace(/<[^>]+>/g, '')
      // Headings (# Heading)
      .replace(/^#{1,6}\s+/gm, '')
      // Bold/italic (*** ** * ___ __ _)
      .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
      // Inline code
      .replace(/`([^`]*)`/g, '$1')
      // Strikethrough
      .replace(/~~(.*?)~~/g, '$1')
      .trim()
  )
}
