"use client"

/**
 * Feature B — Strategy Switch Toggle.
 *
 * A row of strategy pills shown at the top of the results page. Selecting a
 * different strategy opens a mini-form modal that asks ONLY for the fields
 * that strategy genuinely needs (everything else is carried over from the
 * current analysis), then re-runs the analysis under the new strategy.
 *
 * The actual re-analysis lives in the parent (page.tsx owns formData +
 * handleManualSubmit + router); this component just collects inputs and
 * hands back a merged PropertyFormData via `onSwitch`.
 */
import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import type { InvestmentType, PropertyFormData, BackendResults } from "@/lib/types"
import { formatCurrency } from "@/lib/calculations"

interface FieldDef {
  key: keyof PropertyFormData
  label: string
  prefix?: string
  suffix?: string
  /** Suggested starting value when the field isn't already known. */
  suggest: (d: PropertyFormData, ctx: { avgRent: number | null; avgSold: number | null }) => number | undefined
}

const STRATEGY_META: Record<
  InvestmentType,
  { label: string; icon: string; fullName: string }
> = {
  btl: { label: "BTL", icon: "🏠", fullName: "Buy-to-Let" },
  hmo: { label: "HMO", icon: "🏘", fullName: "HMO" },
  brr: { label: "BRR", icon: "🔄", fullName: "BRRRR" },
  flip: { label: "Flip", icon: "🔨", fullName: "Flip" },
  r2sa: { label: "SA", icon: "🌟", fullName: "Serviced Accommodation" },
  development: { label: "Dev", icon: "🏗", fullName: "Development" },
}

const STRATEGY_ORDER: InvestmentType[] = ["btl", "hmo", "brr", "flip", "r2sa", "development"]

// Strategy-specific fields the modal collects. Base property details
// (price, deposit, mortgage, legals…) are always carried over silently.
const STRATEGY_FIELDS: Record<InvestmentType, FieldDef[]> = {
  btl: [
    {
      key: "monthlyRent",
      label: "Monthly Rent",
      prefix: "£",
      suffix: "/mo",
      suggest: (d, c) =>
        d.monthlyRent ||
        (d.roomCount && d.avgRoomRate ? d.roomCount * d.avgRoomRate : undefined) ||
        c.avgRent ||
        Math.round(d.purchasePrice * 0.005),
    },
  ],
  hmo: [
    { key: "roomCount", label: "Number of Rooms", suggest: (d) => d.roomCount || (d.bedrooms >= 5 ? d.bedrooms : d.bedrooms + 1) },
    { key: "avgRoomRate", label: "Rent per Room", prefix: "£", suffix: "/mo", suggest: (d) => d.avgRoomRate || 550 },
    { key: "bills", label: "Bills (Monthly)", prefix: "£", suffix: "/mo", suggest: (d) => d.bills || 300 },
  ],
  brr: [
    { key: "arv", label: "After-Repair Value (ARV)", prefix: "£", suggest: (d, c) => d.arv || c.avgSold || Math.round(d.purchasePrice * 1.3) },
    { key: "refurbishmentBudget", label: "Refurb Budget", prefix: "£", suggest: (d) => d.refurbishmentBudget || Math.round(d.purchasePrice * 0.15) },
    { key: "refinanceLTV", label: "Refinance LTV", suffix: "%", suggest: (d) => d.refinanceLTV || 75 },
  ],
  flip: [
    { key: "arv", label: "After-Repair Value (ARV)", prefix: "£", suggest: (d, c) => d.arv || c.avgSold || Math.round(d.purchasePrice * 1.25) },
    { key: "refurbishmentBudget", label: "Refurb Budget", prefix: "£", suggest: (d) => d.refurbishmentBudget || Math.round(d.purchasePrice * 0.15) },
    { key: "flipAgentFeePercent", label: "Sale Agent Fee", suffix: "%", suggest: (d) => d.flipAgentFeePercent || 1.5 },
  ],
  r2sa: [
    { key: "saNightlyRate", label: "Nightly Rate", prefix: "£", suffix: "/night", suggest: (d) => d.saNightlyRate || 120 },
    { key: "saOccupancyRate", label: "Occupancy", suffix: "%", suggest: (d) => d.saOccupancyRate || 65 },
    { key: "saPlatformFeePercent", label: "Platform Fee", suffix: "%", suggest: (d) => d.saPlatformFeePercent || 15 },
    { key: "saCleaningCostPerStay", label: "Cleaning per Stay", prefix: "£", suggest: (d) => d.saCleaningCostPerStay || 80 },
    { key: "saUtilitiesMonthly", label: "Utilities (Monthly)", prefix: "£", suffix: "/mo", suggest: (d) => d.saUtilitiesMonthly || 200 },
  ],
  development: [], // routed to the full builder — too detailed for a mini-form
}

