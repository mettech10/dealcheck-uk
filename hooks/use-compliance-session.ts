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

/** Localhost-only review hatch (`?demo=1`). Never activates on the public host. */
export const LOCAL_DEMO_USER_ID = "local-demo"

const LOCAL_DEMO_PROPERTIES: PortfolioPropertyRow[] = [
  {
    id: "demo-btl-acacia",
    nickname: "Manchester BTL",
    address: "14 Acacia Avenue",
    postcode: "M14 5AA",
    strategy: "BTL",
    bedrooms: 3,
  },
  {
    id: "demo-hmo-oxford",
    nickname: "Oxford HMO",
    address: "8 Iffley Road",
    postcode: "OX4 1EJ",
    strategy: "HMO",
    bedrooms: 6,
  },
]

const DEMO_STORAGE_KEY = "metalyzi.compliance.localDemo"

export function isLocalComplianceDemo(): boolean {
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  if (host !== "localhost" && host !== "127.0.0.1") return false
  const flag = new URLSearchParams(window.location.search).get("demo")
  if (flag === "1") {
    window.sessionStorage.setItem(DEMO_STORAGE_KEY, "1")
    return true
  }
  if (flag === "0") {
    window.sessionStorage.removeItem(DEMO_STORAGE_KEY)
    return false
  }
  return window.sessionStorage.getItem(DEMO_STORAGE_KEY) === "1"
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
      if (isLocalComplianceDemo()) {
        setLoggedIn(true)
        setUserId(LOCAL_DEMO_USER_ID)
        setProperties(LOCAL_DEMO_PROPERTIES)
        return
      }
      const [portfolioRes, meRes] = await Promise.all([
        fetch("/api/portfolio"),
        fetch("/api/me"),
      ])
      if (portfolioRes.status === 401 || !portfolioRes.ok) {
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
