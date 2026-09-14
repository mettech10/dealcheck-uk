"use client"

/**
 * Shared auth + portfolio loading for Compliance Cockpit pages.
 * Mirrors /tools/portfolio: probe /api/portfolio so httpOnly cookies work.
 */

import { useCallback, useEffect, useState } from "react"
import type { PropertyRef } from "@/lib/compliance/types"

export interface PortfolioPropertyRow {
  id: string
  nickname: string | null
  address: string
  postcode: string | null
  strategy: string | null
  bedrooms: number | null
}

export function toPropertyRef(row: PortfolioPropertyRow): PropertyRef {
  return {
    propertyId: row.id,
    address: row.address,
    nickname: row.nickname,
    postcode: row.postcode,
    strategy: row.strategy,
    bedrooms: row.bedrooms,
  }
}

export function useComplianceSession() {
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setLoggedIn] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [properties, setProperties] = useState<PortfolioPropertyRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [portfolioRes, meRes] = await Promise.all([
        fetch("/api/portfolio"),
        fetch("/api/me"),
      ])
      if (portfolioRes.status === 401) {
        setLoggedIn(false)
        setProperties([])
        setUserId(null)
        return
      }
      const body = await portfolioRes.json()
      setLoggedIn(true)
      setProperties(body.properties ?? [])
      if (meRes.ok) {
        const me = await meRes.json()
        setUserId(me.id ?? null)
      }
    } finally {
      setAuthChecked(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { authChecked, isLoggedIn, userId, properties, loading, reload }
}
