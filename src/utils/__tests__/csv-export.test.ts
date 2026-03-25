/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCSV, formatCellValue, getExportableColumns, getExportFilename, rowsToCSV } from '../csv-export'

// =============================================
// formatCellValue
// =============================================

describe('formatCellValue', () => {
  it('returns "" for null', () => {
    expect(formatCellValue(null, { cellType: 'text' })).toBe('')
  })

  it('returns "" for undefined', () => {
    expect(formatCellValue(undefined, { cellType: 'text' })).toBe('')
  })

  // Text types
  it('text → raw string passthrough', () => {
    expect(formatCellValue('Project Alpha', { cellType: 'text' })).toBe('Project Alpha')
  })

  it('longtext → raw string passthrough', () => {
    expect(formatCellValue('Long text content', { cellType: 'longtext' })).toBe('Long text content')
  })

  it('textarea → raw string passthrough', () => {
    expect(formatCellValue('Multi\nline', { cellType: 'textarea' })).toBe('Multi\nline')
  })

  it('entity-name → raw string passthrough', () => {
    expect(formatCellValue('Some Entity', { cellType: 'entity-name' })).toBe('Some Entity')
  })

  // Rich text / markdown
  it('rich-text — strips **bold**', () => {
    expect(formatCellValue('**Bold heading**', { cellType: 'rich-text' })).toBe('Bold heading')
  })

  it('markdown — strips # Heading', () => {
    expect(formatCellValue('# Heading', { cellType: 'markdown' })).toBe('Heading')
  })

  it('rich-text — converts [link](url) to "link"', () => {
    expect(formatCellValue('[click here](https://example.com)', { cellType: 'rich-text' })).toBe('click here')
  })

  it('rich-text — strips inline code', () => {
    expect(formatCellValue('Use `code` here', { cellType: 'rich-text' })).toBe('Use code here')
  })

  // Number types
  it('number → numeric string', () => {
    expect(formatCellValue(42.5, { cellType: 'number' })).toBe('42.5')
  })

  it('integer → numeric string', () => {
    expect(formatCellValue(42, { cellType: 'integer' })).toBe('42')
  })

  it('decimal → numeric string', () => {
    expect(formatCellValue(3.14159, { cellType: 'decimal' })).toBe('3.14159')
  })

  it('percentage → numeric string (no % sign)', () => {
    expect(formatCellValue(42.5, { cellType: 'percentage' })).toBe('42.5')
  })

  it('rating → numeric string', () => {
    expect(formatCellValue(4, { cellType: 'rating' })).toBe('4')
  })

  it('slider → numeric string', () => {
    expect(formatCellValue(75, { cellType: 'slider' })).toBe('75')
  })

  // Currency
  it('currency → raw numeric string (no $ or commas)', () => {
    expect(formatCellValue(125000, { cellType: 'currency' })).toBe('125000')
  })

  it('currency-abbreviated → raw numeric string', () => {
    expect(formatCellValue(500000, { cellType: 'currency-abbreviated' })).toBe('500000')
  })

  // Boolean
  it('boolean true → "true"', () => {
    expect(formatCellValue(true, { cellType: 'boolean' })).toBe('true')
  })

  it('boolean false → "false"', () => {
    expect(formatCellValue(false, { cellType: 'boolean' })).toBe('false')
  })

  // Date
  it('date → ISO 8601 date only', () => {
    expect(formatCellValue('2026-02-26T14:30:00.000Z', { cellType: 'date' })).toBe('2026-02-26')
  })

  it('expiration-date → ISO 8601 date only', () => {
    expect(formatCellValue('2026-12-31', { cellType: 'expiration-date' })).toBe('2026-12-31')
  })

  // Time
  it('time → raw time string passthrough', () => {
    expect(formatCellValue('14:30:00', { cellType: 'time' })).toBe('14:30:00')
  })

  // Datetime / Timestamp
  it('datetime → ISO 8601 with time', () => {
    const result = formatCellValue('2026-02-26T14:30:00.000Z', { cellType: 'datetime' })
    expect(result).toBe('2026-02-26T14:30:00.000Z')
  })

  it('timestamp → ISO 8601 with time', () => {
    const result = formatCellValue('2026-02-26T14:30:00.000Z', { cellType: 'timestamp' })
    expect(result).toBe('2026-02-26T14:30:00.000Z')
  })

  it('timestamptz → ISO 8601 with time', () => {
    const result = formatCellValue('2026-02-26T14:30:00.000Z', { cellType: 'timestamptz' })
    expect(result).toBe('2026-02-26T14:30:00.000Z')
  })

  // Single select — resolve label
  it('select → resolves label via editor.options', () => {
    const col = {
      cellType: 'select' as const,
      editor: {
        options: [
          { value: 'in_progress', label: 'In Progress' },
          { value: 'done', label: 'Done' },
        ],
      },
    }
    expect(formatCellValue('in_progress', col)).toBe('In Progress')
  })

  it('status → resolves label', () => {
    const col = {
      cellType: 'status' as const,
      editor: {
        options: [
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ],
      },
    }
    expect(formatCellValue('open', col)).toBe('Open')
  })

  it('select with unknown value → falls back to raw value', () => {
    const col = {
      cellType: 'select' as const,
      editor: {
        options: [{ value: 'a', label: 'Alpha' }],
      },
    }
    expect(formatCellValue('unknown_val', col)).toBe('unknown_val')
  })

  it('select with no options → falls back to raw value', () => {
    expect(formatCellValue('some_value', { cellType: 'select' })).toBe('some_value')
  })

  // Multi-select
  it('multi-select array → comma-separated labels', () => {
    const col = {
      cellType: 'multi-select' as const,
      editor: {
        options: [
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
          { value: 'g', label: 'Gamma' },
        ],
      },
    }
    expect(formatCellValue(['a', 'b', 'g'], col)).toBe('Alpha, Beta, Gamma')
  })

  it('multi-select with missing options → falls back to raw values', () => {
    expect(formatCellValue(['x', 'y'], { cellType: 'multi-select' })).toBe('x, y')
  })

  // JSON
  it('json object → JSON.stringify output', () => {
    expect(formatCellValue({ key: 'val' }, { cellType: 'json' })).toBe('{"key":"val"}')
  })

  it('json string → passthrough', () => {
    expect(formatCellValue('{"already":"json"}', { cellType: 'json' })).toBe('{"already":"json"}')
  })

  // Color
  it('color → hex string passthrough', () => {
    expect(formatCellValue('#ff5733', { cellType: 'color' })).toBe('#ff5733')
  })

  // Misc
  it('email → passthrough', () => {
    expect(formatCellValue('user@example.com', { cellType: 'email' })).toBe('user@example.com')
  })

  it('url → passthrough', () => {
    expect(formatCellValue('https://example.com', { cellType: 'url' })).toBe('https://example.com')
  })

  // Unknown type → String(value) fallback
  it('unknown column type → String(value) fallback', () => {
    expect(formatCellValue(42, { cellType: 'some_future_type' })).toBe('42')
  })

  it('no cellType → String(value) fallback', () => {
    expect(formatCellValue('hello', {})).toBe('hello')
  })
})

