"use client"

/**
 * useAnalysisAccess — per-analysis PDF / Save entitlement.
 *
 * Wraps GET /api/payments/access in the React Query-light pattern used
 * by useUserPermissions: returns the resolved state + a refresh()
 * function that callers invoke after a mutation (consume-credit,
 * saved-deal POST, etc.) so the UI reflects the new entitlement
 * without a full page reload.
 *
 * analysisId may be null while the user hasn't saved the deal yet —
 * the endpoint handles that by reporting only tier-level entitlements
 * (canExportPDF = false for Free/PPA, true for Pro). When the
 * analysis is saved, pass the new id and the hook refetches.
 *
 * Fail-closed on fetch error — same stance as useUserPermissions.
 */

import { useCallback, useEffect, useState } from "react"
import type { TierId } from "@/lib/tiers"

export interface AnalysisAccess {
  tier: TierId
  authenticated: boolean
  canExportPDF: boolean
  canSaveDeals: boolean
  hasBoundCredit: boolean
  floatingCredits: number
}

const FREE_DENY: AnalysisAccess = {
  tier: "free",
  authenticated: false,
  canExportPDF: false,
  canSaveDeals: false,
  hasBoundCredit: false,
  floatingCredits: 0,
}

export function useAnalysisAccess(analysisId: string | null | undefined) {
  const [access, setAccess] = useState<AnalysisAccess | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAccess = useCallback(async () => {
    setLoading(true)
    const qs = analysisId
      ? `?analysisId=${encodeURIComponent(analysisId)}`
      : ""
    try {
      const r = await fetch(`/api/payments/access${qs}`)
      if (!r.ok) {
        setAccess(FREE_DENY)
        return
      }
      const data = (await r.json()) as AnalysisAccess
      setAccess(data)
    } catch {
      setAccess(FREE_DENY)
    } finally {
      setLoading(false)
    }
  }, [analysisId])

  useEffect(() => {
    let cancelled = false
    fetchAccess().catch(() => {
      if (!cancelled) setAccess(FREE_DENY)
    })
    return () => {
      cancelled = true
    }
  }, [fetchAccess])

  return { access, loading, refresh: fetchAccess }
}
