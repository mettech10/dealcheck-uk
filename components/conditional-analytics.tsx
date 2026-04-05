"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/next"
import { hasAnalyticsConsent } from "@/components/cookie-consent"

export function ConditionalAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(hasAnalyticsConsent())
  }, [])

  if (!enabled) return null
  return <Analytics />
}
