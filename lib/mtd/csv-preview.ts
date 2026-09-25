import type { FlaskCsvPreview } from "./types"

export function csvPreviewRowStatus(row: FlaskCsvPreview["rows"][number]): string {
  if (!row.valid) return row.errors.join("; ") || "Invalid"
  if (row.alreadyImported) return "Already imported"
  return "Ready"
}

export function csvPreviewNewCount(preview: Pick<FlaskCsvPreview, "validCount" | "alreadyImportedCount">) {
  return Math.max(0, (preview.validCount ?? 0) - (preview.alreadyImportedCount ?? 0))
}