// Defaults applied on switch so the chosen strategy's engine never sees
// NaN/undefined for fields the mini-form doesn't ask about.
function strategyDefaults(target: InvestmentType, d: PropertyFormData): Partial<PropertyFormData> {
  switch (target) {
    case "hmo":
      return { hmoLicenceCost: d.hmoLicenceCost ?? 1000, insurance: d.insurance || 800 }
    case "brr":
      return {
        arvBasis: d.arvBasis ?? "manual",
        bridgingLTV: d.bridgingLTV ?? 70,
        bridgingMonthlyRate: d.bridgingMonthlyRate ?? 0.75,
        bridgingTermMonths: d.bridgingTermMonths ?? 6,
        refinanceRate: d.refinanceRate ?? d.interestRate ?? 5.5,
        refinanceTermYears: d.refinanceTermYears ?? 25,
        refurbContingencyPercent: d.refurbContingencyPercent ?? 10,
        brrrExitStrategy: d.brrrExitStrategy ?? "btl",
      }
    case "flip":
      return {
        arvBasis: d.arvBasis ?? "manual",
        flipOwnershipStructure: d.flipOwnershipStructure ?? "individual",
        flipTaxBand: d.flipTaxBand ?? "higher",
        flipSaleMonths: d.flipSaleMonths ?? 3,
        flipHoldingMonths: d.flipHoldingMonths ?? 6,
      }
    case "r2sa":
      return {
        saOwnershipType: d.saOwnershipType ?? "own",
        saManagementFeePercent: d.saManagementFeePercent ?? 20,
        saMaintenancePercent: d.saMaintenancePercent ?? 5,
        saInsuranceAnnual: d.saInsuranceAnnual ?? 800,
        saAvgStaysPerMonth: d.saAvgStaysPerMonth ?? 8,
      }
    default:
      return {}
  }
}

interface StrategySwitcherProps {
  data: PropertyFormData
  backendData?: BackendResults | null
  /** Hand back a fully-merged form ready to re-analyse. */
  onSwitch: (newData: PropertyFormData) => void
  isSwitching?: boolean
  /** Strategy to offer a "← Back to X" breadcrumb for, if any. */
  backStrategy?: InvestmentType | null
  onBack?: () => void
  /** Lets the panel's "Switch →" buttons open this modal externally. */
  externalTarget?: InvestmentType | null
  onExternalTargetHandled?: () => void
}

