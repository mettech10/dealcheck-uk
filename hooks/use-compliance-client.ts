"use client"

/**
 * Resolve the Compliance Cockpit store for signed-in pages.
 * Production/preview never receive a stub client from this hook.
 */

import { useCallback, useEffect, useState } from "react"
import {
  getComplianceClient,
  resetComplianceClientCache,
  type ComplianceClientHandle,
  type ComplianceSource,
} from "@/lib/compliance/client"
import type { ComplianceApi } from "@/lib/compliance/stub"

export function useComplianceStore(userId: string | null, enabled: boolean) {
  const [handle, setHandle] = useState<ComplianceClientHandle>({
    api: null,
    source: "live",
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setReady(false)
    void getComplianceClient({ userId: userId ?? "local" }).then((next) => {
      if (cancelled) return
      setHandle(next)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, userId])

  const retry = useCallback(async () => {
    resetComplianceClientCache()
    setReady(false)
    const next = await getComplianceClient({
      userId: userId ?? "local",
      force: true,
    })
    setHandle(next)
    setReady(true)
  }, [userId])

  return {
    api: handle.api as ComplianceApi | null,
    source: handle.source as ComplianceSource,
    error: handle.error,
    ready,
    retry,
  }
}
