"use client"

/**
 * Light/dark theme toggle for the navbar (Feature 1, Section 3).
 *
 * Uses next-themes (wired in app/layout.tsx). `theme` is undefined during
 * SSR / before hydration, so we render a fixed-size placeholder until
 * mounted — this avoids both a hydration mismatch and any icon flash.
 */
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Reserve the same footprint before mount so the navbar doesn't shift.
  if (!mounted) {
    return (
      <span
        aria-hidden
        className="inline-flex h-8 w-[64px] rounded-full border border-border/60 bg-card"
      />
    )
  }

  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-card p-0.5 transition-colors hover:border-primary/50"
    >
      {/* Sun segment — active in light mode */}
      <span
        className={`flex size-7 items-center justify-center rounded-full transition-colors ${
          !isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        <Sun className="size-3.5" />
      </span>
      {/* Moon segment — active in dark mode */}
      <span
        className={`flex size-7 items-center justify-center rounded-full transition-colors ${
          isDark ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        <Moon className="size-3.5" />
      </span>
    </button>
  )
}
