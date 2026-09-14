import {
  STRATEGY_HINTS,
  type AnalyserInvestmentType,
  type StrategyHint,
} from "./types"

/**
 * Flask wire spelling: lowercase `btl | hmo | brrr | flip | sa | development`.
 * `r2sa` → `sa`. Empty / OTHER → `btl` (same as omitting strategyHint).
 */
export function normaliseStrategyHint(raw: unknown): StrategyHint | null {
  if (raw == null) return "btl"
  if (typeof raw !== "string") return null
  const key = raw.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-")
  if (!key || key === "other") return "btl"
  if (key === "brr" || key === "brrr" || key === "brrrr" || key === "brrrrr") {
    return "brrrr"
  }
  if (
    key === "sa" ||
    key === "r2sa" ||
    key === "r-2-sa" ||
    key === "serviced" ||
    key === "serviced-accommodation" ||
    key === "short-let" ||
    key === "shortlet"
  ) {
    return "sa"
  }
  if (key === "buy-to-let" || key === "buytolet") return "btl"
  if (key === "dev" || key === "development") return "development"
  return (STRATEGY_HINTS as readonly string[]).includes(key)
    ? (key as StrategyHint)
    : null
}

/** Map a Flask hint onto the analyser form's `investmentType`. */
export function strategyHintToInvestmentType(
  hint: StrategyHint,
): AnalyserInvestmentType {
  if (hint === "brrrr") return "brr"
  if (hint === "sa") return "r2sa"
  return hint
}

export function isStrategyHint(value: unknown): value is StrategyHint {
  return normaliseStrategyHint(value) !== null
}
