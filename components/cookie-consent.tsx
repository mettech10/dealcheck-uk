"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type ConsentValue = "all" | "essential" | null

function getConsent(): ConsentValue {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)metalyzi_consent=(\w+)/)
  return match ? (match[1] as ConsentValue) : null
}

function setConsent(value: "all" | "essential") {
  const maxAge = 365 * 24 * 60 * 60 // 1 year
  document.cookie = `metalyzi_consent=${value};path=/;max-age=${maxAge};SameSite=Lax`
}

/** Returns true if the user has accepted analytics cookies. */
export function hasAnalyticsConsent(): boolean {
  return getConsent() === "all"
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show if no consent cookie exists
    if (!getConsent()) {
      setVisible(true)
    }
  }, [])

  function accept() {
    setConsent("all")
    setVisible(false)
    // Reload to activate analytics scripts
    window.location.reload()
  }

  function reject() {
    setConsent("essential")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] border-t border-border/50 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use essential cookies to keep the site working and optional analytics cookies
          to improve your experience.{" "}
          <Link
            href="/cookie-policy"
            className="text-primary underline hover:text-primary/80"
          >
            Cookie Policy
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={reject}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Reject Non-Essential
          </button>
          <button
            onClick={accept}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  )
}
