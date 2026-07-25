/**
 * Council tax band extraction — one source of truth.
 *
 * Listings state the band many ways ("Council Tax Band A", "Council Tax
 * Band - A", "Council Tax Band: A", "Council Tax: Band B"), and it's often
 * only mentioned in the free-text description rather than a structured
 * field. This helper pulls it out so the band can be shown as a proper
 * property fact instead of being buried in the description.
 */

/** Allows an optional separator before AND after the word "band". */
const COUNCIL_TAX_RE =
  /council\s*tax\s*(?:band)?\s*[:\-–—]?\s*(?:band)?\s*[:\-–—]?\s*\b([A-H])\b/i

/**
 * Returns the band letter (A–H) from any of the supplied text sources, or
 * null when none state it. Sources are checked in order, so pass the most
 * authoritative (a structured field) first.
 */
export function extractCouncilTaxBand(
  ...sources: Array<string | string[] | null | undefined>
): string | null {
  for (const src of sources) {
    if (!src) continue
    const text = Array.isArray(src) ? src.join(" ") : String(src)
    if (!text.trim()) continue

    // A bare structured value like "A" or "Band C".
    const bare = text.trim().match(/^(?:band\s*)?([A-H])$/i)
    if (bare) return bare[1].toUpperCase()

    const m = text.match(COUNCIL_TAX_RE)
    if (m) return m[1].toUpperCase()
  }
  return null
}
