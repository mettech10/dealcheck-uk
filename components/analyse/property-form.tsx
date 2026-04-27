"use client"

import { useEffect, useState } from "react"
import { useForm, Controller, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Link2, Info, Trash2, Plus } from "lucide-react"
import type { PropertyFormData, PropertyTypeDetail, TenureType } from "@/lib/types"
import { estimateRefurbCost } from "@/lib/calculations"
import { AutoArvButton, type ArvEstimate } from "./auto-arv"
import { AutoGdvButton } from "./auto-gdv"

const schema = z.object({
  address: z.string().min(1, "Address is required"),
  postcode: z.string().min(1, "Postcode is required"),
  purchasePrice: z.coerce.number().min(0),
  propertyType: z.enum(["house", "flat", "commercial"]),
  propertyTypeDetail: z.enum([
    "terraced", "semi-detached", "detached", "end-of-terrace",
    "flat-apartment", "bungalow", "maisonette", "other",
  ]).optional(),
  tenureType: z.enum(["freehold", "leasehold"]).optional(),
  leaseYears: z.coerce.number().min(1).max(999).optional(),
  investmentType: z.enum(["btl", "brr", "hmo", "flip", "r2sa", "development"]),
  sqft: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().min(0).max(20),
  condition: z.enum(["excellent", "good", "cosmetic", "full-refurb", "structural"]),
  buyerType: z.enum(["first-time", "standard", "additional"]),
  refurbishmentBudget: z.coerce.number().min(0),
  legalFees: z.coerce.number().min(0),
  surveyCosts: z.coerce.number().min(0),
  purchaseType: z.enum(["mortgage", "bridging-loan", "cash"]),
  depositPercentage: z.coerce.number().min(0).max(100),
  interestRate: z.coerce.number().min(0).max(20),
  mortgageTerm: z.coerce.number().min(1).max(40),
  // Bridging loan fields
  bridgingLTV: z.coerce.number().min(0).max(100).optional(),
  bridgingMonthlyRate: z.coerce.number().min(0).max(5).optional(),
  bridgingTermMonths: z.coerce.number().min(1).max(36).optional(),
  bridgingArrangementFee: z.coerce.number().min(0).max(5).optional(),
  bridgingExitFee: z.coerce.number().min(0).max(5).optional(),
  // BRR / Flip
  arv: z.coerce.number().min(0).optional(),
  arvBasis: z.enum(["comparables", "surveyor", "agent", "manual"]).optional(),
  // BRRRR refurb extras
  refurbContingencyPercent: z.coerce.number().min(0).max(50).optional(),
  refurbHoldingMonths: z.coerce.number().min(0).max(24).optional(),
  refurbHoldingCostPerMonth: z.coerce.number().min(0).optional(),
  // BRRRR refinance fields (separate from initial mortgage)
  refinanceLTV: z.coerce.number().min(0).max(100).optional(),
  refinanceRate: z.coerce.number().min(0).max(20).optional(),
  refinanceTermYears: z.coerce.number().min(1).max(40).optional(),
  refinanceArrangementFeePercent: z.coerce.number().min(0).max(5).optional(),
  refinanceValuationFee: z.coerce.number().min(0).optional(),
  // ── Flip-specific ──────────────────────────────────────────────
  // Refurb line items — summed into refurbishmentBudget when builder is used.
  refurbKitchen: z.coerce.number().min(0).optional(),
  refurbBathroom: z.coerce.number().min(0).optional(),
  refurbFlooring: z.coerce.number().min(0).optional(),
  refurbDecoration: z.coerce.number().min(0).optional(),
  refurbElectrical: z.coerce.number().min(0).optional(),
  refurbPlumbing: z.coerce.number().min(0).optional(),
  refurbExterior: z.coerce.number().min(0).optional(),
  refurbStructural: z.coerce.number().min(0).optional(),
  // Flip holding during works + marketing.
  flipHoldingMonths: z.coerce.number().min(0).max(36).optional(),
  flipCouncilTaxMonthly: z.coerce.number().min(0).optional(),
  flipInsuranceMonthly: z.coerce.number().min(0).optional(),
  flipUtilitiesMonthly: z.coerce.number().min(0).optional(),
  flipServiceChargeMonthly: z.coerce.number().min(0).optional(),
  // Flip exit strategy.
  flipAgentFeePercent: z.coerce.number().min(0).max(10).optional(),
  flipSaleLegalFees: z.coerce.number().min(0).optional(),
  flipMarketingCosts: z.coerce.number().min(0).optional(),
  flipSaleMonths: z.coerce.number().min(0).max(24).optional(),
  // Flip tax.
  flipOwnershipStructure: z.enum(["individual", "limited-company"]).optional(),
  flipTaxBand: z.enum(["basic", "higher"]).optional(),
  flipCGTAllowanceRemaining: z.coerce.number().min(0).max(3000).optional(),
  flipCorporationTaxRate: z.coerce.number().min(0).max(40).optional(),
  flipOtherGainsThisYear: z.coerce.number().min(0).optional(),
  // HMO
  roomCount: z.coerce.number().min(0).max(20).optional(),
  avgRoomRate: z.coerce.number().min(0).optional(),
  hmoLicenceCost: z.coerce.number().min(0).optional(),
  hmoLicenceTermYears: z.coerce.number().min(1).max(10).optional(),
  hmoRoomVoidWeeks: z.coerce.number().min(0).max(52).optional(),
  // SA / R2SA
  saMonthlySARevenue: z.coerce.number().min(0).optional(),
  saSetupCosts: z.coerce.number().min(0).optional(),
  saOwnershipType: z.enum(["own", "rent-to-sa"]).optional(),
  saNightlyRate: z.coerce.number().min(0).optional(),
  saOccupancyRate: z.coerce.number().min(0).max(100).optional(),
  saPlatformFeePercent: z.coerce.number().min(0).max(100).optional(),
  saCleaningCostPerStay: z.coerce.number().min(0).optional(),
  saAvgStaysPerMonth: z.coerce.number().min(0).max(60).optional(),
  saMonthlyLease: z.coerce.number().min(0).optional(),
  saUtilitiesMonthly: z.coerce.number().min(0).optional(),
  saInsuranceAnnual: z.coerce.number().min(0).optional(),
  saManagementFeePercent: z.coerce.number().min(0).max(100).optional(),
  saMaintenancePercent: z.coerce.number().min(0).max(100).optional(),
  // ── Property Development ──────────────────────────────────────
  devSiteType: z.enum([
    "greenfield", "brownfield", "existing-building",
    "demolition-and-build", "land-only",
  ]).optional(),
  devSiteAreaM2: z.coerce.number().min(0).optional(),
  devPlanningStatus: z.enum([
    "no-planning", "pre-application", "outline",
    "full-planning", "permitted-development", "lapsed",
  ]).optional(),
  devPlanningRef: z.string().optional(),
  devUnitMix: z.array(z.object({
    unitType: z.enum([
      "studio", "1-bed-flat", "2-bed-flat", "3-bed-flat",
      "1-bed-house", "2-bed-house", "3-bed-house",
      "4-bed-house", "5-bed-house", "commercial", "other",
    ]),
    numberOfUnits: z.coerce.number().min(0).max(500),
    avgSizeM2: z.coerce.number().min(0).max(10000),
    salePricePerUnit: z.coerce.number().min(0),
    rentalValuePerUnit: z.coerce.number().min(0).optional(),
  })).optional(),
  sdltRateType: z.enum(["residential", "non-residential", "mixed-use"]).optional(),
  devConstructionType: z.enum([
    "new-build-traditional", "new-build-timber-frame", "new-build-modular",
    "conversion", "extension", "refurbishment",
  ]).optional(),
  devBuildCostPerM2: z.coerce.number().min(0).optional(),
  devAbnormals: z.coerce.number().min(0).optional(),
  devContingencyPercent: z.coerce.number().min(0).max(50).optional(),
  devArchitectPercent: z.coerce.number().min(0).max(20).optional(),
  devStructuralEngineerPercent: z.coerce.number().min(0).max(10).optional(),
  devQsPercent: z.coerce.number().min(0).max(10).optional(),
  devProjectManagerPercent: z.coerce.number().min(0).max(10).optional(),
  devPlanningConsultantFixed: z.coerce.number().min(0).optional(),
  devBuildingControlFixed: z.coerce.number().min(0).optional(),
  devWarrantyPercent: z.coerce.number().min(0).max(5).optional(),
  devCILRatePerM2: z.coerce.number().min(0).optional(),
  devS106PerUnit: z.coerce.number().min(0).optional(),
  devAffordableHousingPercent: z.coerce.number().min(0).max(100).optional(),
  devBuildingRegsFixed: z.coerce.number().min(0).optional(),
  devFinanceLTC: z.coerce.number().min(0).max(100).optional(),
  devFinanceDay1Percent: z.coerce.number().min(0).max(100).optional(),
  devFinanceRate: z.coerce.number().min(0).max(20).optional(),
  devFinanceArrangementFeePercent: z.coerce.number().min(0).max(10).optional(),
  devFinanceMonitoringFeeMonthly: z.coerce.number().min(0).optional(),
  devFinanceTermMonths: z.coerce.number().min(1).max(60).optional(),
  devFinanceExitFeePercent: z.coerce.number().min(0).max(10).optional(),
  devFinanceRolledUp: z.boolean().optional(),
  devExitStrategy: z.enum(["sell-all", "hold-and-refinance", "hybrid"]).optional(),
  devSalesAgentPercent: z.coerce.number().min(0).max(10).optional(),
  devSalesLegalPerUnit: z.coerce.number().min(0).optional(),
  devMarketingCostsFixed: z.coerce.number().min(0).optional(),
  devMarketingPerUnit: z.coerce.number().min(0).optional(),
  capitalGrowthRate: z.coerce.number().min(0).max(30).optional(),
  mortgageType: z.enum(["repayment", "interest-only"]),
  monthlyRent: z.coerce.number().min(0),
  annualRentIncrease: z.coerce.number().min(0).max(20),
  voidWeeks: z.coerce.number().min(0).max(52),
  managementFeePercent: z.coerce.number().min(0).max(100),
  insurance: z.coerce.number().min(0),
  maintenance: z.coerce.number().min(0),
  maintenancePercent: z.coerce.number().min(0).max(100),
  groundRent: z.coerce.number().min(0),
  bills: z.coerce.number().min(0),
})

