"use client"

/**
 * Site-wide referral capture — mounted once in the root layout, renders
 * nothing.
 *
 * 1. Any URL carrying ?ref=CODE (metalyzi.co.uk?ref=ABCD1234, share-card
 *    links, etc.) stores the code in localStorage before signup.
 * 2. Once the visitor is signed in, the stored code is claimed via
 *    POST /api/user/referral. The API is idempotent and enforces the
 *    attribution window, so retrying on every page load is safe; the
 *    stored code is cleared on any definitive answer (claimed, duplicate,
 *    invalid, self-referral, outside window) and kept only while the
 *    visitor is still anonymous (401).
 */

import { useEffect } from "react"

const STORAGE_KEY = "metalyzi_ref"

export function ReferralCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref")
      if (ref && /^[A-Za-z0-9-]{4,20}$/.test(ref)) {
        localStorage.setItem(STORAGE_KEY, ref.toUpperCase())
      }

      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return

      fetch("/api/user/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: stored }),
      })
        .then((r) => {
          // Keep the code only while anonymous — everything else is final.
          if (r.status !== 401) localStorage.removeItem(STORAGE_KEY)
        })
        .catch(() => {
          /* transient network error — retry on a later page load */
        })
    } catch {
      /* storage unavailable (private mode etc.) — referral simply not tracked */
    }
  }, [])

  return null
}