// =============================================
// rowsToCSV
// =============================================

describe('rowsToCSV', () => {
  const columns = [
    { id: 'name', name: 'Name', cellType: 'text' },
    { id: 'age', name: 'Age', cellType: 'number' },
  ]

  it('header row uses column name field, not id', () => {
    const csv = rowsToCSV([], columns)
    // BOM + header
    expect(csv).toBe('\uFEFFName,Age')
  })

  it('prepends UTF-8 BOM', () => {
    const csv = rowsToCSV([], columns)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('skips rows with type !== "data"', () => {
    const rows = [
      { id: '1', type: 'data', data: { name: 'Alice', age: 30 } },
      { id: 'g1', type: 'group', data: { name: 'Group A', age: null } },
      { id: '2', type: 'data', data: { name: 'Bob', age: 25 } },
      { id: 's1', type: 'summary', data: { name: 'Total', age: 55 } },
    ]
    const csv = rowsToCSV(rows, columns)
    const lines = csv.split('\n')
    // BOM + header + 2 data lines
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('Alice,30')
    expect(lines[2]).toBe('Bob,25')
  })

  it('2 data + 1 group + 1 summary → 3 lines total', () => {
    const rows = [
      { id: '1', type: 'data', data: { name: 'A', age: 1 } },
      { id: '2', type: 'data', data: { name: 'B', age: 2 } },
      { id: 'g1', type: 'group', data: {} },
      { id: 's1', type: 'summary', data: {} },
    ]
    const csv = rowsToCSV(rows, columns)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3) // header + 2 data
  })

  it('also skips expanded-content rows', () => {
    const rows = [
      { id: '1', type: 'data', data: { name: 'A', age: 1 } },
      { id: 'ec1', type: 'expanded-content', data: null },
    ]
    const csv = rowsToCSV(rows as any, columns)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2) // header + 1 data
  })

  // CSV escaping
  it('plain value with no special chars is NOT quoted', () => {
    const rows = [{ id: '1', type: 'data', data: { name: 'simple text', age: 10 } }]
    const csv = rowsToCSV(rows, columns)
    expect(csv).toContain('simple text')
    expect(csv).not.toContain('"simple text"')
  })

  it('value with comma is quoted', () => {
    const rows = [{ id: '1', type: 'data', data: { name: 'hello, world', age: 10 } }]
    const csv = rowsToCSV(rows, columns)
    expect(csv).toContain('"hello, world"')
  })

  it('embedded double-quote is escaped', () => {
    const rows = [{ id: '1', type: 'data', data: { name: 'say "hi"', age: 10 } }]
    const csv = rowsToCSV(rows, columns)
    expect(csv).toContain('"say ""hi"""')
  })

  it('value with newline is quoted; newline preserved', () => {
    const rows = [{ id: '1', type: 'data', data: { name: 'line1\nline2', age: 10 } }]
    const csv = rowsToCSV(rows, columns)
    expect(csv).toContain('"line1\nline2"')
  })

  it('empty dataset → BOM + header only', () => {
    const csv = rowsToCSV([], columns)
    expect(csv).toBe('\uFEFFName,Age')
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })
})