interface PropertyFormProps {
  onSubmit: (data: PropertyFormData) => void
  isLoading: boolean
  defaultValues?: Partial<PropertyFormData>
  prefilled?: boolean
  sqftSource?: string // "listing" | "epc" | undefined
}

function FormField({
  label,
  error,
  children,
  hint,
}: {
  label: string
  error?: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm text-foreground">{label}</Label>
      {children}
      {hint && !error && (
        <span className="text-xs text-muted-foreground">{hint}</span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

export function PropertyForm({ onSubmit, isLoading, defaultValues, prefilled, sqftSource }: PropertyFormProps) {
  const baseDefaults: PropertyFormData = {
    address: "",
    postcode: "",
    purchasePrice: 0,
    propertyType: "house",
    investmentType: "btl",
    sqft: undefined,
    bedrooms: 3,
    condition: "good",
    buyerType: "additional",
    refurbishmentBudget: 0,
    legalFees: 1500,
    surveyCosts: 500,
    purchaseType: "mortgage",
    depositPercentage: 25,
    interestRate: 5.5,
    mortgageTerm: 25,
    mortgageType: "interest-only",
    bridgingLTV: 70,
    bridgingMonthlyRate: 0.75,
    bridgingTermMonths: 12,
    bridgingArrangementFee: 1.0,
    bridgingExitFee: 0.5,
    capitalGrowthRate: 4,
    arv: 0,
    arvBasis: "comparables",
    refurbContingencyPercent: 10,
    refurbHoldingMonths: 6,
    refurbHoldingCostPerMonth: 250,
    refinanceLTV: 75,
    refinanceRate: 5.5,
    refinanceTermYears: 25,
    refinanceArrangementFeePercent: 1,
    refinanceValuationFee: 400,
    // Flip defaults — refurb builder line items blank by default so user opts in
    refurbKitchen: 0,
    refurbBathroom: 0,
    refurbFlooring: 0,
    refurbDecoration: 0,
    refurbElectrical: 0,
    refurbPlumbing: 0,
    refurbExterior: 0,
    refurbStructural: 0,
    // Flip holding
    flipHoldingMonths: 6,
    flipCouncilTaxMonthly: 150,
    flipInsuranceMonthly: 40,
    flipUtilitiesMonthly: 80,
    flipServiceChargeMonthly: 0,
    // Flip exit
    flipAgentFeePercent: 1.5,
    flipSaleLegalFees: 1500,
    flipMarketingCosts: 500,
    flipSaleMonths: 3,
    // Flip tax — sensible individual higher-rate defaults (most BTL investors)
    flipOwnershipStructure: "individual",
    flipTaxBand: "higher",
    flipCGTAllowanceRemaining: 3000,
    flipCorporationTaxRate: 25,
    flipOtherGainsThisYear: 0,
    roomCount: 0,
    avgRoomRate: 0,
    hmoLicenceCost: 1000,
    hmoLicenceTermYears: 5,
    saMonthlySARevenue: 0,
    saSetupCosts: 5000,
    saOwnershipType: "rent-to-sa",
    saNightlyRate: 0,
    saOccupancyRate: 65,
    saPlatformFeePercent: 15,
    saCleaningCostPerStay: 80,
    saAvgStaysPerMonth: 8,
    saMonthlyLease: 0,
    saUtilitiesMonthly: 200,
    saInsuranceAnnual: 800,
    saManagementFeePercent: 20,
    saMaintenancePercent: 5,
    // ── Property Development defaults ──────────────────────────
    devSiteType: "brownfield",
    devSiteAreaM2: 0,
    devPlanningStatus: "no-planning",
    devPlanningRef: "",
    devUnitMix: [],
    sdltRateType: "residential",
    devConstructionType: "new-build-traditional",
    devBuildCostPerM2: 2200,          // £/m² for UK new-build traditional (2024/25 avg)
    devAbnormals: 0,
    devContingencyPercent: 10,
    devArchitectPercent: 6,
    devStructuralEngineerPercent: 2,
    devQsPercent: 1.5,
    devProjectManagerPercent: 2,
    devPlanningConsultantFixed: 5000,
    devBuildingControlFixed: 2500,
    devWarrantyPercent: 1.2,
    devCILRatePerM2: 0,
    devS106PerUnit: 0,
    devAffordableHousingPercent: 0,
    devBuildingRegsFixed: 1200,
    devFinanceLTC: 65,
    devFinanceDay1Percent: 50,
    devFinanceRate: 8.5,
    devFinanceArrangementFeePercent: 2,
    devFinanceMonitoringFeeMonthly: 500,
    devFinanceTermMonths: 18,
    devFinanceExitFeePercent: 1,
    devFinanceRolledUp: true,
    devExitStrategy: "sell-all",
    devSalesAgentPercent: 1.5,
    devSalesLegalPerUnit: 1500,
    devMarketingCostsFixed: 15000,
    devMarketingPerUnit: 500,
    monthlyRent: 0,
    annualRentIncrease: 2,
    voidWeeks: 2,
    managementFeePercent: 10,
    insurance: 300,
    maintenance: 500,
    maintenancePercent: 10,
    groundRent: 0,
    bills: 0,
  }

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PropertyFormData>({
    resolver: zodResolver(schema),
    defaultValues: { ...baseDefaults, ...defaultValues },
  })

  const purchaseType = watch("purchaseType")
  const investmentType = watch("investmentType")
  const sqftValue = watch("sqft")
  const conditionValue = watch("condition")
  const propertyTypeValue = watch("propertyType")
  const postcodeValue = watch("postcode")
  const refurbValue = watch("refurbishmentBudget")
  const tenureTypeValue = watch("tenureType")
  const propertyTypeDetailValue = watch("propertyTypeDetail")
  const roomCountValue = watch("roomCount")
  const avgRoomRateValue = watch("avgRoomRate")
  const bedroomsValue = watch("bedrooms")
  const arvValue = watch("arv")

  // Maintenance toggle: % of annual rent vs £ flat (annual). The calc engine
  // (lib/calculations.ts) prefers maintenancePercent when > 0, else uses the
  // flat `maintenance` figure — so we set the unused field to 0 on switch
  // to keep that branching unambiguous.
  const [maintenanceMode, setMaintenanceMode] = useState<"percent" | "flat">("percent")

  // Flip refurb builder line items — when any are set, auto-sum into refurbishmentBudget.
  const flipOwnership       = watch("flipOwnershipStructure")
  const flipHoldingMonths   = watch("flipHoldingMonths") || 0
  const flipSaleMonths      = watch("flipSaleMonths") || 0
  const refurbKitchen       = watch("refurbKitchen") || 0
  const refurbBathroom      = watch("refurbBathroom") || 0
  const refurbFlooring      = watch("refurbFlooring") || 0
  const refurbDecoration    = watch("refurbDecoration") || 0
  const refurbElectrical    = watch("refurbElectrical") || 0
  const refurbPlumbing      = watch("refurbPlumbing") || 0
  const refurbExterior      = watch("refurbExterior") || 0
  const refurbStructural    = watch("refurbStructural") || 0
  const refurbBuilderSum =
    refurbKitchen + refurbBathroom + refurbFlooring + refurbDecoration +
    refurbElectrical + refurbPlumbing + refurbExterior + refurbStructural

  // Auto-map the granular property type to the broad type used by calculations.
  useEffect(() => {
    if (!propertyTypeDetailValue) return
    const flatTypes = ["flat-apartment", "maisonette"]
    const broad = flatTypes.includes(propertyTypeDetailValue) ? "flat" : "house"
    setValue("propertyType", broad, { shouldDirty: false })
  }, [propertyTypeDetailValue, setValue])

  // Auto-compute refurb budget from sqft + condition whenever they change.
  // Always recalculates — user can still override manually.
  useEffect(() => {
    if (!sqftValue || sqftValue <= 0) return
    const estimated = estimateRefurbCost(sqftValue, conditionValue, propertyTypeValue, postcodeValue)
    setValue("refurbishmentBudget", estimated, { shouldDirty: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqftValue, conditionValue, propertyTypeValue, postcodeValue])

  // SA-specific watches
  const saNightlyRate = watch("saNightlyRate") || 0
  const saOccupancyRate = watch("saOccupancyRate") || 0
  const saOwnershipType = watch("saOwnershipType") || "rent-to-sa"
  const saEstimatedMonthly = Math.round(saNightlyRate * (saOccupancyRate / 100) * 30)

  // Auto-derive saMonthlySARevenue from nightly rate × occupancy
  useEffect(() => {
    if (investmentType === "r2sa" && saEstimatedMonthly > 0) {
      setValue("saMonthlySARevenue", saEstimatedMonthly, { shouldDirty: false })
    }
  }, [investmentType, saEstimatedMonthly, setValue])

  const isR2SA     = investmentType === "r2sa"
  const isHMO      = investmentType === "hmo"
  const isBRR      = investmentType === "brr"
  const isFLIP     = investmentType === "flip"
  const isDevelopment = investmentType === "development"
  const isBridging = purchaseType === "bridging-loan"
  const isCash     = purchaseType === "cash"

  // ── Development: dynamic unit-mix field array + live totals ─────
  const { fields: unitMixFields, append: appendUnit, remove: removeUnit } =
    useFieldArray({ control, name: "devUnitMix" })
  const devUnitMixWatch = watch("devUnitMix") || []
  const devBuildCostWatch = watch("devBuildCostPerM2") || 0
  const devConstructionTypeWatch = watch("devConstructionType")
  const devSiteAreaWatch = watch("devSiteAreaM2") || 0

  // Live GDV and GIA totals from unit mix
  const devTotalUnits = devUnitMixWatch.reduce(
    (s, u) => s + (Number(u?.numberOfUnits) || 0), 0
  )
  const devTotalGIA = devUnitMixWatch.reduce(
    (s, u) =>
      s + (Number(u?.numberOfUnits) || 0) * (Number(u?.avgSizeM2) || 0), 0
  )
  const devTotalGDV = devUnitMixWatch.reduce(
    (s, u) =>
      s + (Number(u?.numberOfUnits) || 0) * (Number(u?.salePricePerUnit) || 0), 0
  )

  // Auto-suggest £/m² build cost when construction type changes.
  // UK 2024/25 industry rule-of-thumb averages (BCIS / RICS).
  useEffect(() => {
    if (!isDevelopment || !devConstructionTypeWatch) return
    const suggest: Record<string, number> = {
      "new-build-traditional":  2200,
      "new-build-timber-frame": 2000,
      "new-build-modular":      1800,
      "conversion":             1600,
      "extension":              1900,
      "refurbishment":          1100,
    }
    const target = suggest[devConstructionTypeWatch]
    if (target && devBuildCostWatch === 0) {
      setValue("devBuildCostPerM2", target, { shouldDirty: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devConstructionTypeWatch, isDevelopment])

  // Affordable-housing warning threshold: ≥10 units triggers statutory
  // policy consideration under the NPPF + most Local Plans.
  const devTriggersAffordable = devTotalUnits >= 10

  // HMO: auto-derive monthlyRent from roomCount × avgRoomRate
  const hmoTotalRent = (roomCountValue || 0) * (avgRoomRateValue || 0)
  useEffect(() => {
    if (isHMO && hmoTotalRent >= 0) {
      setValue("monthlyRent", hmoTotalRent)
    }
  }, [isHMO, hmoTotalRent, setValue])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">
      {/* URL Pre-fill Banner */}
      {prefilled && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              Details pre-filled from listing
            </p>
            <p className="text-xs text-muted-foreground">
              Please review and adjust if needed before analysing. Fill in the remaining fields (rent, financing, running costs) to get a full analysis.
            </p>
          </div>
        </div>
      )}

      {/* ── Property Details ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <h3 className="text-base font-semibold text-foreground">Property Details</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label="Property Address" error={errors.address?.message}>
              <Input
                placeholder="e.g. 10 Downing Street, London"
                {...register("address")}
              />
            </FormField>
          </div>
          <FormField label="Postcode" error={errors.postcode?.message}>
            <Input placeholder="e.g. SW1A 2AA" {...register("postcode")} />
          </FormField>
          {/* Investment Strategy */}
          <FormField label="Investment Strategy">
            <Controller
              control={control}
              name="investmentType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="btl">Buy-to-Let (BTL) — Long-term rental</SelectItem>
                    <SelectItem value="hmo">HMO — Room-by-room rental</SelectItem>
                    <SelectItem value="brr">Buy, Refurb &amp; Refinance (BRR)</SelectItem>
                    <SelectItem value="flip">Flip / Renovation — Buy &amp; sell</SelectItem>
                    <SelectItem value="r2sa">Rent-to-SA (R2SA) — Sublet as SA</SelectItem>
                    <SelectItem value="development">
                      Property Development — New Build / Conversion
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          {/* Purchase Price — hidden for R2SA (no purchase) */}
          {!isR2SA && (
            <FormField label="Purchase Price" error={errors.purchasePrice?.message}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input
                  type="number"
                  className="pl-7"
                  placeholder="250000"
                  {...register("purchasePrice")}
                />
              </div>
            </FormField>
          )}
          <FormField label="Property Type">
            <Controller
              control={control}
              name="propertyTypeDetail"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v as PropertyTypeDetail)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="terraced">Terraced</SelectItem>
                    <SelectItem value="semi-detached">Semi-Detached</SelectItem>
                    <SelectItem value="detached">Detached</SelectItem>
                    <SelectItem value="end-of-terrace">End of Terrace</SelectItem>
                    <SelectItem value="flat-apartment">Flat / Apartment</SelectItem>
                    <SelectItem value="bungalow">Bungalow</SelectItem>
                    <SelectItem value="maisonette">Maisonette</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField label="Tenure Type">
            <Controller
              control={control}
              name="tenureType"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v as TenureType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select tenure" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freehold">Freehold</SelectItem>
                    <SelectItem value="leasehold">Leasehold</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          {tenureTypeValue === "leasehold" && (
            <FormField label="Lease Years Remaining" hint="Years left on the lease">
              <Input
                type="number"
                placeholder="e.g. 125"
                {...register("leaseYears")}
              />
            </FormField>
          )}
          <FormField label="Floor Size (sqft)" hint={
            sqftSource === "epc" ? "Floor size from EPC register"
            : sqftSource === "listing" ? "Floor size from listing"
            : sqftValue ? "From listing or EPC certificate"
            : "Floor size not found \u2014 enter manually"
          }>
            <div className="relative">
              <Input
                type="number"
                className="pr-14"
                placeholder="990"
                {...register("sqft")}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">sqft</span>
            </div>
          </FormField>
          {!isHMO && (
            <FormField label="Bedrooms">
              <Input type="number" {...register("bedrooms")} />
            </FormField>
          )}
          <FormField label="Condition">
            <Controller
              control={control}
              name="condition"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">Excellent — Move-in ready, no work needed</SelectItem>
                    <SelectItem value="good">Good — Minor cosmetic touches only</SelectItem>
                    <SelectItem value="cosmetic">Cosmetic — New kitchen/bathroom, redecoration</SelectItem>
                    <SelectItem value="full-refurb">Full Refurb — Complete renovation throughout</SelectItem>
                    <SelectItem value="structural">Structural / Major Works — Extensions, underpinning, rewiring</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           Property Development — 8 groups
           Site · Unit Mix · Acquisition · Construction · Prof Fees ·
           Planning Obligations · Development Finance · Exit
         ════════════════════════════════════════════════════════════ */}
      {isDevelopment && (
        <>
          {/* ── 1 · Site Details ──────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Site Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Site Type">
                <Controller
                  control={control}
                  name="devSiteType"
                  render={({ field }) => (
                    <Select value={field.value ?? "brownfield"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="greenfield">Greenfield (undeveloped land)</SelectItem>
                        <SelectItem value="brownfield">Brownfield (previously developed)</SelectItem>
                        <SelectItem value="existing-building">Existing Building (conversion)</SelectItem>
                        <SelectItem value="demolition-and-build">Demolition &amp; Rebuild</SelectItem>
                        <SelectItem value="land-only">Land Only (no structures)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Site Area (m²)" hint="Total site area, not just building footprint">
                <div className="relative">
                  <Input type="number" className="pr-12" placeholder="500" {...register("devSiteAreaM2")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">m²</span>
                </div>
              </FormField>
              <FormField label="Planning Status">
                <Controller
                  control={control}
                  name="devPlanningStatus"
                  render={({ field }) => (
                    <Select value={field.value ?? "no-planning"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no-planning">No planning permission yet</SelectItem>
                        <SelectItem value="pre-application">Pre-application advice only</SelectItem>
                        <SelectItem value="outline">Outline permission</SelectItem>
                        <SelectItem value="full-planning">Full planning permission</SelectItem>
                        <SelectItem value="permitted-development">Permitted Development (PD)</SelectItem>
                        <SelectItem value="lapsed">Permission lapsed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Planning Ref" hint="LPA reference e.g. 23/01234/FUL (optional)">
                <Input placeholder="23/01234/FUL" {...register("devPlanningRef")} />
              </FormField>
            </div>
            {devSiteAreaWatch > 0 && devTotalGIA > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Plot ratio (GIA ÷ site area): <strong>{(devTotalGIA / devSiteAreaWatch).toFixed(2)}</strong>
                {" "}· Density: <strong>{Math.round((devTotalUnits / (devSiteAreaWatch / 10000)) || 0)}</strong> units/hectare
              </p>
            )}
          </div>

          {/* ── 2 · Unit Mix (dynamic) ──────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-foreground">Unit Mix</h3>
              <button
                type="button"
                onClick={() => appendUnit({
                  unitType: "2-bed-flat",
                  numberOfUnits: 1,
                  avgSizeM2: 70,
                  salePricePerUnit: 0,
                  rentalValuePerUnit: 0,
                })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
              >
                <Plus className="size-3.5" /> Add Unit Type
              </button>
            </div>
            {unitMixFields.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                No units added yet — click <strong>Add Unit Type</strong> above to start.
              </div>
            )}
            {unitMixFields.map((row, idx) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Unit Type #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUnit(idx)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    aria-label={`Remove unit type ${idx + 1}`}
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                  <FormField label="Type">
                    <Controller
                      control={control}
                      name={`devUnitMix.${idx}.unitType` as const}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="studio">Studio</SelectItem>
                            <SelectItem value="1-bed-flat">1-bed flat</SelectItem>
                            <SelectItem value="2-bed-flat">2-bed flat</SelectItem>
                            <SelectItem value="3-bed-flat">3-bed flat</SelectItem>
                            <SelectItem value="1-bed-house">1-bed house</SelectItem>
                            <SelectItem value="2-bed-house">2-bed house</SelectItem>
                            <SelectItem value="3-bed-house">3-bed house</SelectItem>
                            <SelectItem value="4-bed-house">4-bed house</SelectItem>
                            <SelectItem value="5-bed-house">5-bed house</SelectItem>
                            <SelectItem value="commercial">Commercial</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </FormField>
                  <FormField label="Units">
                    <Input
                      type="number"
                      placeholder="4"
                      {...register(`devUnitMix.${idx}.numberOfUnits` as const)}
                    />
                  </FormField>
                  <FormField label="Size (m²)">
                    <div className="relative">
                      <Input
                        type="number"
                        className="pr-10"
                        placeholder="70"
                        {...register(`devUnitMix.${idx}.avgSizeM2` as const)}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">m²</span>
                    </div>
                  </FormField>
                  <FormField label="Sale £/unit">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input
                        type="number"
                        className="pl-7"
                        placeholder="250000"
                        {...register(`devUnitMix.${idx}.salePricePerUnit` as const)}
                      />
                    </div>
                  </FormField>
                  <FormField label="Rent £/mo (opt.)" hint="For BTR hybrid">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input
                        type="number"
                        className="pl-7"
                        placeholder="0"
                        {...register(`devUnitMix.${idx}.rentalValuePerUnit` as const)}
                      />
                    </div>
                  </FormField>
                </div>
              </div>
            ))}
            {unitMixFields.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total units</span>
                  <span className="font-semibold text-foreground">{devTotalUnits}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total GIA</span>
                  <span className="font-semibold text-foreground">{devTotalGIA.toLocaleString()} m²</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total GDV</span>
                  <span className="font-semibold text-primary">£{devTotalGDV.toLocaleString()}</span>
                </div>
              </div>
            )}
            {/*
              Auto-GDV estimator — queries Land Registry + EPC comps for
              new-build premium pricing via /api/gdv/calculate. One-click
              writes chosen scenario back onto the unit mix salePricePerUnit.
              Only surfaced when we have at least one unit row to price.
            */}
            {unitMixFields.length > 0 && (
              <AutoGdvButton
                postcode={postcodeValue || ""}
                units={devUnitMixWatch.map((u) => ({
                  unitType: String(u?.unitType || "other"),
                  numberOfUnits: Number(u?.numberOfUnits) || 0,
                  avgSizeM2: Number(u?.avgSizeM2) || 0,
                }))}
                constructionType={devConstructionTypeWatch}
                onApplyScenario={(scenario, perUnit) => {
                  perUnit.forEach((row, idx) => {
                    const price =
                      scenario === "conservative"
                        ? row.conservativePerUnit
                        : scenario === "optimistic"
                          ? row.optimisticPerUnit
                          : row.midPerUnit
                    setValue(
                      `devUnitMix.${idx}.salePricePerUnit` as const,
                      price,
                      { shouldDirty: true, shouldValidate: true },
                    )
                  })
                }}
              />
            )}
            {devTriggersAffordable && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                <strong>Affordable housing threshold reached.</strong>{" "}
                Schemes of 10+ units typically trigger statutory affordable-housing
                provision (NPPF + Local Plan) — usually 20–40% discount on sale or
                transfer to a registered provider. Check the LPA&apos;s Supplementary
                Planning Document.
              </div>
            )}
          </div>

          {/* ── 3 · Acquisition Costs ─────────────────────── */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Acquisition Costs</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="SDLT Rate Type" hint="Bare land / commercial schemes use non-residential bands (0/2/5%)">
                <Controller
                  control={control}
                  name="sdltRateType"
                  render={({ field }) => (
                    <Select value={field.value ?? "residential"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="residential">Residential (standard bands + surcharge)</SelectItem>
                        <SelectItem value="non-residential">Non-residential (0/2/5%)</SelectItem>
                        <SelectItem value="mixed-use">Mixed-use (0/2/5%)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Legal Fees">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="5000" {...register("legalFees")} />
                </div>
              </FormField>
              <FormField label="Survey / Due Diligence">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="2500" {...register("surveyCosts")} />
                </div>
              </FormField>
            </div>
          </div>

          {/* ── 4 · Construction Costs ────────────────────── */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Construction Costs</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Build Type">
                <Controller
                  control={control}
                  name="devConstructionType"
                  render={({ field }) => (
                    <Select value={field.value ?? "new-build-traditional"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new-build-traditional">New build — traditional (brick &amp; block)</SelectItem>
                        <SelectItem value="new-build-timber-frame">New build — timber frame</SelectItem>
                        <SelectItem value="new-build-modular">New build — modular / MMC</SelectItem>
                        <SelectItem value="conversion">Conversion (existing to residential)</SelectItem>
                        <SelectItem value="extension">Extension</SelectItem>
                        <SelectItem value="refurbishment">Refurbishment only</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Build Cost / m²" hint="Auto-suggested by type. UK 2024/25 benchmarks (BCIS)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7 pr-12" placeholder="2200" {...register("devBuildCostPerM2")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">/m²</span>
                </div>
              </FormField>
              <FormField label="Abnormals (£)" hint="Demolition, contamination, piling, highways, services">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="0" {...register("devAbnormals")} />
                </div>
              </FormField>
              <FormField label="Contingency" hint="% on construction (typ. 10%)">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("devContingencyPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
            </div>
            {devTotalGIA > 0 && devBuildCostWatch > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Build cost estimate: <strong>£{(devTotalGIA * devBuildCostWatch).toLocaleString()}</strong>
                {" "}({devTotalGIA.toLocaleString()} m² × £{devBuildCostWatch}/m²)
              </p>
            )}
          </div>

          {/* ── 5 · Professional Fees ──────────────────── */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Professional Fees</h3>
            <p className="text-[11px] text-muted-foreground">
              Percentages applied to total construction cost (excl. land).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Architect" hint="Typical 6% of construction">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("devArchitectPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Structural Engineer" hint="Typical 2%">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("devStructuralEngineerPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Quantity Surveyor" hint="Typical 1.5%">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("devQsPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Project Manager" hint="Typical 2%">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("devProjectManagerPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Planning Consultant (£ fixed)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="5000" {...register("devPlanningConsultantFixed")} />
                </div>
              </FormField>
              <FormField label="Building Control (£ fixed)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="2500" {...register("devBuildingControlFixed")} />
                </div>
              </FormField>
              <FormField label="Warranty / NHBC" hint="Rate × total GDV (typical 1.2% of all units' sale value)">
                <div className="relative">
                  <Input type="number" step="0.1" className="pr-7" {...register("devWarrantyPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
            </div>
          </div>

          {/* ── 6 · Planning Obligations ──────────────── */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Planning Obligations</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="CIL Rate (£/m²)" hint="Community Infrastructure Levy — rate × total GIA (£0 if below LPA threshold)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7 pr-12" placeholder="0" {...register("devCILRatePerM2")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">/m²</span>
                </div>
              </FormField>
              <FormField label="S106 Per Unit" hint="Per dwelling × number of units (typical £0–£20k/dwelling for education + open space)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="0" {...register("devS106PerUnit")} />
                </div>
              </FormField>
              <FormField label="Affordable Housing Discount" hint="0–50% average price cut on affordable units">
                <div className="relative">
                  <Input type="number" step="1" className="pr-7" {...register("devAffordableHousingPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Building Regs (£ fixed)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="1200" {...register("devBuildingRegsFixed")} />
                </div>
              </FormField>
            </div>
          </div>

          {/* ── 7 · Development Finance ──────────────── */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Development Finance</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Loan-to-Cost (LTC)" hint="% of total project cost lent — typical 65%">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("devFinanceLTC")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Day-1 Advance" hint="% of facility released on completion of land purchase">
                <div className="relative">
                  <Input type="number" step="1" className="pr-7" {...register("devFinanceDay1Percent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Annual Rate" hint="Typical dev finance 7–10% pa">
                <div className="relative">
                  <Input type="number" step="0.1" className="pr-7" {...register("devFinanceRate")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Arrangement Fee" hint="Typical 2% of facility">
                <div className="relative">
                  <Input type="number" step="0.1" className="pr-7" {...register("devFinanceArrangementFeePercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Monitoring Fee (£/month)" hint="£/month × facility term — lender's QS surveyor cost (typical £500/mo)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="500" {...register("devFinanceMonitoringFeeMonthly")} />
                </div>
              </FormField>
              <FormField label="Facility Term (months)" hint="Total time: land → exit (typ. 18)">
                <Input type="number" {...register("devFinanceTermMonths")} />
              </FormField>
              <FormField label="Exit Fee" hint="Typical 1% of facility on redemption">
                <div className="relative">
                  <Input type="number" step="0.1" className="pr-7" {...register("devFinanceExitFeePercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Interest Treatment">
                <Controller
                  control={control}
                  name="devFinanceRolledUp"
                  render={({ field }) => (
                    <Select
                      value={field.value === false ? "serviced" : "rolled-up"}
                      onValueChange={(v) => field.onChange(v === "rolled-up")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rolled-up">Rolled up (paid at redemption)</SelectItem>
                        <SelectItem value="serviced">Serviced monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>
          </div>

          {/* ── 8 · Exit Strategy ──────────────────── */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Exit Strategy</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Strategy">
                <Controller
                  control={control}
                  name="devExitStrategy"
                  render={({ field }) => (
                    <Select value={field.value ?? "sell-all"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sell-all">Sell all units on completion</SelectItem>
                        <SelectItem value="hold-and-refinance">Hold &amp; refinance (BTR)</SelectItem>
                        <SelectItem value="hybrid">Hybrid — sell some, hold rest</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Sales Agent Fee" hint="% of GDV, typical 1.5%">
                <div className="relative">
                  <Input type="number" step="0.1" className="pr-7" {...register("devSalesAgentPercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Sales Legal (£ per unit)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="1500" {...register("devSalesLegalPerUnit")} />
                </div>
              </FormField>
              <FormField label="Marketing — Fixed (£)" hint="Website + CGI + hoardings for whole scheme">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="15000" {...register("devMarketingCostsFixed")} />
                </div>
              </FormField>
              <FormField label="Marketing — Per Unit (£)" hint="Brochures, show-home staging">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                  <Input type="number" className="pl-7" placeholder="500" {...register("devMarketingPerUnit")} />
                </div>
              </FormField>
            </div>
          </div>

          {/* Development uses purchase price as site acquisition cost */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Financing Notes</h3>
            <p className="text-[11px] text-muted-foreground">
              Site acquisition price is taken from <strong>Purchase Price</strong> above.
              Development finance settings (above) replace the standard mortgage / bridging
              block — cash-purchase buyers can set LTC to 0 and the engine will skip
              finance costs.
            </p>
          </div>
        </>
      )}

      {/* ── Purchase Costs (hidden for R2SA — no purchase; hidden for Development — own section) ── */}
      {!isR2SA && !isDevelopment && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-foreground">Purchase Costs</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField label="Buyer Type" hint="Affects Stamp Duty Land Tax (SDLT) calculation">
                <Controller
                  control={control}
                  name="buyerType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="additional">Second Home / Investment (5% SDLT surcharge)</SelectItem>
                        <SelectItem value="standard">Standard Buyer (primary residence, not a first-time buyer)</SelectItem>
                        <SelectItem value="first-time">First-Time Buyer (0% up to £425k, 5% on £425k–£625k)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>
            <FormField label="Refurbishment Budget" hint={sqftValue ? "Estimated based on property condition and size. Adjust if you have a specific quote." : "Enter manually or set floor size + condition above"}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input type="number" className="pl-7" {...register("refurbishmentBudget")} />
              </div>
            </FormField>
            <FormField label="Legal Fees">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input type="number" className="pl-7" {...register("legalFees")} />
              </div>
            </FormField>
            <FormField label="Survey Costs">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input type="number" className="pl-7" {...register("surveyCosts")} />
              </div>
            </FormField>
            {/* ARV — shown for BRR and Flip */}
            {(isBRR || isFLIP) && (
              <>
                <FormField label="After Repair Value (ARV)" hint="Expected value after renovation">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                    <Input
                      type="number"
                      className="pl-7"
                      placeholder="220000"
                      {...register("arv")}
                    />
                  </div>
                </FormField>
                {/*
                  Auto-ARV estimator — queries Land Registry + EPC comps
                  via /api/arv/calculate. Full-width because the comps
                  table + three scenario tiles need horizontal room.
                */}
                <div className="sm:col-span-2">
                  <AutoArvButton
                    postcode={postcodeValue || ""}
                    propertyType={propertyTypeValue}
                    propertyTypeDetail={propertyTypeDetailValue}
                    bedrooms={bedroomsValue}
                    sqft={sqftValue}
                    currentArv={arvValue}
                    onSelectArv={(val) =>
                      setValue("arv", val, { shouldDirty: true, shouldValidate: true })
                    }
                    onEstimate={(e: ArvEstimate | null) => {
                      // Stash the auto-estimate on a hidden-form field so
                      // downstream sensitivity sliders (Section 5) can
                      // centre on it. Purely additive — other strategies
                      // never read it.
                      if (e && typeof e.midARV === "number") {
                        setValue("arvAutoMid" as never, e.midARV as never, {
                          shouldDirty: false,
                        })
                      }
                    }}
                  />
                </div>
              </>
            )}
            {/* ARV Basis — only BRRRR */}
            {isBRR && (
              <FormField label="ARV Basis" hint="How the ARV was established">
                <Controller
                  control={control}
                  name="arvBasis"
                  render={({ field }) => (
                    <Select value={field.value ?? "comparables"} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comparables">Local comparables</SelectItem>
                        <SelectItem value="surveyor">RICS surveyor</SelectItem>
                        <SelectItem value="agent">Estate agent estimate</SelectItem>
                        <SelectItem value="manual">Manual / other</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            )}
          </div>

          {/* ── BRRRR-specific block ─────────────────────────────── */}
          {isBRR && (
            <div className="mt-2 flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">BRRRR Refurb &amp; Refinance</h4>
                <Info className="size-3.5 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Refurb Contingency" hint="Buffer on top of refurb budget (10–15% typical)">
                  <div className="relative">
                    <Input type="number" step="1" className="pr-7" {...register("refurbContingencyPercent")} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Refurb Duration" hint="Months the property is vacant during works">
                  <Input type="number" {...register("refurbHoldingMonths")} />
                </FormField>
                <FormField label="Holding Cost / month" hint="Insurance + utilities + council tax void">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                    <Input type="number" className="pl-7" {...register("refurbHoldingCostPerMonth")} />
                  </div>
                </FormField>
                <FormField label="Refinance LTV" hint="Typical BTL remortgage LTV (75%)">
                  <div className="relative">
                    <Input type="number" step="0.5" className="pr-7" {...register("refinanceLTV")} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Refinance Rate" hint="Post-refurb BTL mortgage rate">
                  <div className="relative">
                    <Input type="number" step="0.1" className="pr-7" {...register("refinanceRate")} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Refinance Term" hint="Years of new mortgage">
                  <Input type="number" {...register("refinanceTermYears")} />
                </FormField>
                <FormField label="Refinance Arrangement Fee" hint="Typical 1–2% of new loan">
                  <div className="relative">
                    <Input type="number" step="0.1" className="pr-7" {...register("refinanceArrangementFeePercent")} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Refinance Valuation Fee" hint="Lender valuation £300–£500">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                    <Input type="number" className="pl-7" {...register("refinanceValuationFee")} />
                  </div>
                </FormField>
              </div>
            </div>
          )}

          {/* ── Flip-specific block ──────────────────────────────── */}
          {isFLIP && (
            <div className="mt-2 flex flex-col gap-6 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">Flip — Detailed Costs &amp; Exit</h4>
                <Info className="size-3.5 text-muted-foreground" />
              </div>

              {/* ── Refurb cost builder ──────────────────────── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Refurb Cost Builder
                  </h5>
                  {refurbBuilderSum > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setValue("refurbishmentBudget", refurbBuilderSum, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      className="text-[11px] underline text-primary hover:text-primary/80"
                    >
                      Apply £{refurbBuilderSum.toLocaleString()} to Refurb Budget
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Break down your refurb by trade — sum appears below and you can one-click it into the Refurb Budget field above.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Kitchen" hint="Fit-out + appliances">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="6000" {...register("refurbKitchen")} />
                    </div>
                  </FormField>
                  <FormField label="Bathroom(s)" hint="Fit-out + sanitaryware">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="4000" {...register("refurbBathroom")} />
                    </div>
                  </FormField>
                  <FormField label="Flooring" hint="Carpets / laminate / tiles">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="2500" {...register("refurbFlooring")} />
                    </div>
                  </FormField>
                  <FormField label="Decoration" hint="Paint + plastering">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="3000" {...register("refurbDecoration")} />
                    </div>
                  </FormField>
                  <FormField label="Electrical" hint="Rewire + fittings">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="3500" {...register("refurbElectrical")} />
                    </div>
                  </FormField>
                  <FormField label="Plumbing &amp; Heating" hint="New boiler / radiators / pipework">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="3000" {...register("refurbPlumbing")} />
                    </div>
                  </FormField>
                  <FormField label="Exterior" hint="Roof / windows / pointing / garden">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="2000" {...register("refurbExterior")} />
                    </div>
                  </FormField>
                  <FormField label="Structural / Extension" hint="Underpinning, loft conversion, extension">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" placeholder="0" {...register("refurbStructural")} />
                    </div>
                  </FormField>
                </div>
                <FormField label="Refurb Contingency" hint="Buffer on top of refurb budget (10–15% typical)">
                  <div className="relative">
                    <Input type="number" step="1" className="pr-7" {...register("refurbContingencyPercent")} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
              </div>

              {/* ── Holding costs during works ─────────────────── */}
              <div className="flex flex-col gap-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Holding Costs (during works &amp; marketing)
                </h5>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Total Holding Months" hint="From completion to sale completion (works + on-market)">
                    <Input type="number" {...register("flipHoldingMonths")} />
                  </FormField>
                  <FormField label="Council Tax (Monthly)" hint="Unoccupied / void rate — check with local council">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" {...register("flipCouncilTaxMonthly")} />
                    </div>
                  </FormField>
                  <FormField label="Unoccupied Insurance (Monthly)" hint="Specialist vacant-property cover">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" {...register("flipInsuranceMonthly")} />
                    </div>
                  </FormField>
                  <FormField label="Utilities (Monthly)" hint="Standing charges for electric / gas / water during works">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" {...register("flipUtilitiesMonthly")} />
                    </div>
                  </FormField>
                  {tenureTypeValue === "leasehold" && (
                    <FormField label="Service Charge (Monthly)" hint="Leasehold flats only — portioned monthly">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                        <Input type="number" className="pl-7" {...register("flipServiceChargeMonthly")} />
                      </div>
                    </FormField>
                  )}
                </div>
              </div>

              {/* ── Exit strategy ─────────────────────────────── */}
              <div className="flex flex-col gap-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Exit Strategy
                </h5>
                <p className="text-[11px] text-muted-foreground">
                  ARV is set above — use the Auto-Calculate button to pull comps from Land Registry.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Estate Agent Fee" hint="Sale commission, typical 1–2% + VAT">
                    <div className="relative">
                      <Input type="number" step="0.1" className="pr-7" {...register("flipAgentFeePercent")} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                  </FormField>
                  <FormField label="Sale Legal Fees" hint="Solicitor for the sale (separate from purchase legal)">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" {...register("flipSaleLegalFees")} />
                    </div>
                  </FormField>
                  <FormField label="Marketing Costs" hint="Photography, staging, floorplans, virtual tour">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                      <Input type="number" className="pl-7" {...register("flipMarketingCosts")} />
                    </div>
                  </FormField>
                  <FormField label="Time to Sell" hint="Months from listing to completion (typical 2–4)">
                    <Input type="number" {...register("flipSaleMonths")} />
                  </FormField>
                </div>
                {(flipHoldingMonths > 0 || flipSaleMonths > 0) && (
                  <p className="text-[11px] text-muted-foreground">
                    Total project timeline: <strong>{flipHoldingMonths + flipSaleMonths} months</strong>{" "}
                    ({flipHoldingMonths} holding + {flipSaleMonths} on-market)
                  </p>
                )}
              </div>

              {/* ── Tax & ownership ───────────────────────────── */}
              <div className="flex flex-col gap-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tax &amp; Ownership Structure
                </h5>
                <FormField label="Ownership" hint="Individual owners pay CGT; Ltd companies pay Corporation Tax">
                  <Controller
                    control={control}
                    name="flipOwnershipStructure"
                    render={({ field }) => (
                      <Select value={field.value ?? "individual"} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual (Capital Gains Tax)</SelectItem>
                          <SelectItem value="limited-company">Limited Company (Corporation Tax)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
                {flipOwnership === "individual" && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Tax Band" hint="Basic: 18% CGT · Higher/Additional: 24% CGT on residential (2024/25)">
                      <Controller
                        control={control}
                        name="flipTaxBand"
                        render={({ field }) => (
                          <Select value={field.value ?? "higher"} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basic">Basic Rate (under £50,270 income)</SelectItem>
                              <SelectItem value="higher">Higher / Additional Rate</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FormField>
                    <FormField label="CGT Allowance Remaining" hint="£3,000 total for 2024/25 — subtract any gains already used this tax year">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                        <Input type="number" className="pl-7" {...register("flipCGTAllowanceRemaining")} />
                      </div>
                    </FormField>
                    <FormField label="Other Gains This Year" hint="Other taxable gains in same tax year (stocks, second property)">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                        <Input type="number" className="pl-7" {...register("flipOtherGainsThisYear")} />
                      </div>
                    </FormField>
                  </div>
                )}
                {flipOwnership === "limited-company" && (
                  <FormField label="Corporation Tax Rate" hint="19% up to £50k profit · 25% over £250k · marginal relief between (2024/25)">
                    <div className="relative">
                      <Input type="number" step="1" className="pr-7" {...register("flipCorporationTaxRate")} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                  </FormField>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Financing (hidden for R2SA + Development — own finance section) ── */}
      {!isR2SA && !isDevelopment && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-foreground">Financing</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Purchase Type">
              <Controller
                control={control}
                name="purchaseType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mortgage">Mortgage</SelectItem>
                      <SelectItem value="bridging-loan">Bridging Loan</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            {/* Deposit — shown for mortgage and bridging (not cash) */}
            {!isCash && (
              <FormField label="Deposit" hint="% of purchase price">
                <div className="relative">
                  <Input
                    type="number"
                    step="0.5"
                    className="pr-7"
                    {...register("depositPercentage")}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
            )}
            {/* Mortgage-specific fields */}
            {!isCash && !isBridging && (
              <>
                <FormField label="Interest Rate">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      className="pr-7"
                      {...register("interestRate")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Mortgage Term" hint="In years">
                  <Input type="number" {...register("mortgageTerm")} />
                </FormField>
                <FormField label="Mortgage Type">
                  <Controller
                    control={control}
                    name="mortgageType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interest-only">Interest Only</SelectItem>
                          <SelectItem value="repayment">Repayment (Capital &amp; Interest)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              </>
            )}
            {/* Capital Growth — visible for all non-R2SA types */}
            <FormField
              label="Capital Growth (annual)"
              hint="Used in 5-year projection (default 4%)"
            >
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  className="pr-7"
                  placeholder="4"
                  {...register("capitalGrowthRate")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </FormField>

            {/* Bridging Loan Detail Fields */}
            {isBridging && (
              <>
                <FormField label="Bridging LTV" hint="% of purchase price bridging covers (typical 65–75%)">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.5"
                      className="pr-7"
                      {...register("bridgingLTV")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Monthly Rate" hint="% per month (e.g. 0.75)">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.05"
                      className="pr-7"
                      {...register("bridgingMonthlyRate")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Loan Term" hint="Months (e.g. 12)">
                  <Input type="number" {...register("bridgingTermMonths")} />
                </FormField>
                <FormField label="Arrangement Fee" hint="% of loan">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      className="pr-7"
                      {...register("bridgingArrangementFee")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Exit Fee" hint="% of loan">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      className="pr-7"
                      {...register("bridgingExitFee")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── HMO Room Details ──────────────────────────────────────────── */}
      {isHMO && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-foreground">HMO Room Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Number of Rooms">
              <Input type="number" placeholder="5" {...register("roomCount")} />
            </FormField>
            <FormField label="Avg Room Rate" hint="Monthly rent per room">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input
                  type="number"
                  className="pl-7"
                  placeholder="450"
                  {...register("avgRoomRate")}
                />
              </div>
            </FormField>
          </div>
          {/* Live total rent preview */}
          {hmoTotalRent > 0 && (
            <div className="rounded-lg bg-primary/5 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total monthly rent: </span>
              <span className="font-semibold text-foreground">
                £{hmoTotalRent.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground ml-1">
                ({roomCountValue} rooms × £{avgRoomRateValue} per room)
              </span>
            </div>
          )}
          {/* HMO void and management fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Void Period" hint={`Per-room void weeks/year (e.g. 1 room vacant for ${watch("voidWeeks") || 4} weeks)`}>
              <Input type="number" {...register("voidWeeks")} />
            </FormField>
            <FormField label="Management Fee" hint="% of rent (HMOs typically 12-15%)">
              <div className="relative">
                <Input
                  type="number"
                  step="0.5"
                  className="pr-7"
                  {...register("managementFeePercent")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </FormField>
          </div>
          {/* HMO licence — one-off council fee, amortised over licence term */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="HMO Licence Cost" hint="Council licence fee (typically £500-£1,500)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input
                  type="number"
                  className="pl-7"
                  placeholder="1000"
                  {...register("hmoLicenceCost")}
                />
              </div>
            </FormField>
            <FormField label="Licence Term" hint="Years — most councils issue 5-year licences">
              <div className="relative">
                <Input
                  type="number"
                  className="pr-12"
                  placeholder="5"
                  {...register("hmoLicenceTermYears")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">yrs</span>
              </div>
            </FormField>
          </div>
        </div>
      )}

      {/* ── Rental Income (hidden for HMO — room×rate; hidden for Flip — sell strategy; hidden for R2SA — handled in SA section; hidden for Development — exit strategy) */}
      {!isHMO && !isFLIP && !isR2SA && !isDevelopment && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {isR2SA ? "Rental Details" : "Rental Income"}
            </h3>
            {prefilled && !isR2SA && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                <Info className="size-3" />
                Required
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label={isR2SA ? "Monthly Rent to Landlord" : "Expected Monthly Rent"}
              error={errors.monthlyRent?.message}
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input
                  type="number"
                  className="pl-7"
                  placeholder="1200"
                  {...register("monthlyRent")}
                />
              </div>
            </FormField>
            {!isR2SA && (
              <>
                <FormField label="Annual Rent Increase" hint="Estimated %">
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.5"
                      className="pr-7"
                      {...register("annualRentIncrease")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Void Period" hint="Weeks per year without tenants">
                  <Input type="number" {...register("voidWeeks")} />
                </FormField>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── R2SA — Serviced Accommodation Details ───────────────────── */}
      {isR2SA && (
        <div className="flex flex-col gap-6">
          {/* Ownership toggle */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Property Ownership</h3>
            <Controller
              name="saOwnershipType"
              control={control}
              render={({ field }) => (
                <div className="flex gap-2">
                  {(["own", "rent-to-sa"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => field.onChange(opt)}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                        field.value === opt
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {opt === "own" ? "I own this property" : "Rent-to-SA (I rent & sublet)"}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {/* SA Income */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">SA Income</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Average nightly rate (£)" hint="Your target or current average nightly rate">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input type="number" className="pl-7" placeholder="120" {...register("saNightlyRate")} />
                </div>
              </FormField>
              <FormField label="Expected occupancy rate (%)" hint="Industry average is 60-70% for UK SA">
                <div className="relative">
                  <Input type="number" step="1" className="pr-7" {...register("saOccupancyRate")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
            </div>
            {/* Auto-calculated monthly income */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated Monthly Income</span>
                <span className="text-lg font-bold text-primary">
                  £{saEstimatedMonthly.toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                = £{saNightlyRate} × {saOccupancyRate}% × 30 nights
              </p>
            </div>
          </div>

          {/* SA Costs */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">SA Costs (Monthly)</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Platform commission (%)" hint="Airbnb/Booking.com typically charge 12-20%">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("saPlatformFeePercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Cleaning cost per turnover (£)" hint="Typical £50-£150 depending on property size">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input type="number" className="pl-7" placeholder="80" {...register("saCleaningCostPerStay")} />
                </div>
              </FormField>
              <FormField label="Avg stays per month" hint="Number of guest turnovers per month">
                <Input type="number" placeholder="8" {...register("saAvgStaysPerMonth")} />
              </FormField>
              <FormField label="Monthly rent or lease (£)" hint="Leave as 0 if you own the property">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input type="number" className="pl-7" placeholder="0" {...register("saMonthlyLease")} />
                </div>
              </FormField>
              <FormField label="Utilities (Monthly)" hint="Electric, gas, water, WiFi, council tax">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input type="number" className="pl-7" {...register("saUtilitiesMonthly")} />
                </div>
              </FormField>
              <FormField label="Insurance (Annual)" hint="SA-specific insurance">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input type="number" className="pl-7" {...register("saInsuranceAnnual")} />
                </div>
              </FormField>
              <FormField label="SA management fee (%)" hint="If using a management company (typically 15-25%)">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("saManagementFeePercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
              <FormField label="Maintenance (% of revenue)" hint="Ongoing repairs and replacements">
                <div className="relative">
                  <Input type="number" step="0.5" className="pr-7" {...register("saMaintenancePercent")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
            </div>
          </div>

          {/* SA Financing — only if owned */}
          {saOwnershipType === "own" && (
            <div className="flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">Financing</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Purchase Price (£)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                    <Input type="number" className="pl-7" {...register("purchasePrice")} />
                  </div>
                </FormField>
                <FormField label="Deposit (%)">
                  <div className="relative">
                    <Input type="number" step="1" className="pr-7" {...register("depositPercentage")} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
                <FormField label="Mortgage Rate (%)">
                  <div className="relative">
                    <Input type="number" step="0.1" className="pr-7" {...register("interestRate")} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormField>
              </div>
            </div>
          )}

          {/* Setup costs */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Setup</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Setup / Furnishing Costs" hint="One-off cost to furnish the property for SA">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                  <Input type="number" className="pl-7" placeholder="5000" {...register("saSetupCosts")} />
                </div>
              </FormField>
            </div>
          </div>
        </div>
      )}

      {/* ── Running Costs (hidden for R2SA; hidden for Development — not a hold strategy) */}
      {!isR2SA && !isDevelopment && (
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-foreground">Running Costs</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Management fee — only shown here for non-HMO (HMO has it in its own section) */}
            {!isHMO && (
              <FormField label="Management Fee" hint="% of rent">
                <div className="relative">
                  <Input
                    type="number"
                    step="0.5"
                    className="pr-7"
                    {...register("managementFeePercent")}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </FormField>
            )}
            <FormField label="Insurance (Annual)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input type="number" className="pl-7" {...register("insurance")} />
              </div>
            </FormField>
            <FormField
              label="Maintenance"
              hint={
                maintenanceMode === "percent"
                  ? "% of annual rent (industry standard: 10%)"
                  : "Flat annual maintenance budget"
              }
            >
              <div className="flex gap-2">
                <Select
                  value={maintenanceMode}
                  onValueChange={(v: "percent" | "flat") => {
                    setMaintenanceMode(v)
                    // Zero the unused field so the calc engine's
                    // "prefer % when > 0, else flat" branch is unambiguous.
                    if (v === "percent") setValue("maintenance", 0)
                    else setValue("maintenancePercent", 0)
                  }}
                >
                  <SelectTrigger className="w-24 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">%</SelectItem>
                    <SelectItem value="flat">£</SelectItem>
                  </SelectContent>
                </Select>
                {maintenanceMode === "percent" ? (
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      step="0.5"
                      className="pr-7"
                      placeholder="10"
                      {...register("maintenancePercent")}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                ) : (
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                    <Input
                      type="number"
                      className="pl-7"
                      placeholder="500"
                      {...register("maintenance")}
                    />
                  </div>
                )}
              </div>
            </FormField>
            <FormField label="Ground Rent (Annual)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input type="number" className="pl-7" {...register("groundRent")} />
              </div>
            </FormField>
            <FormField label="Bills (Monthly)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{"£"}</span>
                <Input type="number" className="pl-7" {...register("bills")} />
              </div>
            </FormField>
          </div>
        </div>
      )}

      <Button type="submit" size="xl" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Analysing Deal...
          </>
        ) : (
          "Analyse This Deal"
        )}
      </Button>
    </form>
  )
}
