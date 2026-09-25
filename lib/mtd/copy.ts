/** English count labels for MTD pack / ledger chrome. */
export function countNoun(count: number, singular: string, plural?: string): string {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count} ${noun}`
}

export function entryCountLabel(count: number): string {
  return countNoun(count, "entry", "entries")
}
