/**
 * Renders lib/pdf/masterclass.tsx → public/downloads/masterclass.pdf.
 *
 * Run after editing the guide's content, then commit the PDF:
 *   npx tsx scripts/generate-masterclass-pdf.tsx
 *
 * The PDF is a committed static asset (spec Option A) so Vercel serves it
 * from /downloads/masterclass.pdf with zero runtime cost. Switch to a
 * signed Supabase Storage URL (Option B) if the email gate needs enforcing.
 */
import path from "path"
import fs from "fs"
import React from "react"
import { renderToFile } from "@react-pdf/renderer"
import { MasterclassDocument } from "../lib/pdf/masterclass"

async function main() {
  const outDir = path.join(__dirname, "..", "public", "downloads")
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, "masterclass.pdf")

  await renderToFile(<MasterclassDocument />, outPath)

  const kb = Math.round(fs.statSync(outPath).size / 1024)
  console.log(`✓ Wrote ${outPath} (${kb} KB)`)
}

main().catch((err) => {
  console.error("PDF generation failed:", err)
  process.exit(1)
})
