---
initiative: GH#2001-file-gallery-cell-type-vibegrid
type: project
issue_type: feature
status: approved
priority: medium
roadmap: null
owner: platform-engineering
github_issue: 2001
github_milestone: null
parent_epic: null
created: 2026-03-19
updated: 2026-03-19

# Implementation phases (used by `kata enter implementation`)
phases:
  - id: p1
    name: "Data Format + Cell Renderer"
    tasks:
      - "Define FileAttachment type and backward-compat parseFileAttachments() parser"
      - "Implement FileUploadGalleryCellRenderer (thumbnail gallery + upload affordance)"
      - "Register in SlotRegistry replacing fileCellRenderer for file_upload type"
      - "Unit tests for value parsing (string[], FileAttachment[], mixed, null)"
  - id: p2
    name: "Lightbox Viewer Dialog"
    tasks:
      - "Implement FileGalleryLightbox React component"
      - "Reuse PhotoPageViewer for image files"
      - "Reuse PdfViewer for PDF files"
      - "FileInfoCard + download button for other file types"
      - "Prev/next navigation between files"
      - "Wire lightbox open from cell click via React portal bridge"
  - id: p3
    name: "Upload Integration"
    tasks:
      - "FileUploadCellDialog — wraps FileUploadInput in Dialog"
      - "Write rich FileAttachment metadata (name, size, mime_type) on upload complete"
      - "Append new attachments to existing array via entity update API"
      - "Progress indicator (spinner) in cell during active upload"
  - id: p4
    name: "FormFieldRenderer + Data Migration"
    tasks:
      - "Update FileUploadInput in FormFieldRenderer to write FileAttachment[] format"
      - "Backward compat: string[] read still works, always writes FileAttachment[]"
      - "Migration script: backfill existing file_upload values from string[] to FileAttachment[]"
      - "CSV export: format() returns comma-separated filenames"
      - "Accessibility and loading-state polish"
---

# File/Gallery Cell Type for VibeGrid

> **Full-Stack Feature**: New `file_upload` cell renderer for VibeGrid displaying files as a thumbnail gallery, with lightbox viewer on click and hover-reveal upload affordance. Includes data format migration from bare R2 key strings to rich `FileAttachment` metadata objects.

---

## Problem Statement

**What problem are we solving?**

The current `file_upload` cell type in VibeGrid (`FileCellRenderer`) only handles a single-file object with `{url, name, size, type}` shape. In practice, `file_upload` fields across entity schemas store `string[]` (arrays of R2 keys) via the `FileUploadInput` form component in `FormFieldRenderer`. The grid cell renders nothing useful for these multi-file arrays — there is no thumbnail preview, no way to open the files from the grid, and no upload affordance. Users cannot interact with file attachments from the grid view at all.

**Why now?**

