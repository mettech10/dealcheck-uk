import { computeScreenMetrics } from "./metrics"
import { normaliseStrategyHint } from "./strategy"
import type {
  RuleOutcome,
  ScreenerRules,
  ScreenerRulesPreset,
  ScreenVerdict,
  StrategyHint,
} from "./types"

export const DEFAULT_RULES_PRESET: ScreenerRulesPreset = {
  id: "default",
  name: "Default screen",
  rules: {
    maxPrice: 250_000,
    minBeds: 2,
    minGrossYield: 6,
    minSimpleCashflow: 0,
    strategies: ["btl", "brrrr", "hmo"],
  },
}

function money(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`
}

export interface EvaluateInput {
  price: number
  bedrooms: number | null
  monthlyRent: number | null | undefined
  strategyHint: StrategyHint | string | null | undefined
}

export function evaluateRules(
  listing: EvaluateInput,
  rules: ScreenerRules,
): ScreenVerdict {
  const metrics = computeScreenMetrics({
    price: listing.price,
    monthlyRent: listing.monthlyRent,
  })

  const hint = normaliseStrategyHint(listing.strategyHint)

  const outcomes: RuleOutcome[] = [
    {
      id: "maxPrice",
      label: "Max price",
      status: listing.price > 0 && listing.price <= rules.maxPrice ? "pass" : "fail",
      actual: listing.price > 0 ? money(listing.price) : "Unknown",
      required: `≤ ${money(rules.maxPrice)}`,
    },
    {
      id: "minBeds",
      label: "Min bedrooms",
      status:
        listing.bedrooms != null && listing.bedrooms >= rules.minBeds
          ? "pass"
          : "fail",
      actual:
        listing.bedrooms != null ? String(listing.bedrooms) : "Unknown",
      required: `≥ ${rules.minBeds}`,
    },
    yieldOutcome(metrics.grossYield, rules.minGrossYield, listing.monthlyRent),
    cashflowOutcome(
      metrics.simpleCashflow,
      rules.minSimpleCashflow,
      listing.monthlyRent,
    ),
    strategyOutcome(hint, rules.strategies),
  ]

  return {
    pass: outcomes.every((o) => o.status === "pass"),
    metrics,
    outcomes,
  }
}

function yieldOutcome(
  grossYield: number | null,
  minGrossYield: number,
  monthlyRent: number | null | undefined,
): RuleOutcome {
  const required = `≥ ${minGrossYield}%`
  if (monthlyRent == null || !(monthlyRent > 0)) {
    return {
      id: "minGrossYield",
      label: "Min gross yield",
      status: "pending",
      actual: "Enter monthly rent",
      required,
      detail: "Yield uses the rent you type — it is never scraped.",
    }
  }
  if (grossYield == null) {
    return {
      id: "minGrossYield",
      label: "Min gross yield",
      status: "fail",
      actual: "n/a",
      required,
    }
  }
  return {
    id: "minGrossYield",
    label: "Min gross yield",
    status: grossYield >= minGrossYield ? "pass" : "fail",
    actual: `${grossYield.toFixed(2)}%`,
    required,
  }
}

function cashflowOutcome(
  simpleCashflow: number | null,
  minSimpleCashflow: number,
  monthlyRent: number | null | undefined,
): RuleOutcome {
  const required = `≥ ${money(minSimpleCashflow)}/mo`
  if (monthlyRent == null || !(monthlyRent > 0)) {
    return {
      id: "minSimpleCashflow",
      label: "Min simple cashflow",
      status: "pending",
      actual: "Enter monthly rent",
      required,
      detail: "Rent − 75% LTV interest-only at 5%. Not the analyser.",
    }
  }
  if (simpleCashflow == null) {
    return {
      id: "minSimpleCashflow",
      label: "Min simple cashflow",
      status: "fail",
      actual: "n/a",
      required,
    }
  }
  const signed =
    simpleCashflow < 0
      ? `-£${Math.abs(Math.round(simpleCashflow)).toLocaleString("en-GB")}`
      : money(simpleCashflow)
  return {
    id: "minSimpleCashflow",
    label: "Min simple cashflow",
    status: simpleCashflow >= minSimpleCashflow ? "pass" : "fail",
    actual: `${signed}/mo`,
    required,
  }
}

function strategyOutcome(
  hint: StrategyHint | null,
  allowList: StrategyHint[],
): RuleOutcome {
  if (!allowList.length) {
    return {
      id: "strategyAllowList",
      label: "Strategy",
      status: hint ? "pass" : "pending",
      actual: hint ?? "Pick a strategy",
      required: "Any",
    }
  }
  if (!hint) {
    return {
      id: "strategyAllowList",
      label: "Strategy",
      status: "pending",
      actual: "Pick a strategy",
      required: allowList.join(", "),
    }
  }
  return {
    id: "strategyAllowList",
    label: "Strategy",
    status: allowList.includes(hint) ? "pass" : "fail",
    actual: hint,
    required: allowList.join(", "),
  }
}
