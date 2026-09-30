import { propertyFormSchema } from "./property-form-schema"
import { calculateAll } from "./calculations"
import type { PropertyFormData } from "./types"

/** The server accepts assumptions, never caller-supplied calculated totals. */
export function canonicalAnalysis(body: { propertyData?: unknown; calculationResults?: unknown }) {
  const parsed = propertyFormSchema.safeParse(body.propertyData)
  if (!parsed.success) return { success: false as const, error: "Invalid property inputs" }
  const propertyData = parsed.data as PropertyFormData
  if (propertyData.purchasePrice <= 0) return { success: false as const, error: "purchasePrice must be positive" }
  const calculationResults = calculateAll(propertyData)
  const required = [calculationResults.grossYield, calculationResults.monthlyCashFlow, calculationResults.sdltAmount, calculationResults.totalCapitalRequired]
  if (!required.every(Number.isFinite)) return { success: false as const, error: "Property inputs cannot produce a valid calculation" }
  return { success: true as const, propertyData, calculationResults }
}
