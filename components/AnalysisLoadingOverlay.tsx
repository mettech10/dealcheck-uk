"use client"

/**
 * AnalysisLoadingOverlay — full-viewport blocker shown while the
 * results page is still resolving its data sources.
 *
 * Design choices (spec'd by the 2026-05-23 brief):
 *   - Solid dark background (rgba(0,0,0,0.85)) NOT backdrop-blur —
 *     partial figures must not be readable underneath.
 *   - Pulsing teal spinner in the brand colour (text-primary maps to
 *     the teal token defined in globals.css :root).
 *   - Rotating sub-label cycles every 2.5s through a fixed list of
 *     status messages so the user has something to read while the
 *     slowest call lands.
 *
 * The overlay is presentational — it has no idea what's still
 * loading. The parent (analyse page) decides when to render it
 * based on useLoadingTracker().isFullyLoaded.
 */

import { useEffect, useState } from "react"

const STATUS_MESSAGES = [
  "Fetching market comparables…",
  "Checking Article 4 restrictions…",
  "Running AI area analysis…",
  "Loading regional benchmarks…",
  "Calculating deal score…",
  "Almost ready…",
] as const

const ROTATE_MS = 2500

export function AnalysisLoadingOverlay() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % STATUS_MESSAGES.length)
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-black/85"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Spinner — pure SVG so it animates without depending on
          any Tailwind keyframe config. 64px, teal stroke,
          spins via the built-in animate-spin utility. */}
      <svg
        className="size-16 animate-spin text-primary"
        viewBox="0 0 50 50"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      >
        <circle cx="25" cy="25" r="20" opacity="0.2" />
        <path d="M25 5 a20 20 0 0 1 20 20" />
      </svg>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-base font-medium text-white">Analysing deal…</p>
        <p className="min-h-[1.25rem] text-sm text-white/60">
          {STATUS_MESSAGES[idx]}
        </p>
      </div>
    </div>
  )
}