// =============================================
// downloadCSV
// =============================================

describe('downloadCSV', () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>
  let mockClick: ReturnType<typeof vi.fn>
  let createdAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    mockRevokeObjectURL = vi.fn()
    mockClick = vi.fn()

    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL

    // Mock document.createElement for <a> tags
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const el = originalCreateElement('a')
        el.click = mockClick
        createdAnchor = el
        return el
      }
      return originalCreateElement(tag)
    })

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    createdAnchor = null
  })

  it('calls URL.createObjectURL with a Blob of type text/csv', () => {
    downloadCSV('data', 'test.csv')

    expect(mockCreateObjectURL).toHaveBeenCalledOnce()
    const blob = mockCreateObjectURL.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/csv;charset=utf-8;')
  })

  it('creates anchor with correct download attribute', () => {
    downloadCSV('data', 'my-export.csv')

    expect(createdAnchor).not.toBeNull()
    expect(createdAnchor!.download).toBe('my-export.csv')
    expect(createdAnchor!.href).toContain('blob:mock-url')
  })

  it('programmatically clicks the anchor', () => {
    downloadCSV('data', 'test.csv')
    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('calls URL.revokeObjectURL after click', () => {
    downloadCSV('data', 'test.csv')
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

// =============================================
// getExportableColumns
// =============================================

describe('getExportableColumns', () => {
  const allColumns = [
    { id: 'selection', name: 'Select', cellType: 'text' },
    { id: 'row-expand', name: 'Expand', cellType: 'text' },
    { id: 'row-number', name: '#', cellType: 'text' },
    { id: 'row-actions', name: 'Actions', cellType: 'text' },
    { id: 'drag-handle', name: 'Drag', cellType: 'text' },
    { id: 'name', name: 'Name', cellType: 'text' },
    { id: 'status', name: 'Status', cellType: 'select' },
    { id: 'age', name: 'Age', cellType: 'number' },
  ]

  it('excludes system columns', () => {
    const result = getExportableColumns(allColumns, {})
    const ids = result.map((c) => c.id)
    expect(ids).not.toContain('selection')
    expect(ids).not.toContain('row-expand')
    expect(ids).not.toContain('row-number')
    expect(ids).not.toContain('row-actions')
    expect(ids).not.toContain('drag-handle')
  })

  it('excludes hidden columns (visibility === false)', () => {
    const result = getExportableColumns(allColumns, { status: false })
    const ids = result.map((c) => c.id)
    expect(ids).not.toContain('status')
    expect(ids).toContain('name')
    expect(ids).toContain('age')
  })

  it('includes visible non-system columns with full metadata', () => {
    const result = getExportableColumns(allColumns, {})
    expect(result).toHaveLength(3) // name, status, age
    expect(result[0]).toEqual({ id: 'name', name: 'Name', cellType: 'text' })
  })
})

// =============================================
// getExportFilename
// =============================================

describe('getExportFilename', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-26T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('entityType="RFI" → "rfi-export-2026-02-26.csv"', () => {
    expect(getExportFilename('RFI')).toBe('rfi-export-2026-02-26.csv')
  })

  it('entityType=undefined → "data-export-2026-02-26.csv"', () => {
    expect(getExportFilename(undefined)).toBe('data-export-2026-02-26.csv')
  })

  it('entityType="GC File" → "gc-file-export-2026-02-26.csv" (sanitized)', () => {
    expect(getExportFilename('GC File')).toBe('gc-file-export-2026-02-26.csv')
  })

  it('entityType="" → "data-export-2026-02-26.csv" (empty fallback)', () => {
    expect(getExportFilename('')).toBe('data-export-2026-02-26.csv')
  })
})
