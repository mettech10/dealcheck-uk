"use client"

/**
 * Client-side mirror of getUserPermissions().
 *
 * Hits /api/usage (which wraps lib/usageGate.checkCanAnalyse) and runs
 * the tier through permissionsForTier() so client components share the
 * exact same gating shape the server computes.
 *
 * State machine:
 *   - loading: true on mount until /api/usage resolves
 *   - permissions: null while loading, then a UserPermissions object
 *
 * On fetch failure we fall back to Free permissions — same fail-closed
 * stance as getUserPermissions() server-side. This keeps the PDF /
 * save buttons gated when the API is degraded rather than leaking
 * paid features.
 */

import { useEffect, useState } from "react"
import { permissionsForTier, type UserPermissions } from "@/lib/permissions"
import type { TierId } from "@/lib/tiers"

interface UsageResponse {
  authenticated?: boolean
  tier?: TierId
}

export function useUserPermissions() {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/usage")
      .then((r) => (r.ok ? (r.json() as Promise<UsageResponse>) : null))
      .then((data) => {
        if (cancelled) return
        const tier: TierId = data?.tier ?? "free"
        setAuthenticated(!!data?.authenticated)
        setPermissions(permissionsForTier(tier))
      })
      .catch(() => {
        if (cancelled) return
        setPermissions(permissionsForTier("free"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { permissions, loading, authenticated }
}
