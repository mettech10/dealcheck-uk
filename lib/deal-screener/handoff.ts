import { SCHEMA_VERSION, type HandoffRequestV1, type NormalisedListingV1, type StrategyHint } from "./types"
import { stripPhotos } from "./normalize"
import { normaliseStrategyHint } from "./strategy"

export function idempotencyKey(
  source: string,
  sourceListingId: string,
): string {
  return `screener:${source}:${sourceListingId}`
}

export function buildHandoffRequest(
  listing: NormalisedListingV1,
  strategyHint: StrategyHint | string,
): HandoffRequestV1 {
  const hint = normaliseStrategyHint(strategyHint)
  if (!hint) {
    throw new Error(`Invalid strategyHint: ${String(strategyHint)}`)
  }
  if (!listing.sourceListingId) {
    throw new Error("sourceListingId is required")
  }
  const cleaned = stripPhotos(
    listing as unknown as Record<string, unknown>,
  ) as unknown as NormalisedListingV1

  return {
    source: "screener",
    schemaVersion: SCHEMA_VERSION,
    strategyHint: hint,
    listing: cleaned,
  }
}
