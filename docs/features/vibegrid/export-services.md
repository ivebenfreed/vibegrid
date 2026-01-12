---
domain: vibegrid
status: draft
relatedRules:
  - vibegrid
  - vibegrid-interactions
---
# Export Services
CSV, Excel, and PDF Export Engines - Data export functionality

## Overview
- **Domain:** vibegrid
- **Status:** draft
- **Related Issues:** GH#27, GH#94, GH#112, GH#776, GH#1073

## Behaviors

### B1: Generate PDF from React Template
- **ID:** B1
- **Trigger:** API call to `POST /api/orpc/lienWaivers/generatePdf` or internal service call.
- **Expected:** System renders a React component to HTML, then utilizes Cloudflare Browser Rendering API to convert the HTML into a high-fidelity PDF document.
- **Verify:** Verify that a valid PDF buffer is returned or stored in R2, and the visual layout matches the React template.
- **Source:** `apps/web/src/server/domain/parseforge/services/PdfGenerationService.ts`

### B2: Format Field Data for Export
- **ID:** B2
- **Trigger:** System iterates through grid rows during an export operation.
- **Expected:** Each field type applies its specialized `formatForExport` logic (e.g., Currency to numeric string, Phone to E.164, Date to ISO-8601) to ensure compatibility with spreadsheet software.
- **Verify:** Inspect the generated export string and ensure complex objects are flattened and formatted correctly for CSV/Excel.
- **Source:** `apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts`

### B3: Package Documents into ZIP Archive
- **ID:** B3
- **Trigger:** oRPC call to `lienWaiverCycle.export` with format set to `zip`.
- **Expected:** System collects all approved/signed PDF documents for a specific cycle and bundles them into a single compressed ZIP archive stored in R2.
- **Verify:** Download the resulting ZIP file and verify it contains the expected set of PDF documents with correct filenames.
- **Source:** `apps/web/src/server/orpc/routers/lien-waiver-cycle.ts`

### B4: Export Grid Data to CSV
- **ID:** B4
- **Trigger:** User clicks "Export CSV" button in a feature page (e.g., Bid Comparison).
- **Expected:** Client-side logic iterates over the current dataset, applies field-specific formatting, and generates a downloadable CSV Blob.
- **Verify:** Verify that a `.csv` file is downloaded by the browser and contains accurate data from the current grid view.
- **Source:** `apps/web/src/features/bid-mail/pages/ProjectBidPackageComparisonPage.tsx`

### B5: Record Export Audit History
- **ID:** B5
- **Trigger:** Completion of a document or data export operation.
- **Expected:** System records the export event in the database, including the user ID, timestamp, and a permanent link to the exported artifact in R2.
- **Verify:** Check the `lien_waiver_cycles` table or the Export History UI panel for a new record after an export.
- **Source:** `apps/web/src/server/domain/lien-waivers/WaiverCycleService.ts`

### B6: Preview PDF Document
- **ID:** B6
- **Trigger:** API call to `POST /api/orpc/parseforge/pdf/preview`.
- **Expected:** System generates a PDF in-memory and returns it as a Base64-encoded string for immediate UI display without permanent storage.
- **Verify:** Ensure the UI displays an accurate PDF preview in a modal or iframe immediately after the request.
- **Source:** `apps/web/src/server/domain/parseforge/services/PdfGenerationService.ts`

### B7: Stream Large File Export
- **ID:** B7
- **Trigger:** API call to `/api/files/download/*` or specialized streaming endpoint.
- **Expected:** System streams the exported data or file from R2 directly to the client to minimize memory overhead on the Worker.
- **Verify:** Verify that large exports (e.g., >10MB) complete successfully without exceeding Worker memory limits.
- **Source:** `apps/web/src/server/api/files.ts`

## Notes
- **Performance:** PDF generation leverages Cloudflare's Browser Rendering API to offload heavy rendering tasks from the edge worker.
- **Formatting:** The system uses a plugin-based architecture via `FieldTypeRegistry` where each field type defines its own export formatting rules.
- **Storage:** Exported packages are stored in the `PROCORE_ATTACHMENTS` R2 bucket with organization-scoped keys.
- **Excel Support:** While full `.xlsx` generation is planned, current "Excel" support primarily relies on CSV formatting optimized for direct import into Excel (handling numeric strings and date formats).
