import { expect, test, vi } from "vitest"
import { createCreditsStore, type CreditsResponse } from "@/lib/credits-store"
const initial: CreditsResponse = { authenticated: true, tier: "free", isUnlimited: false, creditBalance: 3, freeUsed: 3, freeLimit: 3 }

test("all three credit displays receive the same post-deduction snapshot", async () => {
  const store = createCreditsStore(async () => initial)
  const header = vi.fn(), rail = vi.fn(), resultCard = vi.fn()
  store.subscribe(header); store.subscribe(rail); store.subscribe(resultCard)
  await store.refresh()
  store.applyBalance(2)
  expect(store.getSnapshot()?.creditBalance).toBe(2)
  for (const consumer of [header, rail, resultCard]) expect(consumer).toHaveBeenCalledTimes(2)
})
test("a request started before deduction cannot restore an old balance", async () => {
  let resolve!: (value: CreditsResponse) => void
  const fetch = vi.fn().mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const store = createCreditsStore(fetch)
  await store.refresh()
  const pending = store.refresh()
  store.applyBalance(2)
  resolve(initial)
  await pending
  expect(store.getSnapshot()?.creditBalance).toBe(2)
})
test("deduction before initial fetch completes is retained", async () => {
  const store = createCreditsStore(async () => initial)
  const pending = store.refresh()
  store.applyBalance(2)
  await pending
  expect(store.getSnapshot()?.creditBalance).toBe(2)
})
test("free allowance usage refresh updates the result card as well", async () => {
  const store = createCreditsStore(async () => ({ ...initial, creditBalance: 0, freeUsed: 1 }))
  await store.refresh()
  const state = store.getSnapshot()!
  expect(state.freeLimit - state.freeUsed + state.creditBalance).toBe(2)
})
