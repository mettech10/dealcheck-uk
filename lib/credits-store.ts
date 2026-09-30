export interface CreditsResponse {
  authenticated: boolean
  tier: string
  isUnlimited: boolean
  creditBalance: number
  freeUsed: number
  freeLimit: number
}

export const CREDITS_REFRESH_EVENT = "metalyzi:credits-refresh"
export interface CreditsRefreshDetail { newCreditBalance?: number }
export const CREDITS_STORAGE_KEY = "metalyzi:credits-changed"

/** Shared snapshot; late responses must never overwrite a newer deduction. */
export function createCreditsStore(fetchCredits: () => Promise<CreditsResponse>) {
  let state: CreditsResponse | null = null
  let revision = 0
  let paidOverride: number | undefined
  const listeners = new Set<() => void>()
  const publish = () => listeners.forEach((listener) => listener())
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refresh() {
      const request = ++revision
      try {
        const next = await fetchCredits()
        if (request !== revision) return
        state = paidOverride === undefined ? next : { ...next, creditBalance: paidOverride }
        paidOverride = undefined
      } catch {
        if (request !== revision) return
        state = null
      }
      publish()
    },
    applyBalance(balance: number) {
      if (!Number.isFinite(balance) || balance < 0) return
      if (state) {
        ++revision
        state = { ...state, creditBalance: balance }
        publish()
      } else {
        paidOverride = balance
      }
    },
  }
}
