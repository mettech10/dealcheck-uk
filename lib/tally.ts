"use client"

/**
 * Tally feedback popup helpers.
 *
 * The Tally embed script is injected globally in app/layout.tsx via
 * next/script (lazy + async, so never blocks page load). At runtime
 * it exposes window.Tally.openPopup(formId, opts). These helpers
 * wrap that surface so the rest of the app doesn't have to know
 * about window globals or `any`.
 *
 * Everything is wrapped in try/catch + a typeof window guard so
 * Tally can NEVER crash the host app.
 */

const FORM_ID = "0QabP0"

/** Subset of Tally.openPopup options we actually use. */
interface TallyPopupOptions {
  layout?: "modal" | "default"
  width?: number
  autoClose?: number
  hideTitle?: boolean
  overlay?: boolean
  emoji?: { text: string; animation: "wave" | "tada" | "heart-beat" | "spin-big" | "flash" | "bounce" | "rubber-band" | "head-shake" }
  onOpen?: () => void
  onClose?: () => void
  onSubmit?: (payload: unknown) => void
  // Tally also accepts a `hiddenFields` map but we surface deal
  // context via the URL embed instead — keeps the popup quick to
  // open even if the script hasn't fully booted yet.
}

interface TallyGlobal {
  openPopup: (formId: string, opts?: TallyPopupOptions) => void
  loadEmbeds?: () => void
}

declare global {
  interface Window {
    Tally?: TallyGlobal
  }
}

/**
 * Open the Tally feedback popup. Returns true if the popup was
 * invoked, false otherwise (script not loaded yet, mobile too
 * narrow, or already shown this session).
 *
 * `respectSessionFlag` (default true) skips the popup if it's
 * already opened this tab/session. Pass false for the manual
 * "Give feedback" button — that should ALWAYS open.
 */
export function openFeedbackForm(opts?: {
  respectSessionFlag?: boolean
}): boolean {
  if (typeof window === "undefined") return false

  // Skip on narrow mobile — Tally popups eat the whole viewport on
  // tiny screens and feel like a takeover. The persistent feedback
  // button still works, so users can opt in.
  if (window.innerWidth < 480) return false

  if (opts?.respectSessionFlag !== false) {
    try {
      if (window.sessionStorage.getItem("tallyFeedbackShown")) return false
    } catch {
      /* ignore storage errors */
    }
  }

  if (!window.Tally?.openPopup) {
    // Script hasn't booted yet — bail rather than queueing. The
    // 90s post-analysis timer is the main caller and 90s is more
    // than enough for the async script to load.
    return false
  }

  try {
    window.Tally.openPopup(FORM_ID, {
      layout: "modal",
      width: 600,
      autoClose: 3000,
      hideTitle: false,
      overlay: true,
      emoji: { text: "👋", animation: "wave" },
    })
    try {
      window.sessionStorage.setItem("tallyFeedbackShown", "true")
    } catch {
      /* ignore */
    }
    return true
  } catch (e) {
    console.warn("[tally] openPopup failed:", e)
    return false
  }
}