Entity schemas increasingly use `file_upload` fields (photos, COIs, documents). The entity review workflow (GH#1977) established the `PhotoPageViewer` and `PdfViewer` components that are now ready for reuse. The data format needs to be formalized before more schemas adopt `file_upload` fields with incompatible storage shapes.

---

## User Story

As a **platform user working in a VibeGrid table view**,
I want **to see file attachments as thumbnail previews directly in grid cells, click to open a full viewer, and upload new files from the cell itself**,
so that **I can manage file attachments without navigating away from the grid or opening individual entity detail pages**.

---

## Goals and Non-Goals

### Goals

- Display `file_upload` cells as a compact thumbnail gallery (images as rendered thumbs, other files as type icons), max 3 visible with `+N` overflow badge
- Clicking a populated cell opens a `FileGalleryLightbox` dialog — images via `PhotoPageViewer`, PDFs via `PdfViewer`, other files as a download card
- Clicking the upload affordance icon (hover-reveal) triggers an upload dialog reusing `FileUploadInput`
- Rich metadata format: `FileAttachment[]` with `{r2_key, name, size, mime_type}` stored alongside existing R2 keys
- Full backward compatibility: cells that still hold `string[]` of bare R2 keys continue to render correctly
- Migration path to backfill existing `file_upload` field data to `FileAttachment[]` format
- `FormFieldRenderer`'s `FileUploadInput` writes `FileAttachment[]` going forward

### Non-Goals (Out of Scope)

- Server-side thumbnail generation or R2 image transformations (MVP: CSS-sized inline images via `/api/files/view/{r2Key}`)
- Inline drag-reorder of files within the cell
- Per-cell file count limits (schema validation concern, not renderer concern)
- Video or audio preview in the lightbox (file info card + download only)
- Clipboard copy of file attachments
- Real-time sync of upload progress across tabs (EventBus integration deferred)
- Bulk file operations from cell (delete all, download all) — deferred to Phase 2

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| File fields usable from grid | 0% (no interaction) | 100% of file_upload columns render gallery + lightbox | Manual verify on entities with file_upload fields |
| Data format consistency | Mixed (string[], objects) | All new writes use FileAttachment[] | DB query on entity_records.data for file_upload fields |
| Backward compat regressions | N/A | Zero broken renders for existing string[] data | Automated tests: parseFileAttachments() with legacy input |

---

## Feature Behaviors

> All 4 layers (Core + UI/API/Data) present per behavior. Use "N/A" for non-applicable layers.

---

### B1: Thumbnail Gallery Cell Display

**Core:**
- **ID:** file-gallery-cell-display
- **Trigger:** VibeGrid renders a row containing a `file_upload` column with one or more attached files
- **Expected:** Cell shows up to 3 file thumbnails side-by-side. Image files (`mime_type` starts with `image/`) render as `<img>` tags sourced from `/api/files/view/{r2Key}` constrained to 28x28px with `object-fit:cover`. PDF and other file types render a file-type icon span with a short label. If more than 3 files exist, a `+N` overflow badge appears after the third. The cell has `aria-label="{column}: {N} file(s)"`.
- **Verify:** Navigate to entity list with file_upload field containing 4 files. Confirm 3 thumbs + "+1" badge in cell. `agent-browser snapshot -i -s "[data-testid='cell-{id}-{col}']"` — confirm aria-label includes file count.
- **Source:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — new `FileUploadGalleryCellRenderer` class, replaces `fileCellRenderer` for `file_upload` slot registration at line 2943

#### UI Layer

**States:** populated (1-3 thumbs), populated-overflow (3 thumbs + badge), empty-editable (upload icon), empty-readonly (blank), loading (spinner during upload), error (broken-image fallback icon)

Cell layout:
```
┌──────────────────────────────────────────┐
│  [img] [img] [img]  +2      [↑]          │
│  28px  28px  28px  badge   upload icon   │
└──────────────────────────────────────────┘
                             ↑ opacity:0 until hover
```

- Thumbnail images: `width:28px; height:28px; object-fit:cover; border-radius:3px`
- Non-image files: file-type icon at 20px (emoji or SVG determined by mime_type)
- Overflow badge: `bg-muted text-muted-foreground text-xs rounded px-1.5 py-0.5`
- Upload icon button: `opacity:0; pointer-events:none` normally; `opacity:1; pointer-events:auto` on cell hover
- Broken image: `onerror` replaces `<img>` with file-type icon — no browser default broken-image icon

#### API Layer

N/A — Cell rendering is DOM-only; file view URLs are constructed client-side as `/api/files/view/{r2Key}`

#### Data Layer

N/A — Reads from already-loaded entity field data in the grid row; no additional DB access

---

### B2: Legacy String Array Backward Compatibility

**Core:**
- **ID:** file-gallery-legacy-compat
- **Trigger:** VibeGrid renders a `file_upload` cell whose stored value is a `string[]` of bare R2 keys (legacy format written by the old `FileUploadInput`)
- **Expected:** Cell renders correctly. Each string element is treated as `{r2_key: value, name: extractNameFromKey(value), size: 0, mime_type: guessMimeTypeFromExtension(value)}`. Images (detected by extension: .jpg, .jpeg, .png, .gif, .webp, .heic) render as thumbs; others as generic file icon. Behavior identical to B1.
- **Verify:** Seed an entity_record with `file_upload: ["uploads/abc/photo.jpg", "uploads/def/report.pdf"]`. Confirm cell shows image thumb + PDF icon. Unit test: `parseFileAttachments(["uploads/abc/photo.jpg"])` returns `FileAttachment` with `mime_type: 'image/jpeg'`.
- **Source:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — `parseFileAttachments()` utility function

#### UI Layer

Identical rendering to B1 — user cannot distinguish legacy from new format by inspection.

#### API Layer

N/A

#### Data Layer

N/A — Read-only compatibility shim; data is not rewritten on render

---

### B3: Lightbox Viewer Opens on Cell Click

**Core:**
- **ID:** file-gallery-lightbox-open
- **Trigger:** User clicks on the thumbnail content area of a populated `file_upload` cell (not the upload icon button)
- **Expected:** A `Dialog` overlay opens (`FileGalleryLightbox`) showing the first file. Dialog header shows filename and count (`"photo.jpg — 1 of 4"`). Images render via `PhotoPageViewer` (with zoom controls 0.25-3x, Ctrl+scroll). PDFs render via `PdfViewer`. Other file types show a `FileInfoCard` (name, size, type label, download button linking to `/api/files/download/{r2Key}`). Prev/Next navigation buttons in the footer cycle through all attached files.
- **Verify:** Click a file_upload cell with 3 files. Confirm Dialog appears. Confirm `PhotoPageViewer` renders for an image file. Click Next — confirm second file displays. Press Escape — confirm dialog closes. Screenshot: `agent-browser screenshot /tmp/lightbox-open.png`.
- **Source:** `apps/web/src/features/file-gallery/components/FileGalleryLightbox.tsx` (new); `apps/web/src/features/entity-review/components/PhotoPageViewer.tsx` (reused); `apps/web/src/features/entity-review/components/PdfViewer.tsx` (reused)

#### UI Layer

**Component:** `FileGalleryLightbox` — `Dialog` containing navigation header + viewer area + footer

```
┌────────────────────────────────────────────────────────┐
│  photo.jpg — 1 of 4                              [✕]   │  ← DialogHeader
├────────────────────────────────────────────────────────┤
│                                                        │
│   [PhotoPageViewer / PdfViewer / FileInfoCard]         │  ← Viewer area (flex-1)
│                                                        │
├────────────────────────────────────────────────────────┤
│  [← Previous]                      [Next →]           │  ← DialogFooter navigation
└────────────────────────────────────────────────────────┘
```

FileInfoCard (non-image, non-PDF):
```
┌───────────────────────────────────┐
│  📊  report.xlsx                  │
│      Spreadsheet · 1.2 MB         │
│                                   │
│         [Download]                │
└───────────────────────────────────┘
```

**States:** loading (Skeleton while viewer mounts), loaded (viewer rendered), error (AlertCircle + filename + download fallback), single file (Prev/Next buttons hidden)

#### API Layer

N/A — Lightbox uses browser `<img src>` and existing `/api/files/view/{r2Key}` / `/api/files/download/{r2Key}` endpoints

#### Data Layer

N/A — No DB writes; reads R2 keys from already-loaded entity data

---

### B4: Hover-Reveal Upload Affordance

**Core:**
- **ID:** file-gallery-upload-affordance
- **Trigger:** User hovers over a `file_upload` cell in an editable column (whether populated or empty)
- **Expected:** An upload icon (`Upload` from lucide-react, 14px) appears at the right edge of the cell. The icon element is present at `opacity:0` at all times (ARIA-accessible, NOT `display:none` or `visibility:hidden` per vibegrid.md hiding pattern). On hover, opacity transitions to 1. Clicking the icon opens the upload dialog (B5). If column is not editable (`column.editable === false`), this element is never rendered.
- **Verify:** `agent-browser snapshot -i -s "[data-affordance='upload']"` — confirm button present in ARIA tree before hover. Hover cell, screenshot confirms icon visible. Confirm non-editable column has no upload button in ARIA tree.
- **Source:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — `FileUploadGalleryCellRenderer.render()` using `opacity:0; pointer-events:none` pattern

#### UI Layer

Upload icon markup within cell:
```html
<button
  class="vg-cell-upload-btn"
  style="opacity: 0; pointer-events: none;"
  data-affordance="upload"
  aria-label="Upload file"
>
  <!-- Upload SVG icon (lucide Upload, 14px) -->
</button>
```

CSS on `.vibegridx-cell:hover .vg-cell-upload-btn`:
```css
opacity: 1;
pointer-events: auto;
```

**States:** hidden (opacity:0), visible-on-hover (opacity:1), uploading (disabled, spinner replaces icon)

#### API Layer

N/A — Affordance triggers a React Dialog via DOM event dispatch

#### Data Layer

N/A

---

### B5: File Upload from Cell Dialog

**Core:**
- **ID:** file-gallery-upload-from-cell
- **Trigger:** User clicks the upload icon on a `file_upload` cell and selects or drops files in the resulting Dialog
- **Expected:** Upload Dialog opens with drag-and-drop drop zone. On file selection: (1) calls `orpcClient.workflows.upload.getPresignedUrls()` with file metadata, (2) PUTs each file to R2 presigned URL, (3) builds `FileAttachment[]` entries with `{r2_key, name, size, mime_type}` from presigned result + original File metadata, (4) calls entity update API to patch the `file_upload` field value (appending new attachments to existing array), (5) auto-closes dialog. Cell re-renders with new thumbnails added.
- **Verify:** Open upload dialog from empty cell. Select a JPEG and PDF. Confirm both thumbs appear in cell after upload. Query `entity_records.data` — confirm field value is `[{r2_key: "...", name: "photo.jpg", size: 102400, mime_type: "image/jpeg"}, ...]`.
- **Source:** `apps/web/src/features/file-gallery/components/FileUploadCellDialog.tsx` (new); upload flow mirrors existing `FileUploadInput.handleUpload()` in `FormFieldRenderer.tsx`

#### UI Layer

Upload dialog layout:
```
┌──────────────────────────────────────────┐
│  Add Files                          [✕]  │  ← DialogHeader
├──────────────────────────────────────────┤
│                                          │
│  [ Drop files here or click to upload  ] │  ← Drop zone (dashed border)
│                                          │
│  Uploading 1/2...                        │  ← Progress text (conditional)
│                                          │
│  ✓ photo.jpg  (1.2 MB)         [✕]      │  ← Uploaded files list
│  ✓ report.pdf (320 KB)         [✕]      │
│                                          │
├──────────────────────────────────────────┤
│                    [Cancel]  [Done]      │  ← DialogFooter
└──────────────────────────────────────────┘
```

**States:** idle (empty dropzone), dragging (border-primary bg-primary/5 highlight), uploading (progress text, disabled Done), staged (files listed), error (per-file error message in red)

#### API Layer

**Endpoint (existing):** `POST /api/orpc/workflows.upload.getPresignedUrls`
**Endpoint (existing):** `PUT /api/orpc/dataforge.entities.update` — patches field value with merged `FileAttachment[]`

#### Data Layer

**Table:** `entity_records`
**Operation:** UPDATE — `data` JSONB column, `file_upload` key patched with new `FileAttachment[]` (append, not replace)

---

### B6: Upload Progress Indicator in Cell

**Core:**
- **ID:** file-gallery-upload-progress
- **Trigger:** Files are actively uploading after the user submits the upload dialog
- **Expected:** Upload dialog remains open showing per-file progress text (`"Uploading 1/2..."`). The upload icon in the cell is replaced by a `Loader2` spinner (lucide, 14px, animate-spin) at `opacity:1`. Existing thumbnails remain visible in the cell during upload. Thumbnail count does not update until upload completes and entity data refreshes. On completion, dialog auto-closes and cell re-renders with new thumbnails.
- **Verify:** Mock a slow presigned URL response. Confirm spinner appears in cell during upload. Confirm dialog shows progress text. After mock completes, confirm spinner replaced by upload icon, new thumbs visible.
- **Source:** `apps/web/src/features/file-gallery/components/FileUploadCellDialog.tsx` — `isUploading` state propagated back to cell via callback

#### UI Layer

Cell during upload: upload `<button>` content replaced by `<Loader2>` spinner at same position, `opacity:1` (always visible during upload, not hover-gated).

#### API Layer

N/A

#### Data Layer

N/A

---

### B7: Empty Cell Upload Affordance

**Core:**
- **ID:** file-gallery-empty-cell
- **Trigger:** `file_upload` column has no value (null, empty array `[]`, or empty string) for a row, and the column is editable
- **Expected:** Cell shows the hover-reveal upload icon (same as B4 on populated cell). No "Edit ✏️" placeholder is shown (unlike text fields — `renderEmpty()` is NOT called for this renderer). If column is NOT editable, cell is entirely blank. Upload icon is always present at `opacity:0` in the ARIA tree for editable columns.
- **Verify:** Create entity with no files. Snapshot cell — confirm upload button in ARIA tree. Hover — confirm icon appears. Click — confirm upload dialog opens. Non-editable empty cell — confirm snapshot shows no upload button.
- **Source:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — `FileUploadGalleryCellRenderer.render()` empty branch (custom empty state, does NOT call `renderEmpty()`)

#### UI Layer

Empty editable cell:
```
┌────────────────────────────────────┐
│                           [↑]      │  ← Upload icon (opacity:0 until hover)
└────────────────────────────────────┘
```

Empty readonly cell:
```
┌────────────────────────────────────┐
│                                    │  ← Completely blank
└────────────────────────────────────┘
```

#### API Layer

N/A

#### Data Layer

N/A

---

### B8: CSV Export Format

**Core:**
- **ID:** file-gallery-csv-export
- **Trigger:** User exports the VibeGrid to CSV and a `file_upload` column is included
- **Expected:** CSV cell value is a comma-separated list of filenames: `"photo.jpg, report.pdf, scan.png"`. For legacy `string[]` format, filenames are derived from R2 key path using `extractNameFromKey()`. Empty cells export as empty string.
- **Verify:** Export CSV from entity list with file_upload column populated with 3 files. Open CSV — confirm filenames appear (not raw R2 keys). Empty file_upload cell exports as `""`.
- **Source:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — `FileUploadGalleryCellRenderer.format()` method

#### UI Layer

N/A — CSV export is a background download; no UI change

#### API Layer

N/A

#### Data Layer

N/A

---

### B9: FormFieldRenderer Writes Rich Metadata

**Core:**
- **ID:** form-field-renderer-rich-metadata
- **Trigger:** User uploads files via a DataForge entity form (create or edit) using the `FileUploadInput` component in `FormFieldRenderer`
- **Expected:** On upload completion, `fieldApi.handleChange()` is called with `FileAttachment[]` (not `string[]`). Each entry: `{r2_key: result.r2_key, name: file.name, size: file.size, mime_type: file.type || 'application/octet-stream'}`. Reading (from saved entity data) supports both `string[]` (legacy) and `FileAttachment[]` (new) via `parseFileAttachments()` integrated into the read path.
- **Verify:** Submit entity create form with file attachment. DB query: `pnpm bpd 'db SELECT data->>'"'"'photos'"'"' FROM entity_records WHERE id = '"'"'X'"'"''`. Confirm value is JSON array of objects with `r2_key`, `name`, `size`, `mime_type` keys.
- **Source:** `apps/web/src/shared/components/form-fields/FormFieldRenderer.tsx` — `FileUploadInput` component, `handleUpload()` function update

#### UI Layer

No visible change to `FileUploadInput` UI — change is in the written data format only.

#### API Layer

N/A — No API contract change; entity update API accepts generic JSONB for field values

#### Data Layer

**Table:** `entity_records`
**Operation:** UPDATE — `data` JSONB column; `file_upload` fields stored as `FileAttachment[]` JSON array instead of `string[]`

---

### B10: Backward-Compatible Data Migration

**Core:**
- **ID:** file-upload-data-migration
- **Trigger:** Migration script runs against existing `entity_records` rows that have `file_upload` fields stored as `string[]`
- **Expected:** For each row where any `file_upload` field value is a JSON array of plain strings, the migration derives `FileAttachment` metadata from the R2 key: `{r2_key: key, name: extractNameFromKey(key), size: 0, mime_type: guessMimeTypeFromExtension(key)}`. The row is updated in-place. Migration is idempotent — rows already in `FileAttachment[]` format are skipped (detected by checking if first array element is an object, not a string).
- **Verify:** Run migration script on test DB seeded with legacy data. Query updated rows — confirm no plain `string[]` values remain in `file_upload` fields. Run script again — confirm zero rows updated (idempotency).
- **Source:** `apps/dataforge/src/migrations/scripts/migrate-file-upload-fields.ts` (new)

#### UI Layer

N/A — Background migration, no UI impact during normal operation

#### API Layer

N/A

#### Data Layer

**Table:** `entity_records`
**Operation:** UPDATE (batch, 100 rows at a time) — scans rows where schema has `type: 'file_upload'` fields, rewrites plain string arrays to `FileAttachment[]`. Schema discovery from `entity_schemas` table. Logs: rows examined, rows updated, rows skipped.

---

## User Journey

| Step | Action | UI State | Notes |
|------|--------|----------|-------|
| **1. Grid View** | User opens entity list (e.g., `/projects`) with a "Photos" file_upload column | Grid renders thumbnail galleries inline | No navigation away from grid needed |
| **2. View Files** | User clicks a populated thumbnail cell area | `FileGalleryLightbox` Dialog opens, first file shown in viewer | PhotoPageViewer for images, PdfViewer for PDFs |
| **3. Navigate Files** | User clicks "Next" in lightbox footer | Second file content loads; header updates to `"filename — 2 of 4"` | Prev/Next buttons disabled at boundaries; hidden for single-file |
| **4. Close Lightbox** | User presses Escape or clicks X | Dialog closes, focus returns to grid cell | Standard Dialog dismiss; no click-outside (prevents accidental dismiss) |
| **5. Upload New File (from populated cell)** | User hovers populated cell, clicks upload icon (right edge) | Upload Dialog opens with FileUploadInput drop zone | Upload icon visible on hover via opacity transition |
| **6. Drop File** | User drags JPEG onto drop zone | Drop zone highlights with `border-primary bg-primary/5`; progress text appears | Existing thumbnails remain in cell during upload |
| **7. Upload Completes** | Upload finishes, entity record updated | Upload Dialog auto-closes; cell re-renders with new thumbnail appended | Entity data invalidated via TanStack DB collection |
| **8. Upload from Empty Cell** | User hovers empty file_upload cell, clicks upload icon | Upload Dialog opens directly (no lightbox step) | Same flow as steps 5-7 |

**Alternative Flows:**
- If R2 upload fails, dialog shows per-file error message; user can retry the failed file or close and try again
- If image fails to load in lightbox, `AlertCircle` error state shown with filename and download button fallback
- If column is not editable (`column.editable === false`), upload icon never appears; clicking populated cell still opens lightbox for viewing

---

## UI Layout (ASCII Wireframe)

### Design System Foundation

| Aspect | Decision | Location |
|--------|----------|----------|
| **Reference Page** | `features/entity-review/components/SourcePreviewPanel.tsx` | PhotoPageViewer + PdfViewer composition pattern |
| **Layout Component** | `Dialog` (Radix) for lightbox and upload overlay; inline DOM for cell thumbnails | `shared/components/ui/dialog.tsx` |
| **Data Display** | VibeGrid cell — DOM-rendered thumbnails via CellRenderer class | `systems/vibegrid/slots/slot-initialization.ts` |

### Reused Components

| Component | From | Usage |
|-----------|------|-------|
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogClose` | `shared/components/ui/dialog.tsx` | Lightbox container; upload dialog container |
| `PhotoPageViewer` | `features/entity-review/components/PhotoPageViewer.tsx` | Image viewer in lightbox |
| `PdfViewer` | `features/entity-review/components/PdfViewer.tsx` | PDF viewer in lightbox |
| `Button` | `shared/components/ui/button.tsx` | Prev/Next nav, Download, Cancel/Done |
| `Skeleton` | `shared/components/ui/skeleton.tsx` | Loading state in lightbox viewer area |
| `Upload`, `Loader2`, `AlertCircle`, `ChevronLeft`, `ChevronRight`, `Download`, `X`, `FileIcon` | `lucide-react` | Icons throughout |

**Custom Components (new, with justification):**
- `FileGalleryLightbox` — Composes PhotoPageViewer/PdfViewer/FileInfoCard with multi-file navigation state. No existing multi-file navigation shell.
- `FileUploadCellDialog` — Binds upload completion to entity field update via CommandBus context. FormFieldRenderer's `FileUploadInput` uses TanStack Form fieldApi binding which is incompatible with grid context.
- `FileInfoCard` — Sub-component within lightbox for non-image/PDF files (icon + metadata + download button).
- `FileUploadGalleryCellRenderer` — DOM class required by VibeGrid CellRenderer interface; cannot be a React component.

### Theme Tokens (MANDATORY)

| Use | Token | NOT |
|-----|-------|-----|
| Backgrounds | `bg-background`, `bg-card`, `bg-muted` | ~~`bg-white`~~, ~~`bg-gray-100`~~ |
| Text | `text-foreground`, `text-muted-foreground` | ~~`text-black`~~, ~~`text-gray-600`~~ |
| Borders | `border-border`, `border-input` | ~~`border-gray-200`~~, ~~`#e5e7eb`~~ |
| Primary | `bg-primary`, `text-primary-foreground` | ~~`bg-blue-500`~~, ~~`#3b82f6`~~ |
| Drag highlight | `border-primary bg-primary/5` | ~~`border-blue-400`~~ |
| Overflow badge | `bg-muted text-muted-foreground` | ~~`bg-gray-200`~~ |

### Main Cell States

```
Populated (3 files + overflow):
┌──────────────────────────────────────────────┐
│  [🖼️28px] [🖼️28px] [📄20px]  +2   [↑ 0%]  │
│   thumb1   thumb2   pdf-icon  badge  upload  │
└──────────────────────────────────────────────┘
                                        ↑ opacity:0 normally, 1 on hover

Empty, editable:
┌──────────────────────────────────────────────┐
│                                     [↑ 0%]  │
└──────────────────────────────────────────────┘

Empty, readonly:
┌──────────────────────────────────────────────┐
│                                              │
└──────────────────────────────────────────────┘
```

### Lightbox (Image File)

```
┌─────────────────────────────────────────────────────┐
│  photo.jpg — 2 of 4                           [✕]   │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐    │
│  │  [ZoomOut] 100% [ZoomIn] | [Reset] | [↗]    │    │  ← PhotoPageViewer toolbar
│  │─────────────────────────────────────────────│    │
│  │                                             │    │
│  │              [image content]                │    │
│  │                                      1/1   │    │  ← page badge
│  └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│  [← Previous]                        [Next →]       │
└─────────────────────────────────────────────────────┘
```

### Lightbox (Non-image, Non-PDF)

```
┌─────────────────────────────────────────────────────┐
│  report.xlsx — 3 of 4                         [✕]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│                   📊                               │
│              report.xlsx                           │
│           Spreadsheet · 1.2 MB                     │
│                                                     │
│                 [Download]                          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [← Previous]                        [Next →]       │
└─────────────────────────────────────────────────────┘
```

### Upload Dialog

```
┌──────────────────────────────────────────┐
│  Add Files                          [✕]  │
├──────────────────────────────────────────┤
│                                          │
│  ┌──────────────────────────────────┐    │
│  │   ↑                              │    │  ← Drop zone (dashed border)
│  │  Drop files here or click        │    │
│  └──────────────────────────────────┘    │
│                                          │
│  Uploading 1/2...                        │  ← Progress (conditional)
│                                          │
│  📄 photo.jpg (1.2 MB)           [✕]    │  ← Uploaded file list
│  📄 report.pdf (320 KB)          [✕]    │
│                                          │
├──────────────────────────────────────────┤
│                    [Cancel]  [Done]      │
└──────────────────────────────────────────┘
```

---

## Requirements Interview Summary

### Core Functionality

| Question | Answer | Rationale |
|----------|--------|-----------|
| What does the happy path look like? | User sees thumbnail gallery in cell, clicks to open lightbox, views files, closes | Inline visibility reduces friction vs. navigating to entity detail |
| What is the minimal viable cell interaction? | Thumbnail gallery (3 max) + lightbox viewer + upload icon | Covers view and create flows from grid |
| How are files stored? | `FileAttachment[]` with `{r2_key, name, size, mime_type}` | Rich metadata enables display without extra API calls per render |
| How is existing data handled? | `string[]` of R2 keys fully supported via `parseFileAttachments()` compat shim | Zero breaking changes to existing entity data |
| What is the scope? | General `file_upload` field type across all entity schemas | Platform primitive, not domain-specific |
| Role differences? | Upload affordance gated on `column.editable !== false`; view (lightbox) available to all who can see the row | `entities:write` permission controls editability; `entities:read` controls row visibility |

### Edge Cases

| Scenario | Handling | Rationale |
|----------|----------|-----------|
| Image fails to load (broken URL, R2 error) | `onerror` handler swaps `<img>` for file-type icon fallback | No broken browser image icons in grid cells |
| Empty array `[]` | Same as null — shows upload-icon affordance | Empty array and null are semantically identical for this field |
| Large file count (100+) | Cell shows max 3 + "+97 more" badge; lightbox shows all (scrollable) | Grid cell space is fixed; lightbox has no item limit |
| R2 key with no extension | `mime_type: 'application/octet-stream'` → generic file icon | Safe default for unknown file types |
| Upload fails midway | Per-file error message in upload dialog; already-uploaded files retained | Partial success is preserved |
| Non-editable column | Upload icon never rendered; lightbox still opens for populated cells | Read-only contexts still support viewing |
| Legacy `string[]` stored as JSON string (double-encoded) | `parseFileAttachments()` runs `JSON.parse()` on string values | Matches existing `FileUploadInput` read logic lines 599-607 |
| HEIC image | Extension detection returns `image/heic`; if `<img>` load fails (no browser support), fallback icon renders | Graceful degradation |
| Very long filename | Truncated with ellipsis in cell thumbs; full name in lightbox header | Cell space is constrained |

### Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | File attachment is an inline field edit; no workflow trigger required for MVP |
| Real-time sync | Not needed for MVP | Entity field update goes through existing `dataforge.entities.update` which already emits `entity.updated` via `emitTableChange`; TanStack DB collections invalidate automatically |
| Access Control | Reuse existing `entities:write` permission | Upload affordance gated on `column.editable !== false` which is already permission-derived; no new permission needed |
| Audit Logging | Not needed at cell level | Entity-level audit already captures field value changes via existing update path |
| Workflows | Not needed | No multi-step process required for file attachment |
| Settings/Preferences | Not needed | No per-user or per-org config for file gallery behavior |
| Feature Flags | `feature.file-gallery-cell` — default false | Isolates rollout; existing `FileCellRenderer` at `file` type slot is safe fallback |

### UX Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Cell click action | Opens lightbox Dialog | Grid cells cannot expand vertically; Dialog is the only viable rich view surface |
| Upload trigger | Hover-reveal icon separate from content click | Separates view (click content) from edit (click icon) — consistent with other editable cell affordance patterns |
| Thumbnail max count | 3 visible + overflow badge | Balances information density with typical column width of 180-200px |
| Empty cell affordance | Upload icon (not "Edit ✏️" pencil) | File fields semantically differ from text; upload icon conveys the correct action |
| Lightbox dismiss | Escape key or X button only | No click-outside dismiss (prevents accidental dismiss when reviewing files) |
| Lightbox navigation | Prev/Next buttons in footer | Arrow keys reserved for grid keyboard navigation; explicit buttons are unambiguous |
| Thumbnail size | 28x28px, `object-fit:cover` | Fits 3 thumbnails + badge in 200px cell with 4px gaps |
| Upload progress | Spinner in cell + progress text in dialog | Cell updates only when fully complete; no optimistic thumbnail to avoid confusion |
| Keyboard accessibility | Upload icon has `aria-label="Upload file"`; lightbox Dialog is focus-trapped | Meets WCAG 2.1 AA requirements |

### Frontend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Reference Page** | `features/entity-review/components/SourcePreviewPanel.tsx` | PhotoPageViewer + PdfViewer composition pattern to replicate |
| **Layout Component** | Dialog (Radix) for lightbox and upload overlay | Existing pattern, focus-managed, portal-rendered, keyboard accessible |
| **Reused Components** | PhotoPageViewer, PdfViewer, Dialog, Button, Skeleton | All exist and match requirements exactly |
| **Custom Components** | FileGalleryLightbox, FileUploadCellDialog, FileInfoCard, FileUploadGalleryCellRenderer | Each is either a new composition shell or a required DOM class |
| **Theme Tokens** | bg-background, text-muted-foreground, border-border, bg-primary/5 | No hardcoded colors |
| Component location | `src/features/file-gallery/components/` for React; `systems/vibegrid/slots/` for DOM renderer | Per vibegrid.md rules: cell renderer classes must live in slot-initialization.ts |
| Route | No new routes | Feature is entirely within existing grid/entity views |
| Store type | No new store | Upload state is local to FileUploadCellDialog; entity update invalidates via TanStack DB |
| State observable | `isUploading`, `currentIndex` (local React state in dialog components) | No cross-component state needed |
| Form handling | Direct presigned URL flow (no TanStack Form) | File upload is not a form field in this context; same pattern as existing working FileUploadInput |

### Backend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Worker | Web (React components, entity update) + Workflows (presigned URLs) | Follows existing upload flow exactly; no new worker work |
| Router | No new router — reuses `orpcClient.workflows.upload.getPresignedUrls` and `dataforge.entities.update` | Upload flow already implemented and working |
| Schema | No DataForge schema change — `file_upload` field type already defined | Only stored value format changes (string[] → FileAttachment[]) |
| Service | No new service — migration is a standalone runnable script | One-time data migration, not a persistent service |
| Transaction scope | Single UPDATE per entity for upload completion | Append-to-array JSONB patch operation |
| Middleware | Existing auth middleware on entity update endpoint | `entities:write` permission already required |

### Scope Boundaries

| Excluded | Reason |
|----------|--------|
| Server-side thumbnail generation | R2 image transformations require infrastructure work; CSS-sized inline images sufficient for MVP |
| Video/audio preview | Limited use case; download button covers the need |
| Drag-reorder within cell | Low priority; upload and view are the core flows |
| Per-cell file count limits | Schema validation concern, not renderer concern |
| Real-time upload progress across tabs | EventBus integration deferred; local progress state is adequate |
| Bulk file ops from cell (delete all, download all) | Phase 2 after adoption data collected |

---

## Blast Radius Analysis

### Code Impact

- **Direct change:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — `file_upload` slot registration at line 2943 changes from `fileCellRenderer` to new `fileUploadGalleryCellRenderer`. Existing `FileCellRenderer` class stays registered for the `file` type at line 2942.
- **Direct change:** `apps/web/src/shared/components/form-fields/FormFieldRenderer.tsx` — `FileUploadInput.handleUpload()` updated to write `FileAttachment[]`; read logic (`r2Keys` derivation) updated to also parse `FileAttachment[]` input (read `obj.r2_key`).
- **New files:** `apps/web/src/features/file-gallery/components/FileGalleryLightbox.tsx`, `FileUploadCellDialog.tsx`, `FileInfoCard.tsx`
- **New migration:** `apps/dataforge/src/migrations/scripts/migrate-file-upload-fields.ts`
- **New types:** `FileAttachment` interface added to `apps/web/src/shared/types/dataforge.ts`
- **Indirect:** Any domain-specific `file_upload` slot override at priority 50 continues to take priority over this priority-0 registration. No conflict.
- **Workers affected:** Web (slot-initialization.ts, React components), DataForge (migration script)

### Database Impact

| Change | Type | Migration | Existing Data |
|--------|------|-----------|---------------|
| `entity_records.data` — `file_upload` field values change shape | Non-breaking (additive, JSONB) | `migrate-file-upload-fields.ts` one-time backfill | Renderer handles both formats before and after migration |
| `feature_flag_definitions` — new row | Additive | SQL INSERT in migration | No impact on existing rows |

No new tables, no new columns, no constraint changes.

### API Impact

- **Breaking changes:** None — `dataforge.entities.update` accepts arbitrary JSONB for field values; no contract change
- **New endpoints:** None
- **Modified contracts:** None — existing presigned URL and entity update endpoints reused as-is

### Test Impact

- **Tests to update:** `apps/web/src/utils/__tests__/csv-export.test.ts` — add `FileAttachment[]` test case for `formatCellValue()` with `file_upload` type
- **New tests:** Unit tests for `parseFileAttachments()`, `extractNameFromKey()`, `guessMimeTypeFromExtension()`, `FileUploadGalleryCellRenderer.format()`, `FileGalleryLightbox` component (render, navigation, dismiss)
- **Test data requirements:** R2 key fixture strings with known extensions; mock `FileAttachment[]` arrays; entity fixture with legacy `string[]` file_upload value

### Performance Considerations

- **Query complexity:** None — no new queries; cell reads from existing row data
- **N+1 risks:** Thumbnail images: each thumbnail in a cell makes one HTTP GET to `/api/files/view/{r2Key}`. For a 100-row grid with 3 thumbnails each = up to 300 image requests on initial render. Browser caching mitigates repeat views (image URLs are deterministic per R2 key). Future: add IntersectionObserver lazy loading if performance data shows it's needed.
- **Caching implications:** No new cache invalidation needed. Image `src` URLs do not change for a given R2 key.
- **Bundle size:** `FileGalleryLightbox` imports `PhotoPageViewer` and `PdfViewer` — both already in the web bundle via the entity-review feature. No new large dependencies added.

### Security Review

- **Permission checks:** Upload affordance is only rendered when `column.editable !== false`. Column editability is derived from `entities:write` permission at grid initialization (existing behavior). No additional permission check needed in the cell renderer itself.
- **Data sensitivity:** File attachments may contain sensitive documents. The `/api/files/view/{r2Key}` endpoint must remain auth-gated (existing behavior). No change to file serving authentication.
- **Input validation:** `FileAttachment` written to entity_records uses the existing entity update validation pipeline. R2 keys are generated by the backend presigned URL service — no client-provided R2 key is trusted for upload destination.
- **MIME type handling:** Client-side mime type is used for display classification only. Actual content-type is determined at upload time from `File.type`. No server-side MIME validation change needed.

---

## Auxiliary Systems Integration

### Notifications

- **Needed?** No
- **Rationale:** File attachment is an inline field edit, not a workflow event. No notification required for MVP.

### Real-time Sync

- **Needed?** No (MVP)
- **Rationale:** The entity update triggered by file upload already emits `entity.updated` table change events via the existing `emitTableChange` pattern in the DataForge entity update path. TanStack DB collections that include the updated entity invalidate automatically.
- **Optimistic updates:** Not implemented for MVP — cell shows spinner until upload and entity update complete, then re-renders from confirmed server data.

### Access Control

- **New permissions needed?** No
- **Existing permission used:** `entities:write` controls `column.editable` flag
- **UI guards:** Upload icon conditional on `column.editable !== false`; lightbox view has no additional permission gate (if you can see the row, you can see its file attachments)

### Audit Logging

- **Needed?** No (at cell level)
- **Rationale:** Entity-level audit already captures field value changes via the existing entity update audit trail.

### Workflows Integration

- **Needed?** No
- **Rationale:** File attachment does not require a multi-step workflow process. Presigned URL generation + direct R2 PUT + entity update is a complete atomic operation.

### Settings/Preferences

- **Needed?** No
- **Rationale:** No per-user or per-org preferences affect file gallery behavior. Column visibility and width are controlled by existing VibeGrid column config.

### Feature Flags

- **Flag name:** `feature.file-gallery-cell`
- **Default:** `false`
- **Rollout plan:** `false` (all) → `true` for internal orgs (baseplane, widecorp) → `true` for all
- **Kill switch:** Disable flag → `file_upload` slot falls back to existing `FileCellRenderer` (preserved at `file` type slot registration)

```sql
INSERT INTO feature_flag_definitions (key, name, description, default_enabled, rollout_percentage)
VALUES (
  'feature.file-gallery-cell',
  'File Gallery Cell',
  'Enables thumbnail gallery + lightbox viewer for file_upload fields in VibeGrid',
  false,
  0
);
```

### Analytics/Metrics

- **Needed?** No for MVP
- **Future consideration:** Track lightbox opens per entity type; track upload completions from grid vs. form to evaluate cell-upload adoption

---

## Primitives Design

### Primitives Capability Audit

| Primitive | Applicable? | Usage | Gap? |
|-----------|-------------|-------|------|
| **DataForge** | Yes | `file_upload` field type already defined; entity update endpoint already exists | No gap |
| **Relationships** | No | File attachments are embedded field data, not related entities | N/A |
| **Workflows** | Partial | `workflows.upload.getPresignedUrls` reused as-is for R2 upload | No gap |
| **Templates** | No | No reusable template config needed for this feature | N/A |
| **CommandBus** | Yes | Entity update from cell upload dispatched via CommandBus (all mutations per vibegrid.md rule 1) | No gap |
| **EventBus** | No (MVP) | Entity update events handled by existing entity update path | No gap |

### Using Existing Primitives

| Primitive | Specific Usage |
|-----------|----------------|
| DataForge | `file_upload` field type: existing. Entity update: existing `dataforge.entities.update` procedure. |
| Workflows | `workflows.upload.getPresignedUrls`: existing presigned URL generator — identical call signature as FormFieldRenderer lines 620-627 |
| VibeGrid SlotRegistry | Register `FileUploadGalleryCellRenderer` at priority 0 for `file_upload` id (replaces current `fileCellRenderer` registration at slot-initialization.ts line 2943) |

### Custom Code Decisions

| Component | Why Custom? | Why Not Extend Primitive? |
|-----------|-------------|---------------------------|
| `FileUploadGalleryCellRenderer` | Must be an imperative DOM class (VibeGrid CellRenderer interface requires DOM `.render()` method) | SlotRegistry's CellRenderer interface is not a React component; cannot use React hooks |
| `FileGalleryLightbox` | Composes PhotoPageViewer + PdfViewer + FileInfoCard with navigation state; no existing multi-file navigation shell | PhotoPageViewer handles multi-image scroll but not multi-file-type navigation or Dialog wrapper with prev/next |
| `FileUploadCellDialog` | Binds upload completion to entity field update via CommandBus from grid context | FormFieldRenderer's FileUploadInput uses TanStack Form `fieldApi.handleChange()` binding which requires a form context not available in grid |

---

## Risks and Open Questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 300+ thumbnail requests on large grid initial render | Medium | Medium | All `<img>` elements use `loading="lazy"` (native browser lazy loading, zero-cost). Browser caching mitigates repeat visits. IntersectionObserver only if native lazy is insufficient. |
| React Portal rendering for lightbox conflicts with VibeGrid DOM structure | Low | High | Mount `FileGalleryEventBridge` component as a sibling to `ExpandedContentPortals` inside the VibeGrid React tree. Listens for `vibegrid:file-gallery-open` and `vibegrid:file-gallery-upload` custom events on the grid container element. |
| `parseFileAttachments()` silently accepts malformed data | Low | Low | Unit test with adversarial inputs; return safe defaults (name='Unknown', size=0) on parse failure |
| Migration script slow on large orgs with many file_upload records | Medium | Low | Batch updates (100 rows at a time); run as background task, not blocking deploy |
| Feature flag not wired to slot registration | Low | High | SlotRegistry registration must check feature flag at grid init; test flag-off path explicitly in Phase 1 verification |

### Open Questions

- [ ] Should `FileGalleryLightbox` support downloading all files as a ZIP? (Out of scope MVP — revisit after adoption data)
- [ ] Should the upload dialog allow removing existing files from the cell? (MVP: add-only from cell; deletion requires entity detail form)
- [ ] What minimum column width should `FileUploadGalleryCellRenderer` declare as a hint for VibeGrid column initialization to ensure 3 thumbs + badge always fit? (Recommend: 180px min-width)

### Dependencies

| Dependency | Owner | Status | Blocker? |
|------------|-------|--------|----------|
| `PhotoPageViewer` component (GH#1977) | entity-review feature | Merged to staging | No — already available |
| `PdfViewer` component (GH#1977) | entity-review feature | Merged to staging | No — already available |
| `workflows.upload.getPresignedUrls` API | Workflows worker | Deployed | No — in production |
| `feature_flag_definitions` table | Platform infra | Available | No — table exists |
| `dataforge.entities.update` endpoint | DataForge worker | Deployed | No — in production |

---

## Design

### Overview

`FileUploadGalleryCellRenderer` is a new DOM-only CellRenderer class in `slot-initialization.ts` that replaces the current `FileCellRenderer` for the `file_upload` field type. It renders a thumbnail gallery inline using `parseFileAttachments(value)` to normalize the stored value (supporting both legacy `string[]` and new `FileAttachment[]`). Image thumbnails are `<img>` elements sourced from `/api/files/view/{r2Key}`. Non-image files are type-icon spans. An upload affordance button sits at `opacity:0` until cell hover, following the vibegrid.md hiding pattern precisely.

Cell thumbnail clicks dispatch a custom DOM event caught by a React component at the grid root (following the `ExpandedContentPortals` portal bridge pattern) which opens `FileGalleryLightbox`. Upload icon clicks dispatch a separate custom event opening `FileUploadCellDialog`.

`FileGalleryLightbox` wraps `PhotoPageViewer` (images), `PdfViewer` (PDFs), and `FileInfoCard` (other) in a Dialog with index-based navigation state. `FileUploadCellDialog` uses the same presigned URL flow as `FileUploadInput` and on completion calls `dataforge.entities.update` to append `FileAttachment[]` entries to the field value.

The `FormFieldRenderer` change is additive: `handleUpload()` now builds full `FileAttachment` objects instead of bare `string[]`, while the read path (`r2Keys` derivation) is updated to accept both formats.

### Architecture

```
VibeGrid cell DOM
│
├── FileUploadGalleryCellRenderer.render()
│   ├── parseFileAttachments(value) → FileAttachment[]
│   ├── thumbnail <img> elements (max 3, 28x28px, object-fit:cover)
│   ├── overflow badge "+N" (if >3 files)
│   └── upload <button> (opacity:0, data-affordance="upload")
│
├── [thumbnail area click] → CustomEvent("vibegrid:file-gallery-open", {files, initialIndex})
│   └── FileGalleryLightbox (Dialog, portal at grid root)
│       ├── currentIndex: number (state)
│       ├── [image mime_type]  → PhotoPageViewer({r2Keys: [files[i].r2_key]})
│       ├── [pdf mime_type]    → PdfViewer({r2Key: files[i].r2_key})
│       └── [other]            → FileInfoCard({file: files[i]}) + Download button
│
└── [upload button click] → CustomEvent("vibegrid:file-gallery-upload", {entityId, fieldName, existingFiles})
    └── FileUploadCellDialog (Dialog, portal at grid root)
        ├── drag-and-drop drop zone
        ├── orpcClient.workflows.upload.getPresignedUrls({files: [...]})
        ├── PUT to R2 presigned URL (per file)
        ├── build FileAttachment[] from presigned result + File metadata
        └── orpcClient.dataforge.entities.update({id, data: {[fieldName]: [...existing, ...new]}})
```

### Key Interfaces

```typescript
// Canonical file attachment type — new, added to shared/types/dataforge.ts
interface FileAttachment {
  r2_key: string
  name: string
  size: number          // bytes; 0 if unknown (legacy migration backfill)
  mime_type: string     // 'image/jpeg', 'application/pdf', 'application/octet-stream', etc.
  uploaded_at?: string  // ISO 8601 timestamp; useful for chronological sort in lightbox
}

// Utility: normalize any file_upload field value to FileAttachment[]
// Handles: null | undefined | string[] | FileAttachment[] | mixed | JSON string
function parseFileAttachments(value: unknown): FileAttachment[]

// Helper: derive display name from R2 key path
// "uploads/orgId/uuid-photo.jpg" → "photo.jpg"
function extractNameFromKey(r2Key: string): string

// Helper: guess mime type from file extension
// ".jpg" → "image/jpeg", ".pdf" → "application/pdf", unknown → "application/octet-stream"
function guessMimeTypeFromExtension(nameOrKey: string): string

// Cell renderer class (DOM, registered in slot-initialization.ts)
class FileUploadGalleryCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement
  format(value: unknown, column: Column, context: CellRendererContext): string
  affordances: { sortable: false, filterable: false, editable: false, resizable: true, reorderable: true, groupable: false }
  interactionPolicy: { defaultAction: 'custom', editTrigger: 'none', blurPolicy: 'commit' }
  metadata: { category: 'basic', description: 'File upload gallery cell renderer' }
}

// React components
interface FileGalleryLightboxProps {
  files: FileAttachment[]
  initialIndex?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FileUploadCellDialogProps {
  entityId: string
  fieldName: string
  existingFiles: FileAttachment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploadComplete: (newFiles: FileAttachment[]) => void
}

interface FileInfoCardProps {
  file: FileAttachment
}
```

### Data Model Changes

| Table/Entity | Change | Notes |
|--------------|--------|-------|
| `entity_records.data` | `file_upload` field values transition from `string[]` to `FileAttachment[]` JSON | No schema column change; JSONB accepts both; renderer handles both |
| `feature_flag_definitions` | New row: `feature.file-gallery-cell` | Standard feature flag insert migration |

---

## Implementation

### Phase 0: Baseline Verification (BLOCKING)

| Check | How to Verify |
|-------|---------------|
| Existing file_upload cells render without console errors | Navigate to entity list with file_upload field; open browser DevTools |
| `FileCellRenderer` handles null value gracefully | Check entity with empty file_upload field — no crash |
| `PhotoPageViewer` renders correctly | Open entity review panel for record with photos |
| `PdfViewer` renders correctly | Open entity review panel for record with PDF |
| Presigned URL API responds | `pnpm bpd 'auth ceo \| orpc /workflows/upload/getPresignedUrls'` |
| TypeScript compiles | `pnpm typecheck` exits 0 |

**If any check fails:** STOP. File a bug. Fix baseline first.

---

### Phase 1: Data Format + Cell Renderer

**Files changed:**
- `apps/web/src/shared/types/dataforge.ts` — add `FileAttachment` interface
- `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — add `parseFileAttachments()`, `extractNameFromKey()`, `guessMimeTypeFromExtension()` helpers; add `FileUploadGalleryCellRenderer` class; update `file_upload` slot registration
- `apps/web/src/systems/vibegrid/slots/__tests__/file-upload-cell-renderer.test.ts` — new unit tests

**Tasks:**
1. Add `FileAttachment` interface to `shared/types/dataforge.ts`
2. Add `extractNameFromKey(r2Key: string): string` — strips UUID prefix, extracts basename from path
3. Add `guessMimeTypeFromExtension(name: string): string` — maps .jpg/.jpeg → image/jpeg, .png → image/png, .gif → image/gif, .webp → image/webp, .heic → image/heic, .pdf → application/pdf, .doc/.docx → application/msword, .xls/.xlsx → application/vnd.ms-excel, others → application/octet-stream
4. Add `parseFileAttachments(value: unknown): FileAttachment[]` — handles null/undefined (return []), string[] (map each to FileAttachment), FileAttachment[] (return as-is), mixed array (handle each element type), JSON string (JSON.parse then recurse)
5. Implement `FileUploadGalleryCellRenderer` class:
   - `render()`: call `parseFileAttachments(value)`, render up to 3 thumbnail elements + overflow badge + upload button. For each attachment: image mime_type → `<img src="/api/files/view/${r2_key}">` with `onerror` fallback to type icon; other → type icon span. Upload button: `<button class="vg-cell-upload-btn" style="opacity:0;pointer-events:none" data-affordance="upload" aria-label="Upload file">`. Attach click listeners dispatching custom DOM events.
   - `format()`: `parseFileAttachments(value).map(f => f.name).join(', ')`
   - Empty editable: render only the upload button (no `renderEmpty()` call)
   - Empty readonly: return empty div
6. Feature-flag-gated registration in `registerDefaultSlots()`:
   ```typescript
   // --- 11. File ---
   registry.register({ id: 'file', priority: 0, renderer: () => fileCellRenderer })
   // file_upload: gallery renderer at priority 1 (wins over fallback at priority 0)
   // Feature flag check inside the renderer factory — returns gallery if enabled, legacy if not.
   // This works because SlotRegistry calls the factory at resolve() time (per-render), not at register() time.
   registry.register({
     id: 'file_upload',
     priority: 1,
     renderer: () => {
       // featureFlagStore is a global MobX singleton accessible at module scope
       const isEnabled = featureFlagStore.isEnabled('feature.file-gallery-cell')
       return isEnabled ? fileUploadGalleryCellRenderer : fileCellRenderer
     },
   })
   ```
   The `featureFlagStore` is the existing global feature flag store (MobX singleton loaded at app init).
   The factory runs at `resolve()` time so flag changes take effect on next grid render without re-registration.
7. **Rollback safety:** Update `FileCellRenderer.parseFileValue()` to handle arrays — if `Array.isArray(value)`, render first element's name with "(+N)" count. This ensures feature-flag-off fallback shows readable output after data migration.
8. Write unit tests for `parseFileAttachments()`, `extractNameFromKey()`, `guessMimeTypeFromExtension()`, `FileUploadGalleryCellRenderer.format()`, and `FileCellRenderer` array handling

**Verification:**
- `pnpm typecheck` passes
- Unit tests pass: `turbo test --filter=@baseplane/web -- --testPathPattern=file-upload-cell-renderer`
- Navigate to entity list with file_upload field: populated cells render thumbnail(s); empty editable cells render upload icon in ARIA tree
- `agent-browser snapshot -i -s "[data-affordance='upload']"` shows upload button elements

---

### Phase 2: Lightbox Viewer Dialog

**Files changed:**
- `apps/web/src/features/file-gallery/components/FileGalleryLightbox.tsx` — new
- `apps/web/src/features/file-gallery/components/FileInfoCard.tsx` — new
- `apps/web/src/features/file-gallery/index.ts` — barrel export
- `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — cell click event dispatch in `FileUploadGalleryCellRenderer.render()`
- VibeGrid React tree or overlay component — add listener for `vibegrid:file-gallery-open` custom event, manage Dialog open state

**Tasks:**
1. Create `FileInfoCard` component: file-type icon (emoji keyed by mime_type prefix), filename, formatted file size (same `formatFileSize()` logic as existing `FileCellRenderer`), mime type label, Download `<a>` button
2. Create `FileGalleryLightbox` component:
   - State: `currentIndex` (default `initialIndex ?? 0`)
   - Viewer selection: `if (file.mime_type.startsWith('image/')) → PhotoPageViewer; if (file.mime_type.includes('pdf')) → PdfViewer; else → FileInfoCard`
   - PhotoPageViewer: `r2Keys={[files[currentIndex].r2_key]}` (single-file scroll view)
   - Dialog header: `{files[currentIndex].name} — {currentIndex+1} of {files.length}`
   - Footer: Previous button (`disabled={currentIndex === 0}`, `hidden={files.length === 1}`), Next button (`disabled={currentIndex === files.length - 1}`, `hidden={files.length === 1}`)
3. Wire cell thumbnail click → lightbox:
   - In `FileUploadGalleryCellRenderer.render()`: thumbnail area `onclick` dispatches `new CustomEvent('vibegrid:file-gallery-open', { detail: { files, initialIndex: 0 }, bubbles: true })`
   - At grid root (or in a new `FileGalleryOverlay` component mounted alongside VibeGrid): listen for `vibegrid:file-gallery-open`, extract `detail`, set state to open `FileGalleryLightbox`
4. Add CSS `.vg-cell-upload-btn` hover rule (either inline in renderer or in a grid stylesheet)

**Verification:**
- Click populated file_upload cell → lightbox opens
- PhotoPageViewer zoom controls functional in lightbox (Ctrl+scroll, toolbar buttons)
- Prev/Next navigation cycles through all files correctly
- Escape key closes lightbox
- `agent-browser screenshot /tmp/lightbox-open.png` — capture visual evidence

---

### Phase 3: Upload Integration

**Files changed:**
- `apps/web/src/features/file-gallery/components/FileUploadCellDialog.tsx` — new
- `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — upload button click event dispatch
- VibeGrid overlay — add listener for `vibegrid:file-gallery-upload` event

**Tasks:**
1. Create `FileUploadCellDialog` component:
   - Props: `entityId, fieldName, existingFiles, open, onOpenChange, onUploadComplete`
   - State: `isUploading, uploadProgress (string), isDragging`
   - Drop zone implementation: `onDragEnter/Leave/Over/Drop` + `onClick → fileInputRef.current.click()` (same pattern as FormFieldRenderer lines 679-703)
   - `handleUpload(files: File[])`:
     1. `orpcClient.workflows.upload.getPresignedUrls({ entity_schema_id: '_grid_upload', files: files.map(f => ({file_name: f.name, file_size: f.size, mime_type: f.type})) })`
     2. For each presigned result: `fetch(presigned_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })`
     3. Build `FileAttachment[]`: `{r2_key: result.r2_key, name: file.name, size: file.size, mime_type: file.type || 'application/octet-stream'}`
     4. `orpcClient.dataforge.entities.update({ id: entityId, data: { [fieldName]: [...existingFiles, ...newAttachments] } })`
     5. Call `onUploadComplete(newAttachments)`
   - Done button: closes dialog, calls `onUploadComplete` with staged uploads
2. Wire upload button click in `FileUploadGalleryCellRenderer`:
   - Upload `<button>` onclick dispatches `new CustomEvent('vibegrid:file-gallery-upload', { detail: { entityId, fieldName, existingFiles }, bubbles: true })`
   - Overlay listener opens `FileUploadCellDialog`
3. Upload progress in cell: upload button replaced by spinner during active upload (simple: overlay component tracks uploading state, re-dispatches state-change event back to cell or uses MobX-observable approach)

**Verification:**
- Click upload icon on empty cell → dialog opens with drop zone
- Drag a JPEG → progress text appears → dialog closes → image thumbnail appears in cell
- Click upload icon on populated cell → dialog opens → add file → cell gains new thumbnail
- DB query confirms `FileAttachment[]` format: `pnpm bpd 'db SELECT data FROM entity_records WHERE id = '"'"'TEST_ID'"'"''`

---

### Phase 4: FormFieldRenderer + Data Migration

**Files changed:**
- `apps/web/src/shared/components/form-fields/FormFieldRenderer.tsx` — update `FileUploadInput.handleUpload()` and `r2Keys` derivation
- `apps/dataforge/src/migrations/scripts/migrate-file-upload-fields.ts` — new migration script
- `apps/web/src/utils/__tests__/csv-export.test.ts` — add FileAttachment[] test case

**Tasks:**
1. Update `FileUploadInput.handleUpload()` (FormFieldRenderer.tsx line 610):
   - After each successful PUT, build `FileAttachment`: `{r2_key: result.r2_key, name: files[i].name, size: files[i].size, mime_type: files[i].type || 'application/octet-stream'}`
   - Change `updatedKeys` from `string[]` to `FileAttachment[]`
   - `fieldApi.handleChange(updatedFileAttachments)` (was: `fieldApi.handleChange(updatedKeys)`)
2. Update `r2Keys` derivation (FormFieldRenderer.tsx lines 595-608) to also read `FileAttachment[]`:
   - If array element is an object with `r2_key`, use `obj.r2_key` for display; still extract `string[]` of keys for backward-compat display in the existing UI list
   - Or: migrate the internal type to `FileAttachment[]` entirely and update the display list to use `attachment.name` instead of `getDisplayName(key)`
3. Write `migrate-file-upload-fields.ts`:
   - Query `entity_schemas` for all schemas containing fields of `type: 'file_upload'`
   - For each schema's `entity_name`, query `entity_records` where `org_id = schema.org_id`
   - For each record, check if `data->>field_name` is a JSON array of strings (not objects)
   - If so: parse, convert each string to `FileAttachment` using `extractNameFromKey()` + `guessMimeTypeFromExtension()` + `size: 0`
   - UPDATE in batches of 100
   - Log counts; skip rows already in `FileAttachment[]` format
4. Add csv-export.test.ts cases for `FileAttachment[]` format in `formatCellValue()`

**Verification:**
- Form-based upload: create entity with file attachment via form → DB query shows `FileAttachment[]` objects
- Migration script: run on test DB → query shows no plain `string[]` values → run again → 0 rows updated
- `pnpm typecheck` passes
- Relevant test suite passes

---

### Implementation Summary

| Phase | Focus | Key Verification |
|-------|-------|------------------|
| P0 | Baseline | Existing file_upload renders work, API accessible, types compile |
| P1 | Data format + cell renderer | Thumbnails visible in grid, upload icon in ARIA tree, unit tests pass |
| P2 | Lightbox viewer | Click → lightbox opens, prev/next works, Escape closes |
| P3 | Upload from cell | Upload dialog functional, FileAttachment[] written, cell re-renders |
| P4 | Form + migration | Form writes rich format, migration backfills legacy data, idempotent |

---

## E2E Test Resources

### Test Data Requirements

- Entity with `file_upload` field populated as `string[]` (legacy): `["uploads/abc/photo.jpg", "uploads/def/report.pdf", "uploads/ghi/sheet.xlsx"]`
- Entity with `file_upload` field populated as `FileAttachment[]` (new): 4 entries to trigger `+1` overflow badge
- Entity with empty `file_upload` field on editable column
- Entity with `file_upload` field on non-editable (readonly) column
- Test files from Drive: `RFI/Sample Inputs/RFIImageTest.png` (ID: `1I1SBWkGX5-BtnH56Kscxspv_Rsa0cebg`) for image; `COIs/` folder for PDF

### Test User

`ceo` (WideCorp CEO) — has `entities:write` permission on all entity types

### Browser Automation Selectors (agent-browser)

```bash
# Verify thumbnail gallery renders for a populated cell
agent-browser snapshot -i -s "[data-testid='cell-{entityId}-{fieldCol}']"

# Confirm upload button present in ARIA tree (opacity:0 but accessible)
agent-browser snapshot -i -s "[data-affordance='upload']"

# Open lightbox by clicking thumbnail area (not upload button)
agent-browser click "[data-testid='cell-{entityId}-{fieldCol}'] .vg-cell-thumbnail-area"

# Verify lightbox dialog open
agent-browser snapshot -i -s "[role='dialog']"

# Navigate lightbox next
agent-browser click "text:Next"

# Open upload dialog from upload icon
agent-browser click "[data-testid='cell-{entityId}-{fieldCol}'] .vg-cell-upload-btn"

# Upload a file in the dialog
agent-browser upload "#file-input" /tmp/test-image.jpg

# Take screenshots for evidence
agent-browser screenshot /tmp/file-gallery-cell-populated.png
agent-browser screenshot /tmp/file-gallery-lightbox-image.png
agent-browser screenshot /tmp/file-gallery-upload-dialog.png
```

---

## Testing

### Unit Tests

- [ ] `parseFileAttachments()`: null → [], [] → [], string[] → FileAttachment[], FileAttachment[] → same, mixed array → normalized, JSON string → parsed
- [ ] `extractNameFromKey()`: strip UUID prefix (30+ char prefix), handle no-prefix, handle path separators
- [ ] `guessMimeTypeFromExtension()`: .jpg → image/jpeg, .png → image/png, .pdf → application/pdf, .xlsx → spreadsheet mime, unknown → application/octet-stream
- [ ] `FileUploadGalleryCellRenderer.format()`: [], 1 file, 3 files → comma-separated names; legacy string[] input
- [ ] `FileGalleryLightbox`: renders PhotoPageViewer for image, PdfViewer for PDF, FileInfoCard for other; navigation state prev/next; boundary disables; single-file hides nav

### Integration Tests

- [ ] `FileUploadCellDialog`: calls `getPresignedUrls` with correct file metadata; builds `FileAttachment[]` from presigned result; calls entity update with appended array
- [ ] `FormFieldRenderer FileUploadInput`: on upload writes `FileAttachment[]` not `string[]`; reads both string[] and FileAttachment[] correctly

### E2E Tests

- [ ] Happy path view: navigate to entity list → thumbnail gallery visible → click cell → lightbox opens → next/prev navigation → Escape closes
- [ ] Happy path upload (empty cell): hover → upload icon → dialog → drop image file → cell updates with thumbnail
- [ ] Happy path upload (populated cell): hover → upload icon → dialog → add file → cell shows additional thumbnail
- [ ] Legacy data compatibility: entity with `string[]` value renders thumbnails without errors or console warnings
- [ ] Non-editable column: no upload icon visible anywhere in ARIA tree; lightbox still opens for populated cells
- [ ] Broken image URL: fallback file-type icon renders, no browser broken-image icon displayed

### Manual Testing

- [ ] Test as `ceo` (WideCorp) — full upload + view flow
- [ ] Test as `viewer` (WideCorp) — lightbox works; no upload icon visible
- [ ] Test with 1 file — lightbox shows no Prev/Next buttons
- [ ] Test with 10 files — overflow badge shows "+7"; lightbox shows all 10 navigable
- [ ] Test HEIC image — if browser cannot render, fallback icon appears (not broken-image icon)
- [ ] Test very long filename — truncated with ellipsis in cell; full name in lightbox header
- [ ] Test keyboard: Tab to grid → Tab to cell → Enter to open lightbox → Escape to close
- [ ] Test feature flag OFF — confirm `FileCellRenderer` (single-file legacy behavior) renders for `file_upload` column

---

## Rollout

### Feature Flag

- **Flag name:** `feature.file-gallery-cell`
- **Default:** `false`
- **Stages:** false (all) → true (baseplane + widecorp orgs) → true (all orgs)

### Rollback

1. Disable `feature.file-gallery-cell` via feature flag — the renderer factory returns `fileCellRenderer` immediately (no deploy required)
2. **Data format caveat:** After Phase 4 migration, `file_upload` field values are `FileAttachment[]` objects. The legacy `FileCellRenderer.parseFileValue()` receives the **array** as `value`, not individual elements — it will call `String(array)` producing garbled output, NOT acceptable degradation.
   - **Mitigation (done in Phase 1):** The `FileCellRenderer.parseFileValue()` method is updated to handle arrays: if `Array.isArray(value)`, it renders the first element's `name` field with a "(+N)" count, providing a readable fallback.
   - This means rolling back the feature flag shows a degraded-but-readable single-file display, not broken output.
3. Migration script is non-destructive and idempotent; no reverse migration required

---

## Decision Log

### Decision 1: Replace FileCellRenderer for file_upload Slot Only

**Date:** 2026-03-19
**Chose:** Replace `file_upload` slot only; `file` slot keeps `FileCellRenderer`
**Over:** Replace both `file` and `file_upload` registrations
**Reason:** `file` type may be used for single-file object `{url, name, size, type}` in non-entity contexts. `file_upload` is specifically the DataForge entity field type using R2 key arrays. Keeping `FileCellRenderer` for `file` avoids breaking unknown non-entity usages.

### Decision 2: Thumbnail Max Count of 3

**Date:** 2026-03-19
**Chose:** 3 thumbnails + overflow badge
**Over:** 4 or 5 thumbnails
**Reason:** At standard column width of 180-200px, 3 thumbnails at 28px each with 4px gaps + overflow badge + upload icon fits comfortably. 4 thumbnails would require a wider minimum column width or thumbnails so small they lose visual distinctiveness.

### Decision 3: Feature Directory at features/file-gallery, Renderer in systems/vibegrid

**Date:** 2026-03-19
**Chose:** React components in `features/file-gallery/components/`; CellRenderer DOM class in `systems/vibegrid/slots/slot-initialization.ts`
**Over:** Everything in `features/file-gallery/` or everything in `systems/vibegrid/`
**Reason:** CellRenderer classes must live in `slot-initialization.ts` per vibegrid.md anti-patterns. React components (Dialog, lightbox) belong in `features/` as domain-level UI, not grid primitives. `file-gallery` may expand to other contexts (entity detail panel, standalone file browser).

### Decision 4: FileAttachment Metadata Written at Upload Time, Not Derived on Read

**Date:** 2026-03-19
**Chose:** Capture `name`, `size`, `mime_type` at presigned URL request time and store with `r2_key`
**Over:** Derive metadata by fetching R2 object headers on every grid render
**Reason:** R2 HEAD requests per thumbnail would create N+1 latency spikes at grid render. Metadata is fully known at upload time (from `File` object). The migration script provides a one-time backfill using extension-based inference for legacy records.

### Decision 5: No Optimistic Thumbnail

**Date:** 2026-03-19
**Chose:** Cell re-renders only after server confirms entity update
**Over:** Show optimistic thumbnail immediately, then confirm with server
**Reason:** Optimistic thumbnail requires client-side URL construction for newly uploaded files (presigned GET URL is separate from the inline view URL). The spinner-during-upload pattern is simpler and avoids showing a thumbnail that might disappear on server error.

---

## Related Work

- `PhotoPageViewer` implemented in GH#1977 (entity review multi-source preview) — reused in lightbox
- `PdfViewer` implemented in GH#1977 — reused in lightbox
- `SourcePreviewPanel` (GH#1977) — composition pattern reference
- `FormFieldRenderer.FileUploadInput` (GH#1539 era) — upload flow to align with
- Existing `FileCellRenderer` in `slot-initialization.ts` lines 1205-1298 — reference for interactionPolicy/affordances pattern
- `ExpandedContentPortals.tsx` — React portal bridge pattern to follow for lightbox wiring
