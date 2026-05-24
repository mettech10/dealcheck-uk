"use client"

/**
 * useCreditGate — drives the pre-submit credit check on the analyse
 * form. Mirror of the server-side check in checkCanAnalyse so the
 * UI doesn't let users fire a doomed request.
 *
 * Returns the same shape as /api/user/credits plus a refresh()
 * function the caller invokes after a successful analysis (so the
 * "1 left" banner downgrades to "0 left, blocked" immediately
 * without a page reload).
 *
 * Anonymous users get an "anonymous: true, canAnalyse: false" shape —
 * the form should block them and surface a sign-in prompt.
 */

import { useCallback, useEffect, useState } from "react"
import type { TierId } from "@/lib/tiers"

export interface CreditGate {
  authenticated: boolean
  tier: TierId
  isUnlimited: boolean
  creditBalance: number
  freeUsed: number
  freeLimit: number
  canAnalyse: boolean
}

const ANON_GATE: CreditGate = {
  authenticated: false,
  tier: "free",
  isUnlimited: false,
  creditBalance: 0,
  freeUsed: 0,
  freeLimit: 3,
  canAnalyse: false,
}

export function useCreditGate() {
  const [gate, setGate] = useState<CreditGate | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/user/credits")
      if (!r.ok) {
        setGate(ANON_GATE)
        return
      }
      setGate((await r.json()) as CreditGate)
    } catch {
      setGate(ANON_GATE)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => setGate(ANON_GATE))
  }, [refresh])

  return { gate, loading, refresh }
}
