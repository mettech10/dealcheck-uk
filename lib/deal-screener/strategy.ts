import {
  STRATEGY_HINTS,
  type AnalyserInvestmentType,
  type StrategyHint,
} from "./types"

/**
 * Canonical strategy-hint spelling on the wire: lowercase, `brrrr`
 * (not `BRR` / `brr` / `BRRRR`). Anything unrecognised returns null.
 */
export function normaliseStrategyHint(raw: unknown): StrategyHint | null {
  if (typeof raw !== "string") return null
  const key = raw.trim().toLowerCase()
  if (key === "brr" || key === "brrr" || key === "brrrr" || key === "brrrrr") {
    return "brrrr"
  }
  if (key === "sa" || key === "r2sa" || key === "serviced") return "r2sa"
  if (key === "buy-to-let" || key === "buy_to_let") return "btl"
  return (STRATEGY_HINTS as readonly string[]).includes(key)
    ? (key as StrategyHint)
    : null
}

/** Map a screener hint onto the analyser form's `investmentType`. */
export function strategyHintToInvestmentType(
  hint: StrategyHint,
): AnalyserInvestmentType {
  if (hint === "brrrr") return "brr"
  return hint
}

export function isStrategyHint(value: unknown): value is StrategyHint {
  return normaliseStrategyHint(value) !== null
}