export function StrategySwitcher({
  data,
  backendData,
  onSwitch,
  isSwitching,
  backStrategy,
  onBack,
  externalTarget,
  onExternalTargetHandled,
}: StrategySwitcherProps) {
  const current = data.investmentType
  const [target, setTarget] = useState<InvestmentType | null>(null)
  const [inputs, setInputs] = useState<Record<string, number>>({})

  const ctx = useMemo(() => {
    const rents = (backendData?.rent_comparables ?? [])
      .map((r) => r.monthly_rent)
      .filter((n): n is number => !!n)
    const avgRent = rents.length
      ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length)
      : backendData?.postcode_benchmark?.median_monthly_rent ?? null
    const avgSold =
      backendData?.avg_sold_price ??
      (() => {
        const s = (backendData?.sold_comparables ?? []).map((x) => x.price).filter((n): n is number => !!n)
        return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null
      })()
    return { avgRent, avgSold }
  }, [backendData])

  // Open the modal for a target, seeding suggested values.
  function openModal(next: InvestmentType) {
    if (next === current) return
    const seeded: Record<string, number> = {}
    for (const f of STRATEGY_FIELDS[next]) {
      const v = f.suggest(data, ctx)
      if (typeof v === "number" && !Number.isNaN(v)) seeded[f.key as string] = v
    }
    setInputs(seeded)
    setTarget(next)
  }

  // React to the Alternative-panel "Switch →" buttons (external trigger).
  useEffect(() => {
    if (externalTarget && externalTarget !== current) {
      openModal(externalTarget)
      onExternalTargetHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTarget])

  function closeModal() {
    setTarget(null)
    setInputs({})
  }

  function submit() {
    if (!target) return
    const merged: PropertyFormData = {
      ...data,
      ...strategyDefaults(target, data),
      ...(inputs as Partial<PropertyFormData>),
      investmentType: target,
    }
    closeModal()
    onSwitch(merged)
  }

  const reassurance: Array<[string, string]> = [
    ["Purchase price", formatCurrency(data.purchasePrice || 0)],
    ["Deposit", `${data.depositPercentage ?? 25}%`],
    ["Mortgage rate", `${data.interestRate ?? 5}%`],
    ["Legal fees", formatCurrency(data.legalFees || 0)],
  ]

  return (
    <div id="strategy-switcher" className="flex scroll-mt-20 flex-col gap-2 rounded-xl border border-border/50 bg-card p-4 print:hidden">
      <span className="text-xs font-medium text-muted-foreground">Analysing as:</span>

      {/* Pill toggle — horizontal scroll on mobile, wraps on desktop */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        {STRATEGY_ORDER.map((s) => {
          const meta = STRATEGY_META[s]
          const isCurrent = s === current
          const isDev = s === "development"
          return (
            <button
              key={s}
              type="button"
              disabled={isDev || isSwitching}
              title={isDev ? "Use the full form for development schemes" : undefined}
              onClick={() => openModal(s)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : isDev
                  ? "cursor-not-allowed border-border/40 text-muted-foreground/40"
                  : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <span aria-hidden>{meta.icon}</span>
              {meta.label}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Currently: <span className="font-medium text-foreground">{STRATEGY_META[current].fullName}</span>
        {" — pick another to re-analyse this property."}
      </p>

      {/* Back breadcrumb */}
      {backStrategy && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-fit text-xs font-medium text-primary hover:underline"
        >
          ← Back to {STRATEGY_META[backStrategy].label} analysis
        </button>
      )}

      {/* ── Mini-form modal ── full-screen on mobile, centred on desktop ── */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[100dvh] w-full flex-col overflow-y-auto rounded-t-2xl bg-card p-6 shadow-xl sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-foreground">
                Switch to {STRATEGY_META[target].fullName} Analysis
              </h3>
              <button type="button" onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              We&apos;ve kept your property details. Just fill in the {STRATEGY_META[target].label}-specific info:
            </p>

            {/* Missing fields */}
            <div className="flex flex-col gap-3">
              {STRATEGY_FIELDS[target].map((f) => (
                <label key={f.key as string} className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">{f.label}</span>
                  <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background px-3 py-2 focus-within:border-primary">
                    {f.prefix && <span className="text-sm text-muted-foreground">{f.prefix}</span>}
                    <input
                      type="number"
                      inputMode="decimal"
                      value={inputs[f.key as string] ?? ""}
                      onChange={(e) =>
                        setInputs((prev) => ({ ...prev, [f.key as string]: Number(e.target.value) }))
                      }
                      className="w-full bg-transparent text-sm text-foreground outline-none"
                    />
                    {f.suffix && <span className="text-sm text-muted-foreground">{f.suffix}</span>}
                  </div>
                </label>
              ))}
            </div>

            {/* Reassurance — carried-over base data */}
            <div className="mt-4 rounded-lg border border-border/40 bg-muted/30 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Everything else carried over:</p>
              <ul className="flex flex-col gap-1">
                {reassurance.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">✓ {k}</span>
                    <span className="font-medium text-foreground">{v}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={isSwitching}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                Analyse as {STRATEGY_META[target].label} →
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-border/60 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
