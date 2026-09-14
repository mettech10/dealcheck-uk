import { SA105_CATEGORIES, CATEGORY_KIND_ORDER, kindLabel } from "@/lib/mtd/categories"
import { MTD_DISCLAIMER } from "@/lib/mtd/disclaimer"
import { NextResponse } from "next/server"

/** Public — static SA105 category catalogue for pickers and CSV mapping. */
export async function GET() {
  return NextResponse.json({
    disclaimer: MTD_DISCLAIMER,
    hmrcSubmission: false,
    kinds: CATEGORY_KIND_ORDER.map((kind) => ({
      kind,
      label: kindLabel(kind),
    })),
    categories: SA105_CATEGORIES,
  })
}
