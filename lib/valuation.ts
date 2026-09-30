/** Average sold price relative to the asking price, using asking as the denominator. */
export function soldPriceDifference(average: number | undefined, asking: number | undefined): number | null {
  if (!average || !asking || average <= 0 || asking <= 0) return null
  return ((average - asking) / asking) * 100
}
