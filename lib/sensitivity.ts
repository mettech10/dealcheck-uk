/** Preserve explicit zero and fractional void weeks when opening a scenario. */
export function vacancyPercent(voidWeeks: number | null | undefined): number {
  return ((voidWeeks ?? 0) / 52) * 100
}

export function vacancyWeeks(percent: number): number {
  return (percent / 100) * 52
}
