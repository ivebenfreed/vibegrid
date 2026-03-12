import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { orpcClient } from '@/shared/data/orpc/client'

interface EntityPreviewCardProps {
  entityType: string
  entityId: string
  anchorRef: HTMLElement | null
  onClose: () => void
  onNavigate: (entityType: string, entityId: string) => void
}

interface FieldRow {
  label: string
  value: string
}

const SYSTEM_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'org_id',
  'created_by',
  'updated_by',
])

export function EntityPreviewCard({
  entityType,
  entityId,
  anchorRef,
  onClose,
  onNavigate,
}: EntityPreviewCardProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [entityName, setEntityName] = useState('')
  const [fields, setFields] = useState<FieldRow[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    setState('loading')
    try {
      const [dataRes, schemaRes] = await Promise.all([
        orpcClient.dataforge.data.get({
          entityName: entityType,
          recordId: entityId,
        }) as Promise<any>,
        orpcClient.dataforge.schema.getEntity({ entityName: entityType }) as Promise<any>,
      ])

      const record = dataRes?.data
      if (!record) {
        setEntityName('Record not found')
        setFields([])
        setState('loaded')
        return
      }

      // Use name or title as display name
      const displayName = record.name || record.title || `${entityType} ${entityId.slice(-4)}`
      setEntityName(String(displayName))

      // Get first 4 non-system fields from schema
      const schemaFields = schemaRes?.entity?.fields || []
      const visibleFields = schemaFields
        .filter((f: any) => !SYSTEM_FIELDS.has(f.name) && f.name !== 'name' && f.name !== 'title')
        .slice(0, 5)

      setFields(
        visibleFields.map((f: any) => ({
          label: f.display_name || f.name,
          value: record[f.name] != null ? String(record[f.name]) : '—',
        })),
      )
      setState('loaded')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load record')
      setState('error')
    }
  }, [entityType, entityId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Dismiss on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid the badge click itself closing the card
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Position calculation
  const getPosition = (): React.CSSProperties => {
    if (!anchorRef) return { top: 100, left: 100 }
    const rect = anchorRef.getBoundingClientRect()
    const cardHeight = 250
    const nearBottom = rect.bottom + cardHeight > window.innerHeight - 20

    return {
      position: 'fixed',
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
      top: nearBottom ? rect.top - cardHeight - 4 : rect.bottom + 4,
      zIndex: 9999,
    }
  }

  const iconLetter = entityType.charAt(0).toUpperCase()

  const card = (
    <div
      ref={cardRef}
      className="rounded-lg border border-border bg-card shadow-lg"
      style={{ ...getPosition(), width: 300 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-xs font-semibold text-white"
          style={{ backgroundColor: 'var(--entity-badge-icon-bg, #0ea5e9)' }}
        >
          {iconLetter}
        </div>
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {state === 'loading' ? <Skeleton className="h-4 w-32" /> : entityName}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close preview"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {state === 'loading' && (
          <>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-1/2" />
          </>
        )}
        {state === 'loaded' &&
          fields.map((f) => (
            <div key={f.label} className="flex gap-2 text-xs">
              <span className="w-24 flex-shrink-0 truncate text-muted-foreground">{f.label}</span>
              <span className="flex-1 truncate text-foreground">{f.value}</span>
            </div>
          ))}
        {state === 'error' && (
          <div className="py-2 text-center">
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>
              Retry
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      {state !== 'error' && (
        <div className="border-t border-border px-3 py-2">
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => onNavigate(entityType, entityId)}
          >
            Open full record ↗
          </Button>
        </div>
      )}
    </div>
  )

  return createPortal(card, document.body)
}
