"use client"

/**
 * BetaBanner — thin 36px strip mounted at the very top of the page on
 * a curated allow-list of routes (analyse, tools, account, results).
 *
 * Hidden on the landing page, /login, and legal/marketing routes so
 * we don't shout "beta" at people who haven't engaged with the
 * product yet.
 *
 * Dismissal state lives in localStorage under `betaBannerDismissed`
 * so it stays dismissed across sessions on the same device. Read
 * inside an effect (not at mount) to avoid SSR/CSR hydration
 * mismatch — the server can't read localStorage, so we render
 * nothing until we know.
 */

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { openSupportChat } from "@/lib/crisp-context"

const SHOW_ON_PREFIXES = [
  "/analyse",
  "/tools",
  "/account",
] as const

function shouldShow(pathname: string | null): boolean {
  if (!pathname) return false
  return SHOW_ON_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function BetaBanner() {
  const pathname = usePathname()
  // `null` = haven't read localStorage yet (don't render anything,
  // avoids flash of banner + hydration mismatch). `true` / `false`
  // = known state.
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setDismissed(
        typeof window !== "undefined" &&
          window.localStorage.getItem("betaBannerDismissed") === "true",
      )
    } catch {
      // localStorage can throw in private-mode Safari etc. — assume
      // not-dismissed so the banner still works for those users.
      setDismissed(false)
    }
  }, [])

  if (dismissed === null) return null
  if (dismissed) return null
  if (!shouldShow(pathname)) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem("betaBannerDismissed", "true")
    } catch {
      /* ignore — dismissal will just not persist */
    }
    setDismissed(true)
  }

  return (
    <div
      role="status"
      className="flex h-9 items-center justify-center gap-3 border-b border-primary/30 bg-emerald-50 px-4 text-[13px] text-muted-foreground dark:bg-emerald-950"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>🚀</span>
        <span>
          Metalyzi Beta — Help us improve by{" "}
          <button
            type="button"
            onClick={() => openSupportChat()}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            reporting any issues via the chat widget
          </button>{" "}
          →
        </span>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss beta banner"
        className="ml-2 rounded-md px-1.5 text-muted-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        ✕
      </button>
    </div>
  )
}
